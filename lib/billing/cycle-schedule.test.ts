/**
 * Pure rules of the billing schedule (« Échéancier »):
 *     npm run test:billing-schedule
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    addDays,
    addMonthsClamped,
    applyRowAction,
    buildClientSchedule,
    collectTodayItems,
    cycleStatus,
    DEFAULT_SCHEDULE_SETTINGS,
    emptyClientState,
    isValidDay,
    parseClientState,
    parseScheduleSettings,
    withRowTick,
    type ClientScheduleState,
    type ScheduleSettings,
} from "./cycle-schedule";
import { parisDay } from "../clients/first-call";

const ALL: ScheduleSettings = { trackFrom: null, leadDays: 14, firstCycleGraceDays: 7 };

function schedule(
    opts: { firstCallDay?: string | null; hasActiveMission?: boolean; state?: Partial<ClientScheduleState> },
    today: string,
    settings: ScheduleSettings = ALL,
) {
    return buildClientSchedule(
        {
            firstCallDay: opts.firstCallDay ?? null,
            hasActiveMission: opts.hasActiveMission ?? true,
            state: { cycles: {}, ...opts.state },
        },
        settings,
        today,
    );
}

/** Status of the cycle starting in `key` for the given day. */
function statusOn(firstCallDay: string, key: string, today: string, state?: Partial<ClientScheduleState>) {
    const row = schedule({ firstCallDay, state }, today).rows.find((r) => r.key === key);
    return row ? { status: row.status, lateReason: row.lateReason } : undefined;
}

// ============================================
// Day arithmetic and anchors
// ============================================

test("anchor on the 31st: 28 Feb, then back to 31 Mar (always counted from the anchor)", () => {
    assert.equal(addMonthsClamped("2027-01-31", 1), "2027-02-28");
    assert.equal(addMonthsClamped("2027-01-31", 2), "2027-03-31");
    assert.equal(addMonthsClamped("2027-01-31", 3), "2027-04-30");
    assert.equal(addMonthsClamped("2027-01-31", 4), "2027-05-31");
    assert.equal(addMonthsClamped("2028-01-31", 1), "2028-02-29");
    assert.equal(addMonthsClamped("2026-12-31", 2), "2027-02-28");
});

test("anchor on the 30th: 28 Feb, then the 30th again", () => {
    assert.equal(addMonthsClamped("2027-01-30", 1), "2027-02-28");
    assert.equal(addMonthsClamped("2027-01-30", 2), "2027-03-30");
    assert.equal(addMonthsClamped("2027-01-30", 13), "2028-02-29");
});

test("anchor on 29 Feb 2028: the 29th every month, 28 Feb in non-leap years", () => {
    assert.equal(addMonthsClamped("2028-02-29", 1), "2028-03-29");
    assert.equal(addMonthsClamped("2028-02-29", 12), "2029-02-28");
    assert.equal(addMonthsClamped("2028-02-29", 13), "2029-03-29");
    assert.equal(addMonthsClamped("2028-02-29", 48), "2032-02-29");
    assert.equal(addMonthsClamped("2028-02-29", -1), "2028-01-29");
});

test("cycles of a 31st anchor end the day before the next start, keys are unique months", () => {
    const s = schedule({ firstCallDay: "2027-01-31" }, "2027-05-02");
    const cycles = s.rows.map((r) => [r.key, r.cycleStart, r.cycleEnd]);
    assert.deepEqual(cycles, [
        ["2027-01", "2027-01-31", "2027-02-27"],
        ["2027-02", "2027-02-28", "2027-03-30"],
        ["2027-03", "2027-03-31", "2027-04-29"],
        ["2027-04", "2027-04-30", "2027-05-30"],
        ["2027-05", "2027-05-31", "2027-06-29"],
    ]);
});

