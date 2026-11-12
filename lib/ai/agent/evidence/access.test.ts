/**
 * Evidence access with shared conversations (Captain AI v4).
 *     npx tsx --test lib/ai/agent/evidence/access.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { evidenceAccessDecision, type EvidenceAccessSubject } from "./access";

const base: EvidenceAccessSubject = {
    userId: "u1",
    clientId: "c1",
    missionId: "m1",
    conversation: { createdById: "u1", clientId: "c1", missionId: "m1" },
};
const shared: EvidenceAccessSubject = { ...base, conversation: { ...base.conversation, visibility: "SHARED" } };
const owner = { id: "u1", role: "MANAGER", isActive: true };
const colleague = { id: "u2", role: "MANAGER", isActive: true };

test("a PRIVATE (or pre-v4) thread's evidence stays with its author", () => {
    assert.equal(evidenceAccessDecision(base, owner).allowed, true);
    assert.deepEqual(evidenceAccessDecision(base, colleague), { allowed: false, reason: "not_owner" });
    const priv = { ...base, conversation: { ...base.conversation, visibility: "PRIVATE" as const } };
    assert.equal(evidenceAccessDecision(priv, colleague).allowed, false);
});

test("a SHARED thread's evidence opens for any active manager", () => {
    assert.equal(evidenceAccessDecision(shared, colleague).allowed, true);
    assert.equal(evidenceAccessDecision(shared, owner).allowed, true);
    assert.deepEqual(evidenceAccessDecision(shared, { ...colleague, isActive: false }), { allowed: false, reason: "inactive_account" });
    assert.deepEqual(evidenceAccessDecision(shared, { ...colleague, role: "SDR" }), { allowed: false, reason: "role_denied" });
});

test("shared or not, the scope and the author of the record must match the thread", () => {
    assert.deepEqual(evidenceAccessDecision({ ...shared, clientId: "c2" }, colleague), { allowed: false, reason: "scope_mismatch" });
    assert.deepEqual(evidenceAccessDecision({ ...shared, missionId: null }, colleague), { allowed: false, reason: "scope_mismatch" });
    assert.deepEqual(evidenceAccessDecision({ ...shared, userId: "u3" }, colleague), { allowed: false, reason: "not_owner" });
});
