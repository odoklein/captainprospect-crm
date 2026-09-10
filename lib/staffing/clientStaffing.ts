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
 *   - a tiered coverage status, and a suggested days/week value — see "Graceful
 *     degradation" below.
 *
 * Deliberately lighter than lib/planning/capacityMatrix.ts: that module builds a
 * full day-by-day SDR×mission grid (absences, overrides, availability, conflicts)
 * for the Planning UI. This overview only needs a few lean, batched queries across
 * every mission at once — no per-mission round-trips.
 *
 * ------------------------------------------------------------
 * Graceful degradation (managers forget to fill things in)
 * ------------------------------------------------------------
 * The dashboard shouldn't just show blanks when a manager hasn't entered data —
 * it should infer from whatever real signal already exists:
 *
 * - Coverage is a 4-tier status, not a single yes/no flag, built from a widened
 *   0–30 day ScheduleBlock window plus the static SDRAssignment roster as a
 *   fallback signal:
 *     COVERED                — someone is scheduled in the next 14 days
 *     UPCOMING                — nobody in 14 days, but someone is in 15–30 days
 *                                (avoids a false "missing" flag right after a
 *                                mission is set up, before the planner has run)
 *     ASSIGNED_NOT_SCHEDULED — nobody in the calendar at all, but a static SDR
 *                                roster exists (SDRAssignment) — the planning
 *                                step was simply never done for real dates
 *     MISSING                 — no calendar entries and no roster either
 *   Only MISSING / ASSIGNED_NOT_SCHEDULED on an ACTIVE mission count as
 *   "needs attention" (`missingHeadcount`) — UPCOMING is informational, not a gap.
 *
 * - Historical bookers fall back to the static SDRAssignment roster (marked
 *   `assignedOnly: true`) when there is no call history yet, instead of showing
 *   an empty "Aucun appel" with zero information — a brand-new mission still
 *   shows who is supposed to be on it.
 *
 * - When `Client.contractedDaysPerWeek` hasn't been filled in, a
 *   `suggestedDaysPerWeek` is computed from the client's own actual scheduling
 *   cadence over the last 30 days (distinct worked days ÷ ~4.3 weeks, rounded to
 *   the nearest half-day) — so the dashboard can offer a one-click "apply this
 *   value" instead of forcing the manager to guess and type a number.
 */
import { prisma } from "@/lib/prisma";

// SDRs are considered "currently on the mission" if they have a live schedule
// block within this rolling window. A rolling window (rather than "rest of the
// calendar month") avoids a false "missing" flag on the last days of a month
// when next month's planning is already staffed.
const CURRENT_WINDOW_DAYS = 14;
// Second-chance window before falling back further (see coverageStatus above).
const UPCOMING_WINDOW_DAYS = 30;
// Trailing window used to infer a days/week suggestion from real cadence.
const CADENCE_LOOKBACK_DAYS = 30;

// Missions considered "live" for staffing purposes — matches what the planning
// matrix treats as current (excludes COMPLETED/ARCHIVED).
const LIVE_MISSION_STATUSES = ["ACTIVE", "PAUSED", "DRAFT"] as const;

export type CoverageStatus = "COVERED" | "UPCOMING" | "ASSIGNED_NOT_SCHEDULED" | "MISSING";