test("J−14 crosses the year end", () => {
    assert.equal(addDays("2027-01-05", -14), "2026-12-22");
    const s = schedule({ firstCallDay: "2026-12-10" }, "2026-12-27");
    const jan = s.rows.find((r) => r.key === "2027-01");
    assert.equal(jan?.cycleStart, "2027-01-10");
    assert.equal(jan?.invoiceFrom, "2026-12-27");
    assert.equal(jan?.status, "TO_INVOICE");
    assert.equal(s.next?.key, "2027-01");
});

test("isValidDay rejects impossible dates", () => {
    assert.ok(isValidDay("2028-02-29"));
    assert.ok(!isValidDay("2027-02-29"));
    assert.ok(!isValidDay("2027-13-01"));
    assert.ok(!isValidDay("2027-1-01"));
    assert.ok(!isValidDay(null));
});

// ============================================
// Status boundaries (cycle ≥ 1: starts 2027-03-10, invoice from 2027-02-24)
// ============================================

const A = "2027-01-10";

test("before J−14: UPCOMING; from J−14: TO_INVOICE", () => {
    assert.deepEqual(statusOn(A, "2027-03", "2027-02-23"), { status: "UPCOMING", lateReason: undefined });
    assert.deepEqual(statusOn(A, "2027-03", "2027-02-24"), { status: "TO_INVOICE", lateReason: undefined });
    assert.deepEqual(statusOn(A, "2027-03", "2027-03-09"), { status: "TO_INVOICE", lateReason: undefined });
});

test("not invoiced on the cycle's first day: LATE (NOT_INVOICED)", () => {
    assert.deepEqual(statusOn(A, "2027-03", "2027-03-10"), { status: "LATE", lateReason: "NOT_INVOICED" });
});

test("invoiced: INVOICED until the cycle starts, then LATE (UNPAID); paid: PAID", () => {
    const invoiced = { cycles: { "2027-03": { invoicedAt: "2027-02-25" } } };
    assert.deepEqual(statusOn(A, "2027-03", "2027-03-09", invoiced), { status: "INVOICED", lateReason: undefined });
    assert.deepEqual(statusOn(A, "2027-03", "2027-03-10", invoiced), { status: "LATE", lateReason: "UNPAID" });
    const paid = { cycles: { "2027-03": { invoicedAt: "2027-02-25", paidAt: "2027-03-20" } } };
    assert.deepEqual(statusOn(A, "2027-03", "2027-04-30", paid), { status: "PAID", lateReason: undefined });
});

test("cycleStatus: a payment wins over everything", () => {
    const row = { invoiceFrom: "2027-02-24", lateFrom: "2027-03-10" };
    assert.equal(cycleStatus(row, { paidAt: "2027-01-01" }, "2027-01-01").status, "PAID");
});

// ============================================
// First-cycle grace
// ============================================

test("first cycle: due at once, late only after 7 days of grace", () => {
    assert.deepEqual(statusOn(A, "2027-01", "2027-01-10"), { status: "TO_INVOICE", lateReason: undefined });
    assert.deepEqual(statusOn(A, "2027-01", "2027-01-16"), { status: "TO_INVOICE", lateReason: undefined });
    assert.deepEqual(statusOn(A, "2027-01", "2027-01-17"), { status: "LATE", lateReason: "NOT_INVOICED" });
    const invoiced = { cycles: { "2027-01": { invoicedAt: "2027-01-12" } } };
    assert.deepEqual(statusOn(A, "2027-01", "2027-01-16", invoiced), { status: "INVOICED", lateReason: undefined });
    assert.deepEqual(statusOn(A, "2027-01", "2027-01-17", invoiced), { status: "LATE", lateReason: "UNPAID" });
});

test("grace is a setting", () => {
    const s = schedule({ firstCallDay: A }, "2027-01-11", { ...ALL, firstCycleGraceDays: 0 });
    assert.equal(s.rows[0].status, "LATE");
});

// ============================================
// Rows kept, current / next
// ============================================

