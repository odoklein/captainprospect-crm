// Agency benchmark for the mission pulse: the funnel step rates
// (joignabilité, intérêt, conversion en RDV) over the last 90 days.
//
// It used to be recomputed on every mission load, excluding the mission being
// viewed. It is now computed once over ALL missions and memoised for
// BENCHMARK_TTL_MS, per server instance. Tradeoff: the viewed mission's own
// activity is part of its reference. Over 90 days of agency-wide activity one
// mission is a small share, the rates only ever feed a « vs agence » hint, and
// a shared cache is worth far more than that bias. A big mission dominating
// the agency volume would pull the reference towards itself — accepted.

import { Prisma, type PrismaClient } from "@prisma/client";
import type { FunnelBenchmark } from "./pulse";
import { DAY_MS, INTERESTED_RESULTS, REACHED_RESULTS, startOfUtcDay } from "./insights";

export const BENCHMARK_DAYS = 90;
export const BENCHMARK_TTL_MS = 10 * 60 * 1000;
/** Below this many prospects at a stage, the agency rate is noise: leave it out. */
export const BENCHMARK_MIN_SAMPLE = 50;

export type RawDb = Pick<PrismaClient, "$queryRaw">;

type StageCounts = { called: number; reached: number; interested: number; meetings: number };

/** Step rates from distinct-prospect stage counts; null below the minimum sample. */
export function benchmarkFromCounts(agency: StageCounts): FunnelBenchmark {
    const ratio = (part: number, whole: number) => (whole >= BENCHMARK_MIN_SAMPLE ? part / whole : null);
    return {
        reach: ratio(Number(agency.reached), Number(agency.called)),
        interest: ratio(Number(agency.interested), Number(agency.reached)),
        meeting: ratio(Number(agency.meetings), Number(agency.interested)),
    };
}

/** One uncached computation (a prospect counts once per mission at each stage). */
export async function computeAgencyBenchmark(db: RawDb, now: Date = new Date()): Promise<FunnelBenchmark> {
    const since = new Date(startOfUtcDay(now).getTime() - BENCHMARK_DAYS * DAY_MS);
    const rows = await db.$queryRaw<StageCounts[]>(Prisma.sql`
        WITH t AS (
            SELECT c."missionId" AS m, COALESCE(a."contactId", a."companyId") AS target, a."result"::text AS r
            FROM "Action" a
            JOIN "Campaign" c ON c.id = a."campaignId"
            WHERE a."createdAt" >= ${since}
        )
        SELECT COUNT(DISTINCT (m, target))::int AS called,
               COUNT(DISTINCT (m, target)) FILTER (WHERE r = ANY(${REACHED_RESULTS}))::int AS reached,
               COUNT(DISTINCT (m, target)) FILTER (WHERE r = ANY(${INTERESTED_RESULTS}))::int AS interested,
               COUNT(DISTINCT (m, target)) FILTER (WHERE r = 'MEETING_BOOKED')::int AS meetings
        FROM t
    `);
    return benchmarkFromCounts(rows[0] ?? { called: 0, reached: 0, interested: 0, meetings: 0 });
}

let memo: { at: number; value: Promise<FunnelBenchmark> } | null = null;

/**
 * The cached benchmark. Concurrent callers share one in-flight query; a failed
 * query is not cached.
 */
export function getAgencyBenchmark(db: RawDb, now: number = Date.now()): Promise<FunnelBenchmark> {
    if (memo && now - memo.at < BENCHMARK_TTL_MS) return memo.value;
    const value = computeAgencyBenchmark(db, new Date(now));
    const entry = { at: now, value };
    memo = entry;
    value.catch(() => {
        if (memo === entry) memo = null;
    });
    return value;
}

/** Tests only. */
export function resetAgencyBenchmarkCache(): void {
    memo = null;
}
