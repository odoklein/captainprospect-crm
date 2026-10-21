// Server-only builder for GET /api/analytics/overview. See ./types.ts.
//
// Every aggregate is `GROUP BY …, result` and the families are folded in
// TypeScript (lib/stats/metrics → lib/manager-home/outcomes), so there is a single
// source of truth for "what counts as a joint / a lead chaud / a RDV" and the SQL
// never hard-codes a list of result codes. Days and hours are Europe/Paris.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PeriodRange } from "@/lib/manager-home/rules";
import { addResult, buildSeries, emptyTally, type SeriesRow } from "./metrics";
import type {
    HeatCell, MissionRow, PeriodSummary, RdvState, SdrRow, StatsOverview, Tally,
} from "./types";

export interface StatsScope {
    sdrIds: string[];
    missionIds: string[];
    clientIds: string[];
    listIds: string[];
}

/** Paris wall-clock of an Action timestamp (stored as naive UTC). */
const PARIS = Prisma.sql`(a."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris')`;

function scopeSql(scope: StatsScope): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    if (scope.sdrIds.length) parts.push(Prisma.sql`AND a."sdrId" IN (${Prisma.join(scope.sdrIds)})`);
    if (scope.missionIds.length) parts.push(Prisma.sql`AND m.id IN (${Prisma.join(scope.missionIds)})`);
    if (scope.clientIds.length) parts.push(Prisma.sql`AND m."clientId" IN (${Prisma.join(scope.clientIds)})`);
    if (scope.listIds.length) {
        parts.push(Prisma.sql`AND (
            (a."companyId" IS NOT NULL AND a."companyId" IN (SELECT id FROM "Company" WHERE "listId" IN (${Prisma.join(scope.listIds)})))
            OR (a."contactId" IS NOT NULL AND a."contactId" IN (SELECT c2.id FROM "Contact" c2 JOIN "Company" co ON c2."companyId" = co.id WHERE co."listId" IN (${Prisma.join(scope.listIds)})))
        )`);
    }
    return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

/** FROM + WHERE shared by every query: calls in [from, to) within the scope. */
function base(from: Date, to: Date, scope: StatsScope): Prisma.Sql {
    return Prisma.sql`
        FROM "Action" a
        LEFT JOIN "Campaign" c ON c.id = a."campaignId"
        LEFT JOIN "Mission" m ON m.id = c."missionId"
        WHERE a."channel" = 'CALL'
          AND a."createdAt" >= ${from} AND a."createdAt" < ${to}
          ${scopeSql(scope)}`;
}

interface ResultRow { result: string; n: number; secs: number }
interface EntityRow extends ResultRow { id: string; name: string; extra: string | null; flag: boolean | null }

async function summary(from: Date, to: Date, scope: StatsScope): Promise<PeriodSummary> {
    const [rows, distinct] = await Promise.all([
        prisma.$queryRaw<ResultRow[]>`
            SELECT a."result"::text AS result, COUNT(*)::int AS n, COALESCE(SUM(a."duration"), 0)::int AS secs
            ${base(from, to, scope)}
            GROUP BY a."result"`,
        prisma.$queryRaw<{ n: number }[]>`
            SELECT COUNT(DISTINCT COALESCE(a."contactId", a."companyId"))::int AS n
            ${base(from, to, scope)}`,
    ]);
    const t = emptyTally();
    const byResult: Record<string, number> = {};
    for (const r of rows) {
        addResult(t, r.result, Number(r.n), Number(r.secs));
        byResult[r.result] = Number(r.n);
    }
    return { ...t, byResult, prospects: Number(distinct[0]?.n ?? 0) };
}

async function seriesRows(range: { from: Date; to: Date; granularity: "day" | "week" }, scope: StatsScope): Promise<SeriesRow[]> {
    const unit = range.granularity === "week" ? Prisma.sql`'week'` : Prisma.sql`'day'`;
    const rows = await prisma.$queryRaw<{ key: string; result: string; n: number }[]>`
        SELECT TO_CHAR(date_trunc(${unit}, ${PARIS}), 'YYYY-MM-DD') AS key, a."result"::text AS result, COUNT(*)::int AS n
        ${base(range.from, range.to, scope)}
        GROUP BY 1, 2`;
    return rows.map((r) => ({ key: r.key, result: r.result, n: Number(r.n) }));
}

function foldEntities(rows: EntityRow[]): Map<string, { name: string; extra: string | null; flag: boolean | null; tally: Tally }> {
    const map = new Map<string, { name: string; extra: string | null; flag: boolean | null; tally: Tally }>();
    for (const r of rows) {
        const e = map.get(r.id) ?? { name: r.name, extra: r.extra, flag: r.flag, tally: emptyTally() };
        addResult(e.tally, r.result, Number(r.n), Number(r.secs));
        map.set(r.id, e);
    }
    return map;
}

async function bySdr(from: Date, to: Date, scope: StatsScope) {
    const rows = await prisma.$queryRaw<EntityRow[]>`
        SELECT u.id AS id, u."name" AS name, u."role"::text AS extra, NULL::boolean AS flag,
               a."result"::text AS result, COUNT(*)::int AS n, COALESCE(SUM(a."duration"), 0)::int AS secs
        FROM "Action" a
        JOIN "User" u ON u.id = a."sdrId"
        LEFT JOIN "Campaign" c ON c.id = a."campaignId"
        LEFT JOIN "Mission" m ON m.id = c."missionId"
        WHERE a."channel" = 'CALL'
          AND a."createdAt" >= ${from} AND a."createdAt" < ${to}
          ${scopeSql(scope)}
        GROUP BY u.id, u."name", u."role", a."result"`;
    return foldEntities(rows);
}

