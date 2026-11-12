/**
 * Documents, comptes rendus d'appels et playbook.
 *
 * This is the "il a tout en mémoire" half of the project assistant: the files
 * the client dropped, the Leexi recap of the kickoff call, the sales playbook
 * generated from it.
 *
 * Everything here is content other people wrote, so every free-text field goes
 * through `sanitizeUntrusted` on the way out.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { optional } from "@/lib/assistant/store/missing";
import { ensureClientFolder } from "@/lib/assistant/folders/service";
import { resolveDocumentKind } from "@/lib/assistant/files/extract";
import { ensureFileTextReady, type EnsureResult } from "@/lib/assistant/files/pipeline";
import { sanitizeUntrusted } from "../redact";
import { requireProject } from "../context";
import { defineReadTool, frDate, NO_PARAMS, params } from "../helpers";

/** Types read as raw text when the files pipeline does not handle them (JSON, XML). */
const READABLE_MIME = /^(text\/|application\/json|application\/xml)/i;

/** Test seam: the on-demand extraction. Production code never reassigns it. */
export const documentDeps = { ensure: ensureFileTextReady };

/** Index states that will not become readable without a new upload. */
const DEAD_ENDS = new Set(["NEEDS_OCR", "UNSUPPORTED"]);

/** Characters of extracted text handed back by read_project_document. */
const EXTRACTED_TEXT_MAX_CHARS = 12000;

/**
 * Index state of these files (Captain AI v4 AssistantFileText): READY files
 * are readable whatever their mime. Empty when the v4 tables are missing.
 */
async function indexStates(fileIds: string[]): Promise<Map<string, { status: string; error: string | null }>> {
    if (fileIds.length === 0) return new Map();
    const rows = await optional(
        "documents.extracted",
        () =>
            prisma.assistantFileText.findMany({
                where: { fileId: { in: fileIds } },
                select: { fileId: true, status: true, error: true },
            }),
        [] as Array<{ fileId: string; status: string; error: string | null }>,
    );
    return new Map(rows.map((r) => [r.fileId, { status: r.status, error: r.error }]));
}

async function extractedText(fileId: string): Promise<string | null> {
    const row = await optional(
        "documents.extracted_text",
        () =>
            prisma.assistantFileText.findUnique({
                where: { fileId },
                select: { status: true, text: true },
            }),
        null,
    );
    return row && row.status === "READY" && row.text ? row.text : null;
}

