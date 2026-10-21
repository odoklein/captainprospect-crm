import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { parsePeriodRange } from "@/lib/manager-home/rules";
import { getStatsOverview } from "@/lib/stats/overview";

// ============================================
// GET /api/analytics/overview?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//     [&sdrIds[]=…&missionIds[]=…&clientIds[]=…&listIds[]=…]
// One period + the equal-length period before it, for the Statistiques page.
// Days are Europe/Paris days. See lib/stats/types.ts.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER", "DEVELOPER"], request);

    const { searchParams } = new URL(request.url);
    const range = parsePeriodRange(searchParams.get("startDate"), searchParams.get("endDate"));
    if (!range) return errorResponse("Période invalide", 400);

    return successResponse(
        await getStatsOverview(range, {
            sdrIds: searchParams.getAll("sdrIds[]"),
            missionIds: searchParams.getAll("missionIds[]"),
            clientIds: searchParams.getAll("clientIds[]"),
            listIds: searchParams.getAll("listIds[]"),
        }),
    );
});
