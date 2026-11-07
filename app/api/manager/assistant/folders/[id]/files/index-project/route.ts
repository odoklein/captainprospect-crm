// ============================================
// POST /api/manager/assistant/folders/[id]/files/index-project — index the client's files
//
// CLIENT folders only: queues up to 20 of the client's existing project files
// (client- or mission-level, not deleted, readable type, ≤ 25 MB, not indexed
// yet) as PENDING file texts of this folder and schedules their extraction.
// The File rows are not moved or copied. Answers { queued, remaining }; call
// again while remaining > 0.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse, NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { FOLDERS_MISSING, findActiveFolder, indexableProjectFilesWhere } from "@/lib/assistant/files/storage";
import { scheduleExtraction } from "@/lib/assistant/files/pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

const BATCH = 20;

const Params = z.object({ id: z.string().min(1).max(64) });

export const POST = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireRole(["MANAGER"], request);
    const { id } = Params.parse(await params);

    const folder = await findActiveFolder(id);
    if (folder === FOLDERS_MISSING) {
        return errorResponse("Les dossiers de l'assistant ne sont pas encore activés sur cette instance.", 503);
    }
    if (!folder) throw new NotFoundError("Dossier introuvable");
    if (folder.kind !== "CLIENT" || !folder.clientId) {
        return errorResponse("Seuls les dossiers client ont des fichiers projet à indexer.", 400);
    }

    const where = indexableProjectFilesWhere(folder.clientId);
    const candidates = await prisma.file.findMany({
        where,
        select: { id: true },
        orderBy: { createdAt: "desc" },
        take: BATCH,
    });

    let ids: string[] = [];
    if (candidates.length > 0) {
        const fileIds = candidates.map((f) => f.id);
        // fileId is unique: a concurrent call that queued the same file is skipped, not duplicated.
        await prisma.assistantFileText.createMany({
            data: fileIds.map((fileId) => ({ fileId, folderId: folder.id, status: "PENDING" as const })),
            skipDuplicates: true,
        });
        const texts = await prisma.assistantFileText.findMany({
            where: { fileId: { in: fileIds }, folderId: folder.id, status: "PENDING" },
            select: { id: true },
        });
        ids = texts.map((t) => t.id);
        scheduleExtraction(ids);
    }

    const remaining = await prisma.file.count({ where });
    return successResponse({ queued: ids.length, remaining });
});
