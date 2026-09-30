import { NextRequest } from "next/server";
import { z } from "zod";
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
} from "@/lib/api-utils";
import { getPaceConfig, savePaceConfig } from "@/lib/sdr-pace/config";
import { PACE_DEFAULTS, PACE_LIMITS } from "@/lib/sdr-pace/pace";

const { dailyQuota, targetHours } = PACE_LIMITS;

const paceConfigSchema = z.object({
    dailyQuota: z
        .number()
        .int("Le quota doit être un nombre entier")
        .min(dailyQuota.min, `Le quota doit être d'au moins ${dailyQuota.min} appel`)
        .max(dailyQuota.max, `Le quota ne peut pas dépasser ${dailyQuota.max} appels`),
    targetHours: z
        .number()
        .min(targetHours.min, `La durée d'appel doit être d'au moins ${targetHours.min} h`)
        .max(targetHours.max, `La durée d'appel ne peut pas dépasser ${targetHours.max} h`),
});

// GET /api/system-config/sdr-pace — Daily call quota + effective calling hours (applies to every SDR)
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);

    return successResponse({ ...(await getPaceConfig()), defaults: PACE_DEFAULTS });
});

// PUT /api/system-config/sdr-pace — Change the quota for everyone
export const PUT = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);

    const parsed = paceConfigSchema.safeParse(await request.json());
    if (!parsed.success) {
        return errorResponse(parsed.error.issues[0]?.message ?? "Valeurs invalides", 400);
    }

    await savePaceConfig(parsed.data);

    return successResponse({ ...parsed.data, defaults: PACE_DEFAULTS });
});
