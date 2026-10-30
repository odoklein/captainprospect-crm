// ============================================
// GET /api/manager/assistant/search?q= — conversations (titles and messages the
// viewer may read), folders and folder files by name (SearchResponse)
// ============================================

import { NextRequest } from "next/server";
import { requireRole, successResponse } from "@/lib/api-utils";
import { assistantRoute } from "@/lib/assistant/conversations/http";
import { loadViewer } from "@/lib/assistant/conversations/service";
import { searchAssistant } from "@/lib/assistant/search/service";

export const dynamic = "force-dynamic";

export const GET = assistantRoute(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const q = new URL(request.url).searchParams.get("q");
    return successResponse(await searchAssistant(viewer, q));
});
