// ============================================
// SALLE DE PILOTAGE — « Atterrissage du mois ».
//
//   projection = RDV pris ce mois
//              + jours-SDR planifiés restants × quota × tenue × joignabilité × taux de RDV
//
//   tenue          appels passés ÷ quota planifié jusqu'ici (ce mois)
//   joignabilité   joints ÷ appels, 20 derniers jours ouvrés
//   taux de RDV    RDV pris ÷ joints, même fenêtre
//
// Planned days come from the planning (ScheduleBlock, plus the month
// allocations not placed yet), absences deducted. A day is prorated on its
// calling time exactly like the SDR's own pace (lib/sdr-pace): 7 h of blocks
// minus lunch is one day of quota. Pure: the server passes counts.
// ============================================

import { computeEffectiveTime, FULL_DAY_CALLING_MINUTES, type Interval } from "@/lib/sdr-pace/pace";
import { blockDayUnits } from "@/lib/planning/board-shared";
import { isWorkingDay, overlapDays, workingDaysBetween } from "./calendar";
import { ratio } from "./dictionary";

// Same thresholds as pace() in lib/missions/pulse.ts.
export const AHEAD_RATIO = 1.15;
export const BEHIND_RATIO = 0.85;

/** Beyond these, a lever is not a plan: it is wishful thinking. */
export const LEVER_LIMITS = { completion: 1.1, reach: 0.45, rate: 0.09 } as const;

// ── Planned SDR-days ──────────────────────────────────────────────────────

export interface PlannedBlock {
    sdrId: string;
    missionId: string;
    day: string;
    /** Minutes since Paris midnight. */
    start: number;
    end: number;
}

export interface AbsenceSpan {
    sdrId: string;
    from: string;
    to: string;
}

export interface MonthAllocation {
    sdrId: string;
    missionId: string;
    allocatedDays: number;
}

export interface PlanInput {
    todayKey: string;
    nowMinute: number;
    monthFirst: string;
    monthLast: string;
    holidays: ReadonlySet<string>;
    /** This month's blocks on the missions the forecast covers. */
    blocks: PlannedBlock[];
    absences: AbsenceSpan[];
    allocations: MonthAllocation[];
    /** Everyone who could take more days (the team), for the capacity. */
    sdrIds: string[];
}

export interface PlannedDays {
    /** SDR-days of quota planned from the 1st up to now. */
    soFar: number;
    /** SDR-days of quota planned from now to the end of the month. */
    remaining: number;
    /** Of `remaining`, the days allocated in the month plan but not placed in a block yet. */
    unplaced: number;
    /** SDR-days the whole team could still work this month (absences deducted). */
    capacity: number;
}

export function isAbsent(absences: AbsenceSpan[], sdrId: string, day: string): boolean {
    return absences.some((a) => a.sdrId === sdrId && a.from <= day && day <= a.to);
}

/** Calling minutes of a day's blocks (merged, lunch out), and those already behind `nowMinute`. */
function dayMinutes(intervals: Interval[], nowMinute: number): { planned: number; elapsed: number } {
    if (!intervals.length) return { planned: 0, elapsed: 0 };
    const t = computeEffectiveTime({ blocks: intervals, callMinutes: [], nowMinute });
    return { planned: t.plannedMinutes, elapsed: Math.min(t.plannedMinutes, t.elapsedMinutes) };
}

/** Share of a default 9–17 day still ahead at `nowMinute`. */
function defaultDayLeft(nowMinute: number): number {
    const t = computeEffectiveTime({ blocks: [], callMinutes: [], nowMinute });
    return t.plannedMinutes > 0 ? 1 - t.elapsedMinutes / t.plannedMinutes : 0;
}

