import { test } from "node:test";
import assert from "node:assert/strict";
import {
    clampPauseMinutes, describeLine, holdProgress, lineStatus, parseStoredPause, pauseMinutesForHold, rings, storedPause,
    HOLD_THRESHOLD_MS, QUARTER_MS,
} from "./line-state";

const NOW = Date.parse("2026-11-26T10:00:00Z");
const min = 60_000;

test("the line is on, paused until a time, or on voicemail", () => {
    assert.equal(lineStatus({ receiveCalls: true, pause: null }, NOW).mode, "on");
    assert.equal(lineStatus({ receiveCalls: false, pause: null }, NOW).mode, "voicemail");
    const pause = { from: NOW - 10 * min, until: NOW + 20 * min, reason: "manual" as const };
    const s = lineStatus({ receiveCalls: true, pause }, NOW);
    assert.equal(s.mode, "paused");
    assert.ok(Math.abs(s.remaining - 2 / 3) < 1e-9, "the amber arc shows the time left");
    assert.equal(lineStatus({ receiveCalls: true, pause }, NOW + 21 * min).mode, "on", "a pause that ran out is over");
    assert.equal(lineStatus({ receiveCalls: false, pause }, NOW).mode, "voicemail", "the switch wins over a pause");
    assert.equal(rings({ receiveCalls: true, pause }, NOW), false);
    assert.equal(rings({ receiveCalls: true, pause }, NOW + 21 * min), true);
});

test("a press is a click; holding fills the ring a quarter (15 min) at a time", () => {
    assert.equal(pauseMinutesForHold(120), null);
    assert.equal(pauseMinutesForHold(HOLD_THRESHOLD_MS - 1), null);
    assert.equal(pauseMinutesForHold(HOLD_THRESHOLD_MS + 1), 15, "letting go as soon as it fills still pauses");
    assert.equal(pauseMinutesForHold(HOLD_THRESHOLD_MS + QUARTER_MS), 15);
    assert.equal(pauseMinutesForHold(HOLD_THRESHOLD_MS + QUARTER_MS + 1), 30);
    assert.equal(pauseMinutesForHold(HOLD_THRESHOLD_MS + 3 * QUARTER_MS + 1), 60);
    assert.equal(pauseMinutesForHold(60_000), 60, "a full turn is the most");
    assert.equal(holdProgress(0), 0);
    assert.equal(holdProgress(HOLD_THRESHOLD_MS + 2 * QUARTER_MS), 0.5);
    assert.equal(holdProgress(60_000), 1);
});

test("the stored pause is read defensively and clamped when written", () => {
    const stored = storedPause(30, "missed", NOW);
    assert.deepEqual(parseStoredPause(stored, NOW), { from: NOW, until: NOW + 30 * min, reason: "missed" });
    assert.equal(parseStoredPause(stored, NOW + 31 * min), null, "over");
    assert.equal(parseStoredPause({ from: "x", until: "y" }, NOW), null);
    assert.equal(parseStoredPause("oops", NOW), null);
    assert.equal(parseStoredPause({ ...stored, reason: "??" }, NOW)?.reason, "manual");
    assert.equal(clampPauseMinutes(1), 5);
    assert.equal(clampPauseMinutes(10_000), 240);
    assert.equal(clampPauseMinutes(Number.NaN), 5);
});

test("the menu line says what happens to a call now", () => {
    assert.equal(describeLine({ mode: "on", pause: null, remaining: 0 }), "Les appels sonnent ici");
    const until = Date.parse("2026-11-26T13:30:00Z");
    assert.match(describeLine({ mode: "paused", pause: { from: NOW, until, reason: "missed" }, remaining: 1 }), /^En pause jusqu'à \d\d:\d\d : 2 appels sans réponse$/);
});
