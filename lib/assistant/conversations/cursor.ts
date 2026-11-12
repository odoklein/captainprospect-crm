/**
 * Keyset pagination of conversation lists (Captain AI v4). Pure: no I/O.
 *
 * Lists are ordered by a nullable timestamp (lastMessageAt, or pinnedAt for
 * the pinned list) descending with nulls last, then by id descending. The
 * cursor is the (timestamp, id) of the last card of a page, base64url-encoded
 * JSON, opaque to the browser. A tampered cursor decodes to null and the list
 * restarts from the top rather than failing.
 */

export type CursorField = "lastMessageAt" | "pinnedAt";

export interface ListCursor {
    /** ISO timestamp of the sort field, null when the row had none. */
    t: string | null;
    id: string;
}

export const LIST_LIMIT_DEFAULT = 30;
export const LIST_LIMIT_MAX = 100;

export function encodeCursor(cursor: ListCursor): string {
    return Buffer.from(JSON.stringify({ t: cursor.t, id: cursor.id }), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): ListCursor | null {
    if (!raw || raw.length > 400) return null;
    try {
        const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
        if (!parsed || typeof parsed !== "object") return null;
        const { t, id } = parsed as { t?: unknown; id?: unknown };
        if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;
        if (t === null) return { t: null, id };
        if (typeof t !== "string" || Number.isNaN(Date.parse(t))) return null;
        return { t: new Date(t).toISOString(), id };
    } catch {
        return null;
    }
}

/** `limit` query param: default 30, clamped to 1..100. */
export function parseLimit(raw: string | null | undefined, fallback = LIST_LIMIT_DEFAULT, max = LIST_LIMIT_MAX): number {
    const n = raw === null || raw === undefined || raw.trim() === "" ? NaN : Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(1, Math.floor(n)));
}

type FieldFilter = Date | null | { lt: Date };

/**
 * The Prisma `where` fragment selecting the rows after `cursor` in the order
 * `field DESC NULLS LAST, id DESC`. Null cursor = first page (no fragment).
 */
export function keysetWhere(
    field: CursorField,
    cursor: ListCursor | null,
): Record<string, unknown> | null {
    if (!cursor) return null;
    const idBefore = { id: { lt: cursor.id } };
    if (cursor.t === null) {
        // Already in the null tail: only nulls with a smaller id remain.
        return { [field]: null as FieldFilter, ...idBefore };
    }
    const at = new Date(cursor.t);
    return {
        OR: [
            { [field]: { lt: at } as FieldFilter },
            { [field]: at as FieldFilter, ...idBefore },
            { [field]: null as FieldFilter },
        ],
    };
}

/** The orderBy matching keysetWhere. */
export function keysetOrderBy(field: CursorField): Array<Record<string, unknown>> {
    return [{ [field]: { sort: "desc", nulls: "last" } }, { id: "desc" }];
}

/**
 * Cuts a `limit + 1` fetch into a page: the extra row only says another page
 * exists; the cursor is built from the last row kept.
 */
export function pageOf<T extends { id: string }>(
    rows: T[],
    limit: number,
    timestampOf: (row: T) => Date | null,
): { items: T[]; nextCursor: string | null } {
    if (rows.length <= limit) return { items: rows, nextCursor: null };
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    const t = timestampOf(last);
    return { items, nextCursor: encodeCursor({ t: t ? t.toISOString() : null, id: last.id }) };
}
