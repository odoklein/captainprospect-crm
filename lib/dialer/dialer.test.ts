import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch, classifyAnsweredBy, fold, routeAnswered, timeoutFor, type AttemptEvent, type AttemptFacts } from "./attempt-state";
import { CEILINGS, DEFAULT_DIALER_POLICY, decideLines, inCallingWindow, parseDialerPolicy, type LineInputs } from "./policy";

const T = (s: number) => new Date(Date.UTC(2026, 10, 12, 9, 0, s));
const fresh = (): AttemptFacts => ({
    state: "PENDING", outcome: null, callSid: null, answeredBy: null,
    placedAt: null, ringingAt: null, answeredAt: null, detectedAt: null, reservedAt: null, bridgedAt: null, endedAt: null,
});
function run(events: AttemptEvent[], start = fresh()): AttemptFacts {
    return events.reduce((f, e) => {
        const p = fold(f, e);
        return p ? applyPatch(f, p) : f;
    }, start);
}
const status = (s: string, at: number) => ({ type: "PROVIDER_STATUS", status: s, at: T(at) }) as AttemptEvent;

// ── state machine ──────────────────────────────────────────────────────────

test("answered is not connected: only a confirmed bridge counts as a conversation", () => {
    const f = run([{ type: "PLACED", callSid: "CA1", at: T(0) }, status("ringing", 1), status("in-progress", 5), status("completed", 40)]);
    assert.equal(f.outcome, "ABANDONED", "answered, never bridged, verdict unknown → abandoned, not a conversation");
    const g = run([{ type: "PLACED", callSid: "CA1", at: T(0) }, status("in-progress", 5), { type: "AMD", answeredBy: "human", at: T(7) }, { type: "RESERVED", at: T(7) }, { type: "BRIDGE_CONFIRMED", at: T(8) }, status("completed", 90)]);
    assert.equal(g.outcome, "CONVERSATION");
});

test("out-of-order: 'ringing' after 'in-progress' does not move the call back", () => {
    const f = run([status("in-progress", 5), status("ringing", 2)]);
    assert.equal(f.state, "ANSWERED");
    assert.equal(f.ringingAt, null);
});

test("duplicates are no-ops", () => {
    const f = run([status("ringing", 1)]);
    assert.equal(fold(f, status("ringing", 1)), null);
    const g = run([status("in-progress", 5), { type: "AMD", answeredBy: "human", at: T(7) }]);
    assert.equal(fold(g, { type: "AMD", answeredBy: "machine_start", at: T(8) }), null, "the first verdict stands");
});

test("a detection verdict arriving before the 'answered' status implies the answer", () => {
    const f = run([status("ringing", 1), { type: "AMD", answeredBy: "machine_start", at: T(6) }]);
    assert.equal(f.state, "ANSWERED");
    assert.equal(f.answeredBy, "machine_start");
});

test("ENDED is terminal; a late verdict is still recorded for detection metrics", () => {
    const ended = run([status("in-progress", 5), { type: "RELEASE", outcome: "ABANDONED", at: T(6) }]);
    for (const e of [status("ringing", 7), status("completed", 9), { type: "RESERVED", at: T(8) } as AttemptEvent, { type: "BRIDGE_CONFIRMED", at: T(8) } as AttemptEvent]) {
        const p = fold(ended, e);
        assert.equal(p, null, JSON.stringify(e));
    }
    assert.deepEqual(fold(ended, { type: "AMD", answeredBy: "human", at: T(9) }), { answeredBy: "human", detectedAt: T(9) });
});

test("reservation and bridge only happen from their exact predecessor", () => {
    assert.equal(fold(run([status("ringing", 1)]), { type: "RESERVED", at: T(2) }), null, "cannot reserve for a call nobody answered");
    assert.equal(fold(run([status("in-progress", 5)]), { type: "BRIDGE_CONFIRMED", at: T(6) }), null, "cannot connect without a reservation");
});

test("a release while connected keeps it a conversation", () => {
    const f = run([status("in-progress", 5), { type: "AMD", answeredBy: "human", at: T(6) }, { type: "RESERVED", at: T(6) }, { type: "BRIDGE_CONFIRMED", at: T(7) }, { type: "RELEASE", outcome: "CANCELED_SESSION", at: T(60) }]);
    assert.equal(f.outcome, "CONVERSATION");
});

test("hang-up during the bridge counts as abandoned", () => {
    const f = run([status("in-progress", 5), { type: "AMD", answeredBy: "human", at: T(6) }, { type: "RESERVED", at: T(6) }, status("completed", 7)]);
    assert.equal(f.outcome, "ABANDONED");
});

