import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { statusConfigService } from "@/lib/services/StatusConfigService";
import { addDay, parisDay, parisMidnight } from "@/lib/manager-home/today-rules";
import type { CallbackCount } from "@/lib/tasks/feed-types";

// ============================================
// URGENT CALLBACKS — what the unified task list shows instead of listing callbacks.
// A callback is "urgent" when it is still live and due before tonight
// (Europe/Paris): late, or still to do today. "Live" follows the Rappels
// page (app/api/sdr/callbacks): a callback action stops counting once a newer
// action exists on the same contact or company, and an SDR only counts
// callbacks on missions they are assigned to.
// ============================================

const DEFAULT_CALLBACK_CODES = ["CALLBACK_REQUESTED", "RELANCE", "RAPPEL"];

/** Result codes that mean "call back": the defaults plus every status configured with triggersCallback. */
export async function getCallbackStatusCodes(): Promise<string[]> {
    const codes = new Set<string>(DEFAULT_CALLBACK_CODES);
    try {
        const cfg = await statusConfigService.getEffectiveStatusConfig({});
        for (const status of cfg.statuses) {
            if (status.triggersCallback) codes.add(status.code);
        }
    } catch {
        // Keep the default callback codes if the config lookup fails.
    }
    return [...codes];
}

/**
 * Urgent callbacks per SDR. `sdrIds` null = every SDR with at least one.
 * SDRs with none are left out of the result.
 */
export async function countUrgentCallbacks(sdrIds: string[] | null, now: Date = new Date()): Promise<CallbackCount[]> {
    if (sdrIds && sdrIds.length === 0) return [];
    const codes = await getCallbackStatusCodes();
    const tonight = parisMidnight(addDay(parisDay(now), 1));
    const sdrFilter = sdrIds ? Prisma.sql`AND a."sdrId" IN (${Prisma.join(sdrIds)})` : Prisma.empty;

    const rows = await prisma.$queryRaw<{ sdrId: string; sdrName: string; urgent: number; late: number }[]>`
        SELECT a."sdrId" AS "sdrId",
               u."name" AS "sdrName",
               COUNT(*)::int AS "urgent",
               (COUNT(*) FILTER (WHERE a."callbackDate" < ${now}))::int AS "late"
        FROM "Action" a
        JOIN "User" u ON u."id" = a."sdrId"
        JOIN "Campaign" c ON c."id" = a."campaignId"
        WHERE a."result"::text IN (${Prisma.join(codes)})
          AND a."callbackDate" IS NOT NULL
          AND a."callbackDate" < ${tonight}
          ${sdrFilter}
          AND EXISTS (SELECT 1 FROM "SDRAssignment" s WHERE s."sdrId" = a."sdrId" AND s."missionId" = c."missionId")
          AND NOT (a."contactId" IS NOT NULL AND EXISTS (
              SELECT 1 FROM "Action" b WHERE b."contactId" = a."contactId" AND b."createdAt" > a."createdAt"))
          AND NOT (a."companyId" IS NOT NULL AND EXISTS (
              SELECT 1 FROM "Action" b WHERE b."companyId" = a."companyId" AND b."createdAt" > a."createdAt"))
        GROUP BY a."sdrId", u."name"
        ORDER BY "urgent" DESC, u."name" ASC
    `;
    return rows.map((r) => ({ sdrId: r.sdrId, sdrName: r.sdrName, urgent: r.urgent, late: r.late }));
}
