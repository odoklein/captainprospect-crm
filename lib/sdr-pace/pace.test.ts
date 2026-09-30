/**
 * Pure rules of the SDR pace indicator:
 *     npm run test:sdr-pace
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeEffectiveTime,
  computePace,
  formatHours,
  formatPaceSummary,
  statusForBehind,
  type Interval,
} from "./pace";
import { decidePaceNotification, HOURLY_INTERVAL_MS, MIN_CHANGE_GAP_MS } from "./notify";

const at = (h: number, m = 0) => h * 60 + m;
const FULL_DAY: Interval[] = [{ start: at(9), end: at(17) }];

/** Pace for a full 09:00–17:00 day, no pause, at a given hour. */
function paceAt(callsDone: number, hour: number, minute = 0, quota = 70) {
  const time = computeEffectiveTime({ blocks: FULL_DAY, callMinutes: [], nowMinute: at(hour, minute) });
  return computePace({ callsDone, dailyQuota: quota, targetHours: 6, time });
}

// ============================================
// Status thresholds
// ============================================

test("status thresholds: 0–3 on track, 4–8 to catch up, 9+ late", () => {
  assert.equal(statusForBehind(0), "ON_TRACK");
  assert.equal(statusForBehind(3), "ON_TRACK");
  assert.equal(statusForBehind(4), "BEHIND");
  assert.equal(statusForBehind(8), "BEHIND");
  assert.equal(statusForBehind(9), "LATE");
  assert.equal(statusForBehind(40), "LATE");
});

// ============================================
// Cumulative checkpoints from the brief
// ============================================

test("expected calls follow 12 / 24 / 35 / 47 / 59 / 70 over effective calling time", () => {
  // Full day = 7 h of calling (09–17 minus lunch) ↔ 6 h effective. 1 effective hour = 7/6 real hour.
  const checkpoints: [number, number][] = [[1, 12], [2, 24], [3, 35], [4, 47], [5, 59], [6, 70]];
  for (const [effectiveHours, expected] of checkpoints) {
    const time = { plannedMinutes: 420, elapsedMinutes: (effectiveHours / 6) * 420 };
    const pace = computePace({ callsDone: 0, dailyQuota: 70, targetHours: 6, time });
    assert.equal(pace.expected, expected, `${effectiveHours}h`);
    assert.ok(Math.abs(pace.effectiveHoursElapsed - effectiveHours) < 1e-9);
  }
});

test("the example from the brief: 31 calls when 35 are expected is 'à rattraper' by 4", () => {
  const time = { plannedMinutes: 420, elapsedMinutes: 210 }; // 3 effective hours
  const pace = computePace({ callsDone: 31, dailyQuota: 70, targetHours: 6, time });
  assert.equal(pace.expected, 35);
  assert.equal(pace.delta, 4);
  assert.equal(pace.status, "BEHIND");
  assert.equal(formatPaceSummary(pace), "31 / 70 appels · Objectif à ce stade : 35 · Retard : 4 appels");
});

test("ahead of the target stays on track and reports the lead", () => {
  const pace = computePace({
    callsDone: 50,
    dailyQuota: 70,
    targetHours: 6,
    time: { plannedMinutes: 420, elapsedMinutes: 210 },
  });
  assert.equal(pace.status, "ON_TRACK");
  assert.equal(pace.aheadBy, 15);
  assert.equal(pace.goalReached, false);
});

test("goalReached only once the day quota is met", () => {
  const time = { plannedMinutes: 420, elapsedMinutes: 420 };
  assert.equal(computePace({ callsDone: 69, dailyQuota: 70, targetHours: 6, time }).goalReached, false);
  assert.equal(computePace({ callsDone: 70, dailyQuota: 70, targetHours: 6, time }).goalReached, true);
});

// ============================================
// Quota change (manager setting)
// ============================================

test("raising the quota raises the expected count proportionally", () => {
  const time = { plannedMinutes: 420, elapsedMinutes: 210 };
  assert.equal(computePace({ callsDone: 0, dailyQuota: 80, targetHours: 6, time }).expected, 40);
  assert.equal(computePace({ callsDone: 0, dailyQuota: 90, targetHours: 6, time }).expected, 45);
});

