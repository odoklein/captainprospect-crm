// Mission insights: the SQL half. Every function takes the db (prisma, or a
// PGlite stand-in in tests) and aggregates in SQL — a busy mission would
// otherwise ship tens of thousands of rows to be counted in JS.
//
// Conventions shared by every query:
//   - an action belongs to a mission through its campaign;
//   - a « prospect » is the contact, or the company when called directly
//     (COALESCE(contactId, companyId)), counted once per stage;
//   - days are UTC (date_trunc runs in the DB session timezone, UTC).

import { Prisma } from "@prisma/client";
import type { FunnelBenchmark, FunnelCounts } from "./pulse";
import { getAgencyBenchmark, type RawDb } from "./benchmark";
import {
    DAY_MS,
    INTERESTED_RESULTS,
    REACHED_RESULTS,
    bucketRows,
    buildSeries,
    foldListCounts,
    resolveWindow,
    sumBuckets,
    type DayBuckets,
    type InsightsPeriod,
    type ListCountRow,
    type ListCounts,
    type SeriesPoint,
} from "./insights";

export type { RawDb };

const since = (from: Date | null, column = Prisma.raw('a."createdAt"')) =>
    from ? Prisma.sql`AND ${column} >= ${from}` : Prisma.empty;

/** Daily actions / meetings / reached since `from` (UTC buckets). */
export async function fetchDailyBuckets(db: RawDb, missionId: string, from: Date): Promise<DayBuckets> {
    const rows = await db.$queryRaw<Array<{ day: Date; actions: number; meetings: number; reached: number }>>(Prisma.sql`
        SELECT date_trunc('day', a."createdAt") AS day,
               COUNT(a.id)::int AS actions,
               COUNT(CASE WHEN a."result" = 'MEETING_BOOKED' THEN 1 END)::int AS meetings,
               COUNT(CASE WHEN a."result"::text = ANY(${REACHED_RESULTS}) THEN 1 END)::int AS reached
        FROM "Action" a
        JOIN "Campaign" c ON c.id = a."campaignId"
        WHERE c."missionId" = ${missionId}
          AND a."createdAt" >= ${from}
        GROUP BY 1
        ORDER BY 1
    `);
    return bucketRows(rows);
}

/** First action of the mission, if any (start of the « all » series). */
export async function fetchFirstActionAt(db: RawDb, missionId: string): Promise<Date | null> {
    const rows = await db.$queryRaw<Array<{ first: Date | null }>>(Prisma.sql`
        SELECT MIN(a."createdAt") AS first
        FROM "Action" a
        JOIN "Campaign" c ON c.id = a."campaignId"
        WHERE c."missionId" = ${missionId}
    `);
    return rows[0]?.first ? new Date(rows[0].first) : null;
}

/** Action and meeting totals since `from` (whole mission when null). */
export async function fetchActivityTotals(db: RawDb, missionId: string, from: Date | null): Promise<{ actions: number; meetings: number }> {
    const rows = await db.$queryRaw<Array<{ actions: number; meetings: number }>>(Prisma.sql`
        SELECT COUNT(a.id)::int AS actions,
               COUNT(CASE WHEN a."result" = 'MEETING_BOOKED' THEN 1 END)::int AS meetings
        FROM "Action" a
        JOIN "Campaign" c ON c.id = a."campaignId"
        WHERE c."missionId" = ${missionId} ${since(from)}
    `);
    return { actions: Number(rows[0]?.actions ?? 0), meetings: Number(rows[0]?.meetings ?? 0) };
}

type StageCounts = Omit<FunnelCounts, "prospects">;

