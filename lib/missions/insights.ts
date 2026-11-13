// Mission insights: the pure half (period parsing, UTC windows, day series,
// per-list count folding). The SQL lives in insights.server.ts; the routes
// GET /api/missions/[id] and GET /api/missions/[id]/insights compose both.

import { RESULT_META, REACHED_CATEGORIES } from "../api-v1/glossary";

export const DAY_MS = 86_400_000;

// Result groups from the shared glossary.
/** « Joints »: spoken to — refusal, follow-up or meeting. */
export const REACHED_RESULTS: string[] = Object.entries(RESULT_META)
    .filter(([, meta]) => REACHED_CATEGORIES.includes(meta.category))
    .map(([code]) => code);
/** « Intéressés »: left a door open — follow-up or meeting. */
export const INTERESTED_RESULTS: string[] = Object.entries(RESULT_META)
    .filter(([, meta]) => meta.category === "rdv" || meta.category === "follow_up")
    .map(([code]) => code);

export type InsightsPeriod = "7" | "30" | "90" | "all";
export const INSIGHTS_PERIODS: readonly InsightsPeriod[] = ["7", "30", "90", "all"];
export const DEFAULT_PERIOD: InsightsPeriod = "30";
/** The « all » series is capped so a years-old mission stays a bounded payload. */
export const MAX_SERIES_DAYS = 365;

/** `?period=` → a known period; anything else falls back to 30 days. */
export function parsePeriod(raw: string | null | undefined): InsightsPeriod {
    return (INSIGHTS_PERIODS as readonly string[]).includes(raw ?? "") ? (raw as InsightsPeriod) : DEFAULT_PERIOD;
}

/** Midnight UTC of the given instant. date_trunc runs in the DB session timezone (UTC), so buckets are UTC days. */
export function startOfUtcDay(at: Date | number | string): Date {
    const d = new Date(at);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

export interface InsightsWindow {
    period: InsightsPeriod;
    /** Days in the series (today included). */
    windowDays: number;
    /** First day of the series, midnight UTC. */
    windowStart: Date;
    /** Exclusive end: tomorrow, midnight UTC. */
    windowEnd: Date;
    /** Start of the equally long window before; null for « all ». */
    previousStart: Date | null;
    /**
     * Lower bound for window-scoped counts (period funnel, team, current
     * totals). Null for « all »: those counts then cover the whole mission,
     * while the series alone is capped to MAX_SERIES_DAYS.
     */
    countsFrom: Date | null;
}

/**
 * The UTC window for a period. For « all », the series starts at the earlier of
 * the mission start date and its first action, never more than MAX_SERIES_DAYS
 * back and never after today.
 */
export function resolveWindow(
    period: InsightsPeriod,
    opts: { now?: Date | number; missionStart?: Date | string | null; firstActionAt?: Date | string | null } = {},
): InsightsWindow {
    const today = startOfUtcDay(opts.now ?? Date.now());
    const windowEnd = new Date(today.getTime() + DAY_MS);
    if (period !== "all") {
        const days = Number(period);
        const windowStart = new Date(today.getTime() - (days - 1) * DAY_MS);
        return {
            period,
            windowDays: days,
            windowStart,
            windowEnd,
            previousStart: new Date(windowStart.getTime() - days * DAY_MS),
            countsFrom: windowStart,
        };
    }
    const floor = today.getTime() - (MAX_SERIES_DAYS - 1) * DAY_MS;
    const candidates = [opts.missionStart, opts.firstActionAt]
        .filter((v): v is Date | string => v != null)
        .map((v) => startOfUtcDay(v).getTime())
        .filter((t) => Number.isFinite(t));
    const earliest = candidates.length > 0 ? Math.min(...candidates) : today.getTime();
    const start = Math.min(today.getTime(), Math.max(floor, earliest));
    return {
        period,
        windowDays: Math.round((today.getTime() - start) / DAY_MS) + 1,
        windowStart: new Date(start),
        windowEnd,
        previousStart: null,
        countsFrom: null,
    };
}

export interface DayCounts {
    actions: number;
    meetings: number;
    reached: number;
}
export type DayBuckets = Map<string, DayCounts>;
export interface SeriesPoint extends DayCounts {
    date: string;
}

const dayKey = (d: Date | number) => new Date(d).toISOString().slice(0, 10);

/** SQL rows `{ day, actions, meetings, reached }` → "YYYY-MM-DD" → counts. */
export function bucketRows(rows: Array<{ day: Date | string; actions: unknown; meetings: unknown; reached: unknown }>): DayBuckets {
    const out: DayBuckets = new Map();
    for (const row of rows) {
        out.set(dayKey(new Date(row.day)),{ actions: Number(row.actions), meetings: Number(row.meetings), reached: Number(row.reached) });
    }
    return out;
}

/** One point per day from `start`, zero-filled. */
export function buildSeries(buckets: DayBuckets, start: Date, days: number): SeriesPoint[] {
    const series: SeriesPoint[] = [];
    for (let i = 0; i < days; i++) {
        const date = dayKey(start.getTime() + i * DAY_MS);
        const hit = buckets.get(date);
        series.push({ date, actions: hit?.actions ?? 0, meetings: hit?.meetings ?? 0, reached: hit?.reached ?? 0 });
    }
    return series;
}

/** Actions and meetings of the buckets in [from, to). */
export function sumBuckets(buckets: DayBuckets, from: Date, to: Date): { actions: number; meetings: number } {
    let actions = 0;
    let meetings = 0;
    for (const [date, value] of buckets) {
        const t = Date.parse(`${date}T00:00:00.000Z`);
        if (t >= from.getTime() && t < to.getTime()) {
            actions += value.actions;
            meetings += value.meetings;
        }
    }
    return { actions, meetings };
}

// ── Per-list counts (D1) ──────────────────────────────────────────────────

export interface ListCountRow {
    listId: string;
    /** Company.status (CompletenessStatus); null for a list without companies (LEFT JOIN). */
    status: string | null;
    companies: unknown;
    contacts: unknown;
}

export interface ListCounts {
    companies: number;
    contacts: number;
    /** Companies per Company.status. */
    companyStatusCounts: Record<string, number>;
}

/** Fold the grouped (list, status) rows into one entry per list. */
export function foldListCounts(rows: ListCountRow[]): Map<string, ListCounts> {
    const out = new Map<string, ListCounts>();
    for (const row of rows) {
        const entry = out.get(row.listId) ?? { companies: 0, contacts: 0, companyStatusCounts: {} };
        const companies = Number(row.companies) || 0;
        entry.companies += companies;
        entry.contacts += Number(row.contacts) || 0;
        if (row.status != null && companies > 0) {
            entry.companyStatusCounts[row.status] = (entry.companyStatusCounts[row.status] ?? 0) + companies;
        }
        out.set(row.listId, entry);
    }
    return out;
}

export const EMPTY_LIST_COUNTS: ListCounts = Object.freeze({ companies: 0, contacts: 0, companyStatusCounts: {} }) as ListCounts;