export interface StaffingBooker {
    id: string;
    name: string;
    /** Only set for historical bookers — number of logged actions/calls. */
    actionCount?: number;
    lastActionAt?: Date | null;
    /** True when this entry comes from the static SDRAssignment roster because
     *  there's no real call/planning data yet — a fallback, not a measurement. */
    assignedOnly?: boolean;
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
    /** Inferred from real scheduling cadence when contractedDaysPerWeek is null. */
    suggestedDaysPerWeek: number | null;
    historicalBookers: StaffingBooker[];
    currentBookers: StaffingBooker[];
    /** Only populated when coverageStatus is UPCOMING — who's booked in 15-30d. */
    upcomingBookers: StaffingBooker[];
    /** The raw SDRAssignment roster — surfaced so the UI can show *who* still
     *  needs to be put on the calendar when coverageStatus is ASSIGNED_NOT_SCHEDULED. */
    assignedBookers: StaffingBooker[];
    coverageStatus: CoverageStatus;
    /** True when this ACTIVE mission genuinely needs attention now (MISSING or
     *  ASSIGNED_NOT_SCHEDULED) — drives the red badge, the KPI count and the
     *  "Manque uniquement" filter. UPCOMING is informational, not a gap. */
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

function startOfDay(d: Date): Date {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

function addDays(d: Date, days: number): Date {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + days);
    return copy;
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
            sdrAssignments: { select: { sdrId: true } },
        },
        orderBy: { name: "asc" },
    });

    const emptyOverview: StaffingOverview = {
        rows: [],
        kpis: { totalMissions: 0, activeMissions: 0, missingHeadcount: 0, clientsMissingDaysPerWeek: 0, avgDaysPerWeek: null },
    };
    if (missions.length === 0) return emptyOverview;

    const missionIds = missions.map((m) => m.id);
    const missionToClient = new Map(missions.map((m) => [m.id, m.client.id]));
    const campaignToMission = new Map<string, string>();
    missions.forEach((m) => m.campaigns.forEach((c) => campaignToMission.set(c.id, m.id)));
    const campaignIds = [...campaignToMission.keys()];

    const today = startOfDay(new Date());
    const pastStart = addDays(today, -CADENCE_LOOKBACK_DAYS);
    const soonEnd = addDays(today, CURRENT_WINDOW_DAYS);
    const upcomingEnd = addDays(today, UPCOMING_WINDOW_DAYS);

    const [historicalGroups, blocks] = await Promise.all([
        campaignIds.length
            ? prisma.action.groupBy({
                by: ["sdrId", "campaignId"],
                where: { campaignId: { in: campaignIds } },
                _count: { _all: true },
                _max: { createdAt: true },
            })
            : Promise.resolve([]),
        // One widened query (past 30d → next 30d) covers both the coverage tiers
        // (0-14 / 15-30 ahead) and the cadence suggestion (30d behind).
        prisma.scheduleBlock.findMany({
            where: {
                missionId: { in: missionIds },
                date: { gte: pastStart, lte: upcomingEnd },
                status: { not: "CANCELLED" },
            },
            select: { missionId: true, sdrId: true, date: true },
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

    // Bucket ScheduleBlocks into: current (0-14d), upcoming (15-30d), and past
    // (cadence lookback), the last one rolled up per CLIENT (not per mission —
    // several missions on the same client working different days should still
    // count toward that client's overall cadence, not be double-penalized).
    const currentByMission = new Map<string, Set<string>>();
    const upcomingByMission = new Map<string, Set<string>>();
    const pastDatesByClient = new Map<string, Set<string>>();
    for (const b of blocks) {
        const dateKey = b.date.toISOString().slice(0, 10);
        if (b.date >= today && b.date <= soonEnd) {
            const set = currentByMission.get(b.missionId) ?? new Set<string>();
            set.add(b.sdrId);
            currentByMission.set(b.missionId, set);
        } else if (b.date > soonEnd && b.date <= upcomingEnd) {
            const set = upcomingByMission.get(b.missionId) ?? new Set<string>();
            set.add(b.sdrId);
            upcomingByMission.set(b.missionId, set);
        } else if (b.date >= pastStart && b.date < today) {
            const clientId = missionToClient.get(b.missionId);
            if (!clientId) continue;
            const set = pastDatesByClient.get(clientId) ?? new Set<string>();
            set.add(dateKey);
            pastDatesByClient.set(clientId, set);
        }
    }

    const assignedByMission = new Map<string, Set<string>>();
    missions.forEach((m) => assignedByMission.set(m.id, new Set(m.sdrAssignments.map((a) => a.sdrId))));

    // Single lookup for every SDR name referenced anywhere above
    const allSdrIds = new Set<string>();
    historicalByMission.forEach((m) => m.forEach((_, sdrId) => allSdrIds.add(sdrId)));
    currentByMission.forEach((s) => s.forEach((sdrId) => allSdrIds.add(sdrId)));
    assignedByMission.forEach((s) => s.forEach((sdrId) => allSdrIds.add(sdrId)));
    const sdrs = allSdrIds.size
        ? await prisma.user.findMany({ where: { id: { in: [...allSdrIds] } }, select: { id: true, name: true } })
        : [];
    const sdrName = new Map(sdrs.map((s) => [s.id, s.name]));

    // Client-level: contracted days (real) + suggested days (inferred from cadence)
    const clientDays = new Map<string, number | null>();
    missions.forEach((m) => clientDays.set(m.client.id, m.client.contractedDaysPerWeek));
    const suggestedDaysByClient = new Map<string, number | null>();
    pastDatesByClient.forEach((dates, clientId) => {
        const raw = dates.size / (CADENCE_LOOKBACK_DAYS / 7); // distinct days worked per week, on average
        const rounded = Math.round(raw * 2) / 2;
        suggestedDaysByClient.set(clientId, rounded >= 0.5 ? Math.min(rounded, 7) : null);
    });
    const setDays = [...clientDays.values()].filter((d): d is number => d != null);

    const rows: MissionStaffingRow[] = missions.map((m) => {
        const historicalMap = historicalByMission.get(m.id);
        let historical: StaffingBooker[] = [...(historicalMap?.entries() ?? [])]
            .map(([sdrId, v]) => ({ id: sdrId, name: sdrName.get(sdrId) ?? "SDR inconnu", actionCount: v.count, lastActionAt: v.lastAt }))
            .sort((a, b) => (b.actionCount ?? 0) - (a.actionCount ?? 0));
        // No call history yet (brand-new mission)? Fall back to the static roster
        // so the row still shows *something* instead of "Aucun appel".
        if (historical.length === 0) {
            historical = [...assignedByMission.get(m.id)!].map((sdrId) => ({
                id: sdrId,
                name: sdrName.get(sdrId) ?? "SDR inconnu",
                assignedOnly: true,
            }));
        }

        const currentSet = currentByMission.get(m.id) ?? new Set<string>();
        const upcomingSet = upcomingByMission.get(m.id) ?? new Set<string>();
        const assignedSet = assignedByMission.get(m.id) ?? new Set<string>();

        const current = [...currentSet]
            .map((sdrId) => ({ id: sdrId, name: sdrName.get(sdrId) ?? "SDR inconnu" }))
            .sort((a, b) => a.name.localeCompare(b.name));
        const upcoming = [...upcomingSet]
            .map((sdrId) => ({ id: sdrId, name: sdrName.get(sdrId) ?? "SDR inconnu" }))
            .sort((a, b) => a.name.localeCompare(b.name));
        const assigned = [...assignedSet]
            .map((sdrId) => ({ id: sdrId, name: sdrName.get(sdrId) ?? "SDR inconnu" }))
            .sort((a, b) => a.name.localeCompare(b.name));

        let coverageStatus: CoverageStatus;
        if (currentSet.size > 0) coverageStatus = "COVERED";
        else if (upcomingSet.size > 0) coverageStatus = "UPCOMING";
        else if (assignedSet.size > 0) coverageStatus = "ASSIGNED_NOT_SCHEDULED";
        else coverageStatus = "MISSING";

        // A mission can stay flagged ACTIVE in the DB well after the manager pauses
        // the *client* elsewhere — normal data drift, not a real staffing emergency.
        // Require both to be genuinely active before treating a gap as urgent, or
        // every paused client's mission would scream red for no operational reason
        // and managers would learn to distrust the red badge.
        const needsAttention = m.status === "ACTIVE" && m.client.status === "ACTIVE"
            && (coverageStatus === "MISSING" || coverageStatus === "ASSIGNED_NOT_SCHEDULED");

        return {
            missionId: m.id,
            missionName: m.name,
            channel: m.channel,
            status: m.status,
            clientId: m.client.id,
            clientName: m.client.name,
            clientStatus: m.client.status,
            contractedDaysPerWeek: m.client.contractedDaysPerWeek,
            suggestedDaysPerWeek: m.client.contractedDaysPerWeek == null ? suggestedDaysByClient.get(m.client.id) ?? null : null,
            historicalBookers: historical,
            currentBookers: current,
            upcomingBookers: coverageStatus === "UPCOMING" ? upcoming : [],
            assignedBookers: assigned,
            coverageStatus,
            missingHeadcount: needsAttention,
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
