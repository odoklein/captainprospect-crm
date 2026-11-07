import { test } from "node:test";
import assert from "node:assert/strict";
import { addUsage, checkBudget, clampDeadline, DEFAULT_BUDGETS, parseBudget, parseUsage, resolveBudget } from "./budget";
import { EMPTY_USAGE } from "./types";

const t0 = new Date("2026-10-29T10:00:00.000Z");
const at = (s: number) => new Date(t0.getTime() + s * 1000);

test("defaults per kind, overrides field by field, ceilings hold", () => {
    assert.deepEqual(resolveBudget("WATCH"), DEFAULT_BUDGETS.WATCH);
    const b = resolveBudget("WATCH", { maxCostEur: 1, deadlineMs: 99_999_999, maxPhases: -4 });
    assert.equal(b.maxCostEur, 1);
    assert.equal(b.deadlineMs, 3_600_000);
    assert.equal(b.maxPhases, 0);
    assert.equal(b.maxToolCalls, DEFAULT_BUDGETS.WATCH.maxToolCalls);
    assert.deepEqual(parseBudget("garbage", "REPORT"), DEFAULT_BUDGETS.REPORT);
    assert.deepEqual(parseBudget({ maxCostEur: "3" }, "REPORT"), DEFAULT_BUDGETS.REPORT);
});

test("parseUsage tolerates anything", () => {
    assert.deepEqual(parseUsage(null), EMPTY_USAGE);
    assert.deepEqual(parseUsage({ costEur: 0.2, phases: "x" }), { ...EMPTY_USAGE, costEur: 0.2 });
});

test("ok while everything is under budget", () => {
    const b = resolveBudget("WATCH");
    const c = checkBudget(b, { ...EMPTY_USAGE, costEur: 0.1, phases: 1 }, t0, at(30));
    assert.equal(c.ok, true);
    assert.equal(c.stop, null);
    assert.equal(c.remainingMs, 210_000);
    assert.equal(c.remainingPhases, 1);
});

test("stops on the deadline first, whatever else is left", () => {
    const b = resolveBudget("WATCH");
    const c = checkBudget(b, EMPTY_USAGE, t0, at(240));
    assert.equal(c.ok, false);
    assert.equal(c.stop, "deadline");
    assert.match(c.reason!, /240 s/);
});

test("stops on cost, phases, tool calls", () => {
    const b = resolveBudget("WATCH", { maxCostEur: 0.2 });
    assert.equal(checkBudget(b, { ...EMPTY_USAGE, costEur: 0.2 }, t0, at(1)).stop, "cost");
    assert.equal(checkBudget(b, { ...EMPTY_USAGE, phases: 2 }, t0, at(1)).stop, "phases");
    assert.equal(checkBudget(b, { ...EMPTY_USAGE, toolCalls: 10 }, t0, at(1)).stop, "tool_calls");
});

test("clampDeadline keeps the plan under the run's remaining time with a floor", () => {
    const b = resolveBudget("WATCH"); // 240 s
    assert.equal(clampDeadline(180_000, b, t0, at(0)), 180_000);
    assert.equal(clampDeadline(180_000, b, t0, at(200)), 40_000);
    assert.equal(clampDeadline(180_000, b, t0, at(239)), 10_000);
});

test("addUsage sums and rounds cost", () => {
    const u = addUsage({ ...EMPTY_USAGE, costEur: 0.1 }, { costEur: 0.2, toolCalls: 3, phases: 1 });
    assert.deepEqual(u, { promptTokens: 0, completionTokens: 0, costEur: 0.3, toolCalls: 3, phases: 1 });
});
