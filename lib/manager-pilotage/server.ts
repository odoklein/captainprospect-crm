// ============================================
// SALLE DE PILOTAGE — the reads behind GET /api/manager/pilotage.
//
// Live parts (today's actions, the SAS queue, the planning) are read on every
// call: they are small and indexed (Action [createdAt], [sdrId, createdAt],
// [campaignId, createdAt]). The two heavy reads — the 20-working-day pattern
// aggregate and the lists' stock — are memoised per server instance for
// HEAVY_TTL_MS, like the agency benchmark (lib/missions/benchmark.ts).
// Every list is bounded (take / LIMIT), so the payload stays small.
// ============================================

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPaceConfig } from "@/lib/sdr-pace/config";
import { computeBulkHealthSummaries } from "@/lib/services/ListHealthService";
import { listStock } from "@/lib/lists/stock";
import { addDaysToKey, keyToUtcDate, utcDateToKey } from "@/lib/planning/board-shared";
import {
    hhmmToMinute,
    lastWorkingDays,
    monthBounds,
    overlapDays,
    parisKey,
    parisMidnight,
    parisMinute,
    SPIKE_WORKING_DAYS,
    WINDOW_WORKING_DAYS,
} from "./calendar";
import { addCalls, emptyTally, ratio, type Tally } from "./dictionary";
import { forecast, monthShareOfTarget, plannedDays, type AbsenceSpan, type PlannedBlock } from "./forecast";
import { buildClosers, buildHeatmap, type HeatInputCell } from "./patterns";
import {
    closerSignals,
    noTargetSignal,
    refusalSignals,
    sasSignal,
    silenceSignals,
    sortSignals,
    stockSignals,
    type MissionStock,
    type Signal,
} from "./signals";
import { sortTeam, teamMember, type TeamBlock } from "./team";
import type { ForecastMission, PilotagePayload } from "./types";

export const HEAVY_TTL_MS = 5 * 60_000;
const SDR_ROLES = ["SDR", "BUSINESS_DEVELOPER"] as const;
const MAX_MISSIONS = 300;
const MAX_LISTS = 200;
const MAX_HEAT_ROWS = 40;
/** Pending meetings older than this were auto-confirmed by the SAS (24 h) or are stale: not read. */
const SAS_LOOKBACK_MS = 14 * 86_400_000;

// ── Memo (per instance, shared in-flight promise, failures not kept) ──────

const memo = new Map<string, { at: number; value: Promise<unknown> }>();

function remember<T>(key: string, now: number, compute: () => Promise<T>): Promise<T> {
    const hit = memo.get(key);
    if (hit && now - hit.at < HEAVY_TTL_MS) return hit.value as Promise<T>;
    const value = compute();
    const entry = { at: now, value };
    memo.set(key, entry);
    value.catch(() => {
        if (memo.get(key) === entry) memo.delete(key);
    });
    return value;
}

// ── Heavy reads ───────────────────────────────────────────────────────────

interface WindowRow {
    sdr: string;
    mission: string;
    hour: number;
    result: string;
    n: number;
}

/** CALL actions of the window, by SDR × mission × Paris hour × result; and each SDR's days with a call. */
async function readWindow(since: Date) {
    const [rows, days] = await Promise.all([
        prisma.$queryRaw<WindowRow[]>(Prisma.sql`
            SELECT a."sdrId" AS sdr,
                   c."missionId" AS mission,
                   EXTRACT(HOUR FROM ((a."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris'))::int AS hour,
                   a."result"::text AS result,
                   COUNT(*)::int AS n
            FROM "Action" a
            JOIN "Campaign" c ON c.id = a."campaignId"
            WHERE a."createdAt" >= ${since} AND a."channel" = 'CALL'
            GROUP BY 1, 2, 3, 4
            LIMIT 50000
        `),
        prisma.$queryRaw<{ sdr: string; days: number }[]>(Prisma.sql`
            SELECT a."sdrId" AS sdr,
                   COUNT(DISTINCT (((a."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date))::int AS days
            FROM "Action" a
            WHERE a."createdAt" >= ${since} AND a."channel" = 'CALL'
            GROUP BY 1
        `),
    ]);
    return { rows: rows.map((r) => ({ ...r, hour: Number(r.hour), n: Number(r.n) })), days: new Map(days.map((d) => [d.sdr, Number(d.days)])) };
}

