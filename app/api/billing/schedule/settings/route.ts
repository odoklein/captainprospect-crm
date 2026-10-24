import { NextRequest } from "next/server";
import { z } from "zod";
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
} from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { isValidDay } from "@/lib/billing/cycle-schedule";
import { getScheduleSettings, updateScheduleSettings, ScheduleConflictError } from "@/lib/billing/schedule-store";

// ============================================
// GET / PATCH /api/billing/schedule/settings
// ============================================

const settingsSchema = z.object({
    trackFrom: z.string().refine(isValidDay, "Date attendue au format AAAA-MM-JJ").nullable().optional(),
    leadDays: z.number().int().min(0).max(90).optional(),
    firstCycleGraceDays: z.number().int().min(0).max(90).optional(),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    return successResponse(await getScheduleSettings());
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, settingsSchema);

    let before: unknown;
    try {
        const after = await updateScheduleSettings((current) => {
            before = current;
            return {
                trackFrom: body.trackFrom !== undefined ? body.trackFrom : current.trackFrom,
                leadDays: body.leadDays ?? current.leadDays,
                firstCycleGraceDays: body.firstCycleGraceDays ?? current.firstCycleGraceDays,
            };
        });
        audit(request, session, {
            action: "UPDATE",
            entityType: "BillingScheduleSettings",
            summary: "Paramètres de l'échéancier de facturation modifiés",
            before,
            after,
        });
        return successResponse(after);
    } catch (err) {
        if (err instanceof ScheduleConflictError) return errorResponse(err.message, 409);
        throw err;
    }
});
