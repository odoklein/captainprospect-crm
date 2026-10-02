import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { parsePeriodRange } from "@/lib/manager-home/rules";
import { getManagerHomePeriod } from "@/lib/manager-home/period";

// ============================================
// GET /api/manager/home/period?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD[&missionId=]
// Real RDV/actions series, previous-period totals and recent RDVs for the
// manager home (app/manager/dashboard). Days are Europe/Paris days.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);

    const { searchParams } = new URL(request.url);
    const range = parsePeriodRange(searchParams.get("startDate"), searchParams.get("endDate"));
    if (!range) return errorResponse("Période invalide", 400);

    const missionId = searchParams.get("missionId") || null;
    return successResponse(await getManagerHomePeriod(range, missionId));
});
