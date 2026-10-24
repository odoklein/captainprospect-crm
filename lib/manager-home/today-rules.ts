/**
 * « Tâches du jour » — pure rules (npm run test:manager-home).
 * Days are Europe/Paris calendar days ("YYYY-MM-DD").
 */

export const TODAY_TASK_CAP = 8;

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function parisDay(date: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

function parisOffsetMinutes(instant: number): number {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Paris",
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    return Math.round((asUtc - instant) / 60_000);
}

/** The UTC instant of 00:00 in Paris on that day (handles summer/winter time). */
export function parisMidnight(day: string): Date {
    const [y, m, d] = day.split("-").map(Number);
    const guess = Date.UTC(y, m - 1, d);
    const first = guess - parisOffsetMinutes(guess) * 60_000;
    // Re-check once around a DST switch.
    return new Date(guess - parisOffsetMinutes(first) * 60_000);
}

export function addDay(day: string, n: number): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

export function overdueDays(dueDay: string, today: string): number {
    return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDay}T00:00:00Z`)) / 86_400_000));
}

export interface SortableTask {
    dueDay: string;
    priority: string;
}

/** Overdue first (oldest first), then today's tasks by priority. */
export function sortTodayTasks<T extends SortableTask>(tasks: T[], today: string): T[] {
    return [...tasks].sort((a, b) => {
        const aLate = a.dueDay < today;
        const bLate = b.dueDay < today;
        if (aLate !== bLate) return aLate ? -1 : 1;
        if (aLate && a.dueDay !== b.dueDay) return a.dueDay < b.dueDay ? -1 : 1;
        return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    });
}

export function capTasks<T>(tasks: T[], cap: number = TODAY_TASK_CAP): { shown: T[]; more: number } {
    return { shown: tasks.slice(0, cap), more: Math.max(0, tasks.length - cap) };
}
