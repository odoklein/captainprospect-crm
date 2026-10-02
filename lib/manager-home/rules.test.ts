/**
 * Pure rules of the manager home:
 *     npm run test:manager-home
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { bucketSeries, parsePeriodRange, prorateWeeklyGoal, relativeChange } from "./rules";

test("parsePeriodRange: inclusive days, equal-length previous period", () => {
    const r = parsePeriodRange("2026-09-26", "2026-10-02");
    assert.ok(r);
    assert.equal(r.days, 7);
    assert.equal(r.prevStart, "2026-09-19");
    assert.equal(r.prevEnd, "2026-09-25");
    assert.equal(r.granularity, "day");
    // Paris midnight (UTC+2 in summer time)
    assert.equal(r.from.toISOString(), "2026-09-25T22:00:00.000Z");
    assert.equal(r.to.toISOString(), "2026-10-02T22:00:00.000Z");
    assert.equal(r.prevTo.toISOString(), r.from.toISOString());
});

test("parsePeriodRange: single day, and a range across the DST switch", () => {
    const one = parsePeriodRange("2026-10-02", "2026-10-02");
    assert.equal(one?.days, 1);
    assert.equal(one?.prevStart, "2026-10-01");
    const dst = parsePeriodRange("2026-10-20", "2026-10-30");
    assert.equal(dst?.days, 11);
    assert.equal(dst?.to.toISOString(), "2026-10-30T23:00:00.000Z"); // winter time after Oct 25
});

test("parsePeriodRange: rejects malformed, reversed and absurd ranges", () => {
    assert.equal(parsePeriodRange(null, "2026-10-02"), null);
    assert.equal(parsePeriodRange("2026-10-2", "2026-10-02"), null);
    assert.equal(parsePeriodRange("2026-10-05", "2026-10-02"), null);
    assert.equal(parsePeriodRange("2026-02-30", "2026-03-02"), null);
    assert.equal(parsePeriodRange("1990-01-01", "2026-10-02"), null);
});

test("parsePeriodRange: long ranges switch to weekly buckets", () => {
    assert.equal(parsePeriodRange("2026-08-01", "2026-10-01")?.granularity, "day"); // 62 days
    assert.equal(parsePeriodRange("2026-07-01", "2026-10-02")?.granularity, "week");
});

test("bucketSeries: gap-fills every day and buckets by Paris day", () => {
    const range = { start: "2026-09-28", end: "2026-09-30", granularity: "day" as const };
    const out = bucketSeries(
        [
            // 23:30 UTC on the 28th is already the 29th in Paris
            { at: new Date("2026-09-28T23:00:00Z"), actions: 3, meetings: 1 },
            { at: new Date("2026-09-29T08:00:00Z"), actions: 10, meetings: 0 },
            // outside the range: ignored
            { at: new Date("2026-10-01T09:00:00Z"), actions: 99, meetings: 9 },
        ],
        range,
    );
    assert.deepEqual(out.map((b) => [b.key, b.actions, b.meetings]), [
        ["2026-09-28", 0, 0],
        ["2026-09-29", 13, 1],
        ["2026-09-30", 0, 0],
    ]);
    assert.equal(out[1].label, "mar. 29");
});

test("bucketSeries: weekly buckets start on Monday", () => {
    const out = bucketSeries(
        [
            { at: new Date("2026-09-30T10:00:00Z"), actions: 5, meetings: 2 },
            { at: new Date("2026-10-04T10:00:00Z"), actions: 1, meetings: 0 },
        ],
        { start: "2026-09-30", end: "2026-10-06", granularity: "week" },
    );
    assert.deepEqual(out.map((b) => [b.key, b.actions, b.meetings]), [
        ["2026-09-28", 6, 2],
        ["2026-10-05", 0, 0],
    ]);
});

test("relativeChange and prorateWeeklyGoal", () => {
    assert.equal(relativeChange(12, 10), 20);
    assert.equal(relativeChange(9, 12), -25);
    assert.equal(relativeChange(5, 0), null);
    assert.equal(prorateWeeklyGoal(30, 7), 30);
    assert.equal(prorateWeeklyGoal(30, 31), 133);
    assert.equal(prorateWeeklyGoal(30, 1), 4);
});

test("groupOutcomes: folds raw result codes into fixed-order families", async () => {
    const { groupOutcomes } = await import("./outcomes");
    const { slices, total } = groupOutcomes({
        NO_RESPONSE: 50,
        BARRAGE_STANDARD: 10,
        MEETING_BOOKED: 4,
        RAPPEL: 3,
        CALLBACK_REQUESTED: 3,
        MAIL_ENVOYE: 2,
        DISQUALIFIED: 0,
    });
    assert.equal(total, 72);
    assert.deepEqual(slices.map((s) => [s.key, s.count]), [
        ["meeting", 4],
        ["callback", 6],
        ["noReach", 60],
        ["other", 2],
    ]);
    assert.equal(slices.find((s) => s.key === "noReach")?.pct, 83);
});