/** What is left to call per mission, with the Listes page's own numbers (lib/lists/stock). */
async function readStock(missions: { id: string; name: string; listIds: string[] }[]): Promise<MissionStock[]> {
    const listIds = missions.flatMap((m) => m.listIds).slice(0, MAX_LISTS);
    if (!listIds.length) return [];
    const [health, statusRows, contactRows] = await Promise.all([
        computeBulkHealthSummaries({ listIds }),
        prisma.company.groupBy({ by: ["listId", "status"], where: { listId: { in: listIds } }, _count: { _all: true } }),
        prisma.$queryRaw<{ list_id: string; contacts: bigint }[]>(Prisma.sql`
            SELECT co."listId" AS list_id, COUNT(*)::bigint AS contacts
            FROM "Contact" c
            INNER JOIN "Company" co ON co.id = c."companyId"
            WHERE co."listId" IN (${Prisma.join(listIds)})
            GROUP BY co."listId"
        `),
    ]);
    const healthOf = new Map(health.map((h) => [h.listId, h]));
    const contactsOf = new Map(contactRows.map((r) => [r.list_id, Number(r.contacts)]));
    const actionableOf = new Map<string, number>();
    for (const r of statusRows) if (r.status === "ACTIONABLE" && r.listId) actionableOf.set(r.listId, (actionableOf.get(r.listId) ?? 0) + r._count._all);

    return missions.map((m) => {
        let reachable = 0;
        let actions7d = 0;
        for (const id of m.listIds) {
            const h = healthOf.get(id);
            if (!h) continue;
            const s = listStock({ contacts: contactsOf.get(id) ?? 0, actionable: actionableOf.get(id) ?? 0, treated: h.contactedContacts, actions7d: h.actions7d });
            reachable += s.reachable;
            actions7d += h.actions7d;
        }
        return { missionId: m.id, name: m.name, reachable, actions7d };
    });
}

// ── The page ──────────────────────────────────────────────────────────────

const monthName = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" });