export const listProjectDocuments = defineReadTool({
    name: "list_project_documents",
    label: "Documents du projet",
    description:
        "Liste les fichiers déposés sur le projet : nom, type, taille, dossier, qui l'a déposé et quand. Ne renvoie pas le contenu — utilise read_project_document pour ça.",
    parameters: params({
        search: { type: "string", description: "Filtre sur le nom du fichier" },
    }),
    schema: z.object({ search: z.string().max(120).optional() }),
    execute: async (args, ctx) => {
        const project = requireProject(ctx);

        const files = await prisma.file.findMany({
            where: {
                // A mission-bound project sees its own files plus the client-wide
                // ones: a contract filed at client level is still project context.
                ...(project.missionId
                    ? {
                        OR: [
                            { missionId: project.missionId },
                            { clientId: project.clientId, missionId: null },
                        ],
                    }
                    : { clientId: project.clientId }),
                ...(args.search ? { name: { contains: args.search, mode: "insensitive" } } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 60,
            select: {
                id: true,
                name: true,
                originalName: true,
                mimeType: true,
                size: true,
                description: true,
                tags: true,
                createdAt: true,
                folder: { select: { name: true } },
                uploadedBy: { select: { name: true } },
                mission: { select: { name: true } },
            },
        });

        const states = await indexStates(files.map((f) => f.id));

        return {
            documents: files.map((f) => {
                const state = states.get(f.id);
                const supported = !!resolveDocumentKind(f.mimeType, f.originalName || f.name) || READABLE_MIME.test(f.mimeType);
                const readable = state ? state.status === "READY" || !DEAD_ENDS.has(state.status) : supported;
                return {
                    documentId: f.id,
                    nom: f.name,
                    type: f.mimeType,
                    tailleKo: Math.round(f.size / 1024),
                    lisibleParLAssistant: readable,
                    ...(state && state.status !== "READY" && state.error ? { remarque: state.error } : {}),
                    dossier: f.folder?.name ?? null,
                    mission: f.mission?.name ?? null,
                    description: sanitizeUntrusted(f.description, 200),
                    tags: f.tags,
                    deposePar: f.uploadedBy.name,
                    depose: frDate(f.createdAt),
                };
            }),
            note:
                "read_project_document lit les PDF (y compris scannés, par OCR), DOCX, tableurs et fichiers texte, même jamais indexés : le texte est extrait à la demande. Les images et autres formats ne sont pas lisibles.",
        };
    },
});

export const readProjectDocument = defineReadTool({
    name: "read_project_document",
    label: "Lecture d'un document",
    description:
        "Renvoie le contenu texte d'un document du projet (PDF, DOCX, tableur, texte ; PDF scanné via OCR). Le texte est extrait à la demande s'il ne l'a jamais été.",
    parameters: params(
        { documentId: { type: "string", description: "Id obtenu via list_project_documents" } },
        ["documentId"],
    ),
    schema: z.object({ documentId: z.string().min(1) }),
    execute: async (args, ctx) => {
        const project = requireProject(ctx);

        const file = await prisma.file.findUnique({
            where: { id: args.documentId },
            select: {
                id: true,
                name: true,
                originalName: true,
                mimeType: true,
                size: true,
                url: true,
                clientId: true,
                missionId: true,
                deletedAt: true,
            },
        });
        if (!file || file.deletedAt) return { error: "Document introuvable" };

        // The binding is re-checked here, not trusted from the argument: an id
        // from another client must not resolve just because the model asked.
        const inScope =
            file.clientId === project.clientId ||
            (!!project.missionId && file.missionId === project.missionId);
        if (!inScope) {
            return { error: "Ce document n'appartient pas au projet actif." };
        }

        // PDF, DOCX, XLSX, CSV, Markdown, text: through the files pipeline. A
        // file never indexed is extracted now (25 s budget, OCR for a scan),
        // its text row filed in the client's CLIENT folder.
        const displayName = file.originalName || file.name;
        let state: EnsureResult | null = null;
        if (resolveDocumentKind(file.mimeType, displayName)) {
            state = await optional<EnsureResult | null>(
                "documents.ondemand",
                async () => {
                    const folderId = (await ensureClientFolder(project.clientId, ctx.userId)).id;
                    return documentDeps.ensure(file.id, {
                        folderId,
                        ledgerContext: {
                            userId: ctx.userId,
                            clientId: project.clientId,
                            missionId: project.missionId,
                            conversationId: ctx.conversationId,
                        },
                    });
                },
                null,
            );
        }

        // Text extracted by the folder files pipeline wins, whatever the mime.
        const text = await extractedText(file.id);
        if (text) {
            return {
                nom: file.name,
                fileId: file.id,
                source: state?.extractor === "openai-ocr" ? "texte reconnu par OCR (PDF scanné)" : "texte extrait du document",
                ...(state?.pages ? { pages: state.pages } : {}),
                contenu: sanitizeUntrusted(text.slice(0, EXTRACTED_TEXT_MAX_CHARS), EXTRACTED_TEXT_MAX_CHARS),
                ...(text.length > EXTRACTED_TEXT_MAX_CHARS
                    ? {
                          tronque: `Premiers ${EXTRACTED_TEXT_MAX_CHARS} caractères sur ${text.length}. Pour la suite : read_file_section avec file_id « ${file.id} » et from_block (${state?.chunkCount ? `${state.chunkCount} blocs au total` : "0 = début"}), ou search_files pour un passage précis.`,
                      }
                    : {}),
            };
        }

        if (state) {
            const inFlight = state.timedOut || state.status === "PENDING" || state.status === "PROCESSING";
            return {
                nom: file.name,
                fileId: file.id,
                error: inFlight
                    ? "Lecture du document en cours (extraction ou OCR) : rappelle read_project_document dans quelques secondes."
                    : (state.error ?? "Le texte de ce document n'a pas pu être extrait."),
            };
        }

        if (!READABLE_MIME.test(file.mimeType)) {
            return {
                error: `Le format ${file.mimeType} n'est pas lisible par l'assistant : seuls PDF, DOCX, XLSX, CSV, Markdown et texte le sont.`,
                nom: file.name,
            };
        }

        if (!file.url) {
            return { error: "Ce document n'a pas d'URL de téléchargement exploitable." };
        }

        try {
            const response = await fetch(file.url);
            if (!response.ok) return { error: "Le document n'a pas pu être téléchargé." };
            const raw = await response.text();
            return {
                nom: file.name,
                contenu: sanitizeUntrusted(raw, 12000),
            };
        } catch {
            return { error: "Le document n'a pas pu être téléchargé." };
        }
    },
});

export const getCallRecap = defineReadTool({
    name: "get_call_recap",
    label: "Compte rendu d'appel",
    description:
        "Le compte rendu Leexi du projet : titre, date, durée et le texte du récapitulatif. C'est la mémoire des échanges de cadrage avec le client.",
    parameters: NO_PARAMS,
    schema: z.object({}),
    execute: async (_args, ctx) => {
        const project = requireProject(ctx);

        const imports = await prisma.leexiCallImport.findMany({
            where: project.missionId
                ? { OR: [{ missionId: project.missionId }, { clientId: project.clientId }] }
                : { clientId: project.clientId },
            orderBy: { importedAt: "desc" },
            take: 3,
            select: {
                callTitle: true,
                callDate: true,
                callDuration: true,
                rawRecap: true,
                source: true,
                importedAt: true,
                importedBy: { select: { name: true } },
            },
        });

        if (imports.length === 0) {
            return { comptesRendus: [], note: "Aucun compte rendu Leexi importé pour ce projet." };
        }

        return {
            comptesRendus: imports.map((i) => ({
                titre: i.callTitle,
                date: frDate(i.callDate),
                dureeMinutes: i.callDuration ? Math.round(i.callDuration / 60) : null,
                importePar: i.importedBy.name,
                source: i.source,
                recapitulatif: sanitizeUntrusted(i.rawRecap, 8000),
            })),
        };
    },
});

export const getPlaybook = defineReadTool({
    name: "get_playbook",
    label: "Playbook de la mission",
    description:
        "Le playbook commercial de la mission : cible, pitch, objections, séquence. Sert à rédiger un email ou un script cohérent avec ce qui a été validé.",
    parameters: NO_PARAMS,
    schema: z.object({}),
    execute: async (_args, ctx) => {
        const project = requireProject(ctx);

        if (!project.missionId) {
            return {
                error: "Le playbook est défini au niveau d'une mission. Sélectionne une mission précise.",
            };
        }

        const mission = await prisma.mission.findUnique({
            where: { id: project.missionId },
            select: { name: true, playbook: true, objective: true },
        });
        if (!mission) return { error: "Mission introuvable" };

        if (!mission.playbook) {
            return {
                mission: mission.name,
                objectif: sanitizeUntrusted(mission.objective),
                playbook: null,
                note: "Aucun playbook généré pour cette mission.",
            };
        }

        // The playbook is generated from a client call, so it is untrusted text
        // in a structured wrapper: serialise then sanitise the whole thing.
        return {
            mission: mission.name,
            objectif: sanitizeUntrusted(mission.objective),
            playbook: sanitizeUntrusted(JSON.stringify(mission.playbook), 6000),
        };
    },
});
