/**
 * OAuth relay: signed state + what the relay does with a provider callback:
 *     npm run test:oauth-relay
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { peekRelayInstanceId, resolveRelayCallback, verifyRelayState, wrapRelayState } from "./state";
import { getRelayConfig, relayRedirectUri } from "./redirect";
import { stateForProvider } from "./config";

const SECRET = "s3cret-for-agence-nord-instance";
const INNER = Buffer.from(JSON.stringify({ userId: "u1", timestamp: 1, returnUrl: "/manager/emails/mailboxes" })).toString("base64url");
const NOW = 1_760_000_000_000;
const wrap = (over: Partial<Parameters<typeof wrapRelayState>[0]> = {}) =>
    wrapRelayState({ instanceId: "agence-nord", provider: "gmail", inner: INNER, adminSecret: SECRET, now: NOW, ...over });

test("a wrapped state verifies and gives back the inner state", () => {
    const state = wrap();
    assert.equal(peekRelayInstanceId(state), "agence-nord");
    const v = verifyRelayState({ state, adminSecret: SECRET, provider: "gmail", now: NOW + 1000 });
    assert.deepEqual(v, { ok: true, instanceId: "agence-nord", provider: "gmail", inner: INNER });
});

test("wrong secret, tampering, wrong provider, age and garbage are refused", () => {
    const state = wrap();
    const check = (over: Partial<Parameters<typeof verifyRelayState>[0]>) =>
        verifyRelayState({ state, adminSecret: SECRET, provider: "gmail", now: NOW, ...over });

    assert.deepEqual(check({ adminSecret: "another-secret-another-secret" }), { ok: false, reason: "bad_signature" });
    const [v, id, payload, sig] = state.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ p: "gmail", s: "evil", t: NOW })).toString("base64url");
    assert.deepEqual(check({ state: [v, id, forgedPayload, sig].join(".") }), { ok: false, reason: "bad_signature" });
    // Same signature replayed under another instance id
    assert.deepEqual(check({ state: [v, "agence-sud", payload, sig].join(".") }), { ok: false, reason: "bad_signature" });
    assert.deepEqual(check({ provider: "outlook" }), { ok: false, reason: "provider_mismatch" });
    assert.deepEqual(check({ now: NOW + 11 * 60 * 1000 }), { ok: false, reason: "expired" });
    assert.deepEqual(check({ now: NOW - 5 * 60 * 1000 }), { ok: false, reason: "expired" });
    for (const junk of [null, undefined, "", "abc", "v2.a.b.c", "v1.UPPER.b.c", "v1.a.b"]) {
        assert.deepEqual(check({ state: junk }), { ok: false, reason: "malformed" });
    }
    assert.equal(peekRelayInstanceId("not a state"), null);
});

test("instance ids cannot smuggle separators", () => {
    assert.throws(() => wrap({ instanceId: "a.b" }), /invalid_instance_id/);
    assert.throws(() => wrap({ instanceId: "Agence" }), /invalid_instance_id/);
});

const registry = {
    "agence-nord": { appUrl: "https://crm.agence-nord.fr/", adminSecret: SECRET },
};
const lookup = (id: string) => registry[id as keyof typeof registry] ?? null;

test("relay forwards to the REGISTERED host with the inner state and every provider param", async () => {
    const q = new URLSearchParams({ code: "4/abc", scope: "mail", state: wrap() });
    const r = await resolveRelayCallback({ provider: "gmail", query: q, lookup, now: NOW });
    assert.ok(r.ok);
    if (r.ok) {
        const u = new URL(r.location);
        assert.equal(u.origin, "https://crm.agence-nord.fr");
        assert.equal(u.pathname, "/api/email/oauth/gmail/callback");
        assert.equal(u.searchParams.get("code"), "4/abc");
        assert.equal(u.searchParams.get("scope"), "mail");
        assert.equal(u.searchParams.get("state"), INNER);
        assert.equal(r.instanceId, "agence-nord");
    }
});

test("relay forwards a provider error (user pressed Cancel)", async () => {
    const q = new URLSearchParams({ error: "access_denied", state: wrap({ provider: "outlook" }) });
    const r = await resolveRelayCallback({ provider: "outlook", query: q, lookup, now: NOW });
    assert.ok(r.ok);
    if (r.ok) assert.match(r.location, /\/api\/email\/oauth\/outlook\/callback\?error=access_denied&state=/);
});

test("relay refuses unknown instances, bad signatures and unknown providers", async () => {
    const unknown = await resolveRelayCallback({ provider: "gmail", query: new URLSearchParams({ code: "x", state: wrap({ instanceId: "pirate" }) }), lookup, now: NOW });
    assert.deepEqual(unknown, { ok: false, status: 400, error: "unknown_instance" });

    // An attacker minting a state for a real instance id with their own secret
    const forged = wrap({ adminSecret: "attacker-secret-attacker-secret" });
    const bad = await resolveRelayCallback({ provider: "gmail", query: new URLSearchParams({ code: "x", state: forged }), lookup, now: NOW });
    assert.deepEqual(bad, { ok: false, status: 400, error: "bad_signature" });

    assert.deepEqual(await resolveRelayCallback({ provider: "slack", query: new URLSearchParams(), lookup }), { ok: false, status: 404, error: "unknown_provider" });
    assert.deepEqual(await resolveRelayCallback({ provider: "gmail", query: new URLSearchParams({ code: "x" }), lookup }), { ok: false, status: 400, error: "malformed_state" });
});

test("instance side: relay is off unless all three env values are valid", () => {
    const keys = ["OAUTH_RELAY_URL", "INSTANCE_ID", "INSTANCE_ADMIN_SECRET"] as const;
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
        for (const k of keys) delete process.env[k];
        assert.equal(getRelayConfig(), null);
        assert.equal(relayRedirectUri("gmail"), null);
        assert.equal(stateForProvider("gmail", INNER), INNER);

        process.env.OAUTH_RELAY_URL = "https://auth.crm-agence.fr/";
        process.env.INSTANCE_ID = "agence-nord";
        assert.equal(getRelayConfig(), null, "no admin secret yet");
        process.env.INSTANCE_ADMIN_SECRET = SECRET;
        assert.equal(relayRedirectUri("outlook"), "https://auth.crm-agence.fr/oauth/outlook/callback");

        const wrapped = stateForProvider("gmail", INNER);
        const v = verifyRelayState({ state: wrapped, adminSecret: SECRET, provider: "gmail" });
        assert.ok(v.ok && v.inner === INNER && v.instanceId === "agence-nord");

        process.env.INSTANCE_ID = "Not Valid";
        assert.equal(getRelayConfig(), null);
    } finally {
        for (const k of keys) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    }
});
