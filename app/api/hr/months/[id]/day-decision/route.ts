import { NextRequest } from "next/server";
import {
  successResponse,
  requireRole,
  requirePermission,
  withErrorHandler,
  validateRequest,
} from "@/lib/api-utils";
import { hrCalculationService } from "@/lib/hr/hr-calculation-service";
import { HrDayDecision } from "@prisma/client";
import { z } from "zod";

const dayDecisionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (YYYY-MM-DD)"),
  decision: z.nativeEnum(HrDayDecision),
  reason: z.string().min(3, "Un motif d'au moins 3 caractères est obligatoire"),
});

// ============================================
// POST /api/hr/months/[id]/day-decision - Decide on under-quota day
// ============================================
export const POST = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["MANAGER"], request);
    await requirePermission("features.hr_day_decision", request);

    const { id } = await params;
    const body = await validateRequest(request, dayDecisionSchema);

    const result = await hrCalculationService.recordDayDecision(
      id,
      body.date,
      body.decision,
      body.reason,
      session.user.id
    );

    return successResponse(result);
  }
);
