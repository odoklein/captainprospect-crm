import { NextRequest } from "next/server";
import {
  successResponse,
  requireRole,
  requirePermission,
  withErrorHandler,
  validateRequest,
  ValidationError,
} from "@/lib/api-utils";
import { hrCalculationService } from "@/lib/hr/hr-calculation-service";
import { resolveStatusTransition } from "@/lib/hr/hr-rules";
import { HrMonthStatus } from "@prisma/client";
import { z } from "zod";

const updateStatusSchema = z.object({
  status: z.nativeEnum(HrMonthStatus),
  adjustmentCents: z.number().int().optional(),
  adjustmentNote: z.string().max(500).optional(),
});

// ============================================
// PUT /api/hr/months/[id]/status - Update month status
// ============================================
export const PUT = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, updateStatusSchema);

    const current = await hrCalculationService.getMonthRecordStatus(id);
    const transition = resolveStatusTransition(current, body.status);
    if (!transition.allowed) throw new ValidationError(transition.reason!);
    for (const permission of transition.permissions) {
      await requirePermission(permission, request);
    }

    const updated = await hrCalculationService.updateStatus(id, body.status, session.user.id, {
      adjustmentCents: body.adjustmentCents,
      adjustmentNote: body.adjustmentNote,
    });

    return successResponse(updated);
  }
);
