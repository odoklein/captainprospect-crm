// ============================================
// POST /api/manager/assistant/conversations/[id]/messages/[messageId]/feedback
//      — rate an answer (FeedbackBody; rating null clears) → the ThreadMessage
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest } from "@/lib/api-utils";
import { assistantRoute, readIds } from "@/lib/assistant/conversations/http";
import { loadViewer, setMessageFeedback } from "@/lib/assistant/conversations/service";

export const dynamic = "force-dynamic";

const Body = z.object({
    rating: z.enum(["up", "down"]).nullable(),
    comment: z.string().max(2000).nullable().optional(),
});

export const POST = assistantRoute<{ id: string; messageId: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const { id, messageId } = await readIds(params, "id", "messageId");
    const body = await validateRequest(request, Body);
    return successResponse(await setMessageFeedback(id, messageId, viewer, body));
});