/** Distinct prospects at each funnel stage, since `from` (whole mission when null). */
export async function fetchFunnelStages(db: RawDb, missionId: string, from: Date | null): Promise<StageCounts> {
    const rows = await db.$queryRaw<StageCounts[]>(Prisma.sql`
        WITH t AS (
            SELECT COALESCE(a."contactId", a."companyId") AS target, a."result"::text AS r
            FROM "Action" a
            JOIN "Campaign" c ON c.id = a."campaignId"
            WHERE c."missionId" = ${missionId} ${since(from)}
        )
        SELECT COUNT(DISTINCT target)::int AS called,
               COUNT(DISTINCT target) FILTER (WHERE r = ANY(${REACHED_RESULTS}))::int AS reached,
               COUNT(DISTINCT target) FILTER (WHERE r = ANY(${INTERESTED_RESULTS}))::int AS interested,
               COUNT(DISTINCT target) FILTER (WHERE r = 'MEETING_BOOKED')::int AS meetings
        FROM t
    `);
    const f = rows[0];
    return {
        called: Number(f?.called ?? 0),
        reached: Number(f?.reached ?? 0),
        interested: Number(f?.interested ?? 0),
        meetings: Number(f?.meetings ?? 0),
    };
}

/** Contacts sitting in the mission's active, non-archived lists (top of the funnel). */
export async function fetchProspectCount(db: RawDb, missionId: string): Promise<number> {
    const rows = await db.$queryRaw<Array<{ prospects: number }>>(Prisma.sql`
        SELECT COUNT(ct.id)::int AS prospects
        FROM "Contact" ct
        JOIN "Company" co ON co.id = ct."companyId"
        JOIN "List" l ON l.id = co."listId"
        WHERE l."missionId" = ${missionId} AND l."isActive" = true AND l."isArchived" = false
    `);
    return Number(rows[0]?.prospects ?? 0);
}

export interface TeamStat {
    sdrId: string;
    name: string;
    actions: number;
    meetings: number;
    recentActions: number;
}

/**
 * Per-SDR contribution: actions / meetings since `from` (whole mission when
 * null), `recentActions` since `recentFrom`. One group-by, however big the team.
 */
export async function fetchTeamStats(
    db: RawDb,
    missionId: string,
    opts: { from: Date | null; recentFrom: Date },
): Promise<TeamStat[]> {
    const rows = await db.$queryRaw<TeamStat[]>(Prisma.sql`
        SELECT a."sdrId" AS "sdrId",
               MAX(u.name) AS name,
               COUNT(a.id)::int AS actions,
               COUNT(CASE WHEN a."result" = 'MEETING_BOOKED' THEN 1 END)::int AS meetings,
               COUNT(CASE WHEN a."createdAt" >= ${opts.recentFrom} THEN 1 END)::int AS "recentActions"
        FROM "Action" a
        JOIN "Campaign" c ON c.id = a."campaignId"
        JOIN "User" u ON u.id = a."sdrId"
        WHERE c."missionId" = ${missionId} ${since(opts.from)}
        GROUP BY a."sdrId"
    `);
    return rows.map((row) => ({
        sdrId: row.sdrId,
        name: row.name,
        actions: Number(row.actions),
        meetings: Number(row.meetings),
        recentActions: Number(row.recentActions),
    }));
}

/**
 * Opportunities on the mission's lists: created since `currentFrom` (all when
 * null) and in [previousFrom, currentFrom) when both are given.
 */
