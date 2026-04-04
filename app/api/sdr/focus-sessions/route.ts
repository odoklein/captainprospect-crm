import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    requireAuth,
    withErrorHandler,
} from "@/lib/api-utils";

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);

    const focusSession = await prisma.focusSession.create({
        data: { userId: session.user.id },
        select: {
            id: true,
            startedAt: true,
        },
    });

    return successResponse(focusSession, 201);
});

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);

    // Get active (unclosed) focus session
    const activeSession = await prisma.focusSession.findFirst({
        where: {
            userId: session.user.id,
            endedAt: null,
        },
        orderBy: { startedAt: "desc" },
        select: {
            id: true,
            startedAt: true,
            actionCount: true,
            meetingsBooked: true,
        },
    });

    return successResponse(activeSession);
});
