/**
 * Numeric facts and reporting period of one tool result.
 *
 * Facts are what the verifier checks an answer against: every finite number in
 * the scrubbed payload, with the path that names it, its unit, the row entity
 * it belongs to (an SDR, a client) and the period it covers. Array lengths and
 * column sums are added because answers count rows ("3 RDV à venir") and add
 * columns more often than they quote a stored total.
 *
 * Strings never become facts — only the short row label used as `entity`.
 */

export type FactUnit = "count" | "pct";

export interface EvidencePeriod {
    kind: "rolling" | "since" | "month_to_date";
    /** Paris calendar dates, YYYY-MM-DD. */
    from: string;
    to: string;
    days: number | null;
}

export interface Fact {
    path: string;
    /** Last meaningful key, e.g. "rdvPris", "rdv.length". */
    key: string;
    value: number;
    unit: FactUnit;
    entity?: string;
    /** Null = a snapshot (current state), not a reporting window. */
    period: EvidencePeriod | null;
    derived?: "length" | "sum";
}

const ENTITY_KEYS = ["sdr", "nom", "name", "client", "societe", "titre", "libelle", "resultat", "outcome", "tableau"];
const SKIP_KEYS = /^(periodeJours|periode|jours|durationMs)$|Id$|^id$/;
const PCT_KEY = /pct|taux|rate|pourcent|percent/i;
const MAX_FACTS = 300;

// ── Paris calendar helpers ──────────────────────────────────────────────────

const PARIS_DAY = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

export function parisDay(date: Date): string {
    return PARIS_DAY.format(date);
}

export function addDays(isoDay: string, delta: number): string {
    const d = new Date(`${isoDay}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}

export function daysBetween(fromDay: string, toDay: string): number {
    return Math.round((Date.parse(`${toDay}T12:00:00Z`) - Date.parse(`${fromDay}T12:00:00Z`)) / 86_400_000);
}

/** The window a payload declares: explicit `periode`, else `periodeJours` back from now. */
export function periodOf(data: unknown, now: Date): EvidencePeriod | null {
    if (!data || typeof data !== "object") return null;
    const record = data as Record<string, unknown>;
    const today = parisDay(now);

    const explicit = record.periode as { du?: unknown; au?: unknown; jours?: unknown; mode?: unknown } | undefined;
    if (explicit && typeof explicit.du === "string" && /^\d{4}-\d{2}-\d{2}$/.test(explicit.du)) {
        const to = typeof explicit.au === "string" ? explicit.au : today;
        const monthStart = `${to.slice(0, 8)}01`;
        return {
            kind: explicit.du === monthStart ? "month_to_date" : explicit.mode === "depuis" ? "since" : "rolling",
            from: explicit.du,
            to,
            days: typeof explicit.jours === "number" ? explicit.jours : daysBetween(explicit.du, to),
        };
    }
    if (typeof record.periodeJours === "number") {
        const days = record.periodeJours;
        return { kind: "rolling", from: addDays(today, -days), to: today, days };
    }
    return null;
}

function monthToDate(now: Date): EvidencePeriod {
    const today = parisDay(now);
    const from = `${today.slice(0, 8)}01`;
    return { kind: "month_to_date", from, to: today, days: daysBetween(from, today) };
}

function entityOf(row: Record<string, unknown>): string | undefined {
    for (const key of ENTITY_KEYS) {
        const value = row[key];
        if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
    }
    return undefined;
}

function lastKey(path: string): string {
    const parts = path.replace(/\[\]/g, "").split(".");
    return parts[parts.length - 1];
}

export function extractFacts(data: unknown, now: Date): Fact[] {
    const facts: Fact[] = [];
    const period = periodOf(data, now);
    const mtd = monthToDate(now);

    const push = (fact: Omit<Fact, "period"> & { period?: EvidencePeriod | null }) => {
        if (facts.length >= MAX_FACTS) return;
        const periodForKey = /cemois/i.test(fact.key) ? mtd : fact.period === undefined ? period : fact.period;
        facts.push({ ...fact, period: periodForKey });
    };

    const walk = (value: unknown, path: string, entity: string | undefined) => {
        if (facts.length >= MAX_FACTS || value === null || value === undefined) return;

        if (typeof value === "number") {
            if (!Number.isFinite(value)) return;
            const key = lastKey(path);
            push({ path, key, value, unit: PCT_KEY.test(key) ? "pct" : "count", entity });
            return;
        }

        if (Array.isArray(value)) {
            const key = lastKey(path);
            push({ path: `${path}.length`, key: `${key}.length`, value: value.length, unit: "count", entity, derived: "length" });

            const rows = value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v));
            if (rows.length > 1) {
                const numericColumns = new Set<string>();
                for (const row of rows) {
                    for (const [k, v] of Object.entries(row)) if (typeof v === "number" && !SKIP_KEYS.test(k)) numericColumns.add(k);
                }
                for (const column of numericColumns) {
                    const sum = rows.reduce((s, row) => s + (typeof row[column] === "number" ? (row[column] as number) : 0), 0);
                    if (!PCT_KEY.test(column)) {
                        push({ path: `${path}[].${column}:sum`, key: column, value: sum, unit: "count", entity, derived: "sum" });
                    }
                }
            }
            for (const row of value) {
                if (row && typeof row === "object" && !Array.isArray(row)) {
                    walk(row, `${path}[]`, entityOf(row as Record<string, unknown>) ?? entity);
                }
            }
            return;
        }

        if (typeof value === "object") {
            for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
                if (SKIP_KEYS.test(key)) continue;
                walk(child, path ? `${path}.${key}` : key, entity);
            }
        }
    };

    walk(data, "", undefined);
    return facts;
}

/** A payload with nothing in it: no non-empty array and no non-zero number. */
export function isEmptyPayload(data: unknown): boolean {
    if (data === null || data === undefined) return true;
    if (typeof data !== "object") return false;
    const record = data as Record<string, unknown>;
    if (typeof record.error === "string") return true;
    let substance = false;
    const visit = (value: unknown, key: string) => {
        if (substance || SKIP_KEYS.test(key)) return;
        if (Array.isArray(value)) {
            if (value.length > 0) substance = true;
        } else if (typeof value === "number") {
            if (value !== 0) substance = true;
        } else if (typeof value === "string" || typeof value === "boolean") {
            if (key !== "note" && key !== "date" && key !== "_note") substance = true;
        } else if (value && typeof value === "object") {
            for (const [k, v] of Object.entries(value)) visit(v, k);
        }
    };
    for (const [k, v] of Object.entries(record)) visit(v, k);
    return !substance;
}

/** Every string in a payload, for date and name checks. In memory only. */
export function collectStrings(data: unknown, out: string[] = [], depth = 0): string[] {
    if (depth > 6 || out.length > 2000) return out;
    if (typeof data === "string") out.push(data);
    else if (Array.isArray(data)) for (const v of data) collectStrings(v, out, depth + 1);
    else if (data && typeof data === "object") for (const v of Object.values(data)) collectStrings(v, out, depth + 1);
    return out;
}
