// MARKER
/**
 * French text helpers for claim extraction: length-preserving normalisation,
 * reporting-period expressions, dates, numbers.
 *
 * Normalisation keeps one output character per input UTF-16 unit, so an index
 * found in the normalised text is valid in the original — the annotator edits
 * the original at those positions.
 */

import { addDays, daysBetween } from "../evidence/facts";

export function normalizeKeepLength(text: string): string {
    let out = "";
    for (const ch of text) {
        if (ch.length !== 1) {
            out += ch;
            continue;
        }
        if (ch === " " || ch === " ") out += " ";
        else if (ch === "’" || ch === "‘") out += "'";
        else out += (ch.normalize("NFD").charAt(0) || ch).toLowerCase();
    }
    return out;
}

/** Accent-free lowercase for comparisons where length does not matter. */
export function fold(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[  ]/g, " ")
        .toLowerCase();
}

// ── Periods ─────────────────────────────────────────────────────────────────

export type ClaimPeriod =
    | { kind: "rolling"; days: number }
    | { kind: "rolling_months"; months: number }
    | { kind: "month_to_date" }
    | { kind: "week_to_date" }
    | { kind: "today" }
    | { kind: "since"; from: string }
    | { kind: "named_month"; month: number };

export interface PeriodSpan {
    start: number;
    end: number;
    period: ClaimPeriod;
}

const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const MONTH_PREFIX: Array<[string, number]> = [
    ["janv", 1], ["fevr", 2], ["mars", 3], ["avr", 4], ["mai", 5], ["juin", 6],
    ["juil", 7], ["aout", 8], ["sept", 9], ["oct", 10], ["nov", 11], ["dec", 12],
];
const MONTH_ALT = MONTHS.join("|");

export function monthFromWord(word: string): number | null {
    const w = fold(word);
    for (const [prefix, month] of MONTH_PREFIX) if (w.startsWith(prefix)) return month;
    return null;
}

/** Find every reporting-period expression. `text` must be normalised. */
export function findPeriods(text: string, today: string): PeriodSpan[] {
    const spans: PeriodSpan[] = [];
    const add = (m: RegExpExecArray, period: ClaimPeriod) => spans.push({ start: m.index, end: m.index + m[0].length, period });
    const year = Number(today.slice(0, 4));
    let m: RegExpExecArray | null;

    const rolling = /(?:(?:sur|depuis|pendant|durant|au cours des|lors des|ces|les|des)\s+)*(\d{1,3})\s+(?:(?:derniers|dernieres)\s+)?jours?(?:\s+(?:glissants|ecoules))?/g;
    while ((m = rolling.exec(text))) {
        const before = text.slice(Math.max(0, m.index - 10), m.index);
        if (/(il y a|dans|tous les)\s*$/.test(before)) continue;
        add(m, { kind: "rolling", days: Number(m[1]) });
    }
    const weeks = /(?:(?:sur|depuis|pendant|ces|les)\s+)*(\d{1,2})\s+(?:dernieres\s+)?semaines?/g;
    while ((m = weeks.exec(text))) add(m, { kind: "rolling", days: Number(m[1]) * 7 });

    const months = /(?:(?:sur|depuis|pendant|ces|les)\s+)*(\d{1,2})\s+derniers\s+mois/g;
    while ((m = months.exec(text))) add(m, { kind: "rolling_months", months: Number(m[1]) });

    const mtd = /\b(?:ce mois(?:-ci)?|du mois(?: en cours)?|mois en cours|depuis le debut du mois|depuis le (?:1er|premier) du mois)\b/g;
    while ((m = mtd.exec(text))) add(m, { kind: "month_to_date" });

    const wtd = /\b(?:cette semaine|semaine en cours|depuis lundi)\b/g;
    while ((m = wtd.exec(text))) add(m, { kind: "week_to_date" });

    const day = /\baujourd'?hui\b/g;
    while ((m = day.exec(text))) add(m, { kind: "today" });

    const since = new RegExp(`\\bdepuis le (\\d{1,2})(?:er)?\\s+(${MONTH_ALT})(?:\\s+(\\d{4}))?`, "g");
    while ((m = since.exec(text))) {
        const month = MONTHS.indexOf(m[2]) + 1;
        const y = m[3] ? Number(m[3]) : year;
        add(m, { kind: "since", from: `${y}-${String(month).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}` });
    }
    const sinceNumeric = /\bdepuis le (\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g;
    while ((m = sinceNumeric.exec(text))) {
        const y = m[3] ? Number(m[3]) : year;
        add(m, { kind: "since", from: `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` });
    }

    const named = new RegExp(`\\b(?:en|d'|de|du mois d')\\s*(${MONTH_ALT})\\b(?!\\s+\\d)`, "g");
    while ((m = named.exec(text))) {
        if (spans.some((s) => m!.index >= s.start && m!.index < s.end)) continue;
        add(m, { kind: "named_month", month: MONTHS.indexOf(m[1]) + 1 });
    }

    // Overlaps: keep the longest span.
    spans.sort((a, b) => a.start - b.start || b.end - a.end);
    const out: PeriodSpan[] = [];
    for (const span of spans) {
        const last = out[out.length - 1];
        if (last && span.start < last.end) continue;
        out.push(span);
    }
    return out;
}

export function describeClaimPeriod(period: ClaimPeriod): string {
    switch (period.kind) {
        case "rolling":
            return `${period.days} derniers jours`;
        case "rolling_months":
            return `${period.months} derniers mois`;
        case "month_to_date":
            return "mois en cours";
        case "week_to_date":
            return "semaine en cours";
        case "today":
            return "aujourd'hui";
        case "since":
            return `depuis le ${period.from}`;
        case "named_month":
            return MONTHS[period.month - 1];
    }
}

export function mondayOf(today: string): string {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
    return addDays(today, -((weekday + 6) % 7));
}

export { addDays, daysBetween };

// ── Dates ───────────────────────────────────────────────────────────────────

export interface DateMention {
    start: number;
    end: number;
    /** "d/m" — comparable across formats. */
    key: string;
    raw: string;
}

const MONTH_WORD = "(janv|fevr|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec)[a-z]*\\.?";

/** Dates in normalised text: 28/10, 28/10/2026, 28 oct., 1er octobre 2026, 2026-10-28. */
export function findDates(text: string): DateMention[] {
    const out: DateMention[] = [];
    let m: RegExpExecArray | null;
    const numeric = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])/g;
    while ((m = numeric.exec(text))) {
        const d = Number(m[1]);
        const mo = Number(m[2]);
        if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) out.push({ start: m.index, end: m.index + m[0].length, key: `${d}/${mo}`, raw: m[0] });
    }
    const worded = new RegExp(`(?<!\\d)(\\d{1,2})(?:er)?\\s+${MONTH_WORD}(?:\\s+(\\d{4}))?`, "g");
    while ((m = worded.exec(text))) {
        const mo = monthFromWord(m[2]);
        const d = Number(m[1]);
        if (mo && d >= 1 && d <= 31) out.push({ start: m.index, end: m.index + m[0].length, key: `${d}/${mo}`, raw: m[0] });
    }
    const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = iso.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, key: `${Number(m[3])}/${Number(m[2])}`, raw: m[0] });
    return out;
}

