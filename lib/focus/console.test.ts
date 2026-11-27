/**
 * Focus console pure helpers:
 *     npm run test:focus
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDayRail, cycleMission, gateCall, livePace, railTone, upNext } from "./console";

const at = (hm: string) => `2026-11-17T${hm}:00+01:00`; // a Tuesday, Paris winter time
const NOW = new Date(at("11:40"));

test("rail spans the planned blocks and places calls and now on it", () => {
    const rail = buildDayRail(
        [{ at: at("09:00"), result: "NO_RESPONSE" }, { at: at("10:30"), result: "MEETING_BOOKED" }],
        [{ startTime: "09:00", endTime: "12:30" }, { startTime: "14:00", endTime: "17:00" }],
        NOW,
    );
    assert.equal(rail.startMinute, 9 * 60);
    assert.equal(rail.endMinute, 17 * 60);
    assert.equal(rail.ticks.length, 2);
    assert.equal(rail.ticks[0].left, 0);
    assert.equal(rail.ticks[1].tone, "meeting");
    assert.equal(rail.ticks[1].height, 1);
    assert.equal(rail.ticks[1].left, (90 / 480) * 100);
    assert.equal(rail.blocks.length, 2);
    assert.equal(rail.blocks[0].width, (210 / 480) * 100);
    assert.ok(rail.now !== null && Math.abs(rail.now - (160 / 480) * 100) < 1e-9);
    assert.equal(rail.hours[0].label, "09:00");
    assert.equal(rail.hours.at(-1)?.label, "17:00");
});

test("rail widens to a call outside the blocks and ignores other days", () => {
    const rail = buildDayRail(
        [{ at: at("08:20"), result: "REFUS" }, { at: "2026-11-16T10:00:00+01:00", result: "REFUS" }],
        [{ startTime: "09:00", endTime: "12:00" }],
        NOW,
    );
    assert.equal(rail.startMinute, 8 * 60);
    assert.equal(rail.ticks.length, 1);
});

test("without planning the rail runs 09:00–18:00", () => {
    const rail = buildDayRail([], [], NOW);
    assert.equal(rail.startMinute, 540);
    assert.equal(rail.endMinute, 1080);
    assert.equal(rail.now !== null, true);
    assert.deepEqual(buildDayRail([], [{ startTime: "bad", endTime: "12:00" }], NOW).startMinute, 540);
});

test("tones follow the status families, a meeting above all", () => {
    assert.equal(railTone("MEETING_BOOKED"), "meeting");
    assert.equal(railTone("INTERESTED"), "positive");
    assert.equal(railTone("CALLBACK_REQUESTED"), "pending");
    assert.equal(railTone("NO_RESPONSE"), "noreach");
    assert.equal(railTone("REFUS_ARGU", "REFUS"), "negative");
    assert.equal(railTone("CUSTOM", "RAPPEL"), "pending");
});

test("live pace counts the calls on screen before the next poll", () => {
    assert.deepEqual(livePace(30, 32, 35), { calls: 35, expected: 32, lead: 3, status: "ON_TRACK" });
    assert.equal(livePace(28, 32, 20).status, "BEHIND");
    assert.equal(livePace(20, 32, 0).status, "LATE");
});

test("up next skips the prospect on screen, handled rows and rows with no phone", () => {
    const row = (c: string | null, co: string, hasContactInfo = true) => ({ contact: c ? { id: c } : null, company: { id: co }, hasContactInfo });
    const rows = [row("a", "1"), row("b", "1"), row(null, "2", false), row("c", "3"), row("d", "4"), row(null, "5")];
    const next = upNext(rows, "a|1", new Set(["c|3"]), 3);
    assert.deepEqual(next.map((r) => `${r.contact?.id ?? ""}|${r.company.id}`), ["b|1", "d|4", "|5"]);
});

test("the gate picks the oldest qualifiable call that is not the one on screen", () => {
    const rows = [
        { id: "x", at: at("11:30"), company: { id: "1" } },
        { id: "y", at: at("10:05"), company: null },
        { id: "z", at: at("10:40"), company: { id: "2" } },
    ];
    assert.equal(gateCall(rows, null)?.id, "z");
    assert.equal(gateCall(rows, "z")?.id, "x");
    assert.equal(gateCall([rows[1]], null), null);
});

test("mission switching wraps around", () => {
    assert.equal(cycleMission(["a", "b", "c"], "c", 1), "a");
    assert.equal(cycleMission(["a", "b", "c"], "a", -1), "c");
    assert.equal(cycleMission(["a"], "a", 1), null);
    assert.equal(cycleMission(["a", "b"], "zz", 1), "a");
});
