import { test } from "node:test";
import assert from "node:assert/strict";
import {
    applyQueueView,
    callbackState,
    computeSegmentCounts,
    countActiveFilters,
    DEFAULT_FILTERS,
    displayName,
    effectiveLastAction,
    formatRelative,
    initials,
    isRecentlyContacted,
    rowKey,
    type QueueContext,
} from "./queue-selectors";
import { buildCallbackCodes, toneForStatus } from "./status-ui";
import type { DoneEntry, QueueItem } from "./types";

// Local-time "now": Wednesday 1 Oct 2026, 10:00.
const NOW = new Date(2026, 9, 1, 10, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

const ctx: QueueContext = {
    callbackCodes: buildCallbackCodes([]),
    toneOf: (code) => toneForStatus(code),
    now: NOW,
};

function row(partial: Partial<QueueItem> & { id: string }): QueueItem {
    const { id, ...rest } = partial;
    return {
        contactId: id,
        companyId: `co-${id}`,
        contact: { id, firstName: "Jeanne", lastName: id, status: "ACTIONABLE" },
        company: { id: `co-${id}`, name: `Acme ${id}` },
        campaignId: "camp",
        channel: "CALL",
        missionName: "Mission",
        lastAction: null,
        priority: "NEW",
        hasContactInfo: true,
        ...rest,
    };
}

const fresh = row({ id: "fresh" });
const overdue = row({ id: "overdue", priority: "CALLBACK", lastAction: { result: "CALLBACK_REQUESTED", callbackDate: iso(NOW - 2 * HOUR), createdAt: iso(NOW - 2 * DAY) } });
const today = row({ id: "today", priority: "CALLBACK", lastAction: { result: "RAPPEL", callbackDate: iso(NOW + 3 * HOUR), createdAt: iso(NOW - 3 * DAY) } });
const later = row({ id: "later", priority: "CALLBACK", lastAction: { result: "RELANCE", callbackDate: iso(NOW + 10 * DAY), createdAt: iso(NOW - 40 * DAY) } });
const hot = row({ id: "hot", priority: "FOLLOW_UP", lastAction: { result: "INTERESTED", createdAt: iso(NOW - 5 * DAY) } });
const absent = row({ id: "absent", priority: "ABSENT_RDV", lastAction: { result: "MEETING_BOOKED", createdAt: iso(NOW - 9 * DAY) } });
const company = row({ id: "company", contactId: null, contact: null, hasContactInfo: false });
const all = [absent, overdue, today, hot, later, fresh, company];

test("identity helpers", () => {
    assert.equal(rowKey(fresh), "fresh");
    assert.equal(rowKey(company), "co-company");
    assert.equal(displayName(fresh), "Jeanne fresh");
    assert.equal(displayName(company), "Acme company");
    assert.equal(initials("Jeanne Martin Dupont"), "JD");
    assert.equal(initials("acme"), "AC");
});

test("callbackState buckets overdue / today / later and ignores non-callbacks", () => {
    assert.equal(callbackState(overdue, ctx.callbackCodes, NOW)?.kind, "overdue");
    assert.equal(callbackState(today, ctx.callbackCodes, NOW)?.kind, "today");
    assert.equal(callbackState(later, ctx.callbackCodes, NOW)?.kind, "later");
    assert.equal(callbackState(hot, ctx.callbackCodes, NOW), null);
    assert.equal(callbackState(fresh, ctx.callbackCodes, NOW), null);
});

test("configured callback statuses count as callbacks", () => {
    const codes = buildCallbackCodes([{ code: "A_RECONTACTER", label: "À recontacter", requiresNote: false, triggersCallback: true }]);
    const custom = row({ id: "custom", lastAction: { result: "A_RECONTACTER", callbackDate: iso(NOW - HOUR) } });
    assert.equal(callbackState(custom, codes, NOW)?.kind, "overdue");
});

test("segment counts", () => {
    const counts = computeSegmentCounts(all, ctx);
    assert.deepEqual(counts, { all: 7, absent: 1, overdue: 1, today: 1, fresh: 2, hot: 1, enrich: 1 });
});

test("default view keeps contacts only, in server order", () => {
    const view = applyQueueView(all, DEFAULT_FILTERS, ctx, new Map());
    assert.deepEqual(view.map(rowKey), ["absent", "overdue", "today", "hot", "later", "fresh"]);
});

test("segment + status + hideDone narrow the view", () => {
    const done = new Map<string, DoneEntry>([["today", { result: "NO_RESPONSE", at: NOW }]]);
    const base = { ...DEFAULT_FILTERS, type: "all" as const };
    assert.deepEqual(applyQueueView(all, { ...base, segment: "fresh" }, ctx, done).map(rowKey), ["fresh", "co-company"]);
    assert.deepEqual(applyQueueView(all, { ...base, status: "INTERESTED" }, ctx, done).map(rowKey), ["hot"]);
    assert.deepEqual(applyQueueView(all, { ...base, status: "NONE" }, ctx, done).map(rowKey), ["fresh", "co-company"]);
    assert.ok(!applyQueueView(all, { ...base, hideDone: true }, ctx, done).some((r) => rowKey(r) === "today"));
});

test("sorting by callback puts the soonest first and keeps the rest in server order", () => {
    const view = applyQueueView(all, { ...DEFAULT_FILTERS, sort: "callback" }, ctx, new Map());
    assert.deepEqual(view.map(rowKey), ["overdue", "today", "later", "absent", "hot", "fresh"]);
});

test("sorting by stale puts never-contacted first, then oldest touch", () => {
    const view = applyQueueView(all, { ...DEFAULT_FILTERS, sort: "stale" }, ctx, new Map());
    assert.deepEqual(view.map(rowKey), ["fresh", "later", "absent", "hot", "today", "overdue"]);
});

test("countActiveFilters ignores sort and the default target type", () => {
    assert.equal(countActiveFilters(DEFAULT_FILTERS), 0);
    assert.equal(countActiveFilters({ ...DEFAULT_FILTERS, sort: "name" }), 0);
    assert.equal(countActiveFilters({ ...DEFAULT_FILTERS, segment: "hot", status: "NONE", hideDone: true }), 3);
});

test("already-contacted guard", () => {
    const me = { id: "me", name: "Moi" };
    assert.equal(isRecentlyContacted(null, null, "me", NOW), false);
    assert.equal(isRecentlyContacted({ result: "NO_RESPONSE", createdAt: iso(NOW - 3 * DAY) }, me, "me", NOW), true);
    assert.equal(isRecentlyContacted({ result: "NO_RESPONSE", createdAt: iso(NOW - 60 * DAY) }, me, "me", NOW), false);
    assert.equal(isRecentlyContacted({ result: "NO_RESPONSE", createdAt: iso(NOW - 60 * DAY), note: "Rappeler" }, me, "me", NOW), true);
    // My own callback due today is exempt…
    assert.equal(isRecentlyContacted({ result: "CALLBACK_REQUESTED", createdAt: iso(NOW - DAY), callbackDate: iso(NOW + HOUR) }, me, "me", NOW), false);
    // …but not a colleague's.
    assert.equal(isRecentlyContacted({ result: "CALLBACK_REQUESTED", createdAt: iso(NOW - DAY), callbackDate: iso(NOW + HOUR) }, { id: "paul", name: "Paul" }, "me", NOW), true);
});

test("effectiveLastAction falls back to the company's last action", () => {
    const r = row({ id: "x", companyLastAction: { result: "REFUS", createdAt: iso(NOW - DAY), sdrId: "paul", sdrName: "Paul" } });
    const eff = effectiveLastAction(r);
    assert.equal(eff.lastAction?.result, "REFUS");
    assert.equal(eff.lastAction?.scope, "COMPANY");
    assert.deepEqual(eff.lastActionBy, { id: "paul", name: "Paul" });
    assert.equal(effectiveLastAction(hot).lastAction?.result, "INTERESTED");
});

test("formatRelative", () => {
    assert.equal(formatRelative(NOW + 20_000, NOW), "à l'instant");
    assert.equal(formatRelative(NOW - 5 * 60_000, NOW), "il y a 5 min");
    assert.equal(formatRelative(new Date(2026, 9, 1, 14, 30).getTime(), NOW), "aujourd'hui 14:30");
    assert.equal(formatRelative(new Date(2026, 9, 2, 9, 0).getTime(), NOW), "demain 09:00");
    assert.equal(formatRelative(new Date(2026, 8, 30, 9, 0).getTime(), NOW), "hier 09:00");
    assert.equal(formatRelative(NOW - 3 * DAY, NOW), "il y a 3 j");
    assert.equal(formatRelative(NOW + 4 * DAY, NOW), "dans 4 j");
});
