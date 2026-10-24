// ============================================
// BILLING SCHEDULE — pure date engine (« Échéancier »)
// Each client is billed monthly from the day of its first call (the anchor).
// Cycle n starts on anchor + n months, clamped to the end of shorter months and
// always counted from the anchor (31 Jan → 28/29 Feb → 31 Mar). The invoice for
// a cycle is due `leadDays` (14) before it starts; a cycle still unbilled or
// unpaid once it has started is late, the first cycle after a grace period.
//
// Invoices are issued outside the CRM (Dougs): the manager only ticks
// "facturé" / "payé" per cycle, stored in SystemConfig (schedule-store.ts).
// Nothing here reads Invoice or Engagement rows.
//
// Every date is a calendar day "YYYY-MM-DD" (Paris), never an instant.
// ============================================

import { z } from "zod";

// ============================================
// DAY ARITHMETIC
// ============================================

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidDay(value: unknown): value is string {
    if (typeof value !== "string") return false;
    const m = DAY_RE.exec(value);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function isMonthKey(value: unknown): value is string {
    return typeof value === "string" && MONTH_KEY_RE.test(value);
}

function parts(day: string): [number, number, number] {
    const m = DAY_RE.exec(day);
    if (!m) throw new Error(`Invalid day "${day}" (expected YYYY-MM-DD)`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function format(y: number, mo: number, d: number): string {
    return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** month is 1-12 */
export function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(day: string, n: number): string {
    const [y, mo, d] = parts(day);
    const t = new Date(Date.UTC(y, mo - 1, d) + n * DAY_MS);
    return format(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** anchor + n months; the day is clamped to the target month's length. */
export function addMonthsClamped(anchor: string, n: number): string {
    const [y, mo, d] = parts(anchor);
    const zeroBased = mo - 1 + n;
    const year = y + Math.floor(zeroBased / 12);
    const month = (((zeroBased % 12) + 12) % 12) + 1;
    return format(year, month, Math.min(d, daysInMonth(year, month)));
}

/** "YYYY-MM" of a day: the key of the cycle starting that day. */
export function monthKey(day: string): string {
    return day.slice(0, 7);
}

// ============================================
// STORED STATE
// ============================================

/** What the manager ticked on one row. Dates are days, `*By` are user ids. */
export interface Tick {
    invoicedAt?: string;
    invoicedBy?: string;
    paidAt?: string;
    paidBy?: string;
    /** Montant HT, euros */
    amount?: number;
    /** Invoice number in the accounting tool (Dougs, Indy…) */
    reference?: string;
    note?: string;
}

export interface ClientScheduleState {
    /** Replaces the first-call day as the anchor. */
    anchorOverride?: string;
    disabled?: boolean;
    note?: string;
    setup?: Tick;
    /** Keyed by the month the cycle starts in, "YYYY-MM". */
    cycles: Record<string, Tick>;
}

export interface ScheduleSettings {
    /** Cycles starting before this day are not tracked (unless ticked). null = track everything. */
    trackFrom: string | null;
    leadDays: number;
    firstCycleGraceDays: number;
}

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
    trackFrom: "2026-11-01",
    leadDays: 14,
    firstCycleGraceDays: 7,
};

export function emptyClientState(): ClientScheduleState {
    return { cycles: {} };
}

const daySchema = z.string().refine(isValidDay, "Date attendue au format AAAA-MM-JJ");

const tickSchema = z.object({
    invoicedAt: daySchema.optional(),
    invoicedBy: z.string().optional(),
    paidAt: daySchema.optional(),
    paidBy: z.string().optional(),
    amount: z.number().finite().nonnegative().optional(),
    reference: z.string().optional(),
    note: z.string().optional(),
});

const clientStateSchema = z.object({
    anchorOverride: daySchema.optional(),
    disabled: z.boolean().optional(),
    note: z.string().optional(),
    setup: tickSchema.optional(),
    cycles: z.record(z.string().regex(MONTH_KEY_RE), tickSchema).default({}),
});

const settingsSchema = z.object({
    trackFrom: daySchema.nullable().default(DEFAULT_SCHEDULE_SETTINGS.trackFrom),
    leadDays: z.number().int().min(0).max(90).default(DEFAULT_SCHEDULE_SETTINGS.leadDays),
    firstCycleGraceDays: z.number().int().min(0).max(90).default(DEFAULT_SCHEDULE_SETTINGS.firstCycleGraceDays),
});

function parseJson(raw: string | null | undefined): unknown {
    if (raw == null || raw === "") return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        return Symbol.for("unparsable");
    }
}

/** Stored settings, or the defaults when missing or unreadable (with a warning). */
export function parseScheduleSettings(raw: string | null | undefined): ScheduleSettings {
    const json = parseJson(raw);
    if (json === undefined) return { ...DEFAULT_SCHEDULE_SETTINGS };
    const parsed = settingsSchema.safeParse(json);
    if (!parsed.success) {
        console.warn("[billing-schedule] settings unreadable, using defaults", raw);
        return { ...DEFAULT_SCHEDULE_SETTINGS };
    }
    return parsed.data;
}

/** A client's stored state, or an empty one when missing or unreadable (with a warning). */
export function parseClientState(raw: string | null | undefined): ClientScheduleState {
    const json = parseJson(raw);
    if (json === undefined) return emptyClientState();
    const parsed = clientStateSchema.safeParse(json);
    if (!parsed.success) {
        console.warn("[billing-schedule] client state unreadable, using an empty one", raw);
        return emptyClientState();
    }
    return parsed.data;
}

// ============================================
// SCHEDULE
// ============================================

export type CycleStatus = "UPCOMING" | "TO_INVOICE" | "INVOICED" | "PAID" | "LATE";
export type SetupStatus = "SETUP_TO_INVOICE" | "SETUP_INVOICED" | "SETUP_PAID";
export type RowStatus = CycleStatus | SetupStatus;
export type LateReason = "NOT_INVOICED" | "UNPAID";

export const SETUP_KEY = "setup";

export interface ScheduleRow {
    /** "YYYY-MM" for a cycle, "setup" for the setup fee */
    key: string;
    kind: "CYCLE" | "SETUP";
    /** 0 = first cycle; -1 for setup */
    index: number;
    /** false for a cycle before `trackFrom` with nothing ticked: shown for context, never late */
    tracked: boolean;
    cycleStart: string | null;
    cycleEnd: string | null;
    /** Day from which the invoice is due (cycleStart − leadDays) */
    invoiceFrom: string | null;
    /** Day from which an unbilled / unpaid cycle is late */
    lateFrom: string | null;
    status: RowStatus;
    lateReason?: LateReason;
    tick?: Tick;
}

export type ClientHeadline = "DISABLED" | "NO_ANCHOR" | RowStatus;

export interface ClientSchedule {
    anchor: string | null;
    anchorSource: "FIRST_CALL" | "OVERRIDE" | null;
    disabled: boolean;
    /** Oldest first: tracked cycles whose invoice is due, the next upcoming cycle, the setup row first if any. */
    rows: ScheduleRow[];
    /** Cycle containing today */
    current: ScheduleRow | null;
    /** First cycle starting after today */
    next: ScheduleRow | null;
    /** Ticks stored under a month that is no longer a cycle start (anchor changed). */
    orphans: Array<{ key: string; tick: Tick }>;
    /** Rows waiting on the manager: to invoice, invoiced and unpaid, late. Empty when disabled. */
    open: ScheduleRow[];
    /** Worst status, for the list view. */
    headline: ClientHeadline;
}

export interface ClientScheduleInput {
    firstCallDay: string | null;
    hasActiveMission: boolean;
    state: ClientScheduleState;
}

/** Safety stop: a schedule never builds more than this many cycles. */
const MAX_CYCLES = 600;

const OPEN_STATUSES = new Set<RowStatus>(["TO_INVOICE", "INVOICED", "LATE", "SETUP_TO_INVOICE", "SETUP_INVOICED"]);

// Lower = worse, for the headline.
const SEVERITY: Record<RowStatus, number> = {
    LATE: 0,
    SETUP_TO_INVOICE: 1,
    TO_INVOICE: 1,
    SETUP_INVOICED: 2,
    INVOICED: 2,
    UPCOMING: 3,
    SETUP_PAID: 4,
    PAID: 4,
};

export function isOpenStatus(status: RowStatus): boolean {
    return OPEN_STATUSES.has(status);
}

/** Needs an invoice or a late follow-up: what the home « Facturation » block lists. */
export function isActionStatus(status: RowStatus): status is "SETUP_TO_INVOICE" | "TO_INVOICE" | "LATE" {
    return status === "SETUP_TO_INVOICE" || status === "TO_INVOICE" || status === "LATE";
}

function hasTick(tick: Tick | undefined): tick is Tick {
    return !!tick && Object.keys(tick).length > 0;
}

export function cycleStatus(
    row: { invoiceFrom: string; lateFrom: string },
    tick: Tick | undefined,
    today: string,
): { status: CycleStatus; lateReason?: LateReason } {
    if (tick?.paidAt) return { status: "PAID" };
    if (today >= row.lateFrom) return { status: "LATE", lateReason: tick?.invoicedAt ? "UNPAID" : "NOT_INVOICED" };
    if (tick?.invoicedAt) return { status: "INVOICED" };
    if (today >= row.invoiceFrom) return { status: "TO_INVOICE" };
    return { status: "UPCOMING" };
}

export function setupStatus(tick: Tick | undefined): SetupStatus {
    if (tick?.paidAt) return "SETUP_PAID";
    if (tick?.invoicedAt) return "SETUP_INVOICED";
    return "SETUP_TO_INVOICE";
}

export function buildClientSchedule(
    input: ClientScheduleInput,
    settings: ScheduleSettings,
    today: string,
): ClientSchedule {
    const { state } = input;
    const override = state.anchorOverride && isValidDay(state.anchorOverride) ? state.anchorOverride : null;
    const anchor = override ?? input.firstCallDay;
    const anchorSource = override ? "OVERRIDE" : input.firstCallDay ? "FIRST_CALL" : null;
    const disabled = !!state.disabled;
    const rows: ScheduleRow[] = [];

    // Setup fee: billed once the client has an active mission, before any call.
    if ((!anchor && input.hasActiveMission) || hasTick(state.setup)) {
        rows.push({
            key: SETUP_KEY,
            kind: "SETUP",
            index: -1,
            tracked: true,
            cycleStart: null,
            cycleEnd: null,
            invoiceFrom: null,
            lateFrom: null,
            status: setupStatus(state.setup),
            ...(hasTick(state.setup) ? { tick: state.setup } : {}),
        });
    }

    let current: ScheduleRow | null = null;
    let next: ScheduleRow | null = null;
    const usedKeys = new Set<string>();

    if (anchor) {
        for (let i = 0; i < MAX_CYCLES; i++) {
            const cycleStart = addMonthsClamped(anchor, i);
            const invoiceFrom = addDays(cycleStart, -settings.leadDays);
            const key = monthKey(cycleStart);
            const tick = state.cycles[key];
            const ticked = hasTick(tick);
            const due = invoiceFrom <= today;
            const tracked = settings.trackFrom === null || cycleStart >= settings.trackFrom || ticked;

            const cycleEnd = addDays(addMonthsClamped(anchor, i + 1), -1);
            const lateFrom = i === 0 ? addDays(cycleStart, settings.firstCycleGraceDays) : cycleStart;
            const row: ScheduleRow = {
                key,
                kind: "CYCLE",
                index: i,
                tracked,
                cycleStart,
                cycleEnd,
                invoiceFrom,
                lateFrom,
                ...cycleStatus({ invoiceFrom, lateFrom }, tick, today),
                ...(ticked ? { tick } : {}),
            };
            usedKeys.add(key);

            if (cycleStart <= today && today <= cycleEnd) current = row;
            if (cycleStart > today && !next) next = row;

            if (tracked) rows.push(row);
            // Every due cycle, then the first tracked one not due yet.
            if (tracked && !due) break;
        }
    }

    const orphans = Object.entries(state.cycles)
        .filter(([key, tick]) => !usedKeys.has(key) && hasTick(tick))
        .map(([key, tick]) => ({ key, tick }))
        .sort((a, b) => a.key.localeCompare(b.key));

    const open = disabled ? [] : rows.filter((r) => isOpenStatus(r.status));

    let headline: ClientHeadline;
    if (disabled) headline = "DISABLED";
    else if (rows.length === 0) headline = "NO_ANCHOR";
    else headline = rows.reduce((worst, r) => (SEVERITY[r.status] < SEVERITY[worst.status] ? r : worst)).status;

    return { anchor, anchorSource, disabled, rows, current, next, orphans, open, headline };
}

export interface BillingTodayItem {
    clientId: string;
    clientName: string;
    key: string;
    status: "SETUP_TO_INVOICE" | "TO_INVOICE" | "LATE";
    lateReason?: LateReason;
    /** null for the setup row */
    cycleStart: string | null;
}

/** Rows to invoice or chase today, late ones first, then by cycle start. Disabled clients are skipped. */
export function collectTodayItems(
    clients: Array<{ clientId: string; clientName: string; schedule: ClientSchedule }>,
): BillingTodayItem[] {
    const items: BillingTodayItem[] = [];
    for (const { clientId, clientName, schedule } of clients) {
        if (schedule.disabled) continue;
        for (const row of schedule.open) {
            if (!isActionStatus(row.status)) continue;
            items.push({
                clientId,
                clientName,
                key: row.key,
                status: row.status,
                ...(row.lateReason ? { lateReason: row.lateReason } : {}),
                cycleStart: row.cycleStart,
            });
        }
    }
    const rank = (s: BillingTodayItem["status"]) => (s === "LATE" ? 0 : 1);
    return items.sort(
        (a, b) =>
            rank(a.status) - rank(b.status) ||
            (a.cycleStart ?? "").localeCompare(b.cycleStart ?? "") ||
            a.clientName.localeCompare(b.clientName, "fr"),
    );
}

// ============================================
// TICK UPDATES
// ============================================

export type RowAction = "invoice" | "pay" | "unmark-invoice" | "unmark-pay";

export interface RowActionInput {
    action: RowAction;
    /** Day of the invoice / payment; defaults to today */
    date?: string;
    amount?: number | null;
    reference?: string | null;
    note?: string | null;
    userId: string;
    today: string;
}

function cleanTick(tick: Tick): Tick | undefined {
    const out: Tick = {};
    for (const [k, v] of Object.entries(tick) as Array<[keyof Tick, Tick[keyof Tick]]>) {
        if (v !== undefined && v !== null && v !== "") (out as Record<string, unknown>)[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Applies a manager action to a row's tick. Paying an unbilled row also marks
 * it invoiced the same day; un-invoicing clears the payment and the invoice
 * details (amount, reference). Returns undefined when nothing is left.
 */
export function applyRowAction(tick: Tick | undefined, input: RowActionInput): Tick | undefined {
    const date = input.date ?? input.today;
    const next: Tick = { ...(tick ?? {}) };
    const details = () => {
        if (input.amount !== undefined) next.amount = input.amount ?? undefined;
        if (input.reference !== undefined) next.reference = input.reference?.trim() || undefined;
        if (input.note !== undefined) next.note = input.note?.trim() || undefined;
    };

    switch (input.action) {
        case "invoice":
            next.invoicedAt = date;
            next.invoicedBy = input.userId;
            details();
            break;
        case "pay":
            if (!next.invoicedAt) {
                next.invoicedAt = date;
                next.invoicedBy = input.userId;
            }
            next.paidAt = date;
            next.paidBy = input.userId;
            details();
            break;
        case "unmark-invoice":
            delete next.invoicedAt;
            delete next.invoicedBy;
            delete next.paidAt;
            delete next.paidBy;
            delete next.amount;
            delete next.reference;
            break;
        case "unmark-pay":
            delete next.paidAt;
            delete next.paidBy;
            break;
    }
    return cleanTick(next);
}

/** Returns a new state with the row's tick replaced (or removed). */
export function withRowTick(state: ClientScheduleState, key: string, tick: Tick | undefined): ClientScheduleState {
    if (key === SETUP_KEY) {
        const rest: ClientScheduleState = { ...state };
        delete rest.setup;
        return tick ? { ...rest, setup: tick } : rest;
    }
    const cycles = { ...state.cycles };
    if (tick) cycles[key] = tick;
    else delete cycles[key];
    return { ...state, cycles };
}
