// Pure rules for the manager home — no DB, no clock, so they're unit-tested
// directly (npm run test:manager-home). Days are Europe/Paris days, like the rest
// of the SDR tooling (lib/sdr-pace, lib/sdr-daily-report).

import { DateTime } from "luxon";
import type { PeriodBucket } from "./types";

export const APP_TIMEZONE = "Europe/Paris";

/** Ranges longer than this are charted per week — 90 daily columns are unreadable. */
export const MAX_DAILY_BUCKETS = 62;
/** Hard cap on a requested range ("Tout" starts on 2020-01-01). */
const MAX_RANGE_DAYS = 366 * 8;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PeriodRange {
    start: string;
    end: string;
    days: number;
    prevStart: string;
    prevEnd: string;
    granularity: "day" | "week";
    /** [from, to) instants of the period, and of the equal-length period right before it. */
    from: Date;
    to: Date;
    prevFrom: Date;
    prevTo: Date;
}

/** Inclusive Paris days → instants + the comparison period. null when invalid. */
export function parsePeriodRange(start: string | null, end: string | null): PeriodRange | null {
    if (!start || !end || !DAY_RE.test(start) || !DAY_RE.test(end)) return null;
    const s = DateTime.fromISO(start, { zone: APP_TIMEZONE }).startOf("day");
    const e = DateTime.fromISO(end, { zone: APP_TIMEZONE }).startOf("day");
    if (!s.isValid || !e.isValid || e < s) return null;
    const days = Math.round(e.diff(s, "days").days) + 1;
    if (days > MAX_RANGE_DAYS) return null;
    const prevE = s.minus({ days: 1 });
    const prevS = prevE.minus({ days: days - 1 });
    return {
        start,
        end,
        days,
        prevStart: prevS.toFormat("yyyy-MM-dd"),
        prevEnd: prevE.toFormat("yyyy-MM-dd"),
        granularity: days > MAX_DAILY_BUCKETS ? "week" : "day",
        from: s.toJSDate(),
        to: e.plus({ days: 1 }).toJSDate(),
        prevFrom: prevS.toJSDate(),
        prevTo: s.toJSDate(),
    };
}

export interface CountRow {
    /** Start of a UTC hour (daily granularity) or of a UTC day (weekly). */
    at: Date;
    actions: number;
    meetings: number;
}

/**
 * Folds raw counts into gap-filled Paris-day (or Monday-week) buckets covering the
 * whole range, so an idle day shows as an empty column instead of disappearing.
 */
export function bucketSeries(rows: CountRow[], range: Pick<PeriodRange, "start" | "end" | "granularity">): PeriodBucket[] {
    const weekly = range.granularity === "week";
    const first = DateTime.fromISO(range.start, { zone: APP_TIMEZONE });
    const last = DateTime.fromISO(range.end, { zone: APP_TIMEZONE });
    const buckets = new Map<string, PeriodBucket>();
    let cursor = weekly ? first.startOf("week") : first.startOf("day");
    while (cursor <= last) {
        const key = cursor.toFormat("yyyy-MM-dd");
        const label = cursor.setLocale("fr").toFormat(weekly ? "d LLL" : "ccc d");
        buckets.set(key, { key, label, actions: 0, meetings: 0 });
        cursor = cursor.plus(weekly ? { weeks: 1 } : { days: 1 });
    }
    for (const r of rows) {
        const at = DateTime.fromJSDate(r.at, { zone: APP_TIMEZONE });
        const b = buckets.get((weekly ? at.startOf("week") : at.startOf("day")).toFormat("yyyy-MM-dd"));
        if (!b) continue;
        b.actions += r.actions;
        b.meetings += r.meetings;
    }
    return [...buckets.values()];
}

/** Relative change in %, one decimal; null when there is no base to compare with. */
export function relativeChange(current: number, previous: number): number | null {
    if (previous <= 0) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Team RDV goal for a period, from a weekly goal: prorated on calendar days. */
export function prorateWeeklyGoal(weeklyGoal: number, days: number): number {
    return Math.max(1, Math.round((weeklyGoal * days) / 7));
}
