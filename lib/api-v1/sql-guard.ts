/**
 * Free-form read-only SQL, made safe enough to hand to a model.
 *
 * Shared by the MCP's `admin_db_sql` and the in-app assistant. The real
 * guarantee is the database's, not the regexes': the query runs inside a
 * `READ ONLY` transaction with a statement timeout, wrapped in a row cap. The
 * text checks only turn obvious mistakes into a clear error before a round
 * trip, and keep out the few read-only things that are still dangerous —
 * functions that sleep, read files, run a string as SQL, or reach other
 * databases, and the catalogs that hold password hashes.
 *
 * Results are made JSON-safe (Postgres `count(*)` is a BigInt, which
 * `JSON.stringify` refuses — the old `internal_error`) and every column whose
 * name looks like a secret is redacted.
 */

export class SqlGuardError extends Error {
    constructor(
        readonly code: "invalid_query" | "forbidden_keyword" | "forbidden_function" | "forbidden_object" | "multiple_statements",
        message: string,
    ) {
        super(message);
        this.name = "SqlGuardError";
    }
}

export const SQL_DEFAULT_TIMEOUT_MS = 15_000;
export const SQL_DEFAULT_MAX_ROWS = 1_000;

/**
 * A single statement must start with SELECT or WITH, so these can only hide in
 * a data-modifying CTE, a SELECT INTO or a row lock — all of which the
 * READ ONLY transaction refuses anyway. The list stays short on purpose:
 * `comment`, `load` or `call` are real column names and aliases.
 */
const FORBIDDEN_KEYWORDS = [
    "insert", "update", "delete", "merge", "into", "drop", "alter", "truncate", "create", "grant", "revoke",
    "copy", "execute",
];