export async function loadPilotage(nowDate: Date = new Date()): Promise<PilotagePayload> {
    const nowMs = nowDate.getTime();
    const todayKey = parisKey(nowDate);
    const nowMinute = parisMinute(nowDate);
    const { month, first, last } = monthBounds(todayKey);

    const holidayRows = await prisma.planningHoliday.findMany({
        where: { scope: "GLOBAL", date: { gte: keyToUtcDate(addDaysToKey(todayKey, -60)), lte: keyToUtcDate(last) } },
        select: { date: true },
        take: 200,
    });
    const holidays = new Set(holidayRows.map((h) => utcDateToKey(h.date)));
    const windowDays = lastWorkingDays(todayKey, WINDOW_WORKING_DAYS, holidays);
    const spikeDays = lastWorkingDays(todayKey, SPIKE_WORKING_DAYS, holidays);
    const windowSince = parisMidnight(windowDays[0] ?? todayKey);
    const spikeSince = parisMidnight(spikeDays[0] ?? todayKey);
    const monthStart = parisMidnight(first);
    const dayStart = parisMidnight(todayKey);

    const [config, defs, missionRows, sdrUsers] = await Promise.all([
        getPaceConfig(),
        prisma.actionStatusDefinition.findMany({ where: { scopeType: "GLOBAL", isActive: true }, select: { code: true, resultCategoryCode: true } }),
        prisma.mission.findMany({
            where: { status: "ACTIVE" },
            orderBy: { name: "asc" },
            take: MAX_MISSIONS,
            select: {
                id: true,
                name: true,
                targetMeetings: true,
                startDate: true,
                endDate: true,
                client: { select: { name: true } },
                campaigns: { select: { id: true } },
                lists: { where: { isActive: true, isArchived: false }, select: { id: true } },
            },
        }),
        prisma.user.findMany({ where: { role: { in: [...SDR_ROLES] }, isActive: true }, select: { id: true, name: true }, take: 500 }),
    ]);
    const categoryOf = new Map(defs.map((d) => [d.code, d.resultCategoryCode]));
    const quota = config.dailyQuota;

    // Running this month = active and its period touches the month.
    const missions = missionRows.map((m) => {
        const from = parisKey(m.startDate);
        const to = parisKey(m.endDate);
        const inMonth = overlapDays(from, to, first, last) > 0;
        const share = m.targetMeetings && m.targetMeetings > 0 && inMonth ? monthShareOfTarget({ target: m.targetMeetings, missionFrom: from, missionTo: to, monthFirst: first, monthLast: last }) : 0;
        return { ...m, inMonth, share, campaignIds: m.campaigns.map((c) => c.id), listIds: m.lists.map((l) => l.id) };
    });
    const missionOf = new Map<string, string>();
    for (const m of missions) for (const c of m.campaignIds) missionOf.set(c, m.id);
    const missionById = new Map(missions.map((m) => [m.id, m]));
    const running = missions.filter((m) => m.inMonth);
    const covered = running.filter((m) => m.share > 0);
    const coveredIds = new Set(covered.map((m) => m.id));
    const runningCampaigns = running.flatMap((m) => m.campaignIds);
    const coveredCampaigns = covered.flatMap((m) => m.campaignIds);
    const activeCampaigns = missions.flatMap((m) => m.campaignIds);

    const [meetingsMonth, callsMonth, blockRows, absenceRows, allocationRows, lastActions, callsToday, meetingsToday, pendingRows, spikeRows, windowData, stock] =
        await Promise.all([
            runningCampaigns.length
                ? prisma.action.findMany({ where: { campaignId: { in: runningCampaigns }, result: "MEETING_BOOKED", createdAt: { gte: monthStart } }, select: { createdAt: true, campaignId: true }, take: 10_000 })
                : [],
            coveredCampaigns.length ? prisma.action.count({ where: { campaignId: { in: coveredCampaigns }, channel: "CALL", createdAt: { gte: monthStart } } }) : 0,
            prisma.scheduleBlock.findMany({
                where: {
                    date: { gte: keyToUtcDate(first), lte: keyToUtcDate(last) },
                    status: { not: "CANCELLED" },
                    OR: [{ suggestionStatus: null }, { suggestionStatus: "CONFIRMED" }],
                },
                select: { sdrId: true, missionId: true, date: true, startTime: true, endTime: true, mission: { select: { name: true } } },
                take: 10_000,
            }),
            prisma.sdrAbsence.findMany({
                where: { impactsPlanning: true, startDate: { lte: keyToUtcDate(last) }, endDate: { gte: keyToUtcDate(first) } },
                select: { sdrId: true, startDate: true, endDate: true },
                take: 2_000,
            }),
            covered.length
                ? prisma.sdrDayAllocation.findMany({
                      where: { missionMonthPlan: { month, missionId: { in: [...coveredIds] } } },
                      select: { sdrId: true, allocatedDays: true, missionMonthPlan: { select: { missionId: true } } },
                      take: 2_000,
                  })
                : [],
            prisma.action.groupBy({ by: ["sdrId"], where: { createdAt: { gte: dayStart } }, _max: { createdAt: true } }),
            prisma.action.findMany({ where: { channel: "CALL", createdAt: { gte: dayStart } }, select: { sdrId: true, createdAt: true }, take: 30_000 }),
            prisma.action.groupBy({ by: ["sdrId"], where: { result: "MEETING_BOOKED", createdAt: { gte: dayStart } }, _count: { _all: true } }),
            prisma.action.findMany({
                where: { result: "MEETING_BOOKED", confirmationStatus: "PENDING", createdAt: { gte: new Date(nowMs - SAS_LOOKBACK_MS) } },
                orderBy: { createdAt: "asc" },
                take: 50,
                select: {
                    id: true,
                    createdAt: true,
                    sdr: { select: { name: true } },
                    contact: { select: { firstName: true, lastName: true, company: { select: { name: true } } } },
                    company: { select: { name: true } },
                },
            }),
            activeCampaigns.length
                ? prisma.action.groupBy({ by: ["campaignId", "result"], where: { campaignId: { in: activeCampaigns }, channel: "CALL", createdAt: { gte: spikeSince } }, _count: { _all: true } })
                : [],
            remember(`window:${windowDays[0]}`, nowMs, () => readWindow(windowSince)),
            remember(`stock:${running.length}`, nowMs, () => readStock(running.map((m) => ({ id: m.id, name: m.name, listIds: m.listIds })))),
        ]);

    // ── Names ─────────────────────────────────────────────────────────────
    const nameOf = new Map(sdrUsers.map((u) => [u.id, u.name]));
    const unknown = new Set<string>();
    for (const r of windowData.rows) if (!nameOf.has(r.sdr)) unknown.add(r.sdr);
    for (const b of blockRows) if (!nameOf.has(b.sdrId)) unknown.add(b.sdrId);
    if (unknown.size) {
        const extra = await prisma.user.findMany({ where: { id: { in: [...unknown].slice(0, 500) } }, select: { id: true, name: true } });
        for (const u of extra) nameOf.set(u.id, u.name);
    }

    // ── Atterrissage ──────────────────────────────────────────────────────
    const meetingsByDay: Record<string, number> = {};
    const meetingsByMission = new Map<string, number>();
    for (const a of meetingsMonth) {
        const m = missionOf.get(a.campaignId);
        if (!m) continue;
        meetingsByMission.set(m, (meetingsByMission.get(m) ?? 0) + 1);
        if (!coveredIds.has(m)) continue;
        const k = parisKey(a.createdAt);
        meetingsByDay[k] = (meetingsByDay[k] ?? 0) + 1;
    }

    const blocks = blockRows
        .map((b) => ({ ...b, day: utcDateToKey(b.date), start: hhmmToMinute(b.startTime), end: hhmmToMinute(b.endTime) }))
        .filter((b): b is typeof b & { start: number; end: number } => b.start !== null && b.end !== null && b.end > b.start);
    const absences: AbsenceSpan[] = absenceRows.map((a) => ({ sdrId: a.sdrId, from: utcDateToKey(a.startDate), to: utcDateToKey(a.endDate) }));

    const planned = plannedDays({
        todayKey,
        nowMinute,
        monthFirst: first,
        monthLast: last,
        holidays,
        blocks: blocks.filter((b) => coveredIds.has(b.missionId)).map<PlannedBlock>((b) => ({ sdrId: b.sdrId, missionId: b.missionId, day: b.day, start: b.start, end: b.end })),
        absences,
        allocations: allocationRows.map((a) => ({ sdrId: a.sdrId, missionId: a.missionMonthPlan.missionId, allocatedDays: a.allocatedDays })),
        sdrIds: sdrUsers.map((u) => u.id),
    });

    // Pattern tallies: per SDR × hour, per mission × hour, and the covered missions' window.
    const sdrHour = new Map<string, Tally>();
    const missionHour = new Map<string, Tally>();
    const sdrTotal = new Map<string, Tally>();
    const agency = emptyTally();
    const coveredWindow = emptyTally();
    const bump = (map: Map<string, Tally>, key: string, r: WindowRow) => {
        const t = map.get(key) ?? emptyTally();
        addCalls(t, r.result, categoryOf.get(r.result), r.n);
        map.set(key, t);
    };
    for (const r of windowData.rows) {
        bump(sdrHour, `${r.sdr}|${r.hour}`, r);
        if (missionById.has(r.mission)) bump(missionHour, `${r.mission}|${r.hour}`, r);
        bump(sdrTotal, r.sdr, r);
        addCalls(agency, r.result, categoryOf.get(r.result), r.n);
        if (coveredIds.has(r.mission)) addCalls(coveredWindow, r.result, categoryOf.get(r.result), r.n);
    }

    const target = Math.round(covered.reduce((s, m) => s + m.share, 0));
    const fc = forecast({
        todayKey,
        nowMinute,
        monthFirst: first,
        monthLast: last,
        holidays,
        quota,
        target,
        meetingsByDay,
        callsSoFar: callsMonth,
        planned,
        window: { calls: coveredWindow.calls, reached: coveredWindow.reached, meetings: coveredWindow.meetings },
    });
    const forecastMissions: ForecastMission[] = covered
        .map((m) => ({ id: m.id, name: m.name, client: m.client?.name ?? null, target: m.share, meetings: meetingsByMission.get(m.id) ?? 0 }))
        .sort((a, b) => a.meetings / a.target - b.meetings / b.target);
    const untargeted = running
        .filter((m) => !(m.targetMeetings && m.targetMeetings > 0))
        .map((m) => ({ id: m.id, name: m.name, meetings: meetingsByMission.get(m.id) ?? 0 }));

    // ── L'équipe en direct ────────────────────────────────────────────────
    const todayBlocks = new Map<string, TeamBlock[]>();
    for (const b of blocks) {
        if (b.day !== todayKey) continue;
        todayBlocks.set(b.sdrId, [...(todayBlocks.get(b.sdrId) ?? []), { start: b.start, end: b.end, missionId: b.missionId, mission: b.mission.name }]);
    }
    const absentToday = new Set(absences.filter((a) => a.from <= todayKey && todayKey <= a.to).map((a) => a.sdrId));
    const lastAt = new Map(lastActions.map((g) => [g.sdrId, g._max.createdAt]));
    const callMinutes = new Map<string, number[]>();
    for (const c of callsToday) callMinutes.set(c.sdrId, [...(callMinutes.get(c.sdrId) ?? []), parisMinute(c.createdAt)]);
    const meetingsOfSdr = new Map(meetingsToday.map((g) => [g.sdrId, g._count._all]));
    const isSdr = new Set(sdrUsers.map((u) => u.id));
    const teamIds = new Set<string>([
        ...todayBlocks.keys(),
        ...[...absentToday].filter((id) => isSdr.has(id)),
        ...[...lastAt.keys()].filter((id) => isSdr.has(id)),
    ]);
    const team = sortTeam(
        [...teamIds].map((id) => {
            const last = lastAt.get(id);
            return teamMember({
                id,
                name: nameOf.get(id) ?? "SDR",
                nowMinute,
                blocks: (todayBlocks.get(id) ?? []).sort((a, b) => a.start - b.start),
                absent: absentToday.has(id),
                lastActionMinute: last ? parisMinute(last) : null,
                callMinutes: callMinutes.get(id) ?? [],
                meetings: meetingsOfSdr.get(id) ?? 0,
                quota,
                targetHours: config.targetHours,
            });
        }),
    );

    // ── Patterns ──────────────────────────────────────────────────────────
    const toCells = (map: Map<string, Tally>): HeatInputCell[] =>
        [...map].map(([key, tally]) => {
            const [row, hour] = key.split("|");
            return { row, hour: Number(hour), tally };
        });
    const topRows = (ids: Iterable<string>, label: (id: string) => string, totals: (id: string) => number) =>
        [...ids]
            .map((id) => ({ id, label: label(id), n: totals(id) }))
            .sort((a, b) => b.n - a.n)
            .slice(0, MAX_HEAT_ROWS)
            .map(({ id, label: l }) => ({ id, label: l }));
    const missionTotals = new Map<string, number>();
    for (const [key, t] of missionHour) {
        const id = key.split("|")[0];
        missionTotals.set(id, (missionTotals.get(id) ?? 0) + t.reached);
    }
    const heatmap = {
        sdr: buildHeatmap(topRows(sdrTotal.keys(), (id) => nameOf.get(id) ?? "SDR", (id) => sdrTotal.get(id)?.reached ?? 0), toCells(sdrHour)),
        mission: buildHeatmap(topRows(missionTotals.keys(), (id) => missionById.get(id)?.name ?? "Mission", (id) => missionTotals.get(id) ?? 0), toCells(missionHour)),
    };

    const closers = buildClosers(
        [...sdrTotal]
            .filter(([id]) => isSdr.has(id))
            .map(([id, t]) => ({ id, name: nameOf.get(id) ?? "SDR", calls: t.calls, activeDays: windowData.days.get(id) ?? 0, reached: t.reached, meetings: t.meetings })),
        quota,
    );

    // ── À décider maintenant ──────────────────────────────────────────────
    const spikeByMission = new Map<string, Tally>();
    for (const g of spikeRows) {
        const m = missionOf.get(g.campaignId);
        if (!m) continue;
        spikeByMission.set(m, addCalls(spikeByMission.get(m) ?? emptyTally(), g.result, categoryOf.get(g.result), g._count._all));
    }
    const benchmark = agency.reached >= 50 ? ratio(agency.refusals, agency.reached) : null;
    const pending = pendingRows.map((p) => ({
        id: p.id,
        createdAt: p.createdAt.toISOString(),
        label: p.contact?.company?.name ?? p.company?.name ?? ([p.contact?.firstName, p.contact?.lastName].filter(Boolean).join(" ") || "RDV"),
        sdr: p.sdr?.name ?? null,
    }));

    const signals: Signal[] = sortSignals(
        [
            sasSignal(pending, nowDate, holidays),
            ...silenceSignals(team),
            ...refusalSignals(
                [...spikeByMission].map(([id, t]) => ({ missionId: id, name: missionById.get(id)?.name ?? "Mission", reached: t.reached, refusals: t.refusals })),
                benchmark,
            ),
            ...stockSignals(stock),
            ...closerSignals(closers.points, quota, closers.median),
            noTargetSignal(untargeted),
        ].filter((s): s is Signal => s !== null),
    );

    return {
        generatedAt: nowDate.toISOString(),
        today: { key: todayKey, minute: nowMinute, month, monthLabel: monthName.format(keyToUtcDate(first)) },
        config: { quota, targetHours: config.targetHours },
        window: { from: windowDays[0] ?? todayKey, to: todayKey, days: windowDays.length },
        forecast: { ...fc, missions: forecastMissions },
        untargeted,
        signals,
        team,
        heatmap,
        closers,
    };
}

