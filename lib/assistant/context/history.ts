/**
 * Which raw messages travel with a turn when a rolling summary exists.
 *
 * The summary job folds everything up to `summaryUpToMessageId` into the
 * summary, and it only runs once enough new messages pile up. In between, the
 * messages after that cutoff are in neither the summary nor a fixed-size
 * window, so a fixed window silently drops them. This keeps every message after
 * the cutoff (and at least `minTail` of the most recent ones), capped.
 */

export const HISTORY_MIN_TAIL = 12;
export const HISTORY_MAX = 40;

/**
 * `rows` is oldest first. Returns the slice to send. Without a cutoff (or with
 * a cutoff that is no longer in the rows) the newest `minTail`..`max` rows are
 * kept as before: the summary, when there is one, still covers what is older.
 */
export function selectHistoryRows<T extends { id: string }>(
    rows: readonly T[],
    summaryUpToMessageId: string | null,
    options: { minTail?: number; max?: number } = {},
): T[] {
    const minTail = options.minTail ?? HISTORY_MIN_TAIL;
    const max = options.max ?? HISTORY_MAX;
    if (rows.length === 0) return [];
    const cutoff = summaryUpToMessageId ? rows.findIndex((r) => r.id === summaryUpToMessageId) : -1;
    // Everything after the cutoff is unsummarised; never fewer than minTail rows.
    const unsummarised = cutoff >= 0 ? rows.length - (cutoff + 1) : rows.length;
    const keep = Math.min(max, Math.max(minTail, unsummarised));
    return rows.slice(Math.max(0, rows.length - keep));
}
