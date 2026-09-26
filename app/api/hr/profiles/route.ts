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
import { z } from "zod";
import { ContractType, RemunerationMode } from "@prisma/client";

// ============================================
// GET /api/hr/profiles - List all team profiles
// ============================================
export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireRole(["MANAGER"], request);
  await requirePermission("features.hr_view", request);

  const profiles = await hrProfileService.listProfiles();
  return successResponse(profiles);
});

// ============================================
// POST /api/hr/profiles - Create or update profile
// ============================================
const hrProfileSchema = z.object({
  userId: z.string().min(1, "Utilisateur requis"),
  contractType: z.nativeEnum(ContractType),
  remunerationMode: z.nativeEnum(RemunerationMode),
  fixedSalaryCents: z.number().int().min(0, "Le salaire fixe doit être positif"),
  variablePerRdvCents: z.number().int().min(0, "La prime par RDV doit être positive"),
  dailyQuota: z.number().int().min(0, "Le quota journalier doit être positif"),
  effectiveFrom: z.string().min(1, "Date d'effet requise"),
  managerId: z.string().nullable().optional(),
  reason: z.string().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireRole(["MANAGER"], request);
  await requirePermission("features.hr_configure", request);

  const data = await validateRequest(request, hrProfileSchema);
  const result = await hrProfileService.upsertProfile(
    data,
    session.user.id,
    data.reason
  );

  return successResponse(result);
});
