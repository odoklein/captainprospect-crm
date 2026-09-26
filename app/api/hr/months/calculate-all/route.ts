import { NextRequest } from "next/server";
import {
  successResponse,
  requireRole,
  requirePermission,
  withErrorHandler,
  validateRequest,
} from "@/lib/api-utils";
import { hrCalculationService } from "@/lib/hr/hr-calculation-service";
import { z } from "zod";

const calculateAllSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Format de mois invalide (YYYY-MM)"),
});

// ============================================
// POST /api/hr/months/calculate-all - Bulk recalculate month
// ============================================
export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireRole(["MANAGER"], request);
  await requirePermission("features.hr_calculate", request);

  const data = await validateRequest(request, calculateAllSchema);
  const results = await hrCalculationService.calculateAllForMonth(
    data.month,
    session.user.id
  );

  return successResponse(results);
});
