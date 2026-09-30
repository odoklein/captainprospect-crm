import { DateTime } from "luxon";

export const REPORT_ZONE = "Europe/Paris";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Report periods are whole Paris days: `dateFrom` 00:00 → `dateTo` 23:59:59.999,
 * whatever the server's own timezone. Returns null for malformed or inverted input.
 */
export function parisDayRange(dateFrom: string | null | undefined, dateTo: string | null | undefined) {
    if (!dateFrom || !dateTo || !DAY.test(dateFrom) || !DAY.test(dateTo)) return null;
    const from = DateTime.fromISO(dateFrom, { zone: REPORT_ZONE }).startOf("day");
    const to = DateTime.fromISO(dateTo, { zone: REPORT_ZONE }).endOf("day");
    if (!from.isValid || !to.isValid || from > to) return null;
    return { from: from.toJSDate(), to: to.toJSDate() };
}

/** "2026-09" for the Paris month of a timestamp. */
export function parisMonthKey(date: Date): string {
    return DateTime.fromJSDate(date).setZone(REPORT_ZONE).toFormat("yyyy-MM");
}