test("provider terminal statuses map to outcomes", () => {
    assert.equal(run([status("busy", 3)]).outcome, "BUSY");
    assert.equal(run([status("no-answer", 25)]).outcome, "NO_ANSWER");
    assert.equal(run([status("failed", 1)]).outcome, "FAILED");
    assert.equal(run([status("canceled", 1)]).outcome, "CANCELED_SESSION");
    assert.equal(run([status("in-progress", 5), { type: "AMD", answeredBy: "machine_end_beep", at: T(9) }, status("completed", 20)]).outcome, "VOICEMAIL");
});

test("a different callSid for the same attempt is ignored", () => {
    const f = run([{ type: "PLACED", callSid: "CA1", at: T(0) }]);
    assert.equal(fold(f, { type: "PLACED", callSid: "CA2", at: T(1) }), null);
});

// ── classification & routing ───────────────────────────────────────────────

test("anything unexpected from detection is « unknown », never « human »", () => {
    assert.equal(classifyAnsweredBy("human"), "human");
    assert.equal(classifyAnsweredBy("machine_end_silence"), "machine");
    assert.equal(classifyAnsweredBy("fax"), "fax");
    assert.equal(classifyAnsweredBy("unknown"), "unknown");
    assert.equal(classifyAnsweredBy("HUMAN-ish"), "unknown");
    assert.equal(classifyAnsweredBy(null), "unknown");
});

test("routing: wait for the verdict, bridge humans, release machines, abandon when nobody is free", () => {
    const p = { amd: "async" as const, uncertain: "bridge" as const };
    assert.deepEqual(routeAnswered({ state: "ANSWERED", answeredBy: null }, p, true), { action: "WAIT" });
    assert.deepEqual(routeAnswered({ state: "ANSWERED", answeredBy: "human" }, p, true), { action: "BRIDGE" });
    assert.deepEqual(routeAnswered({ state: "ANSWERED", answeredBy: "human" }, p, false), { action: "RELEASE", outcome: "ABANDONED" });
    assert.deepEqual(routeAnswered({ state: "ANSWERED", answeredBy: "machine_start" }, p, true), { action: "RELEASE", outcome: "VOICEMAIL" });
    assert.deepEqual(routeAnswered({ state: "ANSWERED", answeredBy: "unknown" }, p, true), { action: "BRIDGE" }, "uncertain defaults to the SDR, not to hanging up on a person");
    assert.deepEqual(routeAnswered({ state: "ANSWERED", answeredBy: "unknown" }, { ...p, uncertain: "release" }, true), { action: "RELEASE", outcome: "UNCERTAIN_RELEASED" });
    assert.deepEqual(routeAnswered({ state: "ANSWERED", answeredBy: null }, { amd: "off", uncertain: "bridge" }, true), { action: "BRIDGE" });
    assert.equal(routeAnswered({ state: "BRIDGING", answeredBy: "human" }, p, true), null, "only an ANSWERED call is routed");
});

// ── timeouts ───────────────────────────────────────────────────────────────

test("timeouts: lost callbacks never leave a line or an SDR stuck", () => {
    const tp = { ringTimeoutSec: 25, amdTimeoutSec: 6 };
    const base = { ...fresh(), createdAt: T(0) };
    assert.equal(timeoutFor(base, T(20), tp), null);
    assert.deepEqual(timeoutFor(base, T(31), tp), { action: "RELEASE", outcome: "FAILED", hangup: false });
    assert.deepEqual(timeoutFor({ ...base, state: "RINGING", placedAt: T(0) }, T(41), tp), { action: "RELEASE", outcome: "TIMEOUT", hangup: true });
    assert.deepEqual(timeoutFor({ ...base, state: "ANSWERED", answeredAt: T(0) }, T(7), tp), { action: "TREAT_AS_UNKNOWN" });
    assert.equal(timeoutFor({ ...base, state: "ANSWERED", answeredAt: T(0), answeredBy: "human" }, T(7), tp), null);
    assert.deepEqual(timeoutFor({ ...base, state: "BRIDGING", reservedAt: T(0) }, T(16), tp), { action: "RELEASE", outcome: "ABANDONED", hangup: true });
    assert.equal(timeoutFor({ ...base, state: "CONNECTED", bridgedAt: T(0) }, T(3600), tp), null, "a conversation is never timed out");
});

// ── policy ─────────────────────────────────────────────────────────────────

