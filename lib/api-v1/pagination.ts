import { z } from "zod";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Shared by every list endpoint / search tool. */
export const pageParams = {
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).describe("Page size (default 20, max 100)"),
  cursor: z.string().max(300).optional().describe("Opaque cursor from a previous response's next_cursor"),
};

export const encodeCursor = (payload: unknown): string =>
  Buffer.from(JSON.stringify(payload)).toString("base64url");

export function decodeCursor<T = unknown>(cursor: string | undefined): T | undefined {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
  } catch {
    return undefined;
  }
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

/**
 * Cursor pagination on a unique `id`. Fetch `limit + 1` rows; the extra row
 * only proves there is a next page. The cursor is just an anchor inside the
 * already tenant-filtered query — it grants nothing.
 */
export function pageArgs(limit: number, cursor: string | undefined) {
  const id = decodeCursor<{ id?: string }>(cursor)?.id;
  return { take: limit + 1, ...(typeof id === "string" ? { cursor: { id }, skip: 1 } : {}) };
}

export function toPage<T extends { id: string }, U>(rows: T[], limit: number, map: (row: T) => U): Page<U> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: slice.map(map),
    next_cursor: hasMore ? encodeCursor({ id: slice[slice.length - 1].id }) : null,
  };
}

export const zDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Expected an ISO date (YYYY-MM-DD) or datetime");

/** A bare `date_to` (YYYY-MM-DD) is inclusive of that whole day. */
export function dateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(from);
  if (to) {
    const d = new Date(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) d.setUTCHours(23, 59, 59, 999);
    range.lte = d;
  }
  return range;
}

export const zBool = z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).optional();
