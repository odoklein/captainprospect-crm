import { test } from "node:test";
import assert from "node:assert/strict";
import { lastWorkingDays, monthBounds, officeMinutesBetween, overlapDays, parisKey, parisMidnight, parisMinute, workingDaysBetween } from "./calendar";

const none = new Set<string>();

test("calendar: Paris day and minute of an instant, both sides of DST", () => {
    assert.equal(parisKey(new Date("2026-11-26T23:30:00Z")), "2026-11-27"); // UTC+1
    assert.equal(parisMinute(new Date("2026-11-27T08:15:00Z")), 9 * 60 + 15);
    assert.equal(parisMinute(new Date("2026-07-01T08:15:00Z")), 10 * 60 + 15); // UTC+2
});

test("calendar: Paris midnight in winter and summer", () => {
    assert.equal(parisMidnight("2026-11-27").toISOString(), "2026-11-26T23:00:00.000Z");
    assert.equal(parisMidnight("2026-07-01").toISOString(), "2026-06-30T22:00:00.000Z");
});

test("calendar: working days skip weekends and holidays", () => {
    assert.equal(workingDaysBetween("2026-11-01", "2026-11-30", none).length, 21);
    assert.equal(workingDaysBetween("2026-11-01", "2026-11-30", new Set(["2026-11-11"])).length, 20);
});

test("calendar: the last N working days end today when today works", () => {
    const days = lastWorkingDays("2026-11-27", 2, none); // Friday
    assert.deepEqual(days, ["2026-11-26", "2026-11-27"]);
    const fromMonday = lastWorkingDays("2026-11-30", 2, none);
    assert.deepEqual(fromMonday, ["2026-11-27", "2026-11-30"]);
    assert.equal(lastWorkingDays("2026-11-27", 20, none).length, 20);
});

test("calendar: month bounds", () => {
    assert.deepEqual(monthBounds("2026-02-10"), { month: "2026-02", first: "2026-02-01", last: "2026-02-28" });
});

test("calendar: office minutes do not count nights or weekends", () => {
    // Friday 17:30 Paris → Monday 9:30 Paris: 30 min Friday + 30 min Monday.
    const from = new Date("2026-11-27T16:30:00Z");
    const to = new Date("2026-11-30T08:30:00Z");
    assert.equal(officeMinutesBetween(from, to, none), 60);
    // Same day, inside office hours.
    assert.equal(officeMinutesBetween(new Date("2026-11-27T09:00:00Z"), new Date("2026-11-27T11:00:00Z"), none), 120);
});

test("calendar: overlap of two periods, inclusive", () => {
    assert.equal(overlapDays("2026-10-15", "2027-01-14", "2026-11-01", "2026-11-30"), 30);
    assert.equal(overlapDays("2026-12-01", "2026-12-31", "2026-11-01", "2026-11-30"), 0);
});
