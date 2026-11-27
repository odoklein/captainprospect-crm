// ============================================
// SALLE DE PILOTAGE — the calendar every number on the page counts in.
// Days are Paris days ("YYYY-MM-DD" keys), working days are Monday–Friday
// minus the agency's PlanningHoliday rows. Pure: the server passes the
// holidays in, the tests pass plain sets.
// ============================================

import { addDaysToKey, isWeekendKey, keyToUtcDate } from "@/lib/planning/board-shared";

export const PARIS = "Europe/Paris";

/** Window of the patterns (heatmap, closers, reach and rate of the forecast). */
export const WINDOW_WORKING_DAYS = 20;
/** Window of the refusal spike. */
export const SPIKE_WORKING_DAYS = 2;
/** Office hours the SAS clock runs on (« 4 heures ouvrées »). */
export const OFFICE_HOURS = { start: 9 * 60, end: 18 * 60 } as const;

const keyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: PARIS, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

/** The Paris day of an instant. */
export function parisKey(date: Date): string {
    return keyFormat.format(date);
}

/** Minutes since Paris midnight (fractional: seconds included). */
export function parisMinute(date: Date): number {
    const [h, m, s] = timeFormat.format(date).split(":").map(Number);
    return h * 60 + m + s / 60;
}

/** Paris hour 0–23 of an instant. */
export function parisHour(date: Date): number {
    return Math.floor(parisMinute(date) / 60);
}

/** The UTC instant of Paris midnight on a day (DST-safe: probes the offset at that day). */
export function parisMidnight(key: string): Date {
    const utc = keyToUtcDate(key).getTime();
    // Paris is UTC+1 or UTC+2: midnight Paris is 22:00 or 23:00 UTC the day before.
    for (const offsetH of [1, 2]) {
        const candidate = new Date(utc - offsetH * 3_600_000);
        if (parisKey(candidate) === key && parisMinute(candidate) === 0) return candidate;
    }
    return new Date(utc - 3_600_000);
}

export function isWorkingDay(key: string, holidays: ReadonlySet<string>): boolean {
    return !isWeekendKey(key) && !holidays.has(key);
}

/** Working days from → to, inclusive. */
export function workingDaysBetween(fromKey: string, toKey: string, holidays: ReadonlySet<string>): string[] {
    const out: string[] = [];
    for (let k = fromKey; k <= toKey; k = addDaysToKey(k, 1)) if (isWorkingDay(k, holidays)) out.push(k);
    return out;
}

/** The last `count` working days up to and including `todayKey` (today counts when it is one). Oldest first. */
export function lastWorkingDays(todayKey: string, count: number, holidays: ReadonlySet<string>): string[] {
    const out: string[] = [];
    // Bounded: a calendar made only of holidays must not loop forever.
    for (let k = todayKey, steps = 0; out.length < count && steps < 400; k = addDaysToKey(k, -1), steps++) {
        if (isWorkingDay(k, holidays)) out.push(k);
    }
    return out.reverse();
}

export function monthBounds(todayKey: string): { month: string; first: string; last: string } {
    const month = todayKey.slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { month, first: `${month}-01`, last };
}

/**
 * Office minutes (OFFICE_HOURS on working days) between two instants. The SAS
 * clock: a meeting booked Friday 17:30 is 1 h old on Monday 9:30, not 64 h.
 */
export function officeMinutesBetween(from: Date, to: Date, holidays: ReadonlySet<string>): number {
    if (to <= from) return 0;
    const fromKey = parisKey(from);
    const toKey = parisKey(to);
    let total = 0;
    for (let k = fromKey; k <= toKey; k = addDaysToKey(k, 1)) {
        if (!isWorkingDay(k, holidays)) continue;
        const start = Math.max(OFFICE_HOURS.start, k === fromKey ? parisMinute(from) : 0);
        const end = Math.min(OFFICE_HOURS.end, k === toKey ? parisMinute(to) : 24 * 60);
        total += Math.max(0, end - start);
    }
    return total;
}

/** "09:30" → 570; null when malformed. */
export function hhmmToMinute(hhmm: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Calendar days two periods share (inclusive day keys). */
export function overlapDays(aFrom: string, aTo: string, bFrom: string, bTo: string): number {
    const from = aFrom > bFrom ? aFrom : bFrom;
    const to = aTo < bTo ? aTo : bTo;
    if (from > to) return 0;
    return Math.round((keyToUtcDate(to).getTime() - keyToUtcDate(from).getTime()) / 86_400_000) + 1;
}
