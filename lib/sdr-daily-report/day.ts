import { DateTime } from "luxon";

/** Same calendar as the rest of the SDR tooling (see lib/sdr-today-missions.ts). */
const APP_TIMEZONE = "Europe/Paris";

/** The report's day, e.g. "2026-10-01". The server decides it — never the client. */
export function reportDayKey(now: Date = new Date()): string {
    return DateTime.fromJSDate(now).setZone(APP_TIMEZONE).toFormat("yyyy-MM-dd");
}

/**
 * Whether `now` (the browser's clock) has reached the "HH:mm" prompt time.
 * A malformed time falls back to the 15:45 default rather than never firing.
 */
export function isPastPromptTime(now: Date, promptTime: string): boolean {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(promptTime);
    const threshold = new Date(now);
    threshold.setHours(match ? Number(match[1]) : 15, match ? Number(match[2]) : 45, 0, 0);
    return now >= threshold;
}

/** [start, end) of that Paris calendar day, as instants — for filtering timestamps. */
export function reportDayBounds(now: Date = new Date()): { start: Date; end: Date } {
    const startOfDay = DateTime.fromJSDate(now).setZone(APP_TIMEZONE).startOf("day");
    return { start: startOfDay.toJSDate(), end: startOfDay.plus({ days: 1 }).toJSDate() };
}
