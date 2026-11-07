/**
 * Degrade-when-missing for the Captain AI v4 tables (folders, memory, file
 * text, pins) and the columns they add to conversations and messages.
 *
 * The Neon dev database lags production and production is migrated by hand,
 * so every store call that touches the new schema goes through `optional()`:
 * a missing table or column yields the fallback (plus one warning per label
 * per process) instead of breaking the chat turn. Same idea as
 * EvidenceStoreUnavailable in lib/ai/agent/evidence/store.ts, widened to the
 * raw Postgres codes a $queryRaw surfaces.
 */

/** Prisma: table (P2021) or column (P2022) does not exist in the database. */
const PRISMA_MISSING = new Set(["P2021", "P2022"]);
/** Postgres: undefined_table (42P01), undefined_column (42703). */
const PG_MISSING = new Set(["42P01", "42703"]);
const PG_MISSING_RE = /\b(42P01|42703)\b/;

export function isMissingSchemaError(err: unknown, depth = 0): boolean {
    if (!err || typeof err !== "object" || depth > 4) return false;
    const e = err as { code?: unknown; meta?: unknown; message?: unknown; cause?: unknown };
    if (typeof e.code === "string" && (PRISMA_MISSING.has(e.code) || PG_MISSING.has(e.code))) return true;
    // Prisma wraps a failed raw query in P2010 with the Postgres code in meta.
    const meta = e.meta as { code?: unknown } | undefined;
    if (meta && typeof meta.code === "string" && PG_MISSING.has(meta.code)) return true;
    if (typeof e.message === "string" && PG_MISSING_RE.test(e.message)) return true;
    if (e.cause && e.cause !== err) return isMissingSchemaError(e.cause, depth + 1);
    return false;
}

const warned = new Set<string>();

/**
 * Runs `fn`; when it fails because the schema is missing, warns once per
 * label and returns the fallback (a value, or a thunk evaluated lazily, which
 * may itself be async). Any other error is rethrown untouched.
 */
export async function optional<T>(
    label: string,
    fn: () => Promise<T>,
    fallback: T | (() => T | Promise<T>),
): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        if (!isMissingSchemaError(err)) throw err;
        if (!warned.has(label)) {
            warned.add(label);
            console.warn(
                `[assistant] ${label}: schéma manquant (migration 20261030100000_add_assistant_folders_memory_files appliquée ?) — ${describe(err)}`,
            );
        }
        return typeof fallback === "function" ? await (fallback as () => T | Promise<T>)() : fallback;
    }
}

/** Test hook: forget which labels already warned. */
export function resetMissingSchemaWarnings(): void {
    warned.clear();
}

function describe(err: unknown): string {
    const e = err as { code?: unknown; message?: unknown } | null;
    const code = typeof e?.code === "string" ? e.code : "?";
    const msg = typeof e?.message === "string" ? e.message.split("\n")[0].slice(0, 160) : String(err);
    return `${code} ${msg}`;
}
