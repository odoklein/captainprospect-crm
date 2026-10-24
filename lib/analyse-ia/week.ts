/**
 * Week windows for Analyse IA, in Paris time (pure, npm run test:analyse-ia).
 * A week runs Monday → Sunday. Days are "YYYY-MM-DD".
 */

import { addDay, parisDay } from "@/lib/manager-home/today-rules";

/** Monday of the Paris week `offset` weeks from the week containing `now` (0 = this week). */
export function parisWeekBounds(offset: number, now: Date = new Date()): { start: string; end: string } {
    const today = parisDay(now);
    const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    const start = addDay(today, -weekday + offset * 7);
    return { start, end: addDay(start, 6) };
}

/**
 * On Monday and Tuesday the current week holds almost nothing to analyse:
 * default to the last full week. From Wednesday, the current week.
 */
export function defaultWeekOffset(now: Date = new Date()): number {
    const weekday = (new Date(`${parisDay(now)}T12:00:00Z`).getUTCDay() + 6) % 7;
    return weekday <= 1 ? -1 : 0;
}
