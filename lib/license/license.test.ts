/**
 * Pure rules of the instance license:
 *     npm run test:license
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_LICENSE, checkSeats, isFeatureEnabled, isSuspended, mergeLicense, usesSeat, validateLicenseInput } from "./resolve";

test("no row means active, unlimited, everything on", () => {
    const l = mergeLicense(null);
    assert.equal(l.status, "ACTIVE");
    assert.equal(l.seatLimit, null);
    assert.equal(isSuspended(l), false);
    for (const on of Object.values(l.features)) assert.equal(on, true);
});

test("defaults are not shared between calls", () => {
    mergeLicense(null).features.callVault = false;
    assert.equal(DEFAULT_LICENSE.features.callVault, true);
    assert.equal(mergeLicense(null).features.callVault, true);
});

test("a stored row overrides only what it sets; junk falls back", () => {
    const l = mergeLicense({
        status: "SUSPENDED",
        plan: "  pro ",
        seatLimit: 8,
        features: { callVault: false, bogus: false, aiAssistant: "no" },
        aiMonthlyQuota: -3,
        suspendedReason: "",
        updatedAt: new Date("2026-10-26T10:00:00Z"),
    });
    assert.equal(l.status, "SUSPENDED");
    assert.equal(l.plan, "pro");
    assert.equal(l.seatLimit, 8);
    assert.equal(isFeatureEnabled(l, "callVault"), false);
    assert.equal(isFeatureEnabled(l, "aiAssistant"), true);
    assert.equal(l.aiMonthlyQuota, null);
    assert.equal(l.suspendedReason, null);
    assert.equal(l.updatedAt, "2026-10-26T10:00:00.000Z");
    assert.equal(mergeLicense({ status: "whatever" }).status, "ACTIVE");
    assert.equal(mergeLicense({ features: [true] }).features.callVault, true);
});

test("seat check: unlimited, within, at and over the limit", () => {
    const limited = mergeLicense({ seatLimit: 8 });
    assert.equal(checkSeats(mergeLicense(null), 500).ok, true);
    assert.equal(checkSeats(limited, 7).ok, true);
    const full = checkSeats(limited, 8);
    assert.equal(full.ok, false);
    if (!full.ok) assert.match(full.message, /8 utilisateurs/);
    assert.equal(checkSeats(limited, 10, 0).ok, true);
    assert.equal(checkSeats(mergeLicense({ seatLimit: 0 }), 0).ok, false);
    const one = checkSeats(mergeLicense({ seatLimit: 1 }), 1);
    if (!one.ok) assert.match(one.message, /1 utilisateur atteinte/);
});

test("client-portal users take no seat", () => {
    assert.equal(usesSeat("CLIENT"), false);
    assert.equal(usesSeat("COMMERCIAL"), false, "a client's salesperson with a portal account is not agency staff");
    for (const role of ["SDR", "MANAGER", "BOOKER", "DEVELOPER", "BUSINESS_DEVELOPER"]) assert.equal(usesSeat(role), true);
});

test("input validation accepts a partial update and rejects typos", () => {
    const ok = validateLicenseInput({ status: "SUSPENDED", seatLimit: null, features: { callVault: false }, suspendedReason: " impayé " });
    assert.deepEqual(ok, { ok: true, value: { status: "SUSPENDED", seatLimit: null, features: { callVault: false }, suspendedReason: "impayé" } });

    const bad = validateLicenseInput({ status: "PAUSED", seatLimit: -1, seatlimit: 3, features: { nope: true, callVault: "yes" } });
    assert.equal(bad.ok, false);
    if (!bad.ok) {
        assert.deepEqual(Object.keys(bad.errors).sort(), ["features.callVault", "features.nope", "seatLimit", "seatlimit", "status"]);
    }
    assert.equal(validateLicenseInput([]).ok, false);
    assert.equal(validateLicenseInput({ seatLimit: 1.5 }).ok, false);
});

test("feature gates: aiAssistant blocks its API, whiteLabel only blocks edits", async () => {
    const { blockingFeature } = await import("./gates");
    const off = { aiAssistant: false, whiteLabel: false };
    assert.equal(blockingFeature("/api/manager/assistant/chat", "POST", off), "aiAssistant");
    assert.equal(blockingFeature("/api/manager/assistant", "GET", off), "aiAssistant");
    assert.equal(blockingFeature("/api/manager/assistants-other", "GET", off), null, "prefix match is per path segment");
    assert.equal(blockingFeature("/api/manager/brand", "PUT", off), "whiteLabel");
    assert.equal(blockingFeature("/api/manager/brand", "GET", off), null);
    assert.equal(blockingFeature("/api/manager/assistant/chat", "POST", {}), null, "missing key = enabled");
    assert.equal(blockingFeature("/api/manager/assistant/chat", "POST", { aiAssistant: true }), null);
});

test("peek reads the process cache and defaults to enabled when cold", async () => {
    const { peekFeature } = await import("./peek");
    const g = globalThis as unknown as { __licenseCache?: unknown };
    const saved = g.__licenseCache;
    try {
        delete g.__licenseCache;
        assert.equal(peekFeature("callVault"), true);
        g.__licenseCache = { entry: { license: mergeLicense({ features: { callVault: false } }) } };
        assert.equal(peekFeature("callVault"), false);
        assert.equal(peekFeature("aiAssistant"), true);
    } finally {
        if (saved === undefined) delete g.__licenseCache;
        else g.__licenseCache = saved;
    }
});
