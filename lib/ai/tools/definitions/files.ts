/**
 * Fichiers du dossier — the model-facing side of folder files (Captain AI v4).
 *
 * Three reads over the conversation's file scope (lib/assistant/files/access.ts):
 * the folder's files, or — in a thread without a folder but bound to a client
 * (« Vue agence ») — the client's CLIENT folder plus its project files. A file
 * id outside the scope reads as « introuvable », never as someone else's
 * document; a thread with neither folder nor client gets a French refusal.
 *
 * A file without readable text yet (never indexed, still PENDING, failed for
 * a server-side reason that is gone) is extracted on demand inside the call,
 * within 25 s (lib/assistant/files/pipeline.ts ensureFileTextReady); scanned
 * PDFs go through OCR there. read_file_section also takes a `file_name`
 * (case- and accent-insensitive) instead of an id.
 *
 * Everything returned from a document is untrusted content and was sanitised
 * by lib/assistant/files/search.ts. search_files and read_file_section record
 * evidence like any read (a file excerpt is a source to cite); their payloads
 * are not cached in the ledger (lib/ai/agent/evidence/policy.ts).
 */

import { z } from "zod";
import { optional } from "@/lib/assistant/store/missing";
import type { FileTextStatus, FolderFile } from "@/lib/assistant/api-contract";
import { readFileChunks, searchFolderChunks } from "@/lib/assistant/files/search";
import {
    findFilesByName,
    resolveAccessibleFile,
    resolveFileScope,
    scopeFiles,
    unindexedProjectFiles,
    type AccessibleFile,
    type FileScope,
} from "@/lib/assistant/files/access";
import {
    ensureFileTextReady,
    ensureFileTextsReady,
    isHealable,
    MAX_EXTRACTION_ATTEMPTS,
    type EnsureResult,
} from "@/lib/assistant/files/pipeline";
import { defineReadTool, params } from "../helpers";
import { ToolValidationError, type AssistantContext } from "../types";

export const FILE_STATUSES = ["PENDING", "PROCESSING", "READY", "FAILED", "NEEDS_OCR", "UNSUPPORTED"] as const;

const UNAVAILABLE_NOTE = "Les fichiers de dossier ne sont pas encore activés sur cette instance (migration à appliquer).";
const NOT_IN_FOLDER = "Fichier introuvable dans ce dossier. Utilise list_folder_files pour voir les fichiers disponibles.";
const NOT_FOR_CLIENT = "Fichier introuvable pour ce client. Utilise list_project_documents ou list_folder_files pour voir les fichiers disponibles.";
const STILL_EXTRACTING = "Lecture du document en cours (extraction ou OCR) : réessaie dans quelques secondes avec les mêmes arguments.";
/** Never-indexed or pending files a whole-folder search extracts first. */
const SEARCH_PREPARE_MAX = 6;

const STATUS_FR: Record<FileTextStatus, string> = {
    PENDING: "en attente d'indexation",
    PROCESSING: "indexation en cours",
    READY: "indexé",
    FAILED: "échec d'indexation",
    NEEDS_OCR: "PDF scanné, texte non lisible",
    UNSUPPORTED: "format non lu",
};

/**
 * Seams for the tests: the on-demand extraction and the scheduler. Production
 * code never reassigns them.
 */
export const fileToolDeps = {
    ensure: ensureFileTextReady,
    ensureMany: ensureFileTextsReady,
    ocrAvailable: (): boolean => {
        const off = process.env.ASSISTANT_OCR?.trim().toLowerCase() === "off";
        return !off;
    },
};

function ledgerContextOf(ctx: AssistantContext) {
    return {
        userId: ctx.userId,
        clientId: ctx.project?.clientId ?? ctx.folder?.clientId ?? null,
        missionId: ctx.project?.missionId ?? null,
        conversationId: ctx.conversationId,
    };
}

function notFound(scope: FileScope): ToolValidationError {
    return new ToolValidationError(scope.via === "folder" && !scope.clientId ? NOT_IN_FOLDER : NOT_FOR_CLIENT);
}