test("rows: every due cycle, then the next upcoming one; current and next", () => {
    const s = schedule({ firstCallDay: A }, "2027-02-20");
    assert.deepEqual(
        s.rows.map((r) => [r.key, r.status]),
        [
            ["2027-01", "LATE"],
            ["2027-02", "LATE"],
            ["2027-03", "UPCOMING"],
        ],
    );
    assert.equal(s.current?.key, "2027-02");
    assert.equal(s.next?.key, "2027-03");
    assert.equal(s.headline, "LATE");
    assert.deepEqual(s.open.map((r) => r.key), ["2027-01", "2027-02"]);
});

test("everything paid: headline PAID, nothing open", () => {
    const tick = { invoicedAt: "2027-01-10", paidAt: "2027-01-12" };
    const s = schedule({ firstCallDay: A, state: { cycles: { "2027-01": tick } } }, "2027-01-20");
    assert.equal(s.headline, "UPCOMING");
    assert.deepEqual(s.open, []);
    assert.equal(s.rows[0].status, "PAID");
});

// ============================================
// trackFrom
// ============================================

const TRACKED: ScheduleSettings = { ...ALL, trackFrom: "2026-11-01" };

test("trackFrom: an old client only shows cycles starting on or after it", () => {
    const s = schedule({ firstCallDay: "2026-03-10" }, "2026-10-24", TRACKED);
    assert.deepEqual(s.rows.map((r) => [r.key, r.status]), [["2026-11", "UPCOMING"]]);
    assert.equal(s.headline, "UPCOMING");
    // The running cycle is still known, flagged untracked.
    assert.equal(s.current?.key, "2026-10");
    assert.equal(s.current?.tracked, false);
});

test("trackFrom: the first tracked cycle turns TO_INVOICE at J−14 even before trackFrom", () => {
    const s = schedule({ firstCallDay: "2026-03-05" }, "2026-10-24", TRACKED);
    assert.deepEqual(s.rows.map((r) => [r.key, r.status, r.invoiceFrom]), [
        ["2026-11", "TO_INVOICE", "2026-10-22"],
        ["2026-12", "UPCOMING", "2026-11-21"],
    ]);
});

test("trackFrom: a ticked cycle before it stays visible", () => {
    const state = { cycles: { "2026-09": { invoicedAt: "2026-09-01" } } };
    const s = schedule({ firstCallDay: "2026-03-10", state }, "2026-10-24", TRACKED);
    assert.deepEqual(s.rows.map((r) => [r.key, r.status, r.lateReason]), [
        ["2026-09", "LATE", "UNPAID"],
        ["2026-11", "UPCOMING", undefined],
    ]);
});

test("trackFrom null tracks every cycle since the first call", () => {
    const s = schedule({ firstCallDay: "2026-03-10" }, "2026-10-24", ALL);
    assert.equal(s.rows[0].key, "2026-03");
    assert.equal(s.rows.length, 9); // March → November
});

// ============================================
// Anchor override, disabled tracking
// ============================================

test("anchor override replaces the first call; old ticks become orphans", () => {
    const state = { anchorOverride: "2026-11-15", cycles: { "2026-10": { invoicedAt: "2026-10-01" } } };
    const s = schedule({ firstCallDay: "2026-10-03", state }, "2026-11-20", ALL);
    assert.equal(s.anchor, "2026-11-15");
    assert.equal(s.anchorSource, "OVERRIDE");
    assert.equal(s.rows[0].key, "2026-11");
    assert.equal(s.rows[0].cycleStart, "2026-11-15");
    assert.deepEqual(s.orphans, [{ key: "2026-10", tick: { invoicedAt: "2026-10-01" } }]);
});

test("anchor override in the future: only the first cycle, upcoming", () => {
    const s = schedule({ firstCallDay: null, state: { anchorOverride: "2027-03-01" } }, "2027-01-10");
    assert.deepEqual(s.rows.map((r) => [r.key, r.status]), [["2027-03", "UPCOMING"]]);
    assert.equal(s.current, null);
    assert.equal(s.next?.key, "2027-03");
});

