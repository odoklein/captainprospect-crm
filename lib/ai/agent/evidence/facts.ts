/**
 * Numeric facts and reporting period of one tool result.
 *
 * Facts are what the verifier checks an answer against: every finite number in
 * the scrubbed payload, with the path that names it, its unit, the row entity
 * it belongs to (an SDR, a client, a result category) and the period it covers.
 * Array lengths and column sums are added because answers count rows ("3 RDV à
 * venir") and add columns more often than they quote a stored total.
 *
 * Two payload families are understood: the project tools (`periodeJours`,
 * French keys) and the CRM data tools of the public API (`period: {from, to,
 * label}`, `comparison.*.before` for the previous period). When a payload does
 * not echo its window (get_rdv_overview), the window comes from the validated
 * arguments instead.
 *
 * Strings never become facts — only the short row label used as `entity`.
 */

import { periodRange, PERIODS, type Period } from "@/lib/api-v1/dates";

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
    /** Meaningful key: "rdvPris", "rdv.length", "calls.before". */
    key: string;
    value: number;
    unit: FactUnit;
    entity?: string;
    /** Null = a snapshot (current state), not a reporting window. */
    period: EvidencePeriod | null;
    derived?: "length" | "sum";
}

/** Row label, in order of preference: who or what the numbers of a row are about. */
const ENTITY_KEYS = ["sdr", "name", "nom", "client", "societe", "titre", "libelle", "label", "resultat", "result", "category", "outcome", "tableau", "bucket"];
const SKIP_KEYS = /^(periodeJours|periode|period|previous_period|jours|durationMs|timezone|legend|definition)$|Id$|^id$/;
/**
 * The marker `truncateStructured` plants next to a sliced array. Its `kept` and
 * `total` describe the cut, not the data, so the whole subtree is skipped —
 * including the array form the marker takes when a parent is cut twice.
 */
const TRUNCATION_KEY = "_truncated";

function isSkipped(key: string): boolean {
    return key === TRUNCATION_KEY || SKIP_KEYS.test(key);
}
/** Leaf keys that only mean something with their parent: comparison.calls.before. */
const GENERIC_LEAF = /^(now|before|change_pct|count|share_pct|value|total)$/;
const PCT_KEY = /pct|taux|rate|pourcent|percent/i;
const MAX_FACTS = 300;

// -- Paris calendar helpers ---------------------------------------------------

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

function toDay(value: string): string | null {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const t = Date.parse(value);
    return Number.isFinite(t) ? parisDay(new Date(t)) : null;
}

/** A [from, to] window, classified the way the verifier compares periods. */
function windowOf(from: string, to: string, hint: { label?: string | null; days?: number | null; mode?: unknown }): EvidencePeriod {
    const monthStart = `${to.slice(0, 8)}01`;
    const rolling = hint.label?.match(/(\d+)\s+derniers\s+jours/i);
    if (rolling) return { kind: "rolling", from, to, days: Number(rolling[1]) };
    if (from === monthStart) return { kind: "month_to_date", from, to, days: daysBetween(from, to) };
    if (hint.mode === "jours" && typeof hint.days === "number") return { kind: "rolling", from, to, days: hint.days };
    if (hint.label || hint.mode === "depuis") return { kind: "since", from, to, days: daysBetween(from, to) };
    return { kind: "rolling", from, to, days: typeof hint.days === "number" ? Math.round(hint.days) : daysBetween(from, to) };
}

/** The window a payload declares itself, if any. */
export function periodOf(data: unknown, now: Date): EvidencePeriod | null {
    if (!data || typeof data !== "object") return null;
    const record = data as Record<string, unknown>;
    const today = parisDay(now);

    // Project tools, explicit: { periode: { du, au, jours, mode } }
    const periode = record.periode as { du?: unknown; au?: unknown; jours?: unknown; mode?: unknown } | undefined;
    if (periode && typeof periode.du === "string" && toDay(periode.du)) {
        const to = typeof periode.au === "string" ? toDay(periode.au) ?? today : today;
        return windowOf(toDay(periode.du)!, to, { days: typeof periode.jours === "number" ? periode.jours : null, mode: periode.mode });
    }
    // CRM data tools: { period: { label, from, to, days } }
    const period = record.period as { from?: unknown; to?: unknown; label?: unknown; days?: unknown } | undefined;
    if (period && typeof period === "object" && typeof period.from === "string" && toDay(period.from)) {
        const to = typeof period.to === "string" ? toDay(period.to) ?? today : today;
        return windowOf(toDay(period.from)!, to, {
            label: typeof period.label === "string" ? period.label : null,
            days: typeof period.days === "number" ? period.days : null,
        });
    }
    // Project tools, implicit: N rolling days back from now.
    if (typeof record.periodeJours === "number") {
        const days = record.periodeJours;
        return { kind: "rolling", from: addDays(today, -days), to: today, days };
    }
    return null;
}

