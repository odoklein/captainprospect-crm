import { NextRequest } from "next/server";
import { successResponse, requireRole, withErrorHandler } from "@/lib/api-utils";
import { loadActionQueue } from "@/lib/sdr-queue/load-action-queue";

// GET /api/sdr/action-queue — see lib/sdr-queue/load-action-queue.ts.
// Query: missionId?, listId?, channel?, search?
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["SDR", "BUSINESS_DEVELOPER", "BOOKER"], request);
    const { searchParams } = new URL(request.url);
    const result = await loadActionQueue({
        sdrId: session.user.id,
        role: session.user.role,
        missionId: searchParams.get("missionId"),
        listId: searchParams.get("listId"),
        channel: searchParams.get("channel"),
        search: searchParams.get("search"),
    });
    // Same response as before the move: an out-of-scope request answers { items: [] }.
    return successResponse(result.paused ? result : { items: result.items });
});
