// ============================================
// SALLE DE PILOTAGE — the patterns of the last 20 working days.
//
// Heatmap « où le pitch passe, où il casse »: rows (SDR or mission) × Paris
// hour slots. A cell is the share of positive outcomes (RDV, intéressé,
// projet à suivre) among joints, minus the team's share. Diverging scale:
// blue above average, orange where refusals dominate, grey near average.
// Never red: red is for alarms, a refusal is a normal outcome
// (lib/workspace/status-family). Under MIN_SAMPLE joints: hatched, no verdict.
//
// Closers « qui mérite plus d'heures »: calls per day against Taux de RDV
// (RDV ÷ joints); the strong closers who dial little are flagged.
// ============================================

import { MIN_SAMPLE } from "@/lib/missions/pulse";
import { emptyTally, ratio, sumTallies, type Tally } from "./dictionary";

export const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17] as const;

// ── Heatmap ───────────────────────────────────────────────────────────────

export type HeatTone = "low" | "neutral" | "pos1" | "pos2" | "pos3" | "neg1" | "neg2" | "neg3";

/** Steps of the diverging scale, in points of positive share against the team. */
export const HEAT_STEPS = [0.015, 0.04, 0.07] as const;
/** A cell number is shown from this many meetings. */
export const CELL_MEETINGS_MIN = 3;

export interface HeatInputCell {
    row: string;
    hour: number;
    tally: Tally;
}

export interface HeatCell {
    hour: number;
    reached: number;
    meetings: number;
    /** Positive outcomes that are not a meeting: intéressé, projet à suivre. */
    interested: number;
    refusals: number;
    /** Positive share among joints; null without joints. */
    share: number | null;
    /** share − team share; null under MIN_SAMPLE. */
    delta: number | null;
    tone: HeatTone;
    /** The meetings, when at least CELL_MEETINGS_MIN. */
    label: string | null;
}

export interface HeatRow {
    id: string;
    label: string;
    reached: number;
    cells: HeatCell[];
}

export interface HourVerdict {
    hour: number;
    delta: number;
    reached: number;
}

export interface Heatmap {
    hours: number[];
    /** Team positive share among joints over the window. */
    average: number | null;
    /** Team refusal share among joints. */
    refusalAverage: number | null;
    rows: HeatRow[];
    best: HourVerdict | null;
    worst: HourVerdict | null;
}

/**
 * Tone of a cell. Above the team: blue, by how much. Below it: orange only
 * when refusals are what pushes it down (refusal share above the team's);
 * below for another reason (callbacks, emails to send) stays grey.
 */
export function heatTone(input: { reached: number; delta: number | null; refusalShare: number | null; refusalAverage: number | null }): HeatTone {
    if (input.reached < MIN_SAMPLE || input.delta === null) return "low";
    const d = input.delta;
    const step = Math.abs(d) < HEAT_STEPS[0] ? 0 : Math.abs(d) < HEAT_STEPS[1] ? 1 : Math.abs(d) < HEAT_STEPS[2] ? 2 : 3;
    if (step === 0) return "neutral";
    if (d > 0) return `pos${step}` as HeatTone;
    const refusalsDominate = input.refusalShare !== null && input.refusalAverage !== null && input.refusalShare > input.refusalAverage;
    return refusalsDominate ? (`neg${step}` as HeatTone) : "neutral";
}

