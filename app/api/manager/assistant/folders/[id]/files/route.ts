// ============================================
// GET  /api/manager/assistant/folders/[id]/files — the folder's files + index status
// POST /api/manager/assistant/folders/[id]/files — upload (multipart, field `file`, one or more)
//
// Uploads land in the folder's hidden storage Folder with clientId null (never
// visible from the client portal, see lib/assistant/files/storage.ts), get an
// AssistantFileText PENDING row, and are extracted after the response.
// Unknown or archived folder: 404. v4 tables missing: empty list, degraded.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse, NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { optional } from "@/lib/assistant/store/missing";
import { touchFolder } from "@/lib/assistant/folders/service";
import { FILE_MAX_BYTES, type FolderFilesResponse, type UploadFilesResponse } from "@/lib/assistant/api-contract";
import { CANONICAL_MIME, resolveDocumentKind } from "@/lib/assistant/files/extract";
import { FOLDER_FILE_INCLUDE, listFolderFiles, toFolderFile } from "@/lib/assistant/files/search";
import { findRetriableTexts, scheduleExtraction } from "@/lib/assistant/files/pipeline";
import {
    FOLDERS_MISSING,
    findActiveFolder,
    indexableProjectFilesWhere,
    safeFileName,
    storeFolderUpload,
} from "@/lib/assistant/files/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Files accepted per request; the proxy caps a request body at 60 MB anyway. */
const MAX_FILES_PER_REQUEST = 10;

const Params = z.object({ id: z.string().min(1).max(64) });

const EMPTY_DEGRADED: FolderFilesResponse = { files: [], indexableProjectFiles: 0, degraded: true };

export const GET = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireRole(["MANAGER"], request);
    const { id } = Params.parse(await params);

    const folder = await findActiveFolder(id);
    if (folder === FOLDERS_MISSING) return successResponse(EMPTY_DEGRADED);
    if (!folder) throw new NotFoundError("Dossier introuvable");

    const data = await optional<FolderFilesResponse>(
        "files.route.list",
        async () => {
            const [files, indexableProjectFiles, retriable] = await Promise.all([
                listFolderFiles(folder.id),
                folder.kind === "CLIENT" && folder.clientId
                    ? prisma.file.count({ where: indexableProjectFilesWhere(folder.clientId) })
                    : Promise.resolve(0),
                findRetriableTexts(folder.id),
            ]);
            // A file whose extraction was lost (restart, timeout) heals when the list is viewed.
            scheduleExtraction(retriable);
            return { files, indexableProjectFiles };
        },
        EMPTY_DEGRADED,
    );
    return successResponse(data);
});

export const POST = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = Params.parse(await params);

    const folder = await findActiveFolder(id);
    if (folder === FOLDERS_MISSING) {
        return errorResponse("Les dossiers de l'assistant ne sont pas encore activés sur cette instance.", 503);
    }
    if (!folder) throw new NotFoundError("Dossier introuvable");

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return errorResponse("Envoi invalide : formulaire multipart attendu (champ « file »).", 400);
    }
    const entries = form.getAll("file").filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v);
    if (entries.length === 0) return errorResponse("Aucun fichier fourni.", 400);

    const rejected: UploadFilesResponse["rejected"] = [];
    const createdFileIds: string[] = [];

    for (const [i, entry] of entries.entries()) {
        const name = safeFileName(entry.name || "fichier");
        if (i >= MAX_FILES_PER_REQUEST) {
            rejected.push({ name, reason: `Au plus ${MAX_FILES_PER_REQUEST} fichiers par envoi.` });
            continue;
        }
        const kind = resolveDocumentKind(entry.type, name);
        if (!kind) {
            rejected.push({ name, reason: "Format non pris en charge : PDF, DOCX, XLSX, CSV, Markdown ou texte." });
            continue;
        }
        if (entry.size === 0) {
            rejected.push({ name, reason: "Fichier vide." });
            continue;
        }
        if (entry.size > FILE_MAX_BYTES) {
            rejected.push({ name, reason: `Fichier trop volumineux (${Math.round(FILE_MAX_BYTES / (1024 * 1024))} Mo maximum).` });
            continue;
        }
        try {
            const buffer = Buffer.from(await entry.arrayBuffer());
            const file = await storeFolderUpload({
                folderId: folder.id,
                userId: session.user.id,
                buffer,
                name,
                mimeType: CANONICAL_MIME[kind],
            });
            createdFileIds.push(file.id);
        } catch (error) {
            console.error("[assistant.files] upload failed", name, error);
            rejected.push({ name, reason: "Enregistrement du fichier impossible. Réessaie dans un instant." });
        }
    }

    if (createdFileIds.length > 0) {
        await prisma.assistantFileText.createMany({
            data: createdFileIds.map((fileId) => ({ fileId, folderId: folder.id, status: "PENDING" as const })),
            skipDuplicates: true,
        });
    }
    const texts =
        createdFileIds.length > 0
            ? await prisma.assistantFileText.findMany({
                  where: { fileId: { in: createdFileIds } },
                  include: FOLDER_FILE_INCLUDE,
                  orderBy: { createdAt: "asc" },
              })
            : [];
    scheduleExtraction(texts.map((t) => t.id));
    if (texts.length > 0) await touchFolder(folder.id);

    const body: UploadFilesResponse = { files: texts.map(toFolderFile), rejected };
    return successResponse(body, texts.length > 0 ? 201 : 200);
});
