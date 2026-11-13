/**
 * Focus Mode pure helpers:
 *     npm run test:focus
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { callbackPresets, connectRate, dispositionKeys, parseLocalCallback, queueSummary } from "./focus";

const paris = (iso: string) => new Date(iso); // instants given with explicit offsets below

test("callback presets on a weekday morning", () => {
    const now = paris("2026-11-05T10:07:00+01:00"); // Thursday 10:07 Paris
    const p = callbackPresets(now);
    assert.deepEqual(p.map((x) => x.id), ["in2h", "evening", "next9", "next14", "week"]);
    assert.equal(p[0].label, "Dans 2 h (12:15)");
    assert.equal(new Date(p[0].at).toISOString(), "2026-11-05T11:15:00.000Z");
    assert.equal(p[2].label, "Demain 9:00");
    assert.equal(new Date(p[2].at).toISOString(), "2026-11-06T08:00:00.000Z");
    for (const x of p) assert.ok(new Date(x.at) > now, x.id);
});

test("late afternoon drops the same-day presets", () => {
    const p = callbackPresets(paris("2026-11-05T17:20:00+01:00"));
    assert.deepEqual(p.map((x) => x.id), ["next9", "next14", "week"]);
});

test("on Friday and on weekends the next working day is Monday", () => {
    const fri = callbackPresets(paris("2026-11-06T18:00:00+01:00"));
    assert.equal(fri[0].label, "Lundi 9:00");
    assert.equal(new Date(fri[0].at).toISOString(), "2026-11-09T08:00:00.000Z");
    const sat = callbackPresets(paris("2026-11-07T11:00:00+01:00"));
    assert.ok(!sat.some((x) => x.id === "in2h" || x.id === "evening"), "no same-day callback on a Saturday");
    assert.equal(sat[0].label, "Lundi 9:00");
    const week = sat.find((x) => x.id === "week")!;
    assert.ok([1, 2, 3, 4, 5].includes(new Date(week.at).getUTCDay()), "a week later lands on a working day");
});

test("a custom callback must be a valid future Paris time", () => {
    const now = paris("2026-11-05T10:00:00+01:00");
    assert.equal(new Date(parseLocalCallback("2026-11-05T15:30", now)!).toISOString(), "2026-11-05T14:30:00.000Z");
    assert.equal(parseLocalCallback("2026-11-05T09:00", now), null);
    assert.equal(parseLocalCallback("nope", now), null);
});

test("dispositions are ordered and the first nine get keys 1–9", () => {
    const statuses = Array.from({ length: 11 }, (_, i) => ({ code: `S${i}`, sortOrder: 10 - i }));
    const keyed = dispositionKeys(statuses);
    assert.equal(keyed[0].status.code, "S10");
    assert.equal(keyed[0].key, "1");
    assert.equal(keyed[8].key, "9");
    assert.equal(keyed[9].key, null);
});

test("connect rate is null before the first dial", () => {
    assert.equal(connectRate({ dials: 0, connected: 0, saved: 0, meetings: 0, skipped: 0 }), null);
    assert.equal(connectRate({ dials: 3, connected: 1, saved: 0, meetings: 0, skipped: 0 }), 33);
});

test("queue summary for the launch screen", () => {
    const now = new Date(2026, 10, 12, 10, 0);
    const at = (d: number, h: number) => new Date(2026, 10, d, h).toISOString();
    const s = queueSummary(
        [
            { priority: "ABSENT_RDV" },
            { priority: "CALLBACK", lastAction: { callbackDate: at(11, 9) } },
            { priority: "CALLBACK", lastAction: { callbackDate: at(12, 18) } },
            { priority: "CALLBACK", lastAction: { callbackDate: at(13, 9) } },
            { priority: "NEW" },
            { priority: "NEW" },
            { priority: "RETRY" },
            { priority: "FOLLOW_UP" },
        ],
        now,
    );
    assert.deepEqual(s, { total: 8, absent: 1, callbacksDue: 2, callbacksLater: 1, fresh: 2, retries: 2 });
});
