/**
 * ============================================================
 * CLIENT STAFFING OVERVIEW
 * ============================================================
 * Powers the "Dashboard Projet" (app/manager/dashboard-projet).
 *
 * One row per active-ish mission (ACTIVE / PAUSED / DRAFT — mirrors the set the
 * planning module considers "current"), showing:
 *   - contracted days/week (a Client-level field — a client may run several
 *     missions, but the contracted volume is negotiated per client, not per mission)
 *   - historical bookers: which SDRs have actually placed calls on this mission,
 *     derived from real Action records (not a hand-maintained list)
 *   - current bookers: which SDRs are actually scheduled on this mission in the
 *     near term, derived from real ScheduleBlock rows (the live planning grid) —
 *     NOT the static SDRAssignment roster, which can drift from reality
 *   - a missing-headcount flag when an ACTIVE mission has nobody scheduled
 *
 * Deliberately lighter than lib/planning/capacityMatrix.ts: that module builds a
 * full day-by-day SDR×mission grid (absences, overrides, availability, conflicts)
 * for the Planning UI. This overview only needs two lean, batched queries across
 * every mission at once — no per-mission round-trips.
 */
import { prisma } from "@/lib/prisma";

// SDRs are considered "currently on the mission" if they have a live schedule
// block within this rolling window. A rolling window (rather than "rest of the
// calendar month") avoids a false "missing" flag on the last days of a month
// when next month's planning is already staffed.
const CURRENT_WINDOW_DAYS = 14;

// Missions considered "live" for staffing purposes — matches what the planning
// matrix treats as current (excludes COMPLETED/ARCHIVED).
const LIVE_MISSION_STATUSES = ["ACTIVE", "PAUSED", "DRAFT"] as const;

export interface StaffingBooker {
    id: string;
    name: string;
    /** Only set for historical bookers — number of logged actions/calls. */
    actionCount?: number;
    lastActionAt?: Date | null;
}

export interface MissionStaffingRow {
    missionId: string;
    missionName: string;
    channel: string;
    status: string;
    clientId: string;
    clientName: string;
    clientStatus: string;
    contractedDaysPerWeek: number | null;
    historicalBookers: StaffingBooker[];
    currentBookers: StaffingBooker[];
    missingHeadcount: boolean;
}

export interface StaffingOverview {
    rows: MissionStaffingRow[];
    kpis: {
        totalMissions: number;
        activeMissions: number;
        missingHeadcount: number;
        clientsMissingDaysPerWeek: number;
        avgDaysPerWeek: number | null;
    };
}

export async function getStaffingOverview(): Promise<StaffingOverview> {
    const missions = await prisma.mission.findMany({
        where: { status: { in: [...LIVE_MISSION_STATUSES] } },
        select: {
            id: true,
            name: true,
            channel: true,
            status: true,
            client: {
                select: { id: true, name: true, status: true, contractedDaysPerWeek: true },
            },
            campaigns: { select: { id: true } },
        },
        orderBy: { name: "asc" },
    });

    const emptyOverview: StaffingOverview = {
        rows: [],
        kpis: { totalMissions: 0, activeMissions: 0, missingHeadcount: 0, clientsMissingDaysPerWeek: 0, avgDaysPerWeek: null },
    };
    if (missions.length === 0) return emptyOverview;

    const missionIds = missions.map((m) => m.id);
    const campaignToMission = new Map<string, string>();
    missions.forEach((m) => m.campaigns.forEach((c) => campaignToMission.set(c.id, m.id)));
    const campaignIds = [...campaignToMission.keys()];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + CURRENT_WINDOW_DAYS);

    const [historicalGroups, currentBlocks] = await Promise.all([
        campaignIds.length
            ? prisma.action.groupBy({
                by: ["sdrId", "campaignId"],
                where: { campaignId: { in: campaignIds } },
                _count: { _all: true },
                _max: { createdAt: true },
            })
            : Promise.resolve([]),
        prisma.scheduleBlock.findMany({
            where: {
                missionId: { in: missionIds },
                date: { gte: today, lte: windowEnd },
                status: { not: "CANCELLED" },
            },
            select: { missionId: true, sdrId: true },
            distinct: ["missionId", "sdrId"],
        }),
    ]);

    // Roll campaign-level historical groups up to mission level
    const historicalByMission = new Map<string, Map<string, { count: number; lastAt: Date | null }>>();
    for (const g of historicalGroups) {
        const missionId = campaignToMission.get(g.campaignId);
        if (!missionId) continue;
        const bySdr = historicalByMission.get(missionId) ?? new Map();
        const existing = bySdr.get(g.sdrId);
        const count = (existing?.count ?? 0) + g._count._all;
        const prevLast = existing?.lastAt ?? null;
        const newLast = g._max.createdAt ?? null;
        const lastAt = !prevLast ? newLast : !newLast ? prevLast : prevLast > newLast ? prevLast : newLast;
        bySdr.set(g.sdrId, { count, lastAt });
        historicalByMission.set(missionId, bySdr);
    }

    const currentByMission = new Map<string, Set<string>>();
    for (const b of currentBlocks) {
        const set = currentByMission.get(b.missionId) ?? new Set<string>();
        set.add(b.sdrId);
        currentByMission.set(b.missionId, set);
    }

    // Single lookup for every SDR name referenced anywhere above
    const allSdrIds = new Set<string>();
    historicalByMission.forEach((m) => m.forEach((_, sdrId) => allSdrIds.add(sdrId)));
    currentByMission.forEach((s) => s.forEach((sdrId) => allSdrIds.add(sdrId)));
    const sdrs = allSdrIds.size
        ? await prisma.user.findMany({ where: { id: { in: [...allSdrIds] } }, select: { id: true, name: true } })
        : [];
    const sdrName = new Map(sdrs.map((s) => [s.id, s.name]));

    // Client-level KPIs need one entry per client, not per mission
    const clientDays = new Map<string, number | null>();
    missions.forEach((m) => clientDays.set(m.client.id, m.client.contractedDaysPerWeek));
    const setDays = [...clientDays.values()].filter((d): d is number => d != null);

    const rows: MissionStaffingRow[] = missions.map((m) => {
        const historical = [...(historicalByMission.get(m.id)?.entries() ?? [])]
            .map(([sdrId, v]) => ({ id: sdrId, name: sdrName.get(sdrId) ?? "SDR inconnu", actionCount: v.count, lastActionAt: v.lastAt }))
            .sort((a, b) => b.actionCount - a.actionCount);
        const current = [...(currentByMission.get(m.id) ?? [])]
            .map((sdrId) => ({ id: sdrId, name: sdrName.get(sdrId) ?? "SDR inconnu" }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return {
            missionId: m.id,
            missionName: m.name,
            channel: m.channel,
            status: m.status,
            clientId: m.client.id,
            clientName: m.client.name,
            clientStatus: m.client.status,
            contractedDaysPerWeek: m.client.contractedDaysPerWeek,
            historicalBookers: historical,
            currentBookers: current,
            missingHeadcount: m.status === "ACTIVE" && current.length === 0,
        };
    });

    return {
        rows,
        kpis: {
            totalMissions: rows.length,
            activeMissions: rows.filter((r) => r.status === "ACTIVE").length,
            missingHeadcount: rows.filter((r) => r.missingHeadcount).length,
            clientsMissingDaysPerWeek: [...clientDays.values()].filter((d) => d == null).length,
            avgDaysPerWeek: setDays.length ? setDays.reduce((a, b) => a + b, 0) / setDays.length : null,
        },
    };
}