test("policy: parallel is OFF by default and every value is clamped to a ceiling", () => {
    assert.equal(parseDialerPolicy(null).parallelEnabled, false);
    const p = parseDialerPolicy(JSON.stringify({ parallelEnabled: true, maxLinesPerSdr: 50, maxAbandonRate: 0.4, ringTimeoutSec: 5, maxConcurrentOrg: 10_000, missionMaxLines: { m1: 9 } }));
    assert.equal(p.maxLinesPerSdr, CEILINGS.maxLinesPerSdr);
    assert.equal(p.maxAbandonRate, CEILINGS.maxAbandonRate);
    assert.equal(p.ringTimeoutSec, CEILINGS.ringTimeoutSec.min);
    assert.equal(p.maxConcurrentOrg, CEILINGS.maxConcurrentOrg);
    assert.equal(p.missionMaxLines.m1, CEILINGS.maxLinesPerSdr, "a mission can only lower the cap");
});

test("policy: an empty or junk calling window never means « always »", () => {
    assert.deepEqual(parseDialerPolicy(JSON.stringify({ callingWindows: [] })).callingWindows, DEFAULT_DIALER_POLICY.callingWindows);
    assert.deepEqual(parseDialerPolicy(JSON.stringify({ callingWindows: [{ days: [9], start: "25:00", end: "x" }] })).callingWindows, DEFAULT_DIALER_POLICY.callingWindows);
    assert.deepEqual(parseDialerPolicy("{bad").callingWindows, DEFAULT_DIALER_POLICY.callingWindows);
});

test("calling window is evaluated in Paris time", () => {
    const p = DEFAULT_DIALER_POLICY;
    assert.equal(inCallingWindow(new Date("2026-11-12T07:30:00Z"), p), false, "08:30 Paris");
    assert.equal(inCallingWindow(new Date("2026-11-12T08:00:00Z"), p), true, "09:00 Paris");
    assert.equal(inCallingWindow(new Date("2026-11-12T18:00:00Z"), p), false, "19:00 Paris");
    assert.equal(inCallingWindow(new Date("2026-11-14T10:00:00Z"), p), false, "Saturday");
});

function lines(over: Partial<LineInputs> = {}): ReturnType<typeof decideLines> {
    return decideLines({
        policy: { ...DEFAULT_DIALER_POLICY, parallelEnabled: true },
        missionId: null, agentState: "READY", sessionStatus: "OPEN", liveLines: 0, orgLiveLines: 0,
        recent: { attempts: 0, humanAnswers: 0, abandoned: 0 },
        now: new Date("2026-11-12T09:00:00Z"),
        ...over,
    });
}

test("lines: nothing rings unless the SDR is READY in an open session, inside calling hours", () => {
    assert.equal(lines({ agentState: "ON_CALL" }).toPlace, 0);
    assert.equal(lines({ agentState: "WRAP_UP" }).toPlace, 0);
    assert.equal(lines({ sessionStatus: "PAUSED" }).toPlace, 0);
    assert.equal(lines({ now: new Date("2026-11-14T10:00:00Z") }).toPlace, 0);
    assert.equal(lines({ policy: DEFAULT_DIALER_POLICY }).toPlace, 0, "org switch off");
});

test("lines: starts at the conservative cap and adapts to the answer rate", () => {
    assert.equal(lines().target, 2, "prior ≈ 20 % answers, capped at the default 2");
    assert.equal(lines({ recent: { attempts: 40, humanAnswers: 30, abandoned: 0 } }).target, 1, "most calls answered: one line is enough");
    assert.equal(lines({ liveLines: 1 }).toPlace, 1, "only the missing lines are placed");
    assert.equal(lines({ liveLines: 2 }).toPlace, 0);
});

test("lines: an abandon rate above the ceiling falls back to a single line", () => {
    const d = lines({ recent: { attempts: 100, humanAnswers: 20, abandoned: 2 } });
    assert.equal(d.target, 1);
    assert.match(d.reason, /abandon/);
    assert.equal(lines({ recent: { attempts: 20, humanAnswers: 5, abandoned: 2 } }).target, 2, "below the minimum sample, no verdict yet");
});

test("lines: mission cap and organisation capacity", () => {
    const policy = { ...DEFAULT_DIALER_POLICY, parallelEnabled: true, maxLinesPerSdr: 3, missionMaxLines: { m1: 1 } };
    assert.equal(lines({ policy, missionId: "m1" }).target, 1);
    const full = lines({ orgLiveLines: DEFAULT_DIALER_POLICY.maxConcurrentOrg });
    assert.equal(full.toPlace, 0);
    assert.match(full.reason, /Capacité/);
});
