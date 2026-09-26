import { NextRequest } from "next/server";
import {
  successResponse,
  requireRole,
  requirePermission,
  withErrorHandler,
} from "@/lib/api-utils";
import { hrCalculationService } from "@/lib/hr/hr-calculation-service";

// ============================================
// GET /api/hr/months - Get HR table data for a month
// ============================================
export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireRole(["MANAGER"], request);
  await requirePermission("features.hr_view", request);

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = searchParams.get("month") || currentMonthStr;

  const rows = await hrCalculationService.getMonthOverview(month);
  return successResponse({ month, rows });
});
