import { NextRequest } from "next/server";
import { successResponse, requireRole, withErrorHandler } from "@/lib/api-utils";
import { getStaffingOverview } from "@/lib/staffing/clientStaffing";

/**
 * GET /api/manager/dashboard-projet
 *
 * Client/mission staffing overview: contracted days/week, historical bookers
 * (from real call data) and currently-scheduled bookers (from the live planning
 * grid), plus a missing-headcount flag per mission. See lib/staffing/clientStaffing.ts.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const overview = await getStaffingOverview();
    return successResponse(overview);
});
