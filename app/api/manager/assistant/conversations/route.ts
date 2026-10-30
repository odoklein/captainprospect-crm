// ============================================
// GET    /api/manager/assistant/conversations — one page of conversation cards
//        `?folderId=<id>` | `?scope=agency` | `?pinned=1`, plus `q`, `cursor`, `limit`
//        (default 30, max 100) → ConversationsResponse (lib/assistant/api-contract.ts)
// POST   /api/manager/assistant/conversations — start a thread (CreateConversationBody → ConversationCard)
// DELETE /api/manager/assistant/conversations — delete one of the viewer's threads ({ conversationId })
//
// A request carrying none of folderId / scope / pinned / q / cursor / limit is
// the legacy picker call of ChatWorkspace, Thread, AssistantSidebarLayout,
// AssistantModal and AssistantProjetPanel, answered in the legacy shape.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, validateRequest } from "@/lib/api-utils";
import { optional } from "@/lib/assistant/store/missing";
import { assistantRoute, flag } from "@/lib/assistant/conversations/http";
import { parseLimit } from "@/lib/assistant/conversations/cursor";
import {
    createConversation,
    deleteConversation,
    listConversations,
    loadViewer,
} from "@/lib/assistant/conversations/service";
import type { ConversationCard, ConversationsResponse } from "@/lib/assistant/api-contract";

export const dynamic = "force-dynamic";

const V4_PARAMS = ["folderId", "scope", "pinned", "q", "cursor", "limit"] as const;

export const GET = assistantRoute(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const { searchParams } = new URL(request.url);

    if (!V4_PARAMS.some((p) => searchParams.has(p))) {
        return legacyGet(session.user.id, searchParams);
    }

    const viewer = await loadViewer(session.user.id);
    const data: ConversationsResponse = await listConversations(viewer, {
        folderId: searchParams.get("folderId")?.trim() || null,
        scope: searchParams.get("scope") === "agency" ? "agency" : null,
        pinned: flag(searchParams.get("pinned")),
        q: searchParams.get("q"),
        cursor: searchParams.get("cursor"),
        limit: parseLimit(searchParams.get("limit")),
    });
    return successResponse(data);
});

/**
 * @deprecated legacy shape for ChatWorkspace/Thread until the v4 workspace ships.
 *
 * `{ clients, conversations, conversationId, messages }`: the picker (every
 * client with its active missions), the viewer's 50 most recent threads of
 * that exact binding (clientId/missionId, none = agency view), and the latest
 * 100 messages of the requested (or most recent) thread, oldest first.
 */
async function legacyGet(userId: string, searchParams: URLSearchParams) {
    const clientId = searchParams.get("clientId");
    const missionId = searchParams.get("missionId");

    const clients = await prisma.client.findMany({
        where: { archivedAt: null },
        orderBy: { name: "asc" },
        select: {
            id: true,
            name: true,
            missions: {
                where: { isActive: true },
                orderBy: { startDate: "desc" },
                select: { id: true, name: true, status: true },
            },
        },
    });

    const conversations = await prisma.assistantConversation.findMany({
        where: {
            clientId: clientId || null,
            missionId: clientId ? missionId || null : null,
            createdById: userId,
        },
        orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        take: 50,
        select: {
            id: true,
            title: true,
            summary: true,
            messageCount: true,
            lastMessageAt: true,
            updatedAt: true,
        },
    });

    // A requested thread must be the viewer's own; otherwise resume the most recent one.
    const requested = searchParams.get("conversationId");
    const owned = requested
        ? await prisma.assistantConversation.findFirst({
              where: { id: requested, createdById: userId },
              select: { id: true },
          })
        : null;
    const activeId = owned?.id ?? (requested ? null : conversations[0]?.id ?? null);

    const select = { id: true, role: true, content: true, trace: true, action: true, createdAt: true } as const;
    // Latest 100 live messages (newest first), then put back in reading order.
    const newestFirst = activeId
        ? await optional(
              "conversations.legacy.messages",
              () =>
                  prisma.assistantMessage.findMany({
                      where: { conversationId: activeId, supersededAt: null },
                      orderBy: { createdAt: "desc" },
                      take: 100,
                      select,
                  }),
              () =>
                  prisma.assistantMessage.findMany({
                      where: { conversationId: activeId },
                      orderBy: { createdAt: "desc" },
                      take: 100,
                      select,
                  }),
          )
        : [];
    const messages = [...newestFirst].reverse();

    return successResponse({
        clients,
        conversations,
        conversationId: activeId,
        messages: messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            trace: m.trace,
            action: m.action,
            createdAt: m.createdAt.toISOString(),
        })),
    });
}

const CreateBody = z.object({
    folderId: z.string().max(64).optional().nullable(),
    /** Without folderId: the CLIENT folder is ensured and used. Omitted = a "vue agence" thread. */
    clientId: z.string().max(64).optional().nullable(),
    missionId: z.string().max(64).optional().nullable(),
    seedSummary: z.string().max(20_000).optional().nullable(),
    title: z.string().max(300).optional().nullable(),
});

export const POST = assistantRoute(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const body = await validateRequest(request, CreateBody);
    const card: ConversationCard = await createConversation(viewer, body);
    return successResponse(
        {
            ...card,
            /** @deprecated legacy shape for ChatWorkspace/Thread (`data.conversation.id`) until the v4 workspace ships. */
            conversation: { id: card.id, title: card.title, createdAt: card.createdAt },
        },
        201,
    );
});

const DeleteBody = z.object({ conversationId: z.string().min(1).max(64) });

export const DELETE = assistantRoute(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const body = await validateRequest(request, DeleteBody);
    await deleteConversation(body.conversationId, viewer);
    return successResponse({ deleted: true });
});