// ── Numbers ─────────────────────────────────────────────────────────────────

export interface NumberToken {
    start: number;
    end: number;
    raw: string;
    value: number;
    decimals: number;
    unit: "count" | "pct";
}

const NUMBER = /(?<![\p{L}\d_.,/:#°@€$£-])(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d+))?(?![\d/:]|[.,]\d|\p{L})(\s*(?:%|pour\s?cent|points?\b))?/gu;
const PHONE = /(?:\+33\s?|\b0)\d(?:[\s.]?\d{2}){4}\b/g;

export function findNumbers(original: string, normalized: string): NumberToken[] {
    const blocked: Array<[number, number]> = [];
    let m: RegExpExecArray | null;
    PHONE.lastIndex = 0;
    while ((m = PHONE.exec(original))) blocked.push([m.index, m.index + m[0].length]);
    // Quoted titles (« Relance Q4 ») and inline code are names, not claims.
    const quoted = /«[^»\n]*»|`[^`\n]*`|\[[^\]\n]*\]\([^)\n]*\)/g;
    while ((m = quoted.exec(original))) blocked.push([m.index, m.index + m[0].length]);

    const out: NumberToken[] = [];
    NUMBER.lastIndex = 0;
    while ((m = NUMBER.exec(original))) {
        const start = m.index;
        const numberEnd = start + m[1].length + (m[2] !== undefined ? m[2].length + 1 : 0);
        if (blocked.some(([a, b]) => start >= a && start < b)) continue;

        const after = normalized.slice(numberEnd, numberEnd + 12);
        if (/^\s*h(\s*\d|\b)/.test(after)) continue; // 10 h 30
        if (new RegExp(`^\\s*(er\\s+)?${MONTH_WORD}`).test(after)) continue; // 28 oct.
        if (/^\s*(?:e|eme|er|ere)\b/.test(after)) continue; // 3e, 1er
        const lineStart = original.lastIndexOf("\n", start - 1) + 1;
        if (/^\s*$/.test(original.slice(lineStart, start)) && /^[.)]\s/.test(original.slice(numberEnd, numberEnd + 2))) continue; // "1. "

        const digits = m[1].replace(/[   ]/g, "");
        const value = Number(`${digits}${m[2] !== undefined ? `.${m[2]}` : ""}`);
        if (!Number.isFinite(value)) continue;
        const unit = m[3] ? "pct" : "count";
        if (unit === "count" && m[2] === undefined && digits.length === 4 && value >= 1900 && value <= 2100) continue; // a year

        out.push({
            start,
            end: m[3] ? start + m[0].length : numberEnd,
            raw: m[0].trim(),
            value,
            decimals: m[2]?.length ?? 0,
            unit,
        });
    }
    return out;
}
