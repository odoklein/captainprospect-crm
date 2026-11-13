// ============================================
// /api/sdr/assistant/conversations/[id] — one panel conversation
//
// GET    — its live messages, oldest first (the last 100).
// DELETE — removes it (owner only).
// ============================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { SDR_ASSISTANT_ROLES, ownConversation, toCard, toMessage } from "@/lib/sdr-assistant/server";
import type { SdrThreadResponse } from "@/lib/sdr-assistant/contract";

export const dynamic = "force-dynamic";

const THREAD_LIMIT = 100;

export const GET = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(SDR_ASSISTANT_ROLES, request);
    const { id } = await params;
    const conversation = await ownConversation(id, session.user.id);
    const newestFirst = await prisma.assistantMessage.findMany({
        where: { conversationId: conversation.id, supersededAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: THREAD_LIMIT,
        select: { id: true, role: true, content: true, createdAt: true, action: true, trace: true },
    });
    const body: SdrThreadResponse = {
        conversation: toCard(conversation),
        messages: newestFirst.reverse().map(toMessage),
    };
    return successResponse(body);
});

export const DELETE = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(SDR_ASSISTANT_ROLES, request);
    const { id } = await params;
    const conversation = await ownConversation(id, session.user.id);
    await prisma.assistantConversation.delete({ where: { id: conversation.id } });
    return successResponse({ deleted: true });
});
