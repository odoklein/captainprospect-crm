import { NextRequest } from "next/server";
import { successResponse, requireRole, withErrorHandler } from "@/lib/api-utils";
import { getBillingSchedule } from "@/lib/billing/schedule-service";

// ============================================
// GET /api/billing/schedule - Monthly billing schedule (« Échéancier »)
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    return successResponse(await getBillingSchedule());
});
