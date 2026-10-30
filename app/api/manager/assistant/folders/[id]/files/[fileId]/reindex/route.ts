// ============================================
// POST /api/manager/assistant/folders/[id]/files/[fileId]/reindex — extract again
//
// Resets the file text to PENDING with a fresh attempt budget and schedules
// the extraction. Answers the FolderFile as it stands (PENDING).
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse, NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { FOLDERS_MISSING, findActiveFolder } from "@/lib/assistant/files/storage";
import { FOLDER_FILE_INCLUDE, toFolderFile } from "@/lib/assistant/files/search";
import { scheduleExtraction } from "@/lib/assistant/files/pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

const Params = z.object({ id: z.string().min(1).max(64), fileId: z.string().min(1).max(64) });

export const POST = withErrorHandler(
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
            select: { id: true, folderId: true, status: true, updatedAt: true, file: { select: { deletedAt: true } } },
        });
        if (!text || text.folderId !== folder.id || text.file.deletedAt) throw new NotFoundError("Fichier introuvable");

        // A run in progress keeps its claim; a PROCESSING row older than the
        // stale window is fair game (the pipeline reclaims it the same way).
        const reset = await prisma.assistantFileText.updateMany({
            where: {
                id: text.id,
                OR: [{ status: { not: "PROCESSING" } }, { updatedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } }],
            },
            data: { status: "PENDING", attempts: 0, error: null },
        });
        if (reset.count === 0) return errorResponse("Indexation déjà en cours pour ce fichier.", 409);

        scheduleExtraction([text.id]);
        const row = await prisma.assistantFileText.findUniqueOrThrow({ where: { id: text.id }, include: FOLDER_FILE_INCLUDE });
        return successResponse(toFolderFile(row));
    },
);