async function byMission(from: Date, to: Date, scope: StatsScope) {
    const rows = await prisma.$queryRaw<EntityRow[]>`
        SELECT m.id AS id, m."name" AS name, cl."name" AS extra, m."isActive" AS flag,
               a."result"::text AS result, COUNT(*)::int AS n, COALESCE(SUM(a."duration"), 0)::int AS secs
        FROM "Action" a
        JOIN "Campaign" c ON c.id = a."campaignId"
        JOIN "Mission" m ON m.id = c."missionId"
        LEFT JOIN "Client" cl ON cl.id = m."clientId"
        WHERE a."channel" = 'CALL'
          AND a."createdAt" >= ${from} AND a."createdAt" < ${to}
          ${scopeSql(scope)}
        GROUP BY m.id, m."name", cl."name", m."isActive", a."result"`;
    return foldEntities(rows);
}

async function missionSdrCounts(from: Date, to: Date, scope: StatsScope): Promise<Map<string, number>> {
    const rows = await prisma.$queryRaw<{ id: string; n: number }[]>`
        SELECT m.id AS id, COUNT(DISTINCT a."sdrId")::int AS n
        FROM "Action" a
        JOIN "Campaign" c ON c.id = a."campaignId"
        JOIN "Mission" m ON m.id = c."missionId"
        WHERE a."channel" = 'CALL'
          AND a."createdAt" >= ${from} AND a."createdAt" < ${to}
          ${scopeSql(scope)}
        GROUP BY m.id`;
    return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

async function heatmap(from: Date, to: Date, scope: StatsScope): Promise<HeatCell[]> {
    const rows = await prisma.$queryRaw<{ dow: number; hour: number; result: string; n: number }[]>`
        SELECT EXTRACT(ISODOW FROM ${PARIS})::int AS dow, EXTRACT(HOUR FROM ${PARIS})::int AS hour,
               a."result"::text AS result, COUNT(*)::int AS n
        ${base(from, to, scope)}
        GROUP BY 1, 2, 3`;
    const cells = new Map<string, HeatCell & { _t: Tally }>();
    for (const r of rows) {
        const key = `${r.dow}-${r.hour}`;
        const cell = cells.get(key) ?? { dow: Number(r.dow), hour: Number(r.hour), calls: 0, joined: 0, meetings: 0, _t: emptyTally() };
        addResult(cell._t, r.result, Number(r.n));
        cells.set(key, cell);
    }
    return [...cells.values()].map(({ _t, ...c }) => ({ ...c, calls: _t.calls, joined: _t.joined, meetings: _t.meetings }));
}

/** Fate of the RDV booked in the period (SAS confirmation). */
async function rdvState(from: Date, to: Date, scope: StatsScope): Promise<RdvState> {
    const rows = await prisma.$queryRaw<{ status: string; n: number }[]>`
        SELECT a."confirmationStatus"::text AS status, COUNT(*)::int AS n
        ${base(from, to, scope)}
          AND a."result" = 'MEETING_BOOKED'
        GROUP BY a."confirmationStatus"`;
    const state: RdvState = { total: 0, confirmed: 0, pending: 0, rejected: 0 };
    for (const r of rows) {
        const n = Number(r.n);
        state.total += n;
        if (r.status === "CONFIRMED") state.confirmed += n;
        else if (r.status === "CANCELLED") state.rejected += n;
        else state.pending += n;
    }
    return state;
}

export async function getStatsOverview(range: PeriodRange, scope: StatsScope): Promise<StatsOverview> {
    const { from, to, prevFrom, prevTo } = range;
    const [
        current, previous, series, prevSeries,
        sdrNow, sdrBefore, missionNow, missionBefore, missionSdrs, heat, rdv,
    ] = await Promise.all([
        summary(from, to, scope),
        summary(prevFrom, prevTo, scope),
        seriesRows({ from, to, granularity: range.granularity }, scope),
        seriesRows({ from: prevFrom, to: prevTo, granularity: range.granularity }, scope),
        bySdr(from, to, scope),
        bySdr(prevFrom, prevTo, scope),
        byMission(from, to, scope),
        byMission(prevFrom, prevTo, scope),
        missionSdrCounts(from, to, scope),
        heatmap(from, to, scope),
        rdvState(from, to, scope),
    ]);

    const sdrIds = new Set([...sdrNow.keys(), ...sdrBefore.keys()]);
    const sdrs: SdrRow[] = [...sdrIds].map((id) => {
        const now = sdrNow.get(id);
        const before = sdrBefore.get(id);
        return {
            id,
            name: (now ?? before)!.name,
            role: (now ?? before)!.extra ?? "SDR",
            current: now?.tally ?? emptyTally(),
            previous: before?.tally ?? emptyTally(),
        };
    }).sort((a, b) => b.current.meetings - a.current.meetings || b.current.calls - a.current.calls);

    const missions: MissionRow[] = [...missionNow.entries()].map(([id, m]) => ({
        id,
        name: m.name,
        clientName: m.extra ?? "—",
        isActive: m.flag !== false,
        current: m.tally,
        previous: missionBefore.get(id)?.tally ?? emptyTally(),
        sdrCount: missionSdrs.get(id) ?? 0,
    })).sort((a, b) => b.current.meetings - a.current.meetings || b.current.calls - a.current.calls);

    return {
        range: {
            start: range.start,
            end: range.end,
            days: range.days,
            prevStart: range.prevStart,
            prevEnd: range.prevEnd,
            granularity: range.granularity,
        },
        current,
        previous,
        series: buildSeries(series, range),
        prevSeries: buildSeries(prevSeries, { start: range.prevStart, end: range.prevEnd, granularity: range.granularity }),
        sdrs,
        missions,
        heatmap: heat,
        rdv,
    };
}
