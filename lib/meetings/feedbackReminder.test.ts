import { test } from "node:test";
import assert from "node:assert/strict";
import {
    DUE_AFTER_START_MIN,
    REMINDER_LOOKBACK_DAYS,
    compareReminderItems,
    formatNoShowCountdown,
    reminderDateRange,
    toReminderItem,
} from "./feedbackReminder";

const now = new Date("2026-10-24T12:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(now - h * 3600_000);

test("date range: 14 days back to 60 minutes ago", () => {
    assert.equal(REMINDER_LOOKBACK_DAYS, 14);
    assert.equal(DUE_AFTER_START_MIN, 60);
    const { from, to } = reminderDateRange(now);
    assert.equal(from.toISOString(), "2026-10-10T12:00:00.000Z");
    assert.equal(to.toISOString(), "2026-10-24T11:00:00.000Z");
});

test("meeting 17 h ago: 31 h left, urgent", () => {
    const item = toReminderItem({ callbackDate: hoursAgo(17) }, now);
    assert.equal(item.hoursLeft, 31);
    assert.equal(item.windowOpen, true);
    assert.equal(item.urgent, true);
    assert.equal(item.noShowDeadline.toISOString(), new Date(now + 31 * 3600_000).toISOString());
    assert.equal(formatNoShowCountdown(item.hoursLeft), "Absence signalable encore 31 h");
});

test("partial hours round down", () => {
    const item = toReminderItem({ callbackDate: hoursAgo(16.5) }, now);
    assert.equal(item.hoursLeft, 31);
});

test("last hour of the window", () => {
    const item = toReminderItem({ callbackDate: hoursAgo(47.5) }, now);
    assert.equal(item.hoursLeft, 0);
    assert.equal(item.windowOpen, true);
    assert.equal(formatNoShowCountdown(item.hoursLeft), "Absence signalable moins d'1 h");
});

test("exactly at the deadline the window is still open (same rule as the API guard)", () => {
    const item = toReminderItem({ callbackDate: hoursAgo(48) }, now);
    assert.equal(item.windowOpen, true);
    assert.equal(item.hoursLeft, 0);
});

test("window passed: not urgent, countdown says so", () => {
    const item = toReminderItem({ callbackDate: hoursAgo(48.2).toISOString() }, now);
    assert.equal(item.windowOpen, false);
    assert.equal(item.urgent, false);
    assert.ok(item.hoursLeft < 0);
    assert.equal(formatNoShowCountdown(item.hoursLeft), "Délai de signalement d'absence dépassé");
});

test("ordering: open windows by nearest deadline, then closed ones newest first", () => {
    const rows = [
        { id: "closed-old", ...toReminderItem({ callbackDate: hoursAgo(200) }, now) },
        { id: "open-late", ...toReminderItem({ callbackDate: hoursAgo(2) }, now) },
        { id: "closed-new", ...toReminderItem({ callbackDate: hoursAgo(60) }, now) },
        { id: "open-soon", ...toReminderItem({ callbackDate: hoursAgo(40) }, now) },
    ];
    rows.sort(compareReminderItems);
    assert.deepEqual(rows.map((r) => r.id), ["open-soon", "open-late", "closed-new", "closed-old"]);
});
