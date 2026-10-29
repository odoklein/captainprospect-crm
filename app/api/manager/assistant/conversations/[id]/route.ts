// ============================================
// GET    /api/manager/assistant/conversations/[id]?before=<messageId>&limit=60 — ThreadResponse
// PATCH  /api/manager/assistant/conversations/[id] — rename / move / share / pin (owner only)
// DELETE /api/manager/assistant/conversations/[id] — owner only
//
// Readable by the owner, or by any active manager when SHARED; writable by the
// owner alone. Anything else is a 404.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest } from "@/lib/api-utils";
import { assistantRoute, readIds } from "@/lib/assistant/conversations/http";
import { parseLimit } from "@/lib/assistant/conversations/cursor";
import {
    THREAD_LIMIT_DEFAULT,
    THREAD_LIMIT_MAX,
    deleteConversation,
    getThread,
    loadViewer,
    patchConversation,
} from "@/lib/assistant/conversations/service";

export const dynamic = "force-dynamic";

export const GET = assistantRoute<{ id: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const { id } = await readIds(params, "id");
    const { searchParams } = new URL(request.url);
    const thread = await getThread(id, viewer, {
        before: searchParams.get("before")?.trim() || null,
        limit: parseLimit(searchParams.get("limit"), THREAD_LIMIT_DEFAULT, THREAD_LIMIT_MAX),
    });
    return successResponse(thread);
});

const PatchBody = z
    .object({
        title: z.string().max(300).optional(),
        folderId: z.string().max(64).nullable().optional(),
        visibility: z.enum(["PRIVATE", "SHARED"]).optional(),
        pinned: z.boolean().optional(),
    })
    .strict();

export const PATCH = assistantRoute<{ id: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const { id } = await readIds(params, "id");
    const body = await validateRequest(request, PatchBody);
    return successResponse(await patchConversation(id, viewer, body));
});

export const DELETE = assistantRoute<{ id: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const { id } = await readIds(params, "id");
    await deleteConversation(id, viewer);
    return successResponse({ deleted: true });
});
