/**
 * Fichiers du dossier — the model-facing side of folder files (Captain AI v4).
 *
 * Three reads, all scoped to the conversation's folder (requireFolder): the
 * file list with its index status, a lexical search over the extracted text,
 * and the reading of consecutive blocks of one file. A file id from another
 * folder reads as "introuvable dans ce dossier", never as someone else's
 * document. Everything returned from a document is untrusted content and was
 * sanitised by lib/assistant/files/search.ts.
 *
 * search_files and read_file_section record evidence like any read (a file
 * excerpt is a source to cite); their payloads are not cached in the ledger
 * (lib/ai/agent/evidence/policy.ts: document text is free text).
 */

import { z } from "zod";
import { optional } from "@/lib/assistant/store/missing";
import type { FileTextStatus, FolderFile } from "@/lib/assistant/api-contract";
import { listFolderFiles, readFileChunks, searchFolderChunks } from "@/lib/assistant/files/search";
import { requireFolder } from "../context";
import { defineReadTool, params } from "../helpers";
import { ToolValidationError, type AssistantContext } from "../types";

export const FILE_STATUSES = ["PENDING", "PROCESSING", "READY", "FAILED", "NEEDS_OCR", "UNSUPPORTED"] as const;

const UNAVAILABLE_NOTE = "Les fichiers de dossier ne sont pas encore activés sur cette instance (migration à appliquer).";
const NOT_IN_FOLDER = "Fichier introuvable dans ce dossier. Utilise list_folder_files pour voir les fichiers disponibles.";

const STATUS_FR: Record<FileTextStatus, string> = {
    PENDING: "en attente d'indexation",
    PROCESSING: "indexation en cours",
    READY: "indexé",
    FAILED: "échec d'indexation",
    NEEDS_OCR: "PDF scanné, texte non lisible",
    UNSUPPORTED: "format non lu",
};

/** The folder's files, or null when the tables are missing. */
async function folderFiles(ctx: AssistantContext, status?: FileTextStatus): Promise<FolderFile[] | null> {
    const folder = requireFolder(ctx);
    return optional<FolderFile[] | null>("files.tool.list", () => listFolderFiles(folder.id, status ? { status } : {}), null);
}

/** The file when it belongs to the conversation's folder (and is not deleted); refusal otherwise. */
async function requireFolderFile(ctx: AssistantContext, fileId: string): Promise<FolderFile> {
    const files = await folderFiles(ctx);
    const file = files?.find((f) => f.fileId === fileId.trim());
    if (!file) throw new ToolValidationError(NOT_IN_FOLDER);
    return file;
}

function frDay(iso: string | null): string | null {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// ============================================
// list_folder_files
// ============================================

export const listFolderFilesTool = defineReadTool({
    name: "list_folder_files",
    label: "Fichiers du dossier",
    description:
        "Fichiers du dossier : nom, pages, statut d'indexation, blocs, file_id.",
    parameters: params({
        status: { type: "string", enum: [...FILE_STATUSES] },
    }),
    schema: z.object({ status: z.enum(FILE_STATUSES).optional() }),
    requiresProject: false,
    execute: async (args, ctx) => {
        const folder = requireFolder(ctx);
        const files = await folderFiles(ctx, args.status);
        if (files === null) return { dossier: folder.name, fichiers: [], note: UNAVAILABLE_NOTE };
        return {
            dossier: folder.name,
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
            ...(files.length === 0 ? { note: "Aucun fichier dans ce dossier." } : {}),
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
        "Recherche plein texte dans les fichiers du dossier : extraits avec fichier, page et bloc.",
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
        const folder = requireFolder(ctx);
        if (args.file_id) await requireFolderFile(ctx, args.file_id);
        const limit = Math.min(args.limit ?? 5, 8);

        const result = await searchFolderChunks(folder.id, args.query, {
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
                ? { note: "Aucun extrait ne correspond. Essaie d'autres mots, ou vérifie avec list_folder_files que les fichiers sont indexés." }
                : {}),
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
        "Texte intégral de blocs consécutifs d'un fichier du dossier (4 au plus).",
    parameters: params(
        {
            file_id: { type: "string" },
            from_block: { type: "integer", minimum: 0, description: "0 = début" },
            to_block: { type: "integer", minimum: 0, description: "≤ from_block + 3" },
        },
        ["file_id", "from_block"],
    ),
    schema: z
        .object({
            file_id: z.string().trim().min(1).max(64),
            from_block: z.number().int().min(0),
            to_block: z.number().int().min(0).optional(),
        })
        .refine((v) => v.to_block === undefined || v.to_block >= v.from_block, {
            message: "to_block doit être supérieur ou égal à from_block.",
        }),
    requiresProject: false,
    execute: async (args, ctx) => {
        const folder = requireFolder(ctx);
        const file = await requireFolderFile(ctx, args.file_id);
        if (file.status !== "READY") {
            return { nom: file.name, statut: STATUS_FR[file.status] ?? file.status, blocs: [], note: file.error ?? "Ce fichier n'a pas de texte indexé." };
        }
        const read = await readFileChunks(file.fileId, args.from_block, args.to_block, { folderId: folder.id });
        if (!read) throw new ToolValidationError(NOT_IN_FOLDER);
        const last = read.blocks.length > 0 ? read.blocks[read.blocks.length - 1].index : null;
        return {
            nom: read.fileName,
            fileId: read.fileId,
            totalBlocs: read.totalBlocks,
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
