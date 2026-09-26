import { NextRequest } from "next/server";
import {
  successResponse,
  requireRole,
  requirePermission,
  withErrorHandler,
  validateRequest,
} from "@/lib/api-utils";
import { hrCalculationService } from "@/lib/hr/hr-calculation-service";
import { HrMonthStatus } from "@prisma/client";
import { z } from "zod";

const updateStatusSchema = z.object({
  status: z.nativeEnum(HrMonthStatus),
  adjustmentCents: z.number().int().optional(),
  adjustmentNote: z.string().optional(),
});

// ============================================
// PUT /api/hr/months/[id]/status - Update month status
// ============================================
export const PUT = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, updateStatusSchema);

    // If validating, check hr_validate permission
    if (body.status === HrMonthStatus.VALIDATED) {
      await requirePermission("features.hr_validate", request);
    } else {
      await requirePermission("features.hr_configure", request);
    }

    const updated = await hrCalculationService.updateStatus(
      id,
      body.status,
      session.user.id,
      {
        adjustmentCents: body.adjustmentCents,
        adjustmentNote: body.adjustmentNote,
      }
    );

    return successResponse(updated);
  }
);