export function plannedDays(input: PlanInput): PlannedDays {
    const { todayKey, nowMinute, holidays } = input;
    const byDay = new Map<string, Map<string, Interval[]>>(); // sdr → day → intervals
    const placedUnits = new Map<string, number>(); // `${sdr}|${mission}` → planning day units this month
    for (const b of input.blocks) {
        if (b.end <= b.start) continue;
        const days = byDay.get(b.sdrId) ?? new Map<string, Interval[]>();
        days.set(b.day, [...(days.get(b.day) ?? []), { start: b.start, end: b.end }]);
        byDay.set(b.sdrId, days);
        const key = `${b.sdrId}|${b.missionId}`;
        placedUnits.set(key, (placedUnits.get(key) ?? 0) + blockDayUnits(minuteToHhmm(b.start), minuteToHhmm(b.end)));
    }

    let soFar = 0;
    let remainingPlaced = 0;
    for (const [sdrId, days] of byDay) {
        for (const [day, intervals] of days) {
            if (isAbsent(input.absences, sdrId, day)) continue;
            const now = day < todayKey ? 24 * 60 : day > todayKey ? 0 : nowMinute;
            const { planned, elapsed } = dayMinutes(intervals, now);
            if (!planned) continue;
            const units = Math.min(1, planned / FULL_DAY_CALLING_MINUTES);
            soFar += units * (elapsed / planned);
            remainingPlaced += units * (1 - elapsed / planned);
        }
    }

    // Allocated in the month plan, not placed yet: it can only land on a free working day ahead.
    const futureDays = workingDaysBetween(nextDay(todayKey), input.monthLast, holidays);
    const unplacedBySdr = new Map<string, number>();
    for (const a of input.allocations) {
        const left = Math.max(0, a.allocatedDays - (placedUnits.get(`${a.sdrId}|${a.missionId}`) ?? 0));
        if (left > 0) unplacedBySdr.set(a.sdrId, (unplacedBySdr.get(a.sdrId) ?? 0) + left);
    }
    let unplaced = 0;
    for (const [sdrId, left] of unplacedBySdr) {
        const days = byDay.get(sdrId);
        const free = futureDays.filter((d) => !days?.has(d) && !isAbsent(input.absences, sdrId, d)).length;
        unplaced += Math.min(left, free);
    }

    const team = new Set([...input.sdrIds, ...byDay.keys()]);
    const todayLeft = isWorkingDay(todayKey, holidays) && todayKey >= input.monthFirst && todayKey <= input.monthLast ? defaultDayLeft(nowMinute) : 0;
    let capacity = 0;
    for (const sdrId of team) {
        capacity += futureDays.filter((d) => !isAbsent(input.absences, sdrId, d)).length;
        if (todayLeft && !isAbsent(input.absences, sdrId, todayKey)) capacity += todayLeft;
    }

    return { soFar, remaining: remainingPlaced + unplaced, unplaced, capacity: Math.max(capacity, remainingPlaced + unplaced) };
}

