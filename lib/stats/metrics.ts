// Pure rules of the Statistiques page — no DB, no clock, no React — so they are
// unit-tested directly (npm run test:stats).
//
// Vocabulary (one definition, used by every card, table and insight):
//   appel      a call action logged by an SDR (Action.channel = CALL)
//   joint      an appel where someone was reached: every result except
//              "no answer / switchboard" and "wrong number / contact"
//   lead chaud interested + callback families (prospect still to work)
//   RDV        MEETING_BOOKED
// Rates are always RDV / joints (skill of the SDR) and joints / appels (quality
// of the list and of the calling hours): never a single "conversion" that mixes
// the two.

import { DateTime } from "luxon";
import { outcomeOf } from "../manager-home/outcomes";
import type {
    HeatCell, Insight, SdrRow, SeriesPoint, StatsOverview, Tally,
} from "./types";

export const APP_TIMEZONE = "Europe/Paris";

/** Below this many calls a rate says nothing: the UI greys it and rankings skip it. */
export const MIN_CALLS_FOR_RATE = 30;
/** Hour-of-day cells need this many calls before they can be called a "best slot". */
const MIN_SLOT_CALLS = 40;

export function emptyTally(): Tally {
    return { calls: 0, joined: 0, hot: 0, meetings: 0, seconds: 0 };
}

/** Whether a raw result means a person was reached. */
export function isJoinedResult(result: string): boolean {
    const family = outcomeOf(result);
    return family !== "noReach" && family !== "dataIssue";
}

/** Adds `n` calls of one result (and their talk seconds) into a tally. */
export function addResult(t: Tally, result: string, n: number, seconds = 0): void {
    t.calls += n;
    t.seconds += seconds;
    if (isJoinedResult(result)) t.joined += n;
    const family = outcomeOf(result);
    if (family === "meeting") t.meetings += n;
    if (family === "interested" || family === "callback") t.hot += n;
}

/** a / b as a percentage with one decimal; null when there is nothing to divide by. */
export function pct(a: number, b: number): number | null {
    if (b <= 0) return null;
    return Math.round((a / b) * 1000) / 10;
}

/** Joints per call, %. */
export const reachRate = (t: Tally): number | null => pct(t.joined, t.calls);
/** RDV per joint, %. */
export const conversionRate = (t: Tally): number | null => pct(t.meetings, t.joined);
/** RDV per 100 calls. */
export const yieldPer100 = (t: Tally): number | null => (t.calls > 0 ? Math.round((t.meetings / t.calls) * 1000) / 10 : null);
/** "1 RDV every N calls"; null when no RDV. */
export const callsPerMeeting = (t: Tally): number | null => (t.meetings > 0 ? Math.round(t.calls / t.meetings) : null);