test("disabled tracking: rows kept for history, nothing open, headline DISABLED", () => {
    const s = schedule({ firstCallDay: A, state: { disabled: true } }, "2027-03-20");
    assert.equal(s.disabled, true);
    assert.equal(s.headline, "DISABLED");
    assert.deepEqual(s.open, []);
    assert.ok(s.rows.length > 0);
    assert.deepEqual(collectTodayItems([{ clientId: "c", clientName: "C", schedule: s }]), []);
});

// ============================================
// Setup row
// ============================================

test("setup: active mission and no call yet → SETUP_TO_INVOICE", () => {
    const s = schedule({ firstCallDay: null, hasActiveMission: true }, "2027-01-10");
    assert.deepEqual(s.rows.map((r) => [r.key, r.status]), [["setup", "SETUP_TO_INVOICE"]]);
    assert.equal(s.headline, "SETUP_TO_INVOICE");
});

test("setup: no active mission and no call → nothing to bill", () => {
    const s = schedule({ firstCallDay: null, hasActiveMission: false }, "2027-01-10");
    assert.deepEqual(s.rows, []);
    assert.equal(s.headline, "NO_ANCHOR");
});

test("setup: invoiced, then paid", () => {
    const invoiced = schedule({ state: { setup: { invoicedAt: "2027-01-02" } } }, "2027-01-10");
    assert.equal(invoiced.rows[0].status, "SETUP_INVOICED");
    const paid = schedule({ state: { setup: { invoicedAt: "2027-01-02", paidAt: "2027-01-05" } } }, "2027-01-10");
    assert.equal(paid.rows[0].status, "SETUP_PAID");
    assert.deepEqual(paid.open, []);
});

test("setup: once the first call happened, an untouched setup row disappears, a ticked one stays", () => {
    const untouched = schedule({ firstCallDay: A }, "2027-01-12");
    assert.ok(!untouched.rows.some((r) => r.kind === "SETUP"));
    const ticked = schedule({ firstCallDay: A, state: { setup: { invoicedAt: "2027-01-02" } } }, "2027-01-12");
    assert.deepEqual(ticked.rows.map((r) => [r.key, r.status]), [
        ["setup", "SETUP_INVOICED"],
        ["2027-01", "TO_INVOICE"],
        ["2027-02", "UPCOMING"],
    ]);
});

// ============================================
// Today items
// ============================================

test("today items: late first, then to invoice; invoiced rows are not listed", () => {
    const late = schedule({ firstCallDay: "2027-01-01" }, "2027-01-20");
    const toInvoice = schedule({ firstCallDay: "2027-01-15" }, "2027-01-20");
    const setup = schedule({ firstCallDay: null }, "2027-01-20");
    const invoiced = schedule({ firstCallDay: "2027-01-18", state: { cycles: { "2027-01": { invoicedAt: "2027-01-18" } } } }, "2027-01-20");
    const items = collectTodayItems([
        { clientId: "b", clientName: "Beta", schedule: toInvoice },
        { clientId: "s", clientName: "Setup", schedule: setup },
        { clientId: "i", clientName: "Invoiced", schedule: invoiced },
        { clientId: "a", clientName: "Alpha", schedule: late },
    ]);
    assert.deepEqual(items, [
        { clientId: "a", clientName: "Alpha", key: "2027-01", status: "LATE", lateReason: "NOT_INVOICED", cycleStart: "2027-01-01" },
        { clientId: "s", clientName: "Setup", key: "setup", status: "SETUP_TO_INVOICE", cycleStart: null },
        { clientId: "b", clientName: "Beta", key: "2027-01", status: "TO_INVOICE", cycleStart: "2027-01-15" },
        // Alpha's February cycle is due from 18 Jan (J−14).
        { clientId: "a", clientName: "Alpha", key: "2027-02", status: "TO_INVOICE", cycleStart: "2027-02-01" },
    ]);
});