function nextDay(key: string): string {
    const d = new Date(`${key}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

function minuteToHhmm(minute: number): string {
    const m = Math.max(0, Math.round(minute));
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// ── Month target ──────────────────────────────────────────────────────────

/**
 * The share of a mission's target that falls in this month: targetMeetings
 * covers the whole mission period, so a three-month mission owes a third of
 * it in each month (prorated on calendar days, as pace() reads time).
 */
export function monthShareOfTarget(input: { target: number; missionFrom: string; missionTo: string; monthFirst: string; monthLast: string }): number {
    const total = overlapDays(input.missionFrom, input.missionTo, input.missionFrom, input.missionTo);
    if (!total || input.target <= 0) return 0;
    return (input.target * overlapDays(input.missionFrom, input.missionTo, input.monthFirst, input.monthLast)) / total;
}

// ── Forecast ──────────────────────────────────────────────────────────────

export type LandingVerdict = "no_target" | "reached" | "ahead" | "on_track" | "behind";

export interface ForecastInput {
    todayKey: string;
    nowMinute: number;
    monthFirst: string;
    monthLast: string;
    holidays: ReadonlySet<string>;
    /** Daily call quota (getPaceConfig). */
    quota: number;
    /** Meetings the covered missions owe this month (rounded sum of their shares). */
    target: number;
    /** MEETING_BOOKED per Paris day this month, covered missions. */
    meetingsByDay: Record<string, number>;
    /** Calls made this month on the covered missions. */
    callsSoFar: number;
    planned: PlannedDays;
    /** Last 20 working days: calls, joints, meetings. */
    window: { calls: number; reached: number; meetings: number };
}

export type LeverKey = "days" | "completion" | "reach" | "rate";

export interface Lever {
    key: LeverKey;
    label: string;
    /** Today's value (days: planned remaining; others: ratios). */
    current: number;
    /** Value that lands exactly on target, all else equal. Null: no value can (nothing planned). */
    needed: number | null;
    unrealistic: boolean;
    /** Why it is out of reach, when it is. */
    reason: string | null;
}

export interface ForecastPoint {
    key: string;
    actual: number | null;
    ideal: number;
    projection: number | null;
}

export interface Forecast {
    verdict: LandingVerdict;
    done: number;
    target: number;
    projected: number;
    /** projected − target (rounded). */
    gap: number;
    /** Meetings an even pace over the working days would have by now. */
    expectedByNow: number;
    workingDays: { total: number; elapsed: number; left: number };
    rates: {
        /** Null: nothing was planned so far, 100 % is assumed. */
        completion: number | null;
        reach: number | null;
        rate: number | null;
    };
    /** Meetings one planned SDR-day brings at today's rates. */
    perSdrDay: number;
    planned: PlannedDays;
    levers: Lever[];
    series: ForecastPoint[];
}

export function landingVerdict(done: number, projected: number, target: number): LandingVerdict {
    if (target <= 0) return "no_target";
    if (done >= target) return "reached";
    const r = projected / target;
    if (r >= AHEAD_RATIO) return "ahead";
    if (r >= BEHIND_RATIO) return "on_track";
    return "behind";
}

export function forecast(input: ForecastInput): Forecast {
    const { quota, target, planned } = input;
    const done = Object.entries(input.meetingsByDay)
        .filter(([k]) => k >= input.monthFirst && k <= input.monthLast)
        .reduce((s, [, n]) => s + n, 0);

    const plannedQuota = planned.soFar * quota;
    const completion = plannedQuota >= 1 ? input.callsSoFar / plannedQuota : null;
    const reach = ratio(input.window.reached, input.window.calls);
    const rate = ratio(input.window.meetings, input.window.reached);
    const c = completion ?? 1;
    const perSdrDay = quota * c * (reach ?? 0) * (rate ?? 0);
    const projectedRaw = done + planned.remaining * perSdrDay;
    const projected = Math.round(projectedRaw);

    // Working-day clock of the month.
    const days = workingDaysBetween(input.monthFirst, input.monthLast, input.holidays);
    const passed = days.filter((d) => d < input.todayKey).length;
    const todayShare = days.includes(input.todayKey) ? 1 - defaultDayLeft(input.nowMinute) : 0;
    const elapsed = passed + todayShare;
    const expectedByNow = days.length ? (target * elapsed) / days.length : 0;

    const levers = target > done ? leversFor({ need: target - done, quota, completion: c, reach: reach ?? 0, rate: rate ?? 0, planned }) : [];

    return {
        verdict: landingVerdict(done, projectedRaw, target),
        done,
        target,
        projected,
        gap: Math.round(projectedRaw - target),
        expectedByNow,
        workingDays: { total: days.length, elapsed, left: Math.max(0, days.length - elapsed) },
        rates: { completion, reach, rate },
        perSdrDay,
        planned,
        levers,
        series: forecastSeries({ days, todayKey: input.todayKey, meetingsByDay: input.meetingsByDay, done, projected: projectedRaw, target, monthFirst: input.monthFirst }),
    };
}

/** What each lever alone would have to reach to land on target. */
export function leversFor(input: { need: number; quota: number; completion: number; reach: number; rate: number; planned: PlannedDays }): Lever[] {
    const { need, quota, completion, reach, rate, planned } = input;
    const perDay = quota * completion * reach * rate;
    const days = planned.remaining;
    const solve = (others: number) => (days > 0 && others > 0 ? need / (days * others) : null);

    const neededDays = perDay > 0 ? need / perDay : null;
    const neededCompletion = solve(quota * reach * rate);
    const neededReach = solve(quota * completion * rate);
    const neededRate = solve(quota * completion * reach);

    const over = (needed: number | null, limit: number, what: string) =>
        needed === null ? (days > 0 ? "Aucun appel joint ni RDV dans la fenêtre : rien à multiplier." : "Aucun jour planifié d’ici la fin du mois.") : needed > limit ? `Au-delà de ${Math.round(limit * 100)} % ${what}.` : null;

    const daysReason =
        neededDays === null ? "Aucun RDV par jour-SDR au rythme actuel." : neededDays > planned.capacity ? `Plus que les ${formatDays(planned.capacity)} jours-SDR que l’équipe peut encore donner.` : null;

    return [
        { key: "days", label: "Jours-SDR planifiés", current: days, needed: neededDays, unrealistic: daysReason !== null, reason: daysReason },
        { key: "completion", label: "Tenue du quota", current: completion, needed: neededCompletion, unrealistic: over(neededCompletion, LEVER_LIMITS.completion, "de tenue") !== null, reason: over(neededCompletion, LEVER_LIMITS.completion, "de tenue") },
        { key: "reach", label: "Joignabilité", current: reach, needed: neededReach, unrealistic: over(neededReach, LEVER_LIMITS.reach, "de joignabilité") !== null, reason: over(neededReach, LEVER_LIMITS.reach, "de joignabilité") },
        { key: "rate", label: "Taux de RDV", current: rate, needed: neededRate, unrealistic: over(neededRate, LEVER_LIMITS.rate, "de taux de RDV") !== null, reason: over(neededRate, LEVER_LIMITS.rate, "de taux de RDV") },
    ];
}

/** One point per working day: cumulative actual up to today, the even pace, the projection from today. */
export function forecastSeries(input: {
    days: string[];
    todayKey: string;
    meetingsByDay: Record<string, number>;
    done: number;
    projected: number;
    target: number;
    monthFirst: string;
}): ForecastPoint[] {
    const { days } = input;
    const n = days.length;
    let todayIndex = -1;
    days.forEach((d, i) => {
        if (d <= input.todayKey) todayIndex = i;
    });
    const sorted = Object.entries(input.meetingsByDay).sort(([a], [b]) => a.localeCompare(b));
    return days.map((key, i) => {
        let actual: number | null = null;
        if (i < todayIndex) actual = sorted.filter(([k]) => k >= input.monthFirst && k <= key).reduce((s, [, v]) => s + v, 0);
        else if (i === todayIndex) actual = input.done;
        const span = n - 1 - todayIndex;
        const projection =
            todayIndex < 0 ? null : i < todayIndex ? null : span <= 0 ? input.projected : input.done + ((input.projected - input.done) * (i - todayIndex)) / span;
        return { key, actual, ideal: n ? (input.target * (i + 1)) / n : 0, projection };
    });
}

export function formatDays(value: number): string {
    return value >= 10 ? String(Math.round(value)) : value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

export const VERDICT_LABEL: Record<LandingVerdict, string> = {
    no_target: "Sans objectif chiffré",
    reached: "Objectif atteint",
    ahead: "En avance",
    on_track: "Dans le rythme",
    behind: "En retard",
};
