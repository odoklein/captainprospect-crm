// ============================================
// POST /api/manager/assistant/folders/ensure — create-or-get a client's folder
//
// The rail lists clients without a folder row as virtual folders; opening one
// calls this, which is idempotent and safe under concurrent calls.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest } from "@/lib/api-utils";
import { optional } from "@/lib/assistant/store/missing";
import { assistantRoute } from "@/lib/assistant/conversations/http";
import { loadViewer } from "@/lib/assistant/conversations/service";
import {
    AssistantAccessError,
    FOLDERS_UNAVAILABLE,
    ensureClientFolder,
    getFolderDetail,
} from "@/lib/assistant/folders/service";

export const dynamic = "force-dynamic";

const Body = z.object({ clientId: z.string().trim().min(1).max(64) });

export const POST = assistantRoute(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const { clientId } = await validateRequest(request, Body);

    const folder = await optional("folders.ensure", () => ensureClientFolder(clientId, viewer.id), null);
    if (!folder) throw new AssistantAccessError(FOLDERS_UNAVAILABLE, 503);
    return successResponse(await getFolderDetail(folder.id, viewer));
});
