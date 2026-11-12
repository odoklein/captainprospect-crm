/**
 * The finding state machine, pure.
 *     npm run test:agent
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeKeyFor, reconcileFindings } from "./findings";
import type { DetectedFinding, FindingRow } from "./types";

const now = new Date("2026-10-29T10:00:00.000Z");
const earlier = new Date("2026-10-28T10:00:00.000Z");
const opts = { rule: "client_at_risk", scopeKey: "agency", now };

function row(overrides: Partial<FindingRow> & { key: string }): FindingRow {
    const { key, ...rest } = overrides;
    return {
        id: `f_${key}`,
        rule: "client_at_risk",
        dedupeKey: dedupeKeyFor("client_at_risk", "agency", key),
        severity: "WARN",
        kind: "client_at_risk",
        title: "t",
        body: "b",
        metrics: null,
        clientId: key,
        missionId: null,
        subjectUserId: null,
        state: "OPEN",
        firstSeenAt: earlier,
        lastSeenAt: earlier,
        seenCount: 1,
        snoozedUntil: null,
        notifiedAt: earlier,
        ...rest,
    };
}

function det(key: string, severity: DetectedFinding["severity"] = "WARN"): DetectedFinding {
    return { key, severity, kind: "client_at_risk", title: `Client ${key}`, body: "aucun RDV", clientId: key };
}

test("new finding → created OPEN", () => {
    const plan = reconcileFindings([], [det("c1")], opts);
    assert.equal(plan.creates.length, 1);
    assert.equal(plan.creates[0].dedupeKey, "client_at_risk:agency:c1");
    assert.equal(plan.events.created.length, 1);
    assert.equal(plan.events.created[0].state, "OPEN");
    assert.equal(plan.updates.length, 0);
});

test("seen again at the same severity → bumped, nothing announced", () => {
    const plan = reconcileFindings([row({ key: "c1" })], [det("c1")], opts);
    assert.equal(plan.events.created.length + plan.events.escalated.length + plan.events.reopened.length, 0);
    assert.equal(plan.unchanged, 1);
    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0].data.seenCount, 2);
    assert.equal(plan.updates[0].data.lastSeenAt, now);
    assert.equal(plan.updates[0].data.state, undefined);
});

test("severity up → escalated; down → silent", () => {
    const up = reconcileFindings([row({ key: "c1", severity: "WARN" })], [det("c1", "CRITICAL")], opts);
    assert.equal(up.events.escalated.length, 1);
    assert.equal(up.events.escalated[0].severity, "CRITICAL");
    assert.equal(up.updates[0].data.severity, "CRITICAL");

    const down = reconcileFindings([row({ key: "c1", severity: "CRITICAL" })], [det("c1", "INFO")], opts);
    assert.equal(down.events.escalated.length, 0);
    assert.equal(down.unchanged, 1);
    assert.equal(down.updates[0].data.severity, "INFO");
});

test("ACKED stays acked unless it escalates, then it is OPEN again", () => {
    const same = reconcileFindings([row({ key: "c1", state: "ACKED" })], [det("c1")], opts);
    assert.equal(same.updates[0].data.state, undefined);
    assert.equal(same.unchanged, 1);
    const esc = reconcileFindings([row({ key: "c1", state: "ACKED" })], [det("c1", "CRITICAL")], opts);
    assert.equal(esc.updates[0].data.state, "OPEN");
    assert.equal(esc.events.escalated.length, 1);
});

test("SNOOZED is silent until snoozedUntil, then reopened", () => {
    const later = new Date(now.getTime() + 3_600_000);
    const quiet = reconcileFindings([row({ key: "c1", state: "SNOOZED", snoozedUntil: later })], [det("c1", "CRITICAL")], opts);
    assert.equal(quiet.events.escalated.length, 0);
    assert.equal(quiet.events.reopened.length, 0);
    assert.equal(quiet.updates[0].data.state, undefined);

    const expired = reconcileFindings([row({ key: "c1", state: "SNOOZED", snoozedUntil: earlier })], [det("c1")], opts);
    assert.equal(expired.events.reopened.length, 1);
    assert.equal(expired.updates[0].data.state, "OPEN");
    assert.equal(expired.updates[0].data.snoozedUntil, null);
});

test("RESOLVED reappearing → reopened", () => {
    const plan = reconcileFindings([row({ key: "c1", state: "RESOLVED" })], [det("c1")], opts);
    assert.equal(plan.events.reopened.length, 1);
    assert.equal(plan.updates[0].data.state, "OPEN");
    assert.equal(plan.updates[0].data.resolvedAt, null);
});

test("OPEN not returned by the detector → RESOLVED; other scopes and rules untouched", () => {
    const foreign = { ...row({ key: "zz" }), dedupeKey: "client_at_risk:client-X:zz" };
    const otherRule = { ...row({ key: "yy" }), rule: "sdr_under_pace", dedupeKey: "sdr_under_pace:agency:yy" };
    const plan = reconcileFindings([row({ key: "c1" }), row({ key: "c2", state: "SNOOZED" }), foreign, otherRule], [det("c1")], opts);
    assert.deepEqual(plan.events.resolved.map((r) => r.dedupeKey), ["client_at_risk:agency:c2"]);
    assert.equal(plan.updates.find((u) => u.id === "f_c2")?.data.state, "RESOLVED");
    assert.equal(plan.updates.some((u) => u.id === foreign.id || u.id === otherRule.id), false);
});

test("an already RESOLVED row that is still absent is left alone", () => {
    const plan = reconcileFindings([row({ key: "c1", state: "RESOLVED" })], [], opts);
    assert.equal(plan.updates.length, 0);
    assert.equal(plan.events.resolved.length, 0);
});

test("a detector repeating a key yields one finding", () => {
    const plan = reconcileFindings([], [det("c1"), det("c1", "CRITICAL")], opts);
    assert.equal(plan.creates.length, 1);
    assert.equal(plan.creates[0].severity, "WARN");
});

test("day-keyed findings: yesterday's key resolves, today's is created", () => {
    const yesterday = row({ key: "u1:2026-10-28", subjectUserId: "u1" });
    const plan = reconcileFindings([yesterday], [{ ...det("u1:2026-10-29"), subjectUserId: "u1" }], { ...opts, rule: "client_at_risk" });
    assert.equal(plan.events.created.length, 1);
    assert.equal(plan.events.resolved.length, 1);
});
