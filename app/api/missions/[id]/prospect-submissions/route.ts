// GET /api/missions/[id]/prospect-submissions — pending SDR additions of one mission, re-checked.
import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { listReviewItems } from "@/lib/prospect-submissions/review";

export const GET = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;
    return successResponse(await listReviewItems(id));
});