/** Relative change in %, one decimal; null when there is no base to compare with. */
export function relativeChange(current: number, previous: number): number | null {
    if (previous <= 0) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Change of a rate in percentage points; null when either side is unknown. */
export function pointChange(current: number | null, previous: number | null): number | null {
    if (current === null || previous === null) return null;
    return Math.round((current - previous) * 10) / 10;
}

/** A rate is only trustworthy past a minimum volume. */
export const hasVolume = (t: Tally, min = MIN_CALLS_FOR_RATE): boolean => t.calls >= min;

// ── Series ──────────────────────────────────────────────────────────

export interface SeriesRow {
    /** "yyyy-MM-dd" Paris day (daily) or Monday of the week (weekly). */
    key: string;
    result: string;
    n: number;
}

/**
 * Gap-filled buckets covering the whole range, so an idle day shows as an empty
 * column instead of disappearing from the chart.
 */
export function buildSeries(
    rows: SeriesRow[],
    range: { start: string; end: string; granularity: "day" | "week" },
): SeriesPoint[] {
    const weekly = range.granularity === "week";
    const first = DateTime.fromISO(range.start, { zone: APP_TIMEZONE });
    const last = DateTime.fromISO(range.end, { zone: APP_TIMEZONE });
    const buckets = new Map<string, SeriesPoint>();
    let cursor = weekly ? first.startOf("week") : first.startOf("day");
    while (cursor <= last) {
        const key = cursor.toFormat("yyyy-MM-dd");
        const label = cursor.setLocale("fr").toFormat(weekly ? "d LLL" : "ccc d");
        buckets.set(key, { key, label, calls: 0, joined: 0, meetings: 0 });
        cursor = cursor.plus(weekly ? { weeks: 1 } : { days: 1 });
    }
    for (const r of rows) {
        const b = buckets.get(r.key);
        if (!b) continue;
        b.calls += r.n;
        if (isJoinedResult(r.result)) b.joined += r.n;
        if (outcomeOf(r.result) === "meeting") b.meetings += r.n;
    }
    return [...buckets.values()];
}

// ── Heatmap ─────────────────────────────────────────────────────────

export type HeatMetric = "calls" | "reach" | "meetings";

/** Value of one cell for the chosen metric; null when a rate has too few calls. */
export function heatValue(cell: HeatCell | undefined, metric: HeatMetric, minCalls = 10): number | null {
    if (!cell || cell.calls === 0) return null;
    if (metric === "calls") return cell.calls;
    if (metric === "meetings") return cell.meetings;
    return cell.calls >= minCalls ? Math.round((cell.joined / cell.calls) * 1000) / 10 : null;
}

/** Calls/joints folded per hour of the day, across every weekday. */
export function hourTotals(cells: HeatCell[]): { hour: number; calls: number; joined: number; meetings: number }[] {
    const byHour = new Map<number, { hour: number; calls: number; joined: number; meetings: number }>();
    for (const c of cells) {
        const h = byHour.get(c.hour) ?? { hour: c.hour, calls: 0, joined: 0, meetings: 0 };
        h.calls += c.calls;
        h.joined += c.joined;
        h.meetings += c.meetings;
        byHour.set(c.hour, h);
    }
    return [...byHour.values()].sort((a, b) => a.hour - b.hour);
}

// ── Insights ────────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;
const fmtPct = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const TONE_RANK: Record<Insight["tone"], number> = { danger: 0, warning: 1, success: 2, info: 3 };

function bestByYield(sdrs: SdrRow[]): SdrRow | null {
    const eligible = sdrs.filter((s) => s.current.calls >= MIN_CALLS_FOR_RATE && s.current.meetings > 0);
    if (eligible.length < 2) return null;
    return [...eligible].sort((a, b) => (yieldPer100(b.current) ?? 0) - (yieldPer100(a.current) ?? 0))[0];
}

/**
 * Short, factual statements read off the numbers — each one backed by a figure
 * the page shows elsewhere. Nothing is inferred: if the volume is too low to say
 * something, the insight is simply not produced.
 */
export function buildInsights(o: StatsOverview): Insight[] {
    const out: Insight[] = [];
    const { current: cur, previous: prev } = o;
    if (cur.calls === 0) return out;

    // 1. RDV momentum against the previous period.
    const rdvChange = relativeChange(cur.meetings, prev.meetings);
    if (rdvChange !== null && prev.meetings >= 3 && Math.abs(rdvChange) >= 15) {
        const up = rdvChange > 0;
        // Past +200 % a percentage stops being readable: say "×N" instead.
        const size = up && rdvChange >= 200 ? `×${(cur.meetings / prev.meetings).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}` : fmtPct(Math.abs(rdvChange));
        out.push({
            id: "rdv-momentum",
            tone: up ? "success" : "warning",
            title: up && rdvChange >= 200 ? `RDV multipliés (${size})` : `RDV ${up ? "en hausse" : "en baisse"} de ${size}`,
            detail: `${plural(cur.meetings, "RDV")} sur la période, contre ${prev.meetings.toLocaleString("fr-FR")} sur la précédente.`,
        });
    }

    // 2. Best converter (needs two comparable SDRs, else a "best" is meaningless).
    const best = bestByYield(o.sdrs);
    if (best) {
        const every = callsPerMeeting(best.current);
        const team = callsPerMeeting(cur);
        out.push({
            id: "best-sdr",
            tone: "success",
            title: `${firstName(best.name)} signe le meilleur rendement`,
            detail: `${plural(best.current.meetings, "RDV")} en ${plural(best.current.calls, "appel")}${every ? `, soit 1 RDV tous les ${every} appels` : ""}${team ? ` (équipe : 1 tous les ${team})` : ""}.`,
            tab: "equipe",
        });
    }

    // 3. Volume without result — somebody to coach.
    const dry = o.sdrs.filter((s) => s.current.calls >= 80 && s.current.meetings === 0);
    if (dry.length > 0) {
        out.push({
            id: "dry-sdr",
            tone: "warning",
            title: dry.length === 1 ? `${firstName(dry[0].name)} n'a aucun RDV malgré le volume` : `${dry.length} SDR sans RDV malgré le volume`,
            detail: dry.map((s) => `${firstName(s.name)} : ${plural(s.current.calls, "appel")}, ${reachRate(s.current) ?? 0} % de joints`).join(" · "),
            tab: "equipe",
        });
    }

    // 4. Best hour to reach people.
    const hours = hourTotals(o.heatmap).filter((h) => h.calls >= MIN_SLOT_CALLS);
    if (hours.length >= 3) {
        const bestHour = [...hours].sort((a, b) => b.joined / b.calls - a.joined / a.calls)[0];
        const rate = pct(bestHour.joined, bestHour.calls);
        const overall = reachRate(cur);
        if (rate !== null && overall !== null && rate - overall >= 4) {
            out.push({
                id: "best-hour",
                tone: "info",
                title: `On joint le plus entre ${bestHour.hour} h et ${bestHour.hour + 1} h`,
                detail: `${fmtPct(rate)} de joints sur ce créneau (${plural(bestHour.calls, "appel")}), contre ${fmtPct(overall)} en moyenne.`,
                tab: "equipe",
            });
        }
    }

    // 5. Bad numbers / contacts eat the calls.
    const dataIssue = Object.entries(cur.byResult).reduce((acc, [code, n]) => acc + (outcomeOf(code) === "dataIssue" ? n : 0), 0);
    const dataShare = pct(dataIssue, cur.calls);
    if (dataShare !== null && cur.calls >= MIN_CALLS_FOR_RATE && dataShare >= 12) {
        out.push({
            id: "data-quality",
            tone: dataShare >= 20 ? "danger" : "warning",
            title: `${fmtPct(dataShare)} des appels tombent sur un mauvais numéro`,
            detail: `${plural(dataIssue, "appel")} perdus (faux numéro, doublon, mauvais interlocuteur) : vérifier la qualité des listes.`,
            tab: "journal",
        });
    }

    // 6. RDV rejected at the SAS.
    const rejectedShare = pct(o.rdv.rejected, o.rdv.total);
    if (rejectedShare !== null && o.rdv.total >= 5 && rejectedShare >= 15) {
        out.push({
            id: "sas-rejected",
            tone: "warning",
            title: `${plural(o.rdv.rejected, "RDV rejeté", "RDV rejetés")} au SAS`,
            detail: `${fmtPct(rejectedShare)} des RDV pris ne passent pas la confirmation : ils sont comptés dans le total mais n'iront pas chez le client.`,
        });
    }

    // 7. A mission that burns calls without a single RDV.
    const stuck = o.missions.filter((m) => m.current.calls >= 100 && m.current.meetings === 0);
    if (stuck.length > 0) {
        out.push({
            id: "stuck-mission",
            tone: "warning",
            title: stuck.length === 1 ? `Aucun RDV sur « ${stuck[0].name} »` : `${stuck.length} missions sans RDV`,
            detail: stuck.slice(0, 3).map((m) => `${m.name} : ${plural(m.current.calls, "appel")}`).join(" · "),
            tab: "cibles",
        });
    }

    return out.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]).slice(0, 5);
}
