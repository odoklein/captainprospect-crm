// ============================================
// CALL JOURNAL — query parsing and display helpers. Pure: no I/O.
//
// The manager's journal is one URL-shaped filter set shared by the page and
// the API, so a filtered view can be bookmarked and shared.
// ============================================

import { DateTime } from "luxon";
import { APP_TIMEZONE, parsePeriodRange, type PeriodRange } from "@/lib/manager-home/rules";
import { ACTION_RESULT_LABELS } from "@/lib/types";

export type JournalView = "journal" | "unqualified";

export interface JournalFilters {
    view: JournalView;
    /** Inclusive Paris days, yyyy-MM-dd. */
    start: string;
    end: string;
    sdrIds: string[];
    missionId: string | null;
    /** ActionResult codes (the CRM's own statuses). */
    results: string[];
    withRecording: boolean;
    q: string;
    page: number;
    limit: number;
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
/** The journal is a working view: a year of calls at most per query. */
export const MAX_RANGE_DAYS = 366;
/** A call placed this recently may still be qualified by its SDR: not a process gap yet. */
export const QUALIFY_GRACE_MINUTES = 10;

const CODE_RE = /^[A-Z0-9_]{1,64}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function todayParis(now: Date = new Date()): string {
    return DateTime.fromJSDate(now, { zone: APP_TIMEZONE }).toFormat("yyyy-MM-dd");
}

export type ParsedFilters =
    | { ok: true; filters: JournalFilters; range: PeriodRange }
    | { ok: false; error: string };

export function parseJournalFilters(sp: URLSearchParams, now: Date = new Date()): ParsedFilters {
    const today = todayParis(now);
    const start = sp.get("start") || today;
    const end = sp.get("end") || start;
    const range = parsePeriodRange(start, end);
    if (!range) return { ok: false, error: "Période invalide" };
    if (range.days > MAX_RANGE_DAYS) return { ok: false, error: "Période trop longue (1 an maximum)" };

    const list = (key: string, re: RegExp) =>
        [...new Set(sp.getAll(key).flatMap((v) => v.split(",")).map((v) => v.trim()).filter((v) => re.test(v)))].slice(0, 50);

    const page = Math.max(1, Math.floor(Number(sp.get("page"))) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(10, Math.floor(Number(sp.get("limit"))) || DEFAULT_LIMIT));
    const mission = (sp.get("missionId") ?? "").trim();

    return {
        ok: true,
        range,
        filters: {
            view: sp.get("view") === "unqualified" ? "unqualified" : "journal",
            start,
            end,
            sdrIds: list("sdrId", ID_RE),
            missionId: ID_RE.test(mission) ? mission : null,
            results: list("result", CODE_RE),
            withRecording: sp.get("recording") === "1",
            q: (sp.get("q") ?? "").trim().slice(0, 80),
            page,
            limit,
        },
    };
}

/** Filters → query string (page/view/period always explicit; empty filters omitted). */
export function journalQuery(f: JournalFilters): string {
    const p = new URLSearchParams();
    p.set("start", f.start);
    p.set("end", f.end);
    if (f.view !== "journal") p.set("view", f.view);
    for (const id of f.sdrIds) p.append("sdrId", id);
    if (f.missionId) p.set("missionId", f.missionId);
    for (const r of f.results) p.append("result", r);
    if (f.withRecording) p.set("recording", "1");
    if (f.q) p.set("q", f.q);
    if (f.page > 1) p.set("page", String(f.page));
    if (f.limit !== DEFAULT_LIMIT) p.set("limit", String(f.limit));
    return p.toString();
}

/** How many filters narrow the list beyond the period and the view. */
export function activeFilterCount(f: JournalFilters): number {
    return f.sdrIds.length + (f.missionId ? 1 : 0) + f.results.length + (f.withRecording ? 1 : 0) + (f.q ? 1 : 0);
}

// ── Statuses ────────────────────────────────────────────────────────────────

export interface StatusInfo {
    code: string;
    label: string;
    color: string | null;
    category: string | null;
}

export interface StatusDef {
    label: string | null;
    color: string | null;
    resultCategoryCode: string | null;
}

function prettify(code: string): string {
    const s = code.toLowerCase().replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The CRM's configured label/colour for a status code, falling back to the built-in labels. */
export function resolveStatus(code: string, defs: ReadonlyMap<string, StatusDef>): StatusInfo {
    const def = defs.get(code);
    return {
        code,
        label: def?.label?.trim() || ACTION_RESULT_LABELS[code] || prettify(code),
        color: def?.color && /^#[0-9a-f]{3,8}$/i.test(def.color) ? def.color : null,
        category: def?.resultCategoryCode ?? null,
    };
}

// ── Call source ─────────────────────────────────────────────────────────────

export type CallSource = "crm" | "allo" | null;

/**
 * Where a logged call's data comes from: the in-app Twilio softphone (a linked
 * call), the Allo line (recording/summary matched afterwards), or nothing
 * (logged by hand, no telephony data).
 */
export function callSource(a: { hasTelephonyCall: boolean; hasRecording: boolean; enriched: boolean }): CallSource {
    if (a.hasTelephonyCall) return "crm";
    if (a.enriched || a.hasRecording) return "allo";
    return null;
}

export const CALL_SOURCE_LABELS: Record<Exclude<CallSource, null>, string> = {
    crm: "Téléphone intégré",
    allo: "Allo",
};
