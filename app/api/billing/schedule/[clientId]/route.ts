import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
    NotFoundError,
} from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { isValidDay, type ClientScheduleState } from "@/lib/billing/cycle-schedule";
import { updateClientState, ScheduleConflictError } from "@/lib/billing/schedule-store";

// ============================================
// PATCH /api/billing/schedule/[clientId]
// Start date override (null = back to the first call) and tracking on/off.
// ============================================

const patchSchema = z.object({
    anchorOverride: z.string().refine(isValidDay, "Date attendue au format AAAA-MM-JJ").nullable().optional(),
    disabled: z.boolean().optional(),
    note: z.string().max(2000).nullable().optional(),
});

export const PATCH = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ clientId: string }> }
) => {
    const session = await requireRole(["MANAGER"], request);
    const { clientId } = await params;
    const body = await validateRequest(request, patchSchema);

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
    if (!client) throw new NotFoundError("Client introuvable");

    let before: ClientScheduleState | undefined;
    try {
        const after = await updateClientState(clientId, (current) => {
            before = current;
            const next: ClientScheduleState = { ...current };
            if (body.anchorOverride !== undefined) {
                if (body.anchorOverride) next.anchorOverride = body.anchorOverride;
                else delete next.anchorOverride;
            }
            if (body.disabled !== undefined) {
                if (body.disabled) next.disabled = true;
                else delete next.disabled;
            }
            if (body.note !== undefined) {
                const note = body.note?.trim();
                if (note) next.note = note;
                else delete next.note;
            }
            return next;
        });
        audit(request, session, {
            action: "UPDATE",
            entityType: "BillingSchedule",
            entityId: clientId,
            summary: `Échéancier de ${client.name} modifié`,
            before: { anchorOverride: before?.anchorOverride ?? null, disabled: !!before?.disabled, note: before?.note ?? null },
            after: { anchorOverride: after.anchorOverride ?? null, disabled: !!after.disabled, note: after.note ?? null },
        });
        return successResponse(after);
    } catch (err) {
        if (err instanceof ScheduleConflictError) return errorResponse(err.message, 409);
        throw err;
    }
});