function frDay(iso: string | null): string | null {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Whether a text row in this state is worth an on-demand extraction. */
function needsExtraction(file: Pick<AccessibleFile, "status" | "error">): boolean {
    if (file.status === null) return true;
    if (file.status === "READY") return false;
    if (file.status === "PENDING" || file.status === "PROCESSING") return true;
    // attempts are not listed: a FAILED row is retried by the pipeline only while it has attempts left
    // or when its cause is server-side (isHealable with onDemand); the pipeline decides.
    if (file.status === "FAILED") return true;
    return isHealable({ status: file.status, error: file.error, attempts: MAX_EXTRACTION_ATTEMPTS }, fileToolDeps.ocrAvailable(), true);
}

/** Stricter, for a whole-folder search: only rows in flight or left behind by an earlier version. */
function worthWaitingFor(file: Pick<FolderFile, "status" | "error">): boolean {
    if (file.status === "PENDING" || file.status === "PROCESSING") return true;
    return isHealable({ status: file.status, error: file.error, attempts: MAX_EXTRACTION_ATTEMPTS }, fileToolDeps.ocrAvailable(), false);
}

/** The file id from `file_id`, or the single file matching `file_name`. */
async function resolveFileId(scope: FileScope, args: { file_id?: string; file_name?: string }, listed: FolderFile[] | null): Promise<string> {
    if (args.file_id) return args.file_id;
    const name = args.file_name ?? "";
    const matches = await findFilesByName(scope, name, listed);
    if (matches.length === 1) return matches[0].fileId;
    if (matches.length === 0) {
        throw new ToolValidationError(`Aucun fichier ne correspond à « ${name} ». Utilise list_folder_files ou list_project_documents pour voir les noms exacts.`);
    }
    const shown = matches.slice(0, 6).map((m) => `${m.name} (file_id ${m.fileId})`).join(" ; ");
    throw new ToolValidationError(`Plusieurs fichiers correspondent à « ${name} » : ${shown}. Précise file_id.`);
}

/** Readable text now, or the state explaining why not (never throws on extraction trouble). */
async function makeReadable(file: AccessibleFile, ctx: AssistantContext): Promise<EnsureResult> {
    const settled: EnsureResult = {
        fileId: file.fileId,
        fileTextId: null,
        folderId: file.folderId,
        status: file.status ?? "MISSING",
        error: file.error,
        pages: null,
        chunkCount: 0,
        extractor: null,
        timedOut: false,
        extracted: false,
    };
    if (file.refusal) return { ...settled, status: "UNSUPPORTED", error: file.refusal };
    if (!needsExtraction(file)) return settled;
    const result = await optional<EnsureResult | null>(
        "files.tool.ondemand",
        () => fileToolDeps.ensure(file.fileId, { folderId: file.folderId, ledgerContext: ledgerContextOf(ctx) }),
        null,
    );
    return result ?? settled;
}

function unreadable(name: string, result: EnsureResult): Record<string, unknown> {
    const status = result.status === "MISSING" ? null : result.status;
    return {
        nom: name,
        fileId: result.fileId,
        statut: status ? (STATUS_FR[status] ?? status) : "non indexé",
        blocs: [],
        note: result.timedOut || status === "PENDING" || status === "PROCESSING" ? STILL_EXTRACTING : (result.error ?? "Ce fichier n'a pas de texte lisible."),
    };
}

// ============================================
// list_folder_files
// ============================================

export const listFolderFilesTool = defineReadTool({
    name: "list_folder_files",
    label: "Fichiers du dossier",
    description:
        "Fichiers du dossier (ou du client) : nom, pages, statut d'indexation, blocs, file_id.",
    parameters: params({
        status: { type: "string", enum: [...FILE_STATUSES] },
    }),
    schema: z.object({ status: z.enum(FILE_STATUSES).optional() }),
    requiresProject: false,
    execute: async (args, ctx) => {
        const scope = await resolveFileScope(ctx);
        const dossier = scope.folderName ?? "Dossier";
        const all = await scopeFiles(scope);
        if (all === null) return { dossier, fichiers: [], note: UNAVAILABLE_NOTE };
        const files = args.status ? all.filter((f) => f.status === args.status) : all;
        const pendingProject = scope.clientId && !args.status ? await unindexedProjectFiles(scope, 20) : [];
        return {
            dossier,
            fichiers: files.map((f) => ({
                fileId: f.fileId,
                nom: f.name,
                type: f.mimeType,
                statut: STATUS_FR[f.status] ?? f.status,
                pages: f.pages,
                blocs: f.chunkCount,
                tailleKo: Math.round(f.size / 1024),
                deposePar: f.uploadedByName,
                depose: frDay(f.createdAt),
                ...(f.error ? { remarque: f.error } : {}),
            })),
            ...(pendingProject.length > 0
                ? {
                      fichiersProjetNonIndexes: pendingProject.map((p) => ({ fileId: p.fileId, nom: p.name })),
                      conseil: "Les fichiers projet non indexés se lisent quand même : read_file_section (file_id ou file_name) les extrait à la demande.",
                  }
                : {}),
            ...(files.length === 0 && pendingProject.length === 0 ? { note: "Aucun fichier dans ce dossier." } : {}),
        };
    },
});

// ============================================
// search_files
// ============================================

export const searchFiles = defineReadTool({
    name: "search_files",
    label: "Recherche dans les fichiers",
    description:
        "Recherche plein texte dans les fichiers du dossier (ou du client) : extraits avec fichier, page et bloc.",
    parameters: params(
        {
            query: { type: "string", minLength: 2, maxLength: 200, description: "Mots-clés" },
            file_id: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 8, description: "5 par défaut" },
        },
        ["query"],
    ),
    schema: z.object({
        query: z.string().trim().min(2).max(200),
        file_id: z.string().trim().min(1).max(64).optional(),
        // The slimmed wire schema advertises every `limit` as "1–100 (défaut 20)"
        // (registry.ts SHORT_DESCRIPTIONS): accept that range, serve at most 8.
        limit: z.number().int().min(1).max(100).optional(),
    }),
    requiresProject: false,
    execute: async (args, ctx) => {
        const scope = await resolveFileScope(ctx);
        const listed = await scopeFiles(scope);
        if (listed === null && !scope.clientId) {
            return { requete: args.query, extraits: 0, fichiers: 0, resultats: [], note: UNAVAILABLE_NOTE };
        }
        const limit = Math.min(args.limit ?? 5, 8);

        let searchFolderId = scope.folderId;
        let pendingNote: string | null = null;
        if (args.file_id) {
            const file = await resolveAccessibleFile(scope, args.file_id, listed);
            if (!file) throw notFound(scope);
            const ready = await makeReadable(file, ctx);
            if (ready.status !== "READY") return { requete: args.query, extraits: 0, fichiers: 0, resultats: [], ...unreadable(file.name, ready) };
            searchFolderId = ready.folderId ?? file.folderId;
        } else {
            // Files of the scope without text yet are read first (bounded), so a
            // search right after an upload or on a never-indexed client finds them.
            const waiting = (listed ?? []).filter(worthWaitingFor).map((f) => ({ fileId: f.fileId, folderId: scope.folderId }));
            const clientFolderId = scope.clientId ? await scope.clientFolderId() : null;
            const project = clientFolderId
                ? (await unindexedProjectFiles(scope, SEARCH_PREPARE_MAX)).map((p) => ({ fileId: p.fileId, folderId: clientFolderId }))
                : [];
            const todo = [...waiting, ...project];
            if (todo.length > 0) {
                const now = todo.slice(0, SEARCH_PREPARE_MAX);
                const results = await optional<Map<string, EnsureResult> | null>(
                    "files.tool.prepare",
                    () => fileToolDeps.ensureMany(now, { ledgerContext: ledgerContextOf(ctx) }),
                    null,
                );
                const late = [...(results?.values() ?? [])].filter((r) => r.timedOut).length + Math.max(0, todo.length - now.length);
                if (late > 0) pendingNote = `${late} fichier(s) encore en cours de lecture : relance la recherche dans un instant pour les inclure.`;
            }
        }
        if (!searchFolderId) return { requete: args.query, extraits: 0, fichiers: 0, resultats: [], note: UNAVAILABLE_NOTE };

        const result = await searchFolderChunks(searchFolderId, args.query, {
            limit,
            perFile: args.file_id ? limit : 2,
            ...(args.file_id ? { fileId: args.file_id } : {}),
        });
        const fichiers = new Set(result.hits.map((h) => h.fileId)).size;
        return {
            requete: args.query,
            extraits: result.hits.length,
            fichiers,
            resultats: result.hits.map((h) => ({
                // `nom` names the row for the evidence facts (page and bloc belong to it).
                nom: h.fileName,
                fileId: h.fileId,
                bloc: h.index,
                page: h.page,
                section: h.heading,
                extrait: h.excerpt,
            })),
            ...(result.hits.length === 0
                ? { note: "Aucun extrait ne correspond. Essaie d'autres mots, ou lis le document avec read_file_section (from_block 0)." }
                : {}),
            ...(pendingNote ? { enCours: pendingNote } : {}),
            ...(result.degraded ? { avertissement: "Recherche dégradée (index plein texte indisponible) : correspondance de mots simple." } : {}),
        };
    },
});