/** The window the call asked for, for tools whose payload does not echo it. */
export function periodFromArgs(args: unknown, now: Date): EvidencePeriod | null {
    if (!args || typeof args !== "object") return null;
    const a = args as Record<string, unknown>;
    const today = parisDay(now);
    if (typeof a.period === "string" && (PERIODS as readonly string[]).includes(a.period)) {
        const range = periodRange(a.period as Period, now);
        return windowOf(parisDay(range.from), parisDay(range.to), { label: range.label });
    }
    if (typeof a.date_from === "string" && toDay(a.date_from)) {
        const to = typeof a.date_to === "string" ? toDay(a.date_to) ?? today : today;
        return windowOf(toDay(a.date_from)!, to, { mode: "depuis" });
    }
    if (typeof a.days === "number") return { kind: "rolling", from: addDays(today, -a.days), to: today, days: a.days };
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

function segments(path: string): string[] {
    return path.replace(/\[\]/g, "").split(".").filter(Boolean);
}

function keyOf(path: string): string {
    const parts = segments(path);
    const leaf = parts[parts.length - 1] ?? "";
    return GENERIC_LEAF.test(leaf) && parts.length > 1 ? `${parts[parts.length - 2]}.${leaf}` : leaf;
}

export function extractFacts(data: unknown, now: Date, fallbackPeriod: EvidencePeriod | null = null): Fact[] {
    const facts: Fact[] = [];
    const period = periodOf(data, now) ?? fallbackPeriod;
    const mtd = monthToDate(now);

    const push = (fact: Omit<Fact, "period">, scoped: EvidencePeriod | null) => {
        if (facts.length >= MAX_FACTS) return;
        facts.push({ ...fact, period: /cemois/i.test(fact.key) ? mtd : scoped });
    };

    const walk = (value: unknown, path: string, entity: string | undefined, scoped: EvidencePeriod | null, previous: EvidencePeriod | null) => {
        if (facts.length >= MAX_FACTS || value === null || value === undefined) return;

        if (typeof value === "number") {
            if (!Number.isFinite(value)) return;
            const key = keyOf(path);
            const leaf = segments(path).pop() ?? "";
            // comparison.calls.before is the previous period's figure; a change
            // spans both windows, so either one may be named next to it.
            const factPeriod = leaf === "before" && previous ? previous : leaf === "change_pct" ? null : scoped;
            push({ path, key, value, unit: PCT_KEY.test(leaf) || PCT_KEY.test(key) ? "pct" : "count", entity }, factPeriod);
            return;
        }

        if (Array.isArray(value)) {
            const key = keyOf(path);
            push({ path: `${path}.length`, key: `${key}.length`, value: value.length, unit: "count", entity, derived: "length" }, scoped);

            const rows = value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v));
            if (rows.length > 1) {
                const numericColumns = new Set<string>();
                for (const row of rows) {
                    for (const [k, v] of Object.entries(row)) if (typeof v === "number" && !isSkipped(k)) numericColumns.add(k);
                }
                for (const column of numericColumns) {
                    if (PCT_KEY.test(column)) continue;
                    const sum = rows.reduce((s, row) => s + (typeof row[column] === "number" ? (row[column] as number) : 0), 0);
                    push({ path: `${path}[].${column}:sum`, key: column, value: sum, unit: "count", entity, derived: "sum" }, scoped);
                }
            }
            for (const row of rows) walk(row, `${path}[]`, entityOf(row) ?? entity, scoped, previous);
            return;
        }

        if (typeof value === "object") {
            const record = value as Record<string, unknown>;
            const prev = record.previous_period as { from?: unknown; to?: unknown } | undefined;
            const previousHere =
                prev && typeof prev.from === "string" && typeof prev.to === "string" && toDay(prev.from) && toDay(prev.to)
                    ? windowOf(toDay(prev.from)!, toDay(prev.to)!, { mode: "depuis" })
                    : previous;
            for (const [key, child] of Object.entries(record)) {
                // `continue` before the recursive call: the subtree is never entered.
                if (isSkipped(key)) continue;
                walk(child, path ? `${path}.${key}` : key, entity, scoped, previousHere);
            }
        }
    };

    walk(data, "", undefined, period, null);
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
        if (substance) return;
        // A sliced array may be sliced down to nothing; the marker proves there were rows.
        if (key === TRUNCATION_KEY) {
            substance = true;
            return;
        }
        if (isSkipped(key)) return;
        if (Array.isArray(value)) {
            if (value.length > 0) substance = true;
        } else if (typeof value === "number") {
            if (value !== 0) substance = true;
        } else if (typeof value === "string" || typeof value === "boolean") {
            if (!["note", "date", "_note", "next_cursor", "today", "unit", "label"].includes(key)) substance = true;
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
