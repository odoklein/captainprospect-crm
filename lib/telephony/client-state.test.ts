import assert from "node:assert/strict";
import test from "node:test";
import { isCurrentAttempt, matchesCallTarget } from "./client-state";

test("cancelled setup stays invalid after a new call clears cancellation history", () => {
    assert.equal(isCurrentAttempt(1, 1, new Set([1])), false);
    assert.equal(isCurrentAttempt(1, 2, new Set()), false);
    assert.equal(isCurrentAttempt(2, 2, new Set()), true);
});

test("two contacts at the same company never share a call summary", () => {
    const target = { companyId: "acme", contactId: "alice" };
    assert.equal(matchesCallTarget(target, { companyId: "acme", contactId: "bob" }), false);
    assert.equal(matchesCallTarget(target, target), true);
    assert.equal(matchesCallTarget({ companyId: "acme" }, { companyId: "acme", contactId: null }), true);
    assert.equal(matchesCallTarget(target, { companyId: "other", contactId: "alice" }), false);
});