// ============================================
// read_file_section
// ============================================

export const readFileSection = defineReadTool({
    name: "read_file_section",
    label: "Lecture d'un fichier",
    description:
        "Texte intégral de blocs consécutifs d'un fichier (4 au plus), par file_id ou file_name. Lit aussi un fichier pas encore indexé.",
    parameters: params({
        file_id: { type: "string" },
        file_name: { type: "string", description: "Nom (ou partie du nom) si file_id inconnu" },
        from_block: { type: "integer", minimum: 0, description: "0 = début" },
        to_block: { type: "integer", minimum: 0, description: "≤ from_block + 3" },
    }),
    schema: z
        .object({
            file_id: z.string().trim().min(1).max(64).optional(),
            file_name: z.string().trim().min(2).max(200).optional(),
            from_block: z.number().int().min(0).optional(),
            to_block: z.number().int().min(0).optional(),
        })
        .refine((v) => !!v.file_id || !!v.file_name, { message: "Donne file_id ou file_name." })
        .refine((v) => v.to_block === undefined || v.to_block >= (v.from_block ?? 0), {
            message: "to_block doit être supérieur ou égal à from_block.",
        }),
    requiresProject: false,
    execute: async (args, ctx) => {
        const scope = await resolveFileScope(ctx);
        const listed = await scopeFiles(scope);
        if (listed === null && !scope.clientId) return { blocs: [], note: UNAVAILABLE_NOTE };

        const fileId = await resolveFileId(scope, args, listed);
        const file = await resolveAccessibleFile(scope, fileId, listed);
        if (!file) throw notFound(scope);
        const ready = await makeReadable(file, ctx);
        if (ready.status !== "READY") return unreadable(file.name, ready);

        const from = args.from_block ?? 0;
        const read = await readFileChunks(file.fileId, from, args.to_block, ready.folderId ? { folderId: ready.folderId } : {});
        if (!read) throw notFound(scope);
        const last = read.blocks.length > 0 ? read.blocks[read.blocks.length - 1].index : null;
        return {
            nom: read.fileName,
            fileId: read.fileId,
            totalBlocs: read.totalBlocks,
            ...(ready.pages ? { pages: ready.pages } : {}),
            blocs: read.blocks.map((b) => ({ bloc: b.index, page: b.page, section: b.heading, contenu: b.content })),
            ...(read.blocks.length === 0
                ? { note: `Aucun bloc à partir du bloc ${read.fromIndex} : le document en compte ${read.totalBlocks} (0 à ${Math.max(0, read.totalBlocks - 1)}).` }
                : last !== null && last + 1 < read.totalBlocks
                  ? { suite: `Blocs ${last + 1} à ${read.totalBlocks - 1} non lus.` }
                  : {}),
        };
    },
});

/** One-line registration in lib/ai/tools/registry.ts. */
export const FILE_TOOLS = [listFolderFilesTool, searchFiles, readFileSection];