export function buildHeatmap(rows: { id: string; label: string }[], cells: HeatInputCell[], hours: readonly number[] = HOURS): Heatmap {
    const byKey = new Map<string, Tally>();
    for (const c of cells) {
        if (!hours.includes(c.hour)) continue;
        const key = `${c.row}|${c.hour}`;
        byKey.set(key, sumTallies([byKey.get(key) ?? emptyTally(), c.tally]));
    }
    const team = sumTallies(byKey.values());
    const average = ratio(team.positive, team.reached);
    const refusalAverage = ratio(team.refusals, team.reached);

    const outRows: HeatRow[] = rows.map((row) => {
        let reached = 0;
        const rowCells = hours.map((hour) => {
            const t = byKey.get(`${row.id}|${hour}`) ?? emptyTally();
            reached += t.reached;
            const share = ratio(t.positive, t.reached);
            const delta = share !== null && average !== null && t.reached >= MIN_SAMPLE ? share - average : null;
            return {
                hour,
                reached: t.reached,
                meetings: t.meetings,
                interested: Math.max(0, t.positive - t.meetings),
                refusals: t.refusals,
                share,
                delta,
                tone: heatTone({ reached: t.reached, delta, refusalShare: ratio(t.refusals, t.reached), refusalAverage }),
                label: t.meetings >= CELL_MEETINGS_MIN ? String(t.meetings) : null,
            };
        });
        return { id: row.id, label: row.label, reached, cells: rowCells };
    });
    outRows.sort((a, b) => b.reached - a.reached || a.label.localeCompare(b.label, "fr"));

    // Best and worst slot across the rows, on slots with a verdict.
    const perHour: HourVerdict[] = [];
    for (const hour of hours) {
        const t = sumTallies(rows.map((r) => byKey.get(`${r.id}|${hour}`) ?? emptyTally()));
        const share = ratio(t.positive, t.reached);
        if (share !== null && average !== null && t.reached >= MIN_SAMPLE) perHour.push({ hour, delta: share - average, reached: t.reached });
    }
    const sorted = [...perHour].sort((a, b) => b.delta - a.delta);
    const best = sorted.length >= 2 ? sorted[0] : null;
    const worst = sorted.length >= 2 ? sorted[sorted.length - 1] : null;

    return { hours: [...hours], average, refusalAverage, rows: outRows.filter((r) => r.reached > 0), best, worst };
}

// ── Closers ───────────────────────────────────────────────────────────────

/** Volume under this share of the quota is « dials little ». */
export const VOLUME_SHARE = 0.85;
/** Rate at least this many times the team median is « closes well ». */
export const RATE_MULTIPLE = 1.5;
/** Joints needed before a rate earns a flag. */
export const CLOSER_MIN_REACHED = 40;
const WORKING_DAYS_PER_WEEK = 5;

export interface CloserInput {
    id: string;
    name: string;
    calls: number;
    /** Days with at least one call in the window. */
    activeDays: number;
    reached: number;
    meetings: number;
}

export interface CloserPoint {
    id: string;
    name: string;
    /** Calls per day worked. */
    perDay: number;
    reach: number | null;
    /** Taux de RDV: meetings ÷ joints. */
    rate: number | null;
    calls: number;
    reached: number;
    meetings: number;
    underUsed: boolean;
    /** RDV per week left on the table: max(0, quota − volume) × reach × rate × 5. */
    onTable: number;
}

export interface Closers {
    quota: number;
    /** 85 % of the quota, the vertical reference line. */
    volumeLine: number;
    /** Median Taux de RDV of the SDRs with enough joints. */
    median: number | null;
    points: CloserPoint[];
}

export function median(values: number[]): number | null {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function buildClosers(rows: CloserInput[], quota: number): Closers {
    const base = rows
        .filter((r) => r.calls > 0 && r.activeDays > 0)
        .map((r) => ({ ...r, perDay: r.calls / r.activeDays, reach: ratio(r.reached, r.calls), rate: ratio(r.meetings, r.reached) }));
    const med = median(base.filter((r) => r.reached >= MIN_SAMPLE && r.rate !== null).map((r) => r.rate as number));
    const volumeLine = VOLUME_SHARE * quota;
    const points: CloserPoint[] = base.map((r) => {
        const underUsed = med !== null && med > 0 && r.rate !== null && r.rate >= RATE_MULTIPLE * med && r.perDay < volumeLine && r.reached >= CLOSER_MIN_REACHED;
        const onTable = Math.max(0, quota - r.perDay) * (r.reach ?? 0) * (r.rate ?? 0) * WORKING_DAYS_PER_WEEK;
        return {
            id: r.id,
            name: r.name,
            perDay: r.perDay,
            reach: r.reach,
            rate: r.rate,
            calls: r.calls,
            reached: r.reached,
            meetings: r.meetings,
            underUsed,
            onTable,
        };
    });
    points.sort((a, b) => b.onTable - a.onTable || a.name.localeCompare(b.name, "fr"));
    return { quota, volumeLine, median: med, points };
}
