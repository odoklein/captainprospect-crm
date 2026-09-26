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

const calculateSchema = z.object({
  userId: z.string().min(1, "Utilisateur requis"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Format de mois invalide (YYYY-MM)"),
  forceReopen: z.boolean().optional(),
});

// ============================================
// POST /api/hr/months/calculate - Calculate/recalculate for a user
// ============================================
export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireRole(["MANAGER"], request);
  await requirePermission("features.hr_calculate", request);

  const data = await validateRequest(request, calculateSchema);

  // If forceReopen is requested, verify hr_reopen permission
  if (data.forceReopen) {
    await requirePermission("features.hr_reopen", request);
  }

  const breakdown = await hrCalculationService.calculateUserMonth(
    data.userId,
    data.month,
    true,
    session.user.id,
    { forceReopen: data.forceReopen }
  );

  return successResponse(breakdown);
});

// ============================================
// GET /api/hr/months/calculate - Preview / breakdown details
// ============================================
export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireRole(["MANAGER"], request);
  await requirePermission("features.hr_view", request);

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const month = searchParams.get("month");

  if (!userId || !month) {
    throw new Error("userId et month sont requis");
  }

  const breakdown = await hrCalculationService.calculateUserMonth(
    userId,
    month,
    false // preview only
  );

  return successResponse(breakdown);
});