export async function fetchOpportunityCounts(
    db: RawDb,
    missionId: string,
    opts: { currentFrom: Date | null; previousFrom: Date | null },
): Promise<{ current: number; previous: number | null }> {
    const { currentFrom, previousFrom } = opts;
    const current = currentFrom ? Prisma.sql`o."createdAt" >= ${currentFrom}` : Prisma.sql`true`;
    const previous =
        currentFrom && previousFrom
            ? Prisma.sql`o."createdAt" >= ${previousFrom} AND o."createdAt" < ${currentFrom}`
            : Prisma.sql`false`;
    const rows = await db.$queryRaw<Array<{ current: number; previous: number }>>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE ${current})::int AS current,
               COUNT(*) FILTER (WHERE ${previous})::int AS previous
        FROM "Opportunity" o
        JOIN "Contact" ct ON ct.id = o."contactId"
        JOIN "Company" co ON co.id = ct."companyId"
        JOIN "List" l ON l.id = co."listId"
        WHERE l."missionId" = ${missionId}
    `);
    return {
        current: Number(rows[0]?.current ?? 0),
        previous: currentFrom && previousFrom ? Number(rows[0]?.previous ?? 0) : null,
    };
}

/**
 * D1: companies, contacts and companies per Company.status for every list of
 * the mission, in ONE grouped query (no Company row leaves the database).
 * Lists without companies are present with zeros.
 */
export async function fetchListCounts(db: RawDb, missionId: string): Promise<Map<string, ListCounts & { name: string }>> {
    const rows = await db.$queryRaw<Array<ListCountRow & { name: string }>>(Prisma.sql`
        SELECT l.id AS "listId",
               l.name AS name,
               co."status"::text AS status,
               COUNT(co.id)::int AS companies,
               COALESCE(SUM(cc.n), 0)::int AS contacts
        FROM "List" l
        LEFT JOIN "Company" co ON co."listId" = l.id
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS n FROM "Contact" ct WHERE ct."companyId" = co.id
        ) cc ON true
        WHERE l."missionId" = ${missionId}
        GROUP BY l.id, l.name, co."status"
    `);
    const folded = foldListCounts(rows);
    const names = new Map(rows.map((r) => [r.listId, r.name]));
    return new Map([...folded].map(([listId, counts]) => [listId, { ...counts, name: names.get(listId) ?? "" }]));
}

export interface ListPerformance {
    listId: string;
    name: string;
    /** Distinct prospects called / reached / with a meeting, whole mission. */
    called: number;
    reached: number;
    meetings: number;
    companies: number;
    contacts: number;
    /**
     * Companies with at least one action on this mission (on the company or on
     * one of its contacts). Company.status is a data-completeness flag
     * (INCOMPLETE / PARTIAL / ACTIONABLE), not a work status, so « worked » is
     * read from the actions instead.
     */
    workedCompanies: number;
}

/** Per-list performance over the whole mission (the « bases » rows of the pulse). */
export async function fetchListPerformance(db: RawDb, missionId: string): Promise<ListPerformance[]> {
    const [counts, rows] = await Promise.all([
        fetchListCounts(db, missionId),
        db.$queryRaw<Array<{ listId: string; called: number; reached: number; meetings: number; worked: number }>>(Prisma.sql`
            WITH t AS (
                SELECT COALESCE(ct."companyId", a."companyId") AS company,
                       COALESCE(a."contactId", a."companyId") AS target,
                       a."result"::text AS r
                FROM "Action" a
                JOIN "Campaign" c ON c.id = a."campaignId"
                LEFT JOIN "Contact" ct ON ct.id = a."contactId"
                WHERE c."missionId" = ${missionId}
            )
            SELECT co."listId" AS "listId",
                   COUNT(DISTINCT t.target)::int AS called,
                   COUNT(DISTINCT t.target) FILTER (WHERE t.r = ANY(${REACHED_RESULTS}))::int AS reached,
                   COUNT(DISTINCT t.target) FILTER (WHERE t.r = 'MEETING_BOOKED')::int AS meetings,
                   COUNT(DISTINCT t.company)::int AS worked
            FROM t
            JOIN "Company" co ON co.id = t.company
            JOIN "List" l ON l.id = co."listId" AND l."missionId" = ${missionId}
            GROUP BY co."listId"
        `),
    ]);
    const perf = new Map(rows.map((r) => [r.listId, r]));
    return [...counts].map(([listId, c]) => {
        const p = perf.get(listId);
        return {
            listId,
            name: c.name,
            called: Number(p?.called ?? 0),
            reached: Number(p?.reached ?? 0),
            meetings: Number(p?.meetings ?? 0),
            companies: c.companies,
            contacts: c.contacts,
            workedCompanies: Number(p?.worked ?? 0),
        };
    });
}

// ── Compositions used by the routes ───────────────────────────────────────

export interface MissionInsights {
    period: InsightsPeriod;
    windowDays: number;
    windowStart: string;
    series: SeriesPoint[];
    current: { actions: number; meetings: number; opportunities: number };
    previous: { actions: number; meetings: number; opportunities: number } | null;
    pulse: { funnel: FunnelCounts; periodFunnel: FunnelCounts; benchmark: FunnelBenchmark };
    teamStats: TeamStat[];
    lists: ListPerformance[];
}

/** GET /api/missions/[id]/insights?period= */
export async function getMissionInsights(
    db: RawDb,
    args: { missionId: string; period: InsightsPeriod; missionStart?: Date | string | null; now?: Date },
): Promise<MissionInsights> {
    const { missionId, period } = args;
    const now = args.now ?? new Date();
    // Everything but the « all » series start is known up front; for « all »,
    // bucket from the cap (365 days) and trim once the first action is known,
    // so the first-action lookup runs in parallel with the rest.
    const base = resolveWindow(period, { now, missionStart: args.missionStart });
    const bucketsFrom = base.previousStart ?? resolveWindow("all", { now, missionStart: new Date(0) }).windowStart;
    const recentFrom = new Date(base.windowEnd.getTime() - 7 * DAY_MS);

    const [firstActionAt, buckets, allTotals, funnel, periodFunnel, prospects, teamStats, opportunities, lists, benchmark] = await Promise.all([
        period === "all" ? fetchFirstActionAt(db, missionId) : null,
        fetchDailyBuckets(db, missionId, bucketsFrom),
        // « all »: the series is capped, the totals are not.
        base.countsFrom ? null : fetchActivityTotals(db, missionId, null),
        fetchFunnelStages(db, missionId, null),
        base.countsFrom ? fetchFunnelStages(db, missionId, base.countsFrom) : null,
        fetchProspectCount(db, missionId),
        fetchTeamStats(db, missionId, { from: base.countsFrom, recentFrom }),
        fetchOpportunityCounts(db, missionId, { currentFrom: base.countsFrom, previousFrom: base.previousStart }),
        fetchListPerformance(db, missionId),
        getAgencyBenchmark(db),
    ]);

    const w = period === "all" ? resolveWindow(period, { now, missionStart: args.missionStart, firstActionAt }) : base;
    const current = allTotals ?? sumBuckets(buckets, w.windowStart, w.windowEnd);
    const previous = w.previousStart ? sumBuckets(buckets, w.previousStart, w.windowStart) : null;
    const wholeFunnel: FunnelCounts = { prospects, ...funnel };

    return {
        period,
        windowDays: w.windowDays,
        windowStart: w.windowStart.toISOString(),
        series: buildSeries(buckets, w.windowStart, w.windowDays),
        current: { ...current, opportunities: opportunities.current },
        previous: previous && opportunities.previous !== null ? { ...previous, opportunities: opportunities.previous } : null,
        pulse: {
            funnel: wholeFunnel,
            // « all »: the window is the whole mission.
            periodFunnel: periodFunnel ? { prospects, ...periodFunnel } : wholeFunnel,
            benchmark,
        },
        teamStats,
        lists,
    };
}

/**
 * The legacy `pulse` / `insights` / `teamStats` of the full GET
 * /api/missions/[id] (30-day window), kept for back-compat. teamStats keeps its
 * historical meaning there: actions / meetings over the whole mission,
 * recentActions over the 30-day window.
 */
export async function getLegacyMissionInsights(db: RawDb, missionId: string, now: Date = new Date()) {
    const w = resolveWindow("30", { now });
    const previousStart = w.previousStart as Date;
    const [buckets, funnel, prospects, teamStats, opportunities, benchmark] = await Promise.all([
        fetchDailyBuckets(db, missionId, previousStart),
        fetchFunnelStages(db, missionId, null),
        fetchProspectCount(db, missionId),
        fetchTeamStats(db, missionId, { from: null, recentFrom: w.windowStart }),
        fetchOpportunityCounts(db, missionId, { currentFrom: w.windowStart, previousFrom: previousStart }),
        getAgencyBenchmark(db),
    ]);
    const current = sumBuckets(buckets, w.windowStart, w.windowEnd);
    const previous = sumBuckets(buckets, previousStart, w.windowStart);
    return {
        teamStats,
        pulse: { funnel: { prospects, ...funnel } as FunnelCounts, benchmark },
        insights: {
            windowDays: w.windowDays,
            series: buildSeries(buckets, w.windowStart, w.windowDays),
            current: { ...current, opportunities: opportunities.current },
            previous: { ...previous, opportunities: opportunities.previous ?? 0 },
        },
    };
}
