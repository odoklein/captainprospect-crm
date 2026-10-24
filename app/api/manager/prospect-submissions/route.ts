// GET /api/manager/prospect-submissions — every pending SDR addition, all missions, re-checked.
import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { listReviewItems } from "@/lib/prospect-submissions/review";

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const missionId = new URL(request.url).searchParams.get("mission") || undefined;
    return successResponse(await listReviewItems(missionId));
});
