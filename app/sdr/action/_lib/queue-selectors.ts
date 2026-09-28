import type { OutcomeTone } from "./status-ui";
import type { DoneEntry, QueueActor, QueueItem, QueueLastAction } from "./types";

// ============================================
// Pure queue logic: segments, filters, sorting, time labels.
// No React here, so every rule is unit-tested (queue-selectors.test.ts).
// ============================================

const DAY_MS = 24 * 60 * 60 * 1000;

export const rowKey = (row: QueueItem): string => row.contactId ?? row.companyId;

export function displayName(row: QueueItem): string {
    if (row.contact) {
        const full = `${(row.contact.firstName ?? "").trim()} ${(row.contact.lastName ?? "").trim()}`.trim();
        if (full) return full;
    }
    return row.company.name;
}

export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function rowPhone(row: QueueItem): string | null {
    return row.contact?.phone?.trim() || row.company.phone?.trim() || null;
}

/** The action that should warn before calling: the target's own, else the company's. */
export function effectiveLastAction(row: QueueItem): { lastAction: QueueLastAction | null; lastActionBy: QueueActor | null } {
    if (row.lastAction) return { lastAction: row.lastAction, lastActionBy: row.lastActionBy ?? null };
    const co = row.companyLastAction;
    if (!co) return { lastAction: null, lastActionBy: null };
    return {
        lastAction: { result: co.result, note: co.note, createdAt: co.createdAt, scope: "COMPANY" },
        lastActionBy: co.sdrId ? { id: co.sdrId, name: co.sdrName ?? null } : null,
    };
}

/**
 * Same rule the SDR team agreed on for the "déjà contacté" guard: touched in the
 * last 35 days, or carrying a note — except the caller's own callback due today.
 */
export function isRecentlyContacted(
    lastAction: QueueLastAction | null | undefined,
    lastActionBy: QueueActor | null | undefined,
    currentUserId: string | undefined,
    now: number,
): boolean {
    if (!lastAction) return false;
    const isMyCallbackToday =
        lastAction.result === "CALLBACK_REQUESTED" &&
        !!currentUserId &&
        lastActionBy?.id === currentUserId &&
        !!lastAction.callbackDate &&
        new Date(lastAction.callbackDate).toDateString() === new Date(now).toDateString();
    if (isMyCallbackToday) return false;
    const createdAt = lastAction.createdAt ? new Date(lastAction.createdAt).getTime() : NaN;
    const isRecent = Number.isFinite(createdAt) && now - createdAt <= 35 * DAY_MS;
    return isRecent || !!lastAction.note?.trim();
}

// ── Callbacks ────────────────────────────────────────────────────────────────

export type CallbackKind = "overdue" | "today" | "soon" | "later";

export interface CallbackState {
    kind: CallbackKind;
    at: number;
}

export function callbackState(row: QueueItem, callbackCodes: Set<string>, now: number): CallbackState | null {
    const la = row.lastAction;
    if (!la || !callbackCodes.has(la.result) || !la.callbackDate) return null;
    const at = new Date(la.callbackDate).getTime();
    if (!Number.isFinite(at)) return null;
    if (at < now) return { kind: "overdue", at };
    if (new Date(at).toDateString() === new Date(now).toDateString()) return { kind: "today", at };
    if (at <= now + 3 * DAY_MS) return { kind: "soon", at };
    return { kind: "later", at };
}

// ── Segments (cockpit tiles) ─────────────────────────────────────────────────

export type SegmentId = "all" | "absent" | "overdue" | "today" | "fresh" | "hot" | "enrich";

export interface QueueContext {
    callbackCodes: Set<string>;
    toneOf: (code: string) => OutcomeTone;
    now: number;
}

export function matchesSegment(row: QueueItem, segment: SegmentId, ctx: QueueContext): boolean {
    switch (segment) {
        case "all":
            return true;
        case "absent":
            return row.priority === "ABSENT_RDV";
        case "overdue":
            return callbackState(row, ctx.callbackCodes, ctx.now)?.kind === "overdue";
        case "today":
            return callbackState(row, ctx.callbackCodes, ctx.now)?.kind === "today";
        case "fresh":
            return !row.lastAction;
        case "hot":
            return !!row.lastAction && ctx.toneOf(row.lastAction.result) === "positive";
        case "enrich":
            return row.hasContactInfo === false;
    }
}

export const SEGMENT_IDS: SegmentId[] = ["all", "absent", "overdue", "today", "fresh", "hot", "enrich"];

export function computeSegmentCounts(items: QueueItem[], ctx: QueueContext): Record<SegmentId, number> {
    const counts = Object.fromEntries(SEGMENT_IDS.map((id) => [id, 0])) as Record<SegmentId, number>;
    for (const row of items) {
        for (const id of SEGMENT_IDS) {
            if (matchesSegment(row, id, ctx)) counts[id] += 1;
        }
    }
    return counts;
}

// ── Filters & sorting ────────────────────────────────────────────────────────

export type TargetType = "all" | "contact" | "company";
export type SortId = "priority" | "callback" | "stale" | "name";

export interface QueueFilters {
    segment: SegmentId;
    type: TargetType;
    /** "" = any, "NONE" = never contacted, otherwise a result code. */
    status: string;
    channel: string;
    sort: SortId;
    hideDone: boolean;
}

