import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, funnelSteps, nextAction, pace, weakestStep } from "./pulse";

const start = "2026-11-01T00:00:00Z";
const end = "2026-12-01T00:00:00Z";
const at = (day: number) => Date.parse(start) + day * DAY_MS;

test("pace: halfway with half the target is on track", () => {
    const p = pace({ target: 10, meetings: 5, startDate: start, endDate: end, now: at(15) });
    assert.equal(p.verdict, "on_track");
    assert.equal(p.gap, 0);
    assert.equal(p.projected, 10);
});

test("pace: halfway with 2 of 10 is behind and says what is needed", () => {
    const p = pace({ target: 10, meetings: 2, startDate: start, endDate: end, now: at(15) });
    assert.equal(p.verdict, "behind");
    assert.equal(p.gap, -3);
    assert.ok(p.neededPerWeek! > 3.5 && p.neededPerWeek! < 4);
});

test("pace: a projection below target is never « dans le rythme »", () => {
    const p = pace({ target: 12, meetings: 3, startDate: start, endDate: end, now: at(10) });
    assert.equal(p.verdict, "behind");
});

test("pace: one meeting early in the period is not judged", () => {
    assert.equal(pace({ target: 1, meetings: 0, startDate: start, endDate: end, now: at(3) }).verdict, "early");
});

test("pace: no target, no verdict", () => {
    assert.equal(pace({ target: null, meetings: 4, startDate: start, endDate: end, now: at(10) }).verdict, "no_target");
});

test("pace: reached beats everything else", () => {
    assert.equal(pace({ target: 3, meetings: 3, startDate: start, endDate: end, now: at(40) }).verdict, "reached");
});

test("funnel: rates are step to step and compared to the agency", () => {
    const steps = funnelSteps({ prospects: 4200, called: 780, reached: 112, interested: 30, meetings: 7 }, { reach: 0.25, interest: 0.3, meeting: 0.25 });
    const reach = steps.find((step) => step.key === "reached")!;
    assert.ok(Math.abs(reach.rate! - 112 / 780) < 1e-9);
    assert.ok(reach.gap! < 0);
    assert.equal(weakestStep(steps)?.key, "reached");
});

test("funnel: small samples are not judged", () => {
    const steps = funnelSteps({ prospects: 50, called: 10, reached: 1, interested: 0, meetings: 0 }, { reach: 0.3, interest: 0.3, meeting: 0.3 });
    assert.equal(weakestStep(steps), null);
});

test("next action: an active mission without SDR outranks everything", () => {
    const p = pace({ target: 10, meetings: 0, startDate: start, endDate: end, now: at(20) });
    const action = nextAction({ status: "ACTIVE", sdrCount: 0, activeLists: 2, readyLists: 2, pace: p, endDate: end });
    assert.equal(action.kind, "assign");
    assert.equal(action.tone, "danger");
});

test("next action: behind pace points to the weak step", () => {
    const steps = funnelSteps({ prospects: 4200, called: 780, reached: 112, interested: 30, meetings: 2 }, { reach: 0.25, interest: 0.3, meeting: 0.25 });
    const p = pace({ target: 10, meetings: 2, startDate: start, endDate: end, now: at(15) });
    const action = nextAction({ status: "ACTIVE", sdrCount: 3, activeLists: 2, readyLists: 2, pace: p, endDate: end, weakest: weakestStep(steps) });
    assert.equal(action.kind, "funnel");
    assert.match(action.title, /En retard de 3 RDV/);
    assert.match(action.detail, /transformation/);
    assert.match(action.detail, /1er décembre/);
});

test("next action: healthy mission asks for nothing", () => {
    const p = pace({ target: 10, meetings: 6, startDate: start, endDate: end, now: at(15) });
    const action = nextAction({ status: "ACTIVE", sdrCount: 3, activeLists: 2, readyLists: 2, pace: p, endDate: end });
    assert.equal(action.kind, "none");
    assert.equal(action.action, undefined);
});
