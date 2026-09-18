// ============================================
// POST /api/support/conversation/read
// Client-side read marker — resets the unread counter shown on the FAB.
// Managers use /api/support/manager/conversations/[id]/read instead.
// ============================================

import { NextRequest } from "next/server";
import {
    successResponse,
    requireAuth,
    withErrorHandler,
    AuthError,
    NotFoundError,
} from "@/lib/api-utils";
import {
    getConversationIdForClientUser,
    markRead,
    resolveAccessibleConversationId,
} from "@/lib/support/service";

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    if (session.user.role !== "CLIENT" && session.user.role !== "COMMERCIAL") {
        throw new AuthError("Réservé aux clients/commerciaux", 403);
    }
    let bodyConversationId: string | undefined;
    try {
        const body = await request.json().catch(() => ({}));
        if (body?.conversationId && typeof body.conversationId === "string") {
            bodyConversationId = body.conversationId;
        }
    } catch {
        // Body was empty or invalid JSON
    }

    const conversationId = await resolveAccessibleConversationId(
        session.user,
        bodyConversationId,
    );
    if (!conversationId) {
        throw new NotFoundError("Aucune conversation de support disponible");
    }
    await markRead(conversationId, session.user.id, "CLIENT");
    return successResponse({ ok: true });
});