// ============================================
// Row actions and stored state
// ============================================

test("pay without an invoice marks both; unmark-invoice clears payment and details", () => {
    const base = { userId: "u1", today: "2027-01-20" };
    const paid = applyRowAction(undefined, { ...base, action: "pay", date: "2027-01-18" });
    assert.deepEqual(paid, { invoicedAt: "2027-01-18", invoicedBy: "u1", paidAt: "2027-01-18", paidBy: "u1" });

    const invoiced = applyRowAction(undefined, { ...base, action: "invoice", amount: 1500, reference: " F-2027-001 ", note: "acompte" });
    assert.deepEqual(invoiced, { invoicedAt: "2027-01-20", invoicedBy: "u1", amount: 1500, reference: "F-2027-001", note: "acompte" });

    const unpaid = applyRowAction({ ...invoiced, paidAt: "2027-01-21", paidBy: "u1" }, { ...base, action: "unmark-pay" });
    assert.deepEqual(unpaid, invoiced);

    assert.deepEqual(applyRowAction(invoiced, { ...base, action: "unmark-invoice" }), { note: "acompte" });
    assert.equal(applyRowAction({ invoicedAt: "2027-01-20" }, { ...base, action: "unmark-invoice" }), undefined);
});

test("withRowTick sets and removes cycle and setup ticks without mutating", () => {
    const state = emptyClientState();
    const a = withRowTick(state, "2027-01", { invoicedAt: "2027-01-02" });
    assert.deepEqual(state, { cycles: {} });
    assert.deepEqual(a.cycles, { "2027-01": { invoicedAt: "2027-01-02" } });
    assert.deepEqual(withRowTick(a, "2027-01", undefined).cycles, {});
    const b = withRowTick(a, "setup", { paidAt: "2027-01-03" });
    assert.deepEqual(b.setup, { paidAt: "2027-01-03" });
    assert.equal(withRowTick(b, "setup", undefined).setup, undefined);
});

test("unreadable stored values fall back to defaults", () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
        assert.deepEqual(parseScheduleSettings(null), DEFAULT_SCHEDULE_SETTINGS);
        assert.deepEqual(parseScheduleSettings("{oops"), DEFAULT_SCHEDULE_SETTINGS);
        assert.deepEqual(parseScheduleSettings('{"leadDays":"x"}'), DEFAULT_SCHEDULE_SETTINGS);
        assert.deepEqual(parseScheduleSettings('{"leadDays":10}'), { ...DEFAULT_SCHEDULE_SETTINGS, leadDays: 10 });
        assert.deepEqual(parseScheduleSettings('{"trackFrom":null}'), { ...DEFAULT_SCHEDULE_SETTINGS, trackFrom: null });
        assert.deepEqual(parseClientState(undefined), { cycles: {} });
        assert.deepEqual(parseClientState("[]"), { cycles: {} });
        assert.deepEqual(parseClientState('{"cycles":{"2027-13":{}}}'), { cycles: {} });
        assert.deepEqual(parseClientState('{"disabled":true}'), { disabled: true, cycles: {} });
    } finally {
        console.warn = warn;
    }
});

// ============================================
// parisDay
// ============================================

test("parisDay: 31 Dec 22:30 UTC is still 31 Dec in Paris, 23:30 UTC is 1 Jan", () => {
    assert.equal(parisDay(new Date("2026-12-31T22:30:00Z")), "2026-12-31");
    assert.equal(parisDay(new Date("2026-12-31T23:30:00Z")), "2027-01-01");
    // Summer time (UTC+2)
    assert.equal(parisDay(new Date("2027-06-30T21:30:00Z")), "2027-06-30");
    assert.equal(parisDay(new Date("2027-06-30T22:30:00Z")), "2027-07-01");
});