// ============================================
// Effective time
// ============================================

test("expected count is flat across lunch — the lunch break never adds lateness", () => {
  const before = paceAt(30, 12, 30);
  const during = paceAt(30, 13, 0);
  const after = paceAt(30, 13, 30);
  assert.equal(before.expected, during.expected);
  assert.equal(before.expected, after.expected);
  assert.equal(paceAt(30, 13, 31).expected > before.expected, true);
});

test("full day: 12:30 is 3.5 of 7 planned hours → half the quota", () => {
  assert.equal(paceAt(0, 12, 30).expected, 35);
  assert.equal(paceAt(0, 17, 0).expected, 70);
  assert.equal(paceAt(0, 9, 0).expected, 0);
  assert.equal(paceAt(0, 20, 0).expected, 70);
});

test("no planning block falls back to the default 09:00–17:00 window", () => {
  const t = computeEffectiveTime({ blocks: [], callMinutes: [], nowMinute: at(17) });
  assert.equal(t.plannedMinutes, 420);
  assert.equal(t.elapsedMinutes, 420);
});

test("overlapping / duplicated blocks (several missions at the same time) count once", () => {
  const t = computeEffectiveTime({
    blocks: [{ start: at(9), end: at(17) }, { start: at(9), end: at(17) }, { start: at(14), end: at(16) }],
    callMinutes: [],
    nowMinute: at(17),
  });
  assert.equal(t.plannedMinutes, 420);
});

test("a gap between two blocks (a planned meeting) is not calling time", () => {
  const t = computeEffectiveTime({
    blocks: [{ start: at(9), end: at(11) }, { start: at(14), end: at(16) }],
    callMinutes: [],
    nowMinute: at(16),
  });
  assert.equal(t.plannedMinutes, 240);
  assert.equal(t.elapsedMinutes, 240);
});

test("a half-day planning gets a prorated quota instead of the full 70", () => {
  const time = computeEffectiveTime({
    blocks: [{ start: at(9), end: at(12, 30) }],
    callMinutes: [],
    nowMinute: at(12, 30),
  });
  const pace = computePace({ callsDone: 0, dailyQuota: 70, targetHours: 6, time });
  assert.equal(pace.dayQuota, 35);
  assert.equal(pace.expected, 35);
  assert.equal(pace.effectiveHoursTarget, 3);
});

test("isCallingTime is false at lunch and outside planned hours", () => {
  const at_ = (minute: number) =>
    computeEffectiveTime({ blocks: FULL_DAY, callMinutes: [], nowMinute: minute }).isCallingTime;
  assert.equal(at_(at(10)), true);
  assert.equal(at_(at(13)), false);
  assert.equal(at_(at(8)), false);
  assert.equal(at_(at(17)), false);
});

// ============================================
// Pauses / meetings inferred from call gaps
// ============================================

test("a 45-minute silence followed by calls is forgiven: no artificial lateness", () => {
  const calls = [at(10), at(10, 5), at(10, 50), at(10, 55)]; // 45 min gap
  const withPause = computeEffectiveTime({ blocks: FULL_DAY, callMinutes: calls, nowMinute: at(11) });
  const without = computeEffectiveTime({ blocks: FULL_DAY, callMinutes: [], nowMinute: at(11) });
  assert.equal(withPause.forgivenPauseMinutes, 45);
  assert.equal(withPause.elapsedMinutes, without.elapsedMinutes - 45);
});

test("the silence running right now is NOT forgiven", () => {
  const t = computeEffectiveTime({ blocks: FULL_DAY, callMinutes: [at(10)], nowMinute: at(11, 30) });
  assert.equal(t.forgivenPauseMinutes, 0);
});

test("gaps under the pause threshold are ordinary calling rhythm", () => {
  const t = computeEffectiveTime({ blocks: FULL_DAY, callMinutes: [at(10), at(10, 29)], nowMinute: at(11) });
  assert.equal(t.forgivenPauseMinutes, 0);
});

