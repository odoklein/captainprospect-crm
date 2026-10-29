// ============================================
// PATCH /api/manager/agent/findings/[id] — PatchFindingBody → AgentFindingItem
//   ACKED: seen by a manager · SNOOZED: silent until `snoozedUntil` (required,
//   in the future, ≤ 90 days) · RESOLVED: closed · OPEN: back in the inbox.
// A watch rule that sees the condition again reopens it (lib/agent/findings.ts).
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotFoundError, requireRole, successResponse, validateRequest, ValidationError, withErrorHandler } from "@/lib/api-utils";
import { isAgentUnavailable } from "@/lib/agent/api";
import { toFindingItems } from "@/lib/agent/findings-api";
import { withStore } from "@/lib/agent/store";

export const dynamic = "force-dynamic";

const Body = z.object({
    state: z.enum(["ACKED", "SNOOZED", "RESOLVED", "OPEN"]),
    snoozedUntil: z.string().datetime({ offset: true }).optional(),
});

const MAX_SNOOZE_MS = 90 * 24 * 3_600_000;

export const PATCH = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, Body);
    const now = new Date();

    let data: Prisma.AgentFindingUpdateInput;
    switch (body.state) {
        case "ACKED":
            data = { state: "ACKED", ackedById: session.user.id, ackedAt: now, snoozedUntil: null };
            break;
        case "SNOOZED": {
            const until = body.snoozedUntil ? new Date(body.snoozedUntil) : null;
            if (!until || until.getTime() <= now.getTime()) throw new ValidationError("snoozedUntil doit être une date future.");
            if (until.getTime() - now.getTime() > MAX_SNOOZE_MS) throw new ValidationError("Mise en sourdine de 90 jours au plus.");
            data = { state: "SNOOZED", snoozedUntil: until, ackedById: session.user.id, ackedAt: now };
            break;
        }
        case "RESOLVED":
            data = { state: "RESOLVED", resolvedAt: now, snoozedUntil: null };
            break;
        default:
            data = { state: "OPEN", resolvedAt: null, snoozedUntil: null };
    }

    try {
        const { count } = await withStore(() => prisma.agentFinding.updateMany({ where: { id }, data: data as Prisma.AgentFindingUpdateManyMutationInput }));
        if (count === 0) throw new NotFoundError("Signalement introuvable");
        const row = await withStore(() => prisma.agentFinding.findUnique({ where: { id } }));
        if (!row) throw new NotFoundError("Signalement introuvable");
        const [item] = await toFindingItems([row]);
        return successResponse(item);
    } catch (error) {
        if (isAgentUnavailable(error)) throw new NotFoundError("Signalement introuvable");
        throw error;
    }
});
