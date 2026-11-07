// ============================================
// DELETE /api/manager/assistant/folders/[id]/files/[fileId] — remove a file from the folder
//
// A file uploaded to the assistant is soft-deleted (File.deletedAt) and its
// extracted text and chunks are dropped. A client project file that was only
// indexed (index-project) is un-indexed: its text goes, the File itself stays
// in the project — deleting it here would delete it for the client too.
// Unknown folder, archived folder or a file of another folder: 404.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse, NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { FOLDERS_MISSING, findActiveFolder, isAssistantUpload } from "@/lib/assistant/files/storage";

export const runtime = "nodejs";

const Params = z.object({ id: z.string().min(1).max(64), fileId: z.string().min(1).max(64) });

export const DELETE = withErrorHandler(
    async (request: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) => {
        await requireRole(["MANAGER"], request);
        const { id, fileId } = Params.parse(await params);

        const folder = await findActiveFolder(id);
        if (folder === FOLDERS_MISSING) {
            return errorResponse("Les dossiers de l'assistant ne sont pas encore activés sur cette instance.", 503);
        }
        if (!folder) throw new NotFoundError("Dossier introuvable");

        const text = await prisma.assistantFileText.findUnique({
            where: { fileId },
            select: {
                id: true,
                folderId: true,
                file: { select: { id: true, tags: true, folderId: true, clientId: true, deletedAt: true } },
            },
        });
        if (!text || text.folderId !== folder.id || text.file.deletedAt) throw new NotFoundError("Fichier introuvable");

        const upload = isAssistantUpload(text.file, folder.storageFolderId);
        // Chunks cascade from the file text.
        await prisma.$transaction([
            prisma.assistantFileText.delete({ where: { id: text.id } }),
            ...(upload ? [prisma.file.update({ where: { id: fileId }, data: { deletedAt: new Date() } })] : []),
        ]);

        return successResponse({ fileId, deleted: upload, unindexed: true });
    },
);
