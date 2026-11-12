/**
 * Unified task list — grouping and ordering, pure (npm run test:tasks).
 * Days are Europe/Paris calendar days ("YYYY-MM-DD").
 */

import type { WorkItem } from "./feed-types";

export type DueBucket = "late" | "today" | "week" | "later" | "none";

export const BUCKET_LABELS: Record<DueBucket, string> = {
    late: "En retard",
    today: "Aujourd'hui",
    week: "Cette semaine",
    later: "Plus tard",
    none: "Sans échéance",
};

export const BUCKET_ORDER: DueBucket[] = ["late", "today", "week", "later", "none"];

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** The Sunday closing the (Monday-first) week that contains `day`. */
export function endOfWeek(day: string): string {
    const d = new Date(`${day}T00:00:00Z`);
    const daysToSunday = (7 - d.getUTCDay()) % 7;
    d.setUTCDate(d.getUTCDate() + daysToSunday);
    return d.toISOString().slice(0, 10);
}

export function bucketOf(dueDay: string | null, today: string): DueBucket {
    if (!dueDay) return "none";
    if (dueDay < today) return "late";
    if (dueDay === today) return "today";
    if (dueDay <= endOfWeek(today)) return "week";
    return "later";
}

/** Oldest due day first, then priority, then title — stable across reloads. */
export function compareItems(a: WorkItem, b: WorkItem): number {
    if (a.dueDay !== b.dueDay) {
        if (!a.dueDay) return 1;
        if (!b.dueDay) return -1;
        return a.dueDay < b.dueDay ? -1 : 1;
    }
    const byPriority = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (byPriority !== 0) return byPriority;
    return a.title.localeCompare(b.title, "fr");
}

export interface DueGroup {
    bucket: DueBucket;
    label: string;
    items: WorkItem[];
}

/** Non-empty due-date groups, in reading order. */
export function groupByDue(items: WorkItem[], today: string): DueGroup[] {
    const map = new Map<DueBucket, WorkItem[]>();
    for (const item of items) {
        const bucket = bucketOf(item.dueDay, today);
        const list = map.get(bucket) ?? [];
        list.push(item);
        map.set(bucket, list);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((bucket) => ({
        bucket,
        label: BUCKET_LABELS[bucket],
        items: map.get(bucket)!.sort(compareItems),
    }));
}

export interface NamedGroup {
    key: string;
    label: string;
    items: WorkItem[];
    /** Items late or due today, for the group header. */
    urgent: number;
}

/**
 * Groups by client or by project. Rows without one go last, under `emptyLabel`.
 * Groups with the most urgent work come first, then alphabetically.
 */
export function groupByEntity(
    items: WorkItem[],
    by: "client" | "project",
    today: string,
    emptyLabel: string,
): NamedGroup[] {
    const map = new Map<string, NamedGroup>();
    for (const item of items) {
        const entity = item[by];
        const key = entity?.id ?? "";
        const group = map.get(key) ?? { key, label: entity?.name ?? emptyLabel, items: [], urgent: 0 };
        group.items.push(item);
        if (!item.done && item.dueDay && item.dueDay <= today) group.urgent += 1;
        map.set(key, group);
    }
    return [...map.values()]
        .map((g) => ({ ...g, items: g.items.sort(compareItems) }))
        .sort((a, b) => {
            if (!a.key !== !b.key) return a.key ? -1 : 1;
            if (a.urgent !== b.urgent) return b.urgent - a.urgent;
            return a.label.localeCompare(b.label, "fr");
        });
}
