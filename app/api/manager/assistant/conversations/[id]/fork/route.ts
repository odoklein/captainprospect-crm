// ============================================
// POST /api/manager/assistant/conversations/[id]/fork — continue a readable thread
// in a new private one of the viewer's (ConversationCard)
//
// Same folder, client and mission; seeded with the source's summary (or its
// last exchanges). This is how a manager "replies" to a colleague's SHARED thread.
// ============================================

import { NextRequest } from "next/server";
import { requireRole, successResponse } from "@/lib/api-utils";
import { assistantRoute, readIds } from "@/lib/assistant/conversations/http";
import { forkConversation, loadViewer } from "@/lib/assistant/conversations/service";

export const dynamic = "force-dynamic";

export const POST = assistantRoute<{ id: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const { id } = await readIds(params, "id");
    return successResponse(await forkConversation(id, viewer), 201);
});
