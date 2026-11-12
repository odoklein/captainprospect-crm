/**
 * Socket handshake token:
 *     npm run test:socket-handshake
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { wrapRelayState } from "../oauth-relay/state";
import { peekSocketInstanceId, signSocketToken, socketRoomFor, verifySocketToken } from "./handshake";

const SECRET = "s3cret-for-agence-nord-instance";
const NOW = 1_760_000_000_000;
const sign = (over: Partial<Parameters<typeof signSocketToken>[0]> = {}) =>
    signSocketToken({ instanceId: "agence-nord", userId: "user_1", adminSecret: SECRET, now: NOW, ...over });

test("a token proves instance and user", () => {
    const token = sign();
    assert.equal(peekSocketInstanceId(token), "agence-nord");
    assert.deepEqual(verifySocketToken({ token, adminSecret: SECRET, now: NOW + 1000 }), { ok: true, instanceId: "agence-nord", userId: "user_1" });
    assert.equal(socketRoomFor("agence-nord"), "inst:agence-nord");
});

test("wrong secret, forged user, other instance, age and junk are refused", () => {
    const token = sign();
    const verify = (over: Partial<Parameters<typeof verifySocketToken>[0]>) => verifySocketToken({ token, adminSecret: SECRET, now: NOW, ...over });

    assert.deepEqual(verify({ adminSecret: "another-secret-another-secret" }), { ok: false, reason: "bad_signature" });

    const [v, id, payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "admin_of_someone_else", t: NOW })).toString("base64url");
    assert.deepEqual(verify({ token: [v, id, forged, sig].join(".") }), { ok: false, reason: "bad_signature" });
    assert.deepEqual(verify({ token: [v, "agence-sud", payload, sig].join(".") }), { ok: false, reason: "bad_signature" });

    assert.deepEqual(verify({ now: NOW + 6 * 60 * 1000 }), { ok: false, reason: "expired" });
    assert.deepEqual(verify({ now: NOW - 5 * 60 * 1000 }), { ok: false, reason: "expired" });
    for (const junk of [undefined, null, 42, "", "a.b.c", "v1.UP.x.y", "v9.a.b.c"]) assert.deepEqual(verify({ token: junk }), { ok: false, reason: "malformed" });
    assert.throws(() => sign({ instanceId: "a.b" }), /invalid_instance_id/);
});

test("a relay-state signature is not a socket token (separate keys)", () => {
    const relay = wrapRelayState({ instanceId: "agence-nord", provider: "gmail", inner: "x", adminSecret: SECRET, now: NOW });
    assert.equal(verifySocketToken({ token: relay, adminSecret: SECRET, now: NOW }).ok, false);
});
