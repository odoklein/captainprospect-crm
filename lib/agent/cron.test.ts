/**
 * Cron parser and next-match search, including the two Paris DST edges.
 *     npm run test:agent
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { CronParseError, isValidCron, matchesAt, nextMatch, parseCron } from "./cron";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

test("parses stars, steps, ranges and lists", () => {
    const f = parseCron("*/15 9-17 1,15 * 1-5");
    assert.deepEqual([...f.minute], [0, 15, 30, 45]);
    assert.deepEqual([...f.hour], [9, 10, 11, 12, 13, 14, 15, 16, 17]);
    assert.deepEqual([...f.dayOfMonth], [1, 15]);
    assert.equal(f.month.size, 12);
    assert.deepEqual([...f.dayOfWeek], [1, 2, 3, 4, 5]);
    assert.equal(f.anyDayOfMonth, false);
    assert.equal(f.anyDayOfWeek, false);
});

test("day of week 7 is Sunday, like 0", () => {
    assert.deepEqual([...parseCron("0 0 * * 7").dayOfWeek], [0]);
    assert.deepEqual([...parseCron("0 0 * * 0,6").dayOfWeek], [0, 6]);
});

test("rejects malformed expressions", () => {
    for (const bad of ["", "* * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "a * * * *", "*/0 * * * *", "5-3 * * * *"]) {
        assert.throws(() => parseCron(bad), CronParseError, bad);
        assert.equal(isValidCron(bad), false, bad);
    }
    assert.equal(isValidCron("30 7 * * 1-5"), true);
});

test("next match is strictly after the reference, in the zone", () => {
    // 11:00 Paris on Tuesday 27 October (CET, UTC+1 after the 25 Oct fall-back) = 10:00Z
    const after = new Date("2026-10-27T10:00:00.000Z");
    assert.equal(iso(nextMatch("0 11 * * 1-5", after)), "2026-10-28T10:00:00.000Z");
    // one second earlier: today still qualifies
    assert.equal(iso(nextMatch("0 11 * * 1-5", new Date("2026-10-27T09:59:59.000Z"))), "2026-10-27T10:00:00.000Z");
});

test("weekday restriction skips the weekend", () => {
    // Friday 2026-10-30 at 15:30 Paris (UTC+1 after the 25 Oct fall-back) → Monday 2 Nov 11:00
    const after = new Date("2026-10-30T14:30:00.000Z");
    assert.equal(iso(nextMatch("0 11 * * 1-5", after)), "2026-11-02T10:00:00.000Z");
});

test("every five minutes", () => {
    assert.equal(iso(nextMatch("*/5 * * * *", new Date("2026-10-27T09:02:10.000Z"))), "2026-10-27T09:05:00.000Z");
    assert.equal(iso(nextMatch("*/5 * * * *", new Date("2026-10-27T09:05:00.000Z"))), "2026-10-27T09:10:00.000Z");
});

test("dom OR dow when both are restricted (classic cron)", () => {
    // 1st of the month or any Monday; from Sat 2026-10-03 → Monday 5 Oct
    assert.equal(iso(nextMatch("0 8 1 * 1", new Date("2026-10-03T12:00:00.000Z"))), "2026-10-05T06:00:00.000Z");
    // from Thu 2026-10-29 → Sunday 1 Nov (dom wins before Monday 2 Nov)
    assert.equal(iso(nextMatch("0 8 1 * 1", new Date("2026-10-29T12:00:00.000Z"))), "2026-11-01T07:00:00.000Z");
});

test("spring forward: 02:30 Paris does not exist on 29 March 2026, the job skips to the next day", () => {
    const after = new Date("2026-03-28T23:00:00.000Z"); // 00:00 Paris on the 29th
    assert.equal(iso(nextMatch("30 2 * * *", after)), "2026-03-30T00:30:00.000Z"); // 02:30 CEST
    // a 03:30 job still fires on the 29th, at its first (and only) occurrence
    assert.equal(iso(nextMatch("30 3 * * *", after)), "2026-03-29T01:30:00.000Z");
});

test("fall back: 02:30 Paris exists twice on 25 October 2026, the job fires once, at the first", () => {
    const after = new Date("2026-10-24T23:00:00.000Z"); // 01:00 Paris CEST on the 25th
    assert.equal(iso(nextMatch("30 2 * * *", after)), "2026-10-25T00:30:00.000Z"); // 02:30 CEST (first)
    // from just after the first occurrence: not the second one, but the next day
    assert.equal(iso(nextMatch("30 2 * * *", new Date("2026-10-25T00:30:00.000Z"))), "2026-10-26T01:30:00.000Z");
});

test("a daily job keeps its wall-clock time across the DST change", () => {
    assert.equal(iso(nextMatch("0 11 * * *", new Date("2026-10-24T09:30:00.000Z"))), "2026-10-25T10:00:00.000Z"); // 11:00 CET
    assert.equal(iso(nextMatch("0 11 * * *", new Date("2026-10-23T09:30:00.000Z"))), "2026-10-24T09:00:00.000Z"); // 11:00 CEST
});

test("other zones and UTC", () => {
    assert.equal(iso(nextMatch("0 9 * * *", new Date("2026-06-01T00:00:00.000Z"), "UTC")), "2026-06-01T09:00:00.000Z");
    assert.equal(iso(nextMatch("0 9 * * *", new Date("2026-06-01T00:00:00.000Z"), "America/New_York")), "2026-06-01T13:00:00.000Z");
    assert.throws(() => nextMatch("0 9 * * *", new Date(), "Mars/Olympus"), CronParseError);
});

test("an unreachable expression returns null instead of looping forever", () => {
    assert.equal(nextMatch("0 0 31 2 *", new Date("2026-01-01T00:00:00.000Z")), null);
});

test("matchesAt", () => {
    assert.equal(matchesAt("0 11 * * 1-5", new Date("2026-10-27T10:00:30.000Z")), true);
    assert.equal(matchesAt("0 11 * * 1-5", new Date("2026-10-27T10:01:00.000Z")), false);
    assert.equal(matchesAt("0 11 * * 1-5", new Date("2026-10-31T10:00:00.000Z")), false); // Saturday
});
