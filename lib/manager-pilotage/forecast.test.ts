import { test } from "node:test";
import assert from "node:assert/strict";
import { forecast, landingVerdict, leversFor, monthShareOfTarget, plannedDays, type PlanInput, type PlannedDays } from "./forecast";

const none = new Set<string>();
// Friday 27 November 2026, 12:00 Paris. November has 21 working days; 19 are behind, today is the 20th.
const base: Omit<PlanInput, "blocks" | "absences" | "allocations" | "sdrIds"> = {
    todayKey: "2026-11-27",
    nowMinute: 12 * 60,
    monthFirst: "2026-11-01",
    monthLast: "2026-11-30",
    holidays: none,
};
const fullDay = (sdrId: string, day: string) => ({ sdrId, missionId: "m1", day, start: 9 * 60, end: 17 * 60 });

test("planned days: a full 9–17 block is one day; today splits at now", () => {
    const p = plannedDays({ ...base, blocks: [fullDay("a", "2026-11-26"), fullDay("a", "2026-11-27"), fullDay("a", "2026-11-30")], absences: [], allocations: [], sdrIds: ["a"] });
    // 9–12 of a 7 h calling day (lunch out) is 3/7 of today.
    assert.ok(Math.abs(p.soFar - (1 + 3 / 7)) < 1e-9);
    assert.ok(Math.abs(p.remaining - (4 / 7 + 1)) < 1e-9);
});

test("planned days: an absence removes the planned day", () => {
    const p = plannedDays({
        ...base,
        blocks: [fullDay("a", "2026-11-30")],
        absences: [{ sdrId: "a", from: "2026-11-30", to: "2026-11-30" }],
        allocations: [],
        sdrIds: ["a"],
    });
    assert.equal(p.remaining, 0);
});

test("planned days: allocated days not placed yet count, up to the free days left", () => {
    const p = plannedDays({
        ...base,
        blocks: [fullDay("a", "2026-11-27")],
        absences: [],
        allocations: [{ sdrId: "a", missionId: "m1", allocatedDays: 5 }],
        sdrIds: ["a"],
    });
    // One day placed (today), 4 left to place, only Monday 30 is free.
    assert.equal(p.unplaced, 1);
    assert.ok(Math.abs(p.remaining - (4 / 7 + 1)) < 1e-9);
});

test("planned days: a half-day block is prorated on calling time", () => {
    const p = plannedDays({ ...base, nowMinute: 8 * 60, blocks: [{ sdrId: "a", missionId: "m1", day: "2026-11-27", start: 9 * 60, end: 12 * 60 + 30 }], absences: [], allocations: [], sdrIds: [] });
    assert.ok(Math.abs(p.remaining - 3.5 / 7) < 1e-9);
});

test("month target: a three-month mission owes this month's share", () => {
    const share = monthShareOfTarget({ target: 92, missionFrom: "2026-10-01", missionTo: "2026-12-31", monthFirst: "2026-11-01", monthLast: "2026-11-30" });
    assert.ok(Math.abs(share - 30) < 1e-9);
});

test("verdict: same thresholds as pace() — < 85 % behind, ≥ 115 % ahead", () => {
    assert.equal(landingVerdict(10, 84, 100), "behind");
    assert.equal(landingVerdict(10, 85, 100), "on_track");
    assert.equal(landingVerdict(10, 115, 100), "ahead");
    assert.equal(landingVerdict(100, 100, 100), "reached");
    assert.equal(landingVerdict(3, 10, 0), "no_target");
});

const planned = (soFar: number, remaining: number, capacity = 999): PlannedDays => ({ soFar, remaining, unplaced: 0, capacity });

test("forecast: done + remaining days × quota × completion × reach × rate", () => {
    const f = forecast({
        ...base,
        quota: 70,
        target: 96,
        meetingsByDay: { "2026-11-02": 20, "2026-11-20": 19 },
        // Planned 50 SDR-days so far, 82 % of their quota called.
        callsSoFar: 0.82 * 50 * 70,
        planned: planned(50, 54),
        window: { calls: 10_000, reached: 2_800, meetings: 123 }, // 28 % reach, 4.39 % rate
    });
    assert.equal(f.done, 39);
    assert.ok(Math.abs(f.rates.completion! - 0.82) < 1e-9);
    const perDay = 70 * 0.82 * 0.28 * (123 / 2800);
    assert.ok(Math.abs(f.perSdrDay - perDay) < 1e-9);
    assert.equal(f.projected, Math.round(39 + 54 * perDay));
    assert.equal(f.verdict, "behind");
    assert.equal(f.series.length, 21);
    assert.equal(f.series[19].actual, 39);
    assert.equal(f.series[20].actual, null);
    assert.ok(Math.abs(f.series[20].projection! - (39 + 54 * perDay)) < 1e-9);
    assert.equal(f.series[20].ideal, 96);
});

test("forecast: nothing planned so far assumes 100 % completion and says so", () => {
    const f = forecast({ ...base, quota: 70, target: 10, meetingsByDay: {}, callsSoFar: 0, planned: planned(0, 2), window: { calls: 100, reached: 30, meetings: 3 } });
    assert.equal(f.rates.completion, null);
    assert.ok(Math.abs(f.perSdrDay - 70 * 0.3 * 0.1) < 1e-9);
});


test("levers: each one closes the gap alone, unrealistic past the limits", () => {
    // 57 RDV still to book, 54 SDR-days planned, the team can give 60 at most.
    const levers = leversFor({ need: 57, quota: 70, completion: 0.82, reach: 0.28, rate: 0.044, planned: planned(50, 54, 60) });
    const by = Object.fromEntries(levers.map((l) => [l.key, l]));
    const perDay = 70 * 0.82 * 0.28 * 0.044;
    assert.ok(Math.abs(by.days.needed! - 57 / perDay) < 1e-9); // ≈ 80.6 days
    assert.equal(by.days.unrealistic, true); // more than the 60 the team has
    assert.ok(Math.abs(by.completion.needed! - 57 / (54 * 70 * 0.28 * 0.044)) < 1e-9); // ≈ 122 %
    assert.equal(by.completion.unrealistic, true);
    assert.ok(by.reach.needed! > 0.41 && by.reach.needed! < 0.42);
    assert.equal(by.reach.unrealistic, false);
    assert.ok(by.rate.needed! > 0.065 && by.rate.needed! < 0.066);
    assert.equal(by.rate.unrealistic, false);
});

test("levers: with nothing planned, only more days can close the gap", () => {
    const levers = leversFor({ need: 5, quota: 70, completion: 1, reach: 0.3, rate: 0.05, planned: planned(10, 0, 20) });
    const by = Object.fromEntries(levers.map((l) => [l.key, l]));
    assert.ok(Math.abs(by.days.needed! - 5 / (70 * 0.3 * 0.05)) < 1e-9);
    assert.equal(by.days.unrealistic, false);
    for (const key of ["completion", "reach", "rate"]) {
        assert.equal(by[key].needed, null);
        assert.equal(by[key].unrealistic, true);
    }
});

test("forecast: no lever once the target is booked", () => {
    const f = forecast({ ...base, quota: 70, target: 10, meetingsByDay: { "2026-11-10": 12 }, callsSoFar: 100, planned: planned(2, 1), window: { calls: 100, reached: 30, meetings: 3 } });
    assert.equal(f.verdict, "reached");
    assert.deepEqual(f.levers, []);
});
