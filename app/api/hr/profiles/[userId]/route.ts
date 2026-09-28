import { NextRequest } from "next/server";
import {
  successResponse,
  errorResponse,
  requireRole,
  requirePermission,
  withErrorHandler,
  validateRequest,
} from "@/lib/api-utils";
import { hrProfileService } from "@/lib/hr/hr-profile-service";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { ContractType, RemunerationMode } from "@prisma/client";

// ============================================
// GET /api/hr/profiles/[userId] - Get user profile
// ============================================
export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ userId: string }> }) => {
    await requireRole(["MANAGER"], request);
    await requirePermission("features.hr_view", request);

    const { userId } = await params;
    const [result, months] = await Promise.all([
      hrProfileService.getProfile(userId),
      prisma.hrMonthRecord.findMany({
        where: { userId },
        orderBy: { month: "desc" },
        take: 12,
        select: {
          id: true,
          month: true,
          status: true,
          workingDays: true,
          absenceDays: true,
          totalCalls: true,
          totalRdv: true,
          fixedAmountCents: true,
          variableAmountCents: true,
          adjustmentCents: true,
          totalAmountCents: true,
          validatedAt: true,
          paidAt: true,
        },
      }),
    ]);
    return successResponse({ ...result, months });
  }
);

// ============================================
// PUT /api/hr/profiles/[userId] - Update user profile
// ============================================
const updateHrProfileSchema = z.object({
  contractType: z.nativeEnum(ContractType),
  remunerationMode: z.nativeEnum(RemunerationMode),
  fixedSalaryCents: z.number().int().min(0, "Le salaire fixe doit être positif"),
  variablePerRdvCents: z.number().int().min(0, "La prime par RDV doit être positive"),
  dailyQuota: z.number().int().min(0, "Le quota journalier doit être positif"),
  effectiveFrom: z.string().min(1, "Date d'effet requise"),
  managerId: z.string().nullable().optional(),
  reason: z.string().optional(),
});

export const PUT = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ userId: string }> }) => {
    const session = await requireRole(["MANAGER"], request);
    await requirePermission("features.hr_configure", request);

    const { userId } = await params;
    const body = await validateRequest(request, updateHrProfileSchema);

    const result = await hrProfileService.upsertProfile(
      {
        userId,
        ...body,
      },
      session.user.id,
      body.reason
    );

    return successResponse(result);
  }
);
