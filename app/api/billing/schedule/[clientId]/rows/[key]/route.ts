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
    ValidationError,
} from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { parisDay } from "@/lib/clients/first-call";
import {
    applyRowAction,
    isMonthKey,
    isValidDay,
    withRowTick,
    SETUP_KEY,
    type Tick,
} from "@/lib/billing/cycle-schedule";
import { updateClientState, ScheduleConflictError } from "@/lib/billing/schedule-store";

// ============================================
// PATCH /api/billing/schedule/[clientId]/rows/[key]
// Ticks one row of the schedule: key "YYYY-MM" (cycle) or "setup".
// The invoice itself lives in the accounting tool; only its date, amount and
// reference are noted here.
// ============================================

const ACTION_LABELS = {
    invoice: "marqué facturé",
    pay: "marqué payé",
    "unmark-invoice": "facturation annulée",
    "unmark-pay": "paiement annulé",
} as const;

const rowSchema = z.object({
    action: z.enum(["invoice", "pay", "unmark-invoice", "unmark-pay"]),
    date: z.string().refine(isValidDay, "Date attendue au format AAAA-MM-JJ").optional(),
    amount: z.number().finite().nonnegative().nullable().optional(),
    reference: z.string().max(200).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
});

export const PATCH = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ clientId: string; key: string }> }
) => {
    const session = await requireRole(["MANAGER"], request);
    const { clientId, key } = await params;
    if (key !== SETUP_KEY && !isMonthKey(key)) {
        throw new ValidationError("Ligne inconnue (attendu « setup » ou AAAA-MM)");
    }
    const body = await validateRequest(request, rowSchema);

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
    if (!client) throw new NotFoundError("Client introuvable");

    const today = parisDay(new Date());
    let before: Tick | undefined;
    let after: Tick | undefined;
    try {
        const state = await updateClientState(clientId, (current) => {
            before = key === SETUP_KEY ? current.setup : current.cycles[key];
            after = applyRowAction(before, { ...body, userId: session.user.id, today });
            return withRowTick(current, key, after);
        });
        audit(request, session, {
            action: "UPDATE",
            entityType: "BillingSchedule",
            entityId: clientId,
            summary: `${client.name} · ${key === SETUP_KEY ? "setup" : key} ${ACTION_LABELS[body.action]}`,
            before: before ?? null,
            after: after ?? null,
            metadata: { key, action: body.action },
        });
        return successResponse(state);
    } catch (err) {
        if (err instanceof ScheduleConflictError) return errorResponse(err.message, 409);
        throw err;
    }
});
