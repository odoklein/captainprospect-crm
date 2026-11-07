import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getTaskFeed } from "@/lib/tasks/feed";

// GET /api/tasks/feed?scope=mine|team&status=open|done
// The unified task list (lib/tasks/feed.ts). "team" is honoured for managers only.
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(
        ["MANAGER", "SDR", "BOOKER", "DEVELOPER", "BUSINESS_DEVELOPER", "COMMERCIAL"],
        request,
    );
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") === "team" ? "team" : "mine";
    const status = searchParams.get("status") === "done" ? "done" : "open";

    const feed = await getTaskFeed({ id: session.user.id, role: session.user.role }, { scope, status });
    return successResponse(feed);
});
