// ============================================
// /api/sdr/assistant/conversations — the SDR panel's history
//
// GET  — the user's own panel conversations (newest first) and the
//        assistant mode (live / demo / unavailable), so the panel can say
//        honestly what it can do before the first message.
// POST — start a new conversation.
//
// Stored in the same AssistantConversation table as the Assistant Projet:
// PRIVATE, no client, no folder, owned by the SDR. Manager listings are
// scoped to their own author id, so these never appear there.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { SDR_ASSISTANT_ROLES, UNAVAILABLE_REASON, sdrAssistantMode, toCard } from "@/lib/sdr-assistant/server";
import type { SdrConversationsResponse } from "@/lib/sdr-assistant/contract";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 30;

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(SDR_ASSISTANT_ROLES, request);
    const rows = await prisma.assistantConversation.findMany({
        where: { createdById: session.user.id, clientId: null, folderId: null, kind: "CHAT", messageCount: { gt: 0 } },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        take: LIST_LIMIT,
        select: { id: true, title: true, lastMessageAt: true, messageCount: true },
    });
    const mode = sdrAssistantMode();
    const body: SdrConversationsResponse = {
        mode,
        unavailableReason: mode === "unavailable" ? UNAVAILABLE_REASON : null,
        conversations: rows.map(toCard),
    };
    return successResponse(body);
});

const CreateBody = z.object({ title: z.string().max(120).optional() }).optional();

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(SDR_ASSISTANT_ROLES, request);
    const body = await validateRequest(request, CreateBody.transform((b) => b ?? {}));
    const row = await prisma.assistantConversation.create({
        data: {
            createdById: session.user.id,
            title: body.title?.trim() || "Nouvelle conversation",
        },
        select: { id: true, title: true, lastMessageAt: true, messageCount: true },
    });
    return successResponse(toCard(row), 201);
});
