// ============================================
// SALES ENGINE METRICS — what managers need to trust (or rein in) the engine.
// Every number is counted from the source-of-truth tables, deduplicated by
// construction (one DialAttempt per line, one proposal per key):
//   dialing    attempts, human answers, conversations, voicemails, abandons,
//              answer → SDR median delay, per SDR, per caller id (reputation)
//   AI         how often SDRs kept the AI's proposed outcome; proposals
//              applied vs dismissed by kind
//   plumbing   provider events failing or parked (dead letters)
// ============================================

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface SalesEngineMetrics {
    since: string;
    dialing: {
        attempts: number;
        humanAnswers: number;
        conversations: number;
        voicemails: number;
        abandoned: number;
        abandonRate: number | null;
        medianBridgeSec: number | null;
        p90BridgeSec: number | null;
        failed: number;
    };
    bySdr: { sdrId: string; name: string; attempts: number; conversations: number; abandoned: number }[];
    callerIds: { number: string; today: number; answerRate: number | null }[];
    ai: {
        /** Calls with an AI-proposed outcome that an SDR qualified. */
        judged: number;
        /** …where the SDR kept the AI's outcome. */
        kept: number;
        proposals: { kind: string; applied: number; auto: number; dismissed: number; failed: number }[];
    };
    events: { failing: number; parked: number };
}

const num = (v: unknown) => (v == null ? 0 : Number(v));

export interface SqlDb {
    $queryRaw<T>(sql: Prisma.Sql): Promise<T>;
}

export async function salesEngineMetrics(days: number, db: SqlDb = prisma, now: Date = new Date()): Promise<SalesEngineMetrics> {
    const since = new Date(now.getTime() - days * 86_400_000);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const [dialing, bySdr, callerIds, judged, proposals, events] = await Promise.all([
        db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
            SELECT count(*)::int AS attempts,
                   count(*) FILTER (WHERE "outcome" IN ('CONVERSATION','ABANDONED'))::int AS human,
                   count(*) FILTER (WHERE "outcome" = 'CONVERSATION')::int AS conv,
                   count(*) FILTER (WHERE "outcome" = 'VOICEMAIL')::int AS vm,
                   count(*) FILTER (WHERE "outcome" = 'ABANDONED')::int AS aband,
                   count(*) FILTER (WHERE "outcome" = 'FAILED')::int AS failed,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("bridgedAt" - "answeredAt"))) FILTER (WHERE "bridgedAt" IS NOT NULL AND "answeredAt" IS NOT NULL) AS p50,
                   percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("bridgedAt" - "answeredAt"))) FILTER (WHERE "bridgedAt" IS NOT NULL AND "answeredAt" IS NOT NULL) AS p90
              FROM "DialAttempt" WHERE "createdAt" >= ${since}`),
        db.$queryRaw<{ sdrId: string; name: string | null; attempts: number; conv: number; aband: number }[]>(Prisma.sql`
            SELECT a."sdrId", u.name, count(*)::int AS attempts,
                   count(*) FILTER (WHERE a."outcome" = 'CONVERSATION')::int AS conv,
                   count(*) FILTER (WHERE a."outcome" = 'ABANDONED')::int AS aband
              FROM "DialAttempt" a LEFT JOIN "User" u ON u.id = a."sdrId"
             WHERE a."createdAt" >= ${since}
             GROUP BY a."sdrId", u.name ORDER BY attempts DESC LIMIT 50`),
        db.$queryRaw<{ number: string; today: number; answered: number }[]>(Prisma.sql`
            SELECT "fromNumber" AS number, count(*)::int AS today,
                   count(*) FILTER (WHERE "answeredAt" IS NOT NULL)::int AS answered
              FROM "DialAttempt" WHERE "createdAt" >= ${dayStart}
             GROUP BY "fromNumber" ORDER BY today DESC LIMIT 50`),
        db.$queryRaw<{ judged: number; kept: number }[]>(Prisma.sql`
            SELECT count(*)::int AS judged,
                   count(*) FILTER (WHERE a.result::text = t."aiSummary"->>'suggestedStatus')::int AS kept
              FROM "TelephonyCall" t JOIN "Action" a ON a.id = t."actionId"
             WHERE t."aiSummaryStatus" = 'done' AND t."startedAt" >= ${since}
               AND COALESCE(t."aiSummary"->>'suggestedStatus', '') <> ''`),
        db.$queryRaw<{ kind: string; applied: number; auto: number; dismissed: number; failed: number }[]>(Prisma.sql`
            SELECT "kind",
                   count(*) FILTER (WHERE "status" = 'APPLIED' AND "decidedBy" <> 'auto')::int AS applied,
                   count(*) FILTER (WHERE "status" = 'APPLIED' AND "decidedBy" = 'auto')::int AS auto,
                   count(*) FILTER (WHERE "status" = 'DISMISSED')::int AS dismissed,
                   count(*) FILTER (WHERE "status" = 'FAILED')::int AS failed
              FROM "PostCallProposal" WHERE "createdAt" >= ${since}
             GROUP BY "kind" ORDER BY "kind"`),
        db.$queryRaw<{ failing: number; parked: number }[]>(Prisma.sql`
            SELECT count(*) FILTER (WHERE "tries" < 5)::int AS failing,
                   count(*) FILTER (WHERE "tries" >= 5)::int AS parked
              FROM "DialerEvent" WHERE "processedAt" IS NULL AND "error" IS NOT NULL AND "receivedAt" >= ${since}`),
    ]);

    const d = dialing[0] ?? {};
    const human = num(d.human);
    const aband = num(d.aband);
    const round = (v: unknown) => (v == null ? null : Math.round(Number(v) * 10) / 10);
    return {
        since: since.toISOString(),
        dialing: {
            attempts: num(d.attempts),
            humanAnswers: human,
            conversations: num(d.conv),
            voicemails: num(d.vm),
            abandoned: aband,
            abandonRate: human > 0 ? aband / human : null,
            medianBridgeSec: round(d.p50),
            p90BridgeSec: round(d.p90),
            failed: num(d.failed),
        },
        bySdr: bySdr.map((r) => ({ sdrId: r.sdrId, name: r.name ?? "—", attempts: num(r.attempts), conversations: num(r.conv), abandoned: num(r.aband) })),
        callerIds: callerIds.map((r) => ({ number: r.number, today: num(r.today), answerRate: num(r.today) > 0 ? num(r.answered) / num(r.today) : null })),
        ai: { judged: num(judged[0]?.judged), kept: num(judged[0]?.kept), proposals: proposals.map((p) => ({ kind: p.kind, applied: num(p.applied), auto: num(p.auto), dismissed: num(p.dismissed), failed: num(p.failed) })) },
        events: { failing: num(events[0]?.failing), parked: num(events[0]?.parked) },
    };
}