/** Read-only functions that still do harm: sleep, read files, run text as SQL, reach out. */
const FORBIDDEN_FUNCTIONS: Array<[RegExp, string]> = [
    [/\bpg_sleep\w*\s*\(/, "pg_sleep"],
    [/\bpg_read_\w+\s*\(/, "pg_read_*"],
    [/\bpg_ls_\w+\s*\(/, "pg_ls_*"],
    [/\bpg_stat_file\s*\(/, "pg_stat_file"],
    [/\blo_\w+\s*\(/, "lo_*"],
    [/\bdblink\w*\s*\(/, "dblink"],
    [/\bset_config\s*\(/, "set_config"],
    [/\bcurrent_setting\s*\(/, "current_setting"],
    [/\bpg_(terminate|cancel)_backend\s*\(/, "pg_terminate_backend"],
    [/\bpg_reload_conf\s*\(/, "pg_reload_conf"],
    [/\bpg_rotate_logfile\s*\(/, "pg_rotate_logfile"],
    [/\bpg_(try_)?advisory\w*\s*\(/, "pg_advisory_*"],
    [/\bpg_notify\s*\(/, "pg_notify"],
    [/\b(query|cursor|table|schema|database)_to_xml\w*\s*\(/, "*_to_xml"],
    [/\b(nextval|setval)\s*\(/, "nextval/setval"],
];

/** Catalogs and schemas holding credentials (Postgres roles, Supabase auth and vault). */
const FORBIDDEN_OBJECTS = [
    /\bpg_authid\b/,
    /\bpg_shadow\b/,
    /\bpg_user_mapping\w*/,
    /\bpg_hba_file_rules\b/,
    /\bpg_file_settings\b/,
    /(^|[^\w."])"?(auth|vault|storage|supabase_functions)"?\s*\.\s*"?\w/,
];

/**
 * A column whose name ENDS like a secret, in camelCase or snake_case:
 * `passwordHash`, `resetToken`, `vaultCredential`, `api_key`, `secretEncrypted`…
 * Anchored at the end so `totalTokens` or `tokenExpiresAt` stay readable.
 */
const SECRET_COLUMN = /(pass(word)?|secret|token|hash|credential|api_?key|secret_?key|private_?key|otp|salt)(_?(enc(rypted)?|cipher|value|digest))?$/i;

/** Code with comments and literals blanked out: what the checks look at. */
function codeOnly(sql: string): string {
    return sql
        .replace(/--[^\n]*/g, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "''")
        .replace(/'(?:[^']|'')*'/g, "''")
        .toLowerCase();
}

/**
 * Checks one query and returns it ready to wrap: trimmed, without a trailing
 * semicolon. Throws a SqlGuardError the caller can show to the model.
 */
export function checkReadOnlySql(sql: string): string {
    const statement = sql.trim().replace(/;\s*$/, "").trim();
    // Double-quoted identifiers stay: `"Action"` is code, not a literal.
    const code = codeOnly(statement);

    if (!/^\(*\s*(select|with)\b/.test(code.trim())) {
        throw new SqlGuardError("invalid_query", "Seules les requêtes SELECT ou WITH sont autorisées.");
    }
    if (code.includes(";")) {
        throw new SqlGuardError("multiple_statements", "Une seule requête à la fois (pas de « ; » au milieu).");
    }
    // A quoted identifier ("Update", "createdAt") is a name, never a keyword.
    const keywordCode = code.replace(/"[^"]*"/g, '""');
    for (const word of FORBIDDEN_KEYWORDS) {
        if (new RegExp(`\\b${word}\\b`).test(keywordCode)) {
            throw new SqlGuardError("forbidden_keyword", `Le mot-clé SQL « ${word.toUpperCase()} » est interdit : lecture seule.`);
        }
    }
    for (const [pattern, name] of FORBIDDEN_FUNCTIONS) {
        if (pattern.test(code)) {
            throw new SqlGuardError("forbidden_function", `Fonction interdite dans une requête d'analyse : ${name}.`);
        }
    }
    for (const pattern of FORBIDDEN_OBJECTS) {
        if (pattern.test(code)) {
            throw new SqlGuardError("forbidden_object", "Cette table système ou ce schéma contient des identifiants et n'est pas lisible.");
        }
    }
    return statement;
}

/** BigInt, Decimal, Date and bytes in a shape JSON accepts. */
export function toJsonSafe(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === "bigint") {
        return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : value.toString();
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value !== "object") return value;
    if (value instanceof Uint8Array) return `[binaire, ${value.byteLength} octets]`;
    if (Array.isArray(value)) return value.map(toJsonSafe);
    // Prisma.Decimal (decimal.js): its string form is the exact value.
    if (typeof (value as { toFixed?: unknown }).toFixed === "function" && typeof (value as { isNaN?: unknown }).isNaN === "function") {
        const n = Number(String(value));
        return Number.isFinite(n) ? n : String(value);
    }
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) out[key] = toJsonSafe(v);
    return out;
}

/** Redacts every key that looks like a secret, at any depth (json columns included). */
export function redactSecretColumns(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redactSecretColumns);
    if (!value || typeof value !== "object") return value;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        out[key] = SECRET_COLUMN.test(key) && v !== null ? "[REDACTED_SECRET]" : redactSecretColumns(v);
    }
    return out;
}

/** The part of a Prisma client this needs; a PGlite stand-in fits it in tests. */
export interface ReadOnlySqlDb {
    $transaction<T>(fn: (tx: ReadOnlySqlTx) => Promise<T>, options?: { timeout?: number; maxWait?: number }): Promise<T>;
}
export interface ReadOnlySqlTx {
    $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
    $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export interface ReadOnlySqlResult {
    rows: Record<string, unknown>[];
    rowCount: number;
    truncated: boolean;
    columns: string[];
    durationMs: number;
}

export async function runReadOnlySql(
    db: ReadOnlySqlDb,
    sql: string,
    params: unknown[] = [],
    options: { timeoutMs?: number; maxRows?: number } = {},
): Promise<ReadOnlySqlResult> {
    const statement = checkReadOnlySql(sql);
    const timeoutMs = Math.max(1_000, Math.min(60_000, Math.round(options.timeoutMs ?? SQL_DEFAULT_TIMEOUT_MS)));
    const maxRows = Math.max(1, Math.min(10_000, Math.round(options.maxRows ?? SQL_DEFAULT_MAX_ROWS)));
    const startedAt = Date.now();

    const raw = await db.$transaction(
        async (tx) => {
            await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
            await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${timeoutMs}`);
            // One more row than the cap tells "exactly maxRows" from "cut".
            return tx.$queryRawUnsafe<Record<string, unknown>[]>(
                `SELECT * FROM (\n${statement}\n) AS cp_query LIMIT ${maxRows + 1}`,
                ...params,
            );
        },
        { timeout: timeoutMs + 5_000, maxWait: 5_000 },
    );

    const all = Array.isArray(raw) ? raw : [];
    const truncated = all.length > maxRows;
    const rows = redactSecretColumns(toJsonSafe(all.slice(0, maxRows))) as Record<string, unknown>[];
    return {
        rows,
        rowCount: rows.length,
        truncated,
        columns: rows[0] ? Object.keys(rows[0]) : [],
        durationMs: Date.now() - startedAt,
    };
}
