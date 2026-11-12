/**
 * Watch rule `sdr_under_pace`: every active SDR behind today's call pace,
 * during their planned calling time. Reuses the SDR page's own computation
 * (lib/sdr-pace/server.ts) with a 5 s cap on Allo; when Allo does not answer
 * the CRM's calls are used and the finding says so.
 *
 *   BEHIND → WARN, LATE → CRITICAL, ON_TRACK / goal reached / outside calling time → nothing.
 *
 * Key = SDR + day: an SDR behind at 11:00 and still behind at 15:30 is one
 * finding (escalated if it got worse); tomorrow is a new one and today's
 * resolves. Weekends detect nothing.
 */

import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { APP_TIMEZONE, computeSdrPaceFor, type SdrPaceSnapshot } from "@/lib/sdr-pace/server";
import { PACE_STATUS_COPY } from "@/lib/sdr-pace/pace";
import type { DetectedFinding } from "../../types";
import type { WatchRule, WatchRuleContext } from "./types";

export const ALLO_TIMEOUT_MS = 5_000;

export interface SdrUnderPaceDeps {
    listSdrs: () => Promise<Array<{ id: string; name: string }>>;
    pace: (sdrId: string, now: Date) => Promise<SdrPaceSnapshot>;
}

export const prismaSdrUnderPaceDeps: SdrUnderPaceDeps = {
    listSdrs: () => prisma.user.findMany({ where: { role: "SDR", isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    pace: (sdrId, now) => computeSdrPaceFor(sdrId, now, { alloTimeoutMs: ALLO_TIMEOUT_MS }),
};

export function createSdrUnderPaceRule(deps: SdrUnderPaceDeps = prismaSdrUnderPaceDeps): WatchRule {
    return {
        id: "sdr_under_pace",
        label: "SDR en retard sur le rythme",
        description: "SDR actifs dont les appels du jour sont en dessous du rythme attendu à cette heure, pendant leur temps d'appel planifié.",
        defaultSchedule: "0 11,15 * * 1-5",
        scopeKey: () => "agency",
        async detect(ctx: WatchRuleContext): Promise<DetectedFinding[]> {
            const paris = DateTime.fromJSDate(ctx.now, { zone: APP_TIMEZONE });
            if (paris.weekday >= 6) return [];
            const day = paris.toFormat("yyyy-LL-dd");
            const hhmm = paris.toFormat("HH:mm");
            const sdrs = await deps.listSdrs();
            const out: DetectedFinding[] = [];
            for (const sdr of sdrs) {
                if (ctx.signal.aborted) break;
                let snap: SdrPaceSnapshot;
                try {
                    snap = await deps.pace(sdr.id, ctx.now);
                } catch (error) {
                    console.warn(`[agent.sdr_under_pace] ${sdr.name}: pace unavailable`, error instanceof Error ? error.message : error);
                    continue;
                }
                const { pace, time } = snap;
                if (!time.isCallingTime || pace.goalReached || pace.status === "ON_TRACK") continue;
                const severity = pace.status === "LATE" ? "CRITICAL" : "WARN";
                const note = snap.alloDegraded ? " Mesure Allo indisponible (délai dépassé) : appels CRM uniquement." : "";
                out.push({
                    key: `${sdr.id}:${day}`,
                    severity,
                    kind: "sdr_under_pace",
                    title: `${sdr.name} : ${PACE_STATUS_COPY[pace.status].label.toLowerCase()} (${pace.callsDone}/${pace.expected} appels à ${hhmm})`,
                    body: `${sdr.name} a passé ${pace.callsDone} appels contre ${pace.expected} attendus à ${hhmm}, soit ${pace.behindBy} de retard. Objectif du jour : ${pace.dayQuota}.${note}`,
                    metrics: {
                        appels: pace.callsDone,
                        attendus: pace.expected,
                        retard: pace.behindBy,
                        objectifJour: pace.dayQuota,
                        appelsCrm: snap.crmCalls,
                        appelsAllo: snap.alloUsed ? snap.alloCalls : null,
                        alloDegrade: snap.alloDegraded ? 1 : 0,
                        heure: hhmm,
                    },
                    subjectUserId: sdr.id,
                });
            }
            return out;
        },
    };
}

export const sdrUnderPaceRule = createSdrUnderPaceRule();
