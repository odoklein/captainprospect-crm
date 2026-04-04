import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    errorResponse,
    requireAuth,
    withErrorHandler,
    validateRequest,
} from "@/lib/api-utils";
import { z } from "zod";

const endSessionSchema = z.object({
    actionCount: z.number().int().min(0).optional(),
    meetingsBooked: z.number().int().min(0).optional(),
});

export const PATCH = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth(request);
    const { id } = await params;
    const data = await validateRequest(request, endSessionSchema);

    const focusSession = await prisma.focusSession.findUnique({
        where: { id },
        select: { userId: true, endedAt: true, startedAt: true },
    });

    if (!focusSession) {
        return errorResponse("Session non trouvée", 404);
    }
    if (focusSession.userId !== session.user.id) {
        return errorResponse("Non autorisé", 403);
    }
    if (focusSession.endedAt) {
        return errorResponse("Session déjà terminée", 400);
    }

    const endedAt = new Date();
    const durationMs = endedAt.getTime() - focusSession.startedAt.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    const updated = await prisma.focusSession.update({
        where: { id },
        data: {
            endedAt,
            actionCount: data.actionCount ?? 0,
            meetingsBooked: data.meetingsBooked ?? 0,
        },
        select: {
            id: true,
            startedAt: true,
            endedAt: true,
            actionCount: true,
            meetingsBooked: true,
        },
    });

    return successResponse({
        ...updated,
        durationMinutes,
        actionsPerHour: durationMinutes > 0
            ? Math.round((updated.actionCount / durationMinutes) * 60)
            : 0,
    });
});
