import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { getGmapsRun, providersStatus, startGmapsRun } from "@/lib/sourcing/providers.server";
import { querySchema } from "@/lib/sourcing/schemas";

// ============================================
// Google Maps runs on Apify and takes 1-3 minutes.
// POST starts one run for every activity × location pair; GET polls it and
// returns the normalized leads once it has succeeded.
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const query = await validateRequest(request, querySchema);
    const status = providersStatus().gmaps;
    if (!status.configured) return errorResponse(status.reason ?? "Google Maps non configuré", 400);
    return successResponse(await startGmapsRun(query));
});

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const runId = request.nextUrl.searchParams.get("runId");
    if (!runId) return errorResponse("runId requis", 400);
    return successResponse(await getGmapsRun(runId));
});
