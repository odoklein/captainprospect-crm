// ============================================
// POST /api/support/conversation/email-notification
// Client toggles the "email me on reply" preference.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { successResponse, requireRole, withErrorHandler, validateRequest } from "@/lib/api-utils";
import { resolveAccessibleConversationId, setEmailNotificationPreference } from "@/lib/support/service";

const Body = z.object({
    enabled: z.boolean(),
    // The conversation being viewed; without it the primary one is used.
    conversationId: z.string().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT", "COMMERCIAL"], request);
    const body = await validateRequest(request, Body);

    const conversationId = await resolveAccessibleConversationId(session.user, body.conversationId);
    if (!conversationId) {
        return successResponse({ updated: false });
    }

    await setEmailNotificationPreference(conversationId, body.enabled);
    return successResponse({ updated: true, enabled: body.enabled });
});