test("lunch inside a gap is not forgiven twice", () => {
  // 12:00 → 14:00 gap = 120 min, of which 60 is lunch (already outside planned time)
  const t = computeEffectiveTime({ blocks: FULL_DAY, callMinutes: [at(12), at(14)], nowMinute: at(15) });
  assert.equal(t.forgivenPauseMinutes, 60);
});

test("forgiven pause time is capped so slow calling can't pass as pauses", () => {
  // one call every 40 minutes all morning: every gap is a 'pause'
  const calls = [at(9), at(9, 40), at(10, 20), at(11), at(11, 40), at(12, 20)];
  const t = computeEffectiveTime({ blocks: FULL_DAY, callMinutes: calls, nowMinute: at(12, 30) });
  assert.equal(t.forgivenPauseMinutes, 90);
});

test("calls dated after 'now' are ignored", () => {
  const t = computeEffectiveTime({ blocks: FULL_DAY, callMinutes: [at(10), at(12)], nowMinute: at(10, 30) });
  assert.equal(t.forgivenPauseMinutes, 0);
});

// ============================================
// Notifications
// ============================================

const T0 = Date.UTC(2026, 8, 30, 9, 0);
const min = (n: number) => n * 60 * 1000;

test("first reading of the day: silent when on track, notifies when not", () => {
  assert.equal(decidePaceNotification(null, "ON_TRACK", T0).notification, null);
  assert.deepEqual(decidePaceNotification(null, "BEHIND", T0).notification, {
    kind: "CHANGE",
    from: null,
    to: "BEHIND",
  });
  assert.deepEqual(decidePaceNotification(null, "ON_TRACK", T0).next, { status: "ON_TRACK", at: T0 });
});

test("a status change notifies once the minimum gap has passed", () => {
  const prev = { status: "ON_TRACK" as const, at: T0 };
  const d = decidePaceNotification(prev, "BEHIND", T0 + MIN_CHANGE_GAP_MS);
  assert.deepEqual(d.notification, { kind: "CHANGE", from: "ON_TRACK", to: "BEHIND" });
  assert.deepEqual(d.next, { status: "BEHIND", at: T0 + MIN_CHANGE_GAP_MS });
});

test("a change too soon after the last notification is held back, reference status kept", () => {
  const prev = { status: "ON_TRACK" as const, at: T0 };
  const d = decidePaceNotification(prev, "BEHIND", T0 + min(5));
  assert.equal(d.notification, null);
  assert.deepEqual(d.next, prev);
});

test("flapping across a threshold then coming back never shows a notification", () => {
  let state: ReturnType<typeof decidePaceNotification>["next"] = { status: "ON_TRACK", at: T0 };
  const shown: unknown[] = [];
  const readings: [number, "ON_TRACK" | "BEHIND"][] = [
    [2, "BEHIND"], [4, "ON_TRACK"], [6, "BEHIND"], [8, "ON_TRACK"], [10, "ON_TRACK"],
  ];
  for (const [m, status] of readings) {
    const d = decidePaceNotification(state, status, T0 + min(m));
    if (d.notification) shown.push(d.notification);
    state = d.next;
  }
  assert.deepEqual(shown, []);
});

test("same status: silent until an hour has passed, then one hourly check-in", () => {
  const prev = { status: "BEHIND" as const, at: T0 };
  assert.equal(decidePaceNotification(prev, "BEHIND", T0 + HOURLY_INTERVAL_MS - 1).notification, null);
  const d = decidePaceNotification(prev, "BEHIND", T0 + HOURLY_INTERVAL_MS);
  assert.deepEqual(d.notification, { kind: "HOURLY", status: "BEHIND" });
  assert.equal(d.next?.at, T0 + HOURLY_INTERVAL_MS);
});

// ============================================
// Formatting
// ============================================

test("formatHours", () => {
  assert.equal(formatHours(0), "0h");
  assert.equal(formatHours(2.5), "2h30");
  assert.equal(formatHours(6), "6h");
  assert.equal(formatHours(1 + 1 / 12), "1h05");
});

test("summary wording when ahead", () => {
  assert.equal(
    formatPaceSummary({ callsDone: 50, dayQuota: 70, expected: 35, delta: -15 }),
    "50 / 70 appels · Objectif à ce stade : 35 · Avance : 15 appels",
  );
});
