/**
 * Which week a Friday bilan covers, and when it is owed (pure).
 * Days are Europe/Paris calendar days ("YYYY-MM-DD").
 */

import { addDay, parisDay } from "@/lib/manager-home/today-rules";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function weekdayOf(day: string): number {
    return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
}

function label(start: string, end: string): string {
    const [ys, ms, ds] = start.split("-").map(Number);
    const [ye, me, de] = end.split("-").map(Number);
    if (ms === me && ys === ye) return `Semaine du ${ds} au ${de} ${MONTHS[me - 1]} ${ye}`;
    return `Semaine du ${ds} ${MONTHS[ms - 1]} au ${de} ${MONTHS[me - 1]} ${ye}`;
}

/** Monday → Friday of the bilan week. On Monday it is still last week's bilan. */
export function bilanWeek(now: Date = new Date(), offset = 0): { start: string; end: string; label: string } {
    const today = parisDay(now);
    const wd = weekdayOf(today);
    const monday = addDay(today, (wd === 0 ? -7 : -wd) + offset * 7);
    const friday = addDay(monday, 4);
    return { start: monday, end: friday, label: label(monday, friday) };
}

/**
 * When the « Bilans de la semaine » to-do shows: Friday to Sunday for the
 * current week, Monday for the week just ended (then flagged overdue).
 */
export function bilanTodoWindow(now: Date = new Date()): { week: { start: string; end: string; label: string }; overdue: boolean } | null {
    const wd = weekdayOf(parisDay(now));
    if (wd >= 4) return { week: bilanWeek(now), overdue: false };
    if (wd === 0) return { week: bilanWeek(now), overdue: true };
    return null;
}

/** The session date for a published bilan: the Friday of its week, noon in Paris. */
export function bilanSessionDate(week: { end: string }): Date {
    return new Date(`${week.end}T10:00:00.000Z`);
}