export const DEFAULT_FILTERS: QueueFilters = {
    segment: "all",
    type: "contact",
    status: "",
    channel: "",
    sort: "priority",
    hideDone: false,
};

/** Filters that narrow the list (sort and the default target type don't count). */
export function countActiveFilters(f: QueueFilters): number {
    let n = 0;
    if (f.segment !== DEFAULT_FILTERS.segment) n++;
    if (f.type !== DEFAULT_FILTERS.type) n++;
    if (f.status) n++;
    if (f.channel) n++;
    if (f.hideDone) n++;
    return n;
}

/** Type + channel only: the population the segment tiles count over. */
export function scopeItems(items: QueueItem[], f: Pick<QueueFilters, "type" | "channel">): QueueItem[] {
    return items.filter((row) => {
        if (f.type === "contact" && !row.contactId) return false;
        if (f.type === "company" && row.contactId) return false;
        if (f.channel && row.channel !== f.channel) return false;
        return true;
    });
}

export function statusCounts(items: QueueItem[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const row of items) {
        const key = row.lastAction?.result ?? "NONE";
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

export function applyQueueView(
    items: QueueItem[],
    f: QueueFilters,
    ctx: QueueContext,
    done: Map<string, DoneEntry>,
): QueueItem[] {
    const filtered = scopeItems(items, f).filter((row) => {
        if (!matchesSegment(row, f.segment, ctx)) return false;
        if (f.status === "NONE" && row.lastAction) return false;
        if (f.status && f.status !== "NONE" && row.lastAction?.result !== f.status) return false;
        if (f.hideDone && done.has(rowKey(row))) return false;
        return true;
    });
    return sortQueue(filtered, f.sort, ctx);
}

export function sortQueue(items: QueueItem[], sort: SortId, ctx: QueueContext): QueueItem[] {
    if (sort === "priority") return items; // server order already encodes priority
    const indexed = items.map((row, index) => ({ row, index }));
    const byIndex = (a: { index: number }, b: { index: number }) => a.index - b.index;
    if (sort === "callback") {
        indexed.sort((a, b) => {
            const ca = callbackState(a.row, ctx.callbackCodes, ctx.now)?.at ?? Infinity;
            const cb = callbackState(b.row, ctx.callbackCodes, ctx.now)?.at ?? Infinity;
            return ca - cb || byIndex(a, b);
        });
    } else if (sort === "stale") {
        const touched = (row: QueueItem) => {
            const t = row.lastAction?.createdAt ? new Date(row.lastAction.createdAt).getTime() : NaN;
            return Number.isFinite(t) ? t : -Infinity; // never contacted first
        };
        indexed.sort((a, b) => touched(a.row) - touched(b.row) || byIndex(a, b));
    } else {
        indexed.sort((a, b) => displayName(a.row).localeCompare(displayName(b.row), "fr", { sensitivity: "base" }) || byIndex(a, b));
    }
    return indexed.map((x) => x.row);
}

// ── Time labels ──────────────────────────────────────────────────────────────

const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

function startOfDay(ms: number): number {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

/** Short French relative label: "à l'instant", "il y a 5 min", "demain 14:00", "dans 3 j", "12 oct.". */
export function formatRelative(at: number, now: number): string {
    const diff = at - now;
    const abs = Math.abs(diff);
    if (abs < 60_000) return "à l'instant";
    if (abs < 60 * 60_000) {
        const min = Math.round(abs / 60_000);
        return diff < 0 ? `il y a ${min} min` : `dans ${min} min`;
    }
    const dayDelta = Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS);
    if (dayDelta === 0) return `aujourd'hui ${timeFmt.format(at)}`;
    if (dayDelta === 1) return `demain ${timeFmt.format(at)}`;
    if (dayDelta === -1) return `hier ${timeFmt.format(at)}`;
    if (Math.abs(dayDelta) < 7) return dayDelta < 0 ? `il y a ${-dayDelta} j` : `dans ${dayDelta} j`;
    return dateFmt.format(at);
}

/** Format a Date for a datetime-local input, in local time (YYYY-MM-DDTHH:mm). */
export function toLocalDateTimeInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** One-tap callback slots so the SDR never opens a date picker mid-call. */
export const CALLBACK_QUICK_PICKS: { id: string; label: string; compute: (now: Date) => Date }[] = [
    { id: "1h", label: "Dans 1h", compute: (now) => new Date(now.getTime() + 60 * 60 * 1000) },
    { id: "tomorrow-9", label: "Demain 9h", compute: (now) => atHour(addDays(now, 1), 9) },
    { id: "tomorrow-14", label: "Demain 14h", compute: (now) => atHour(addDays(now, 1), 14) },
    { id: "in-2-days", label: "Dans 2 jours", compute: (now) => atHour(addDays(now, 2), 9) },
    { id: "monday", label: "Lundi 9h", compute: (now) => atHour(addDays(now, ((8 - now.getDay()) % 7) || 7), 9) },
];

function addDays(d: Date, days: number): Date {
    const next = new Date(d);
    next.setDate(next.getDate() + days);
    return next;
}

function atHour(d: Date, hour: number): Date {
    const next = new Date(d);
    next.setHours(hour, 0, 0, 0);
    return next;
}
