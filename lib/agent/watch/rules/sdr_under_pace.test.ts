/**
 * sdr_under_pace on injected reads: the extracted pace computation (with the
 * Allo timeout) and the rule's mapping to findings.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSdrPaceFor, type SdrPaceDeps } from "@/lib/sdr-pace/server";
import { createSdrUnderPaceRule } from "./sdr_under_pace";

const signal = new AbortController().signal;
// Thursday 29 Oct 2026, 11:00 Paris (CET) — inside the default 9:00-17:00 window
const now = new Date("2026-10-29T10:00:00.000Z");

function deps(overrides: Partial<SdrPaceDeps> & { calls?: number; allo?: number | "slow" | "error"; line?: string | null }): SdrPaceDeps {
    const calls = overrides.calls ?? 10;
    return {
        getPaceConfig: async () => ({ dailyQuota: 70, targetHours: 6 }),
        listCallTimes: async (_sdr, since) => Array.from({ length: calls }, (_, i) => new Date(since.getTime() + (9 * 60 + 5 + i * 5) * 60_000)),
        listScheduleBlocks: async () => [],
        alloPhoneNumber: async () => (overrides.line === undefined ? "+33123456789" : overrides.line),
        alloCalls: async () => {
            if (overrides.allo === "slow") return new Promise<number>((resolve) => setTimeout(() => resolve(99), 200));
            if (overrides.allo === "error") throw new Error("allo down");
            return overrides.allo ?? 0;
        },
        ...overrides,
    };
}

test("computeSdrPaceFor: Allo count wins when higher, the CRM count is the floor", async () => {
    const a = await computeSdrPaceFor("u1", now, { deps: deps({ calls: 10, allo: 14 }) });
    assert.equal(a.pace.callsDone, 14);
    assert.equal(a.alloUsed, true);
    assert.equal(a.alloDegraded, false);
    assert.equal(a.crmCalls, 10);
    const b = await computeSdrPaceFor("u1", now, { deps: deps({ calls: 10, allo: 3 }) });
    assert.equal(b.pace.callsDone, 10);
    const c = await computeSdrPaceFor("u1", now, { deps: deps({ calls: 10, line: null }) });
    assert.equal(c.alloUsed, false);
    assert.equal(c.pace.callsDone, 10);
});

test("computeSdrPaceFor: with a timeout, a slow or failing Allo degrades to CRM calls and says so", async () => {
    const slow = await computeSdrPaceFor("u1", now, { deps: deps({ calls: 10, allo: "slow" }), alloTimeoutMs: 20 });
    assert.equal(slow.alloDegraded, true);
    assert.equal(slow.alloUsed, false);
    assert.equal(slow.pace.callsDone, 10);
    const failing = await computeSdrPaceFor("u1", now, { deps: deps({ calls: 10, allo: "error" }), alloTimeoutMs: 1000 });
    assert.equal(failing.alloDegraded, true);
    assert.equal(failing.pace.callsDone, 10);
    // the route's path (no timeout) still throws, as it always did
    await assert.rejects(computeSdrPaceFor("u1", now, { deps: deps({ calls: 10, allo: "error" }) }), /allo down/);
    // the snapshot carries what the route returns
    assert.equal(typeof slow.time.isCallingTime, "boolean");
    assert.equal(slow.config.dailyQuota, 70);
});

test("the rule: BEHIND → WARN, LATE → CRITICAL, on track / goal reached / outside calling time → nothing", async () => {
    const sdrs = [
        { id: "late", name: "Léa" },
        { id: "behind", name: "Marc" },
        { id: "ok", name: "Nina" },
        { id: "done", name: "Omar" },
        { id: "lunch", name: "Paul" },
        { id: "broken", name: "Zoé" },
    ];
    // 11:00 in a 9-17 day (7 h planned, 2 h elapsed) → expected = ceil(70 * 2/7) = 20
    const rule = createSdrUnderPaceRule({
        listSdrs: async () => sdrs,
        pace: async (id) => {
            if (id === "broken") throw new Error("boom");
            const calls = { late: 8, behind: 15, ok: 19, done: 70, lunch: 2 }[id]!;
            const snap = await computeSdrPaceFor(id, now, { deps: deps({ calls, allo: id === "late" ? "slow" : 0 }), alloTimeoutMs: 20 });
            if (id === "lunch") snap.time = { ...snap.time, isCallingTime: false };
            return snap;
        },
    });
    const found = await rule.detect({ now, scope: { clientId: null, missionId: null }, config: {}, signal });
    assert.deepEqual(
        found.map((f) => [f.key, f.severity, f.subjectUserId]),
        [
            ["late:2026-10-29", "CRITICAL", "late"],
            ["behind:2026-10-29", "WARN", "behind"],
        ],
    );
    assert.equal(found[0].title, "Léa : en retard (8/20 appels à 11:00)");
    assert.match(found[0].body, /8 appels contre 20 attendus à 11:00, soit 12 de retard\. Objectif du jour : 70\. Mesure Allo indisponible/);
    assert.equal(found[0].metrics?.alloDegrade, 1);
    assert.equal(found[1].metrics?.alloDegrade, 0);
    assert.equal(found[1].metrics?.appelsAllo, 0);
    assert.doesNotMatch(found[1].body, /Allo/);
});

test("weekends detect nothing", async () => {
    let listed = 0;
    const rule = createSdrUnderPaceRule({
        listSdrs: async () => {
            listed += 1;
            return [{ id: "x", name: "X" }];
        },
        pace: async () => {
            throw new Error("should not be called");
        },
    });
    const saturday = new Date("2026-10-31T10:00:00.000Z");
    assert.deepEqual(await rule.detect({ now: saturday, scope: { clientId: null, missionId: null }, config: {}, signal }), []);
    assert.equal(listed, 0);
});
