/**
 * Allo webhook signature + payload tests. Pure, no database:
 *     npm run test:incoming-calls
 *
 * The route's only gate is the signature, so the cases that matter most are
 * the rejections: wrong secret, tampered body, replayed timestamp.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

import { isAnsweredResult, parseAlloEvent, verifyAlloSignature } from "./allo-webhook";

const SECRET = "whsec_" + Buffer.from("super-secret-signing-key-32-bytes!").toString("base64");
const NOW = 1_760_000_000;

function sign(body: string, id = "msg_1", ts = NOW, secret = SECRET) {
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const sig = crypto.createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
    return { id, timestamp: String(ts), signature: `v1,${sig}` };
}

const body = JSON.stringify({ topic: "call.received", data: { from_number: "+33612345678" } });

test("accepts a correctly signed delivery", () => {
    assert.deepEqual(verifyAlloSignature({ secret: SECRET, rawBody: body, headers: sign(body), nowSec: NOW }), {
        ok: true,
    });
});

test("accepts when any of several rotated signatures matches", () => {
    const headers = sign(body);
    headers.signature = `v1,bm90LXRoZS1yaWdodC1vbmU= ${headers.signature}`;
    assert.equal(verifyAlloSignature({ secret: SECRET, rawBody: body, headers, nowSec: NOW }).ok, true);
});

test("rejects a tampered body", () => {
    const headers = sign(body);
    const result = verifyAlloSignature({ secret: SECRET, rawBody: body.replace("612", "699"), headers, nowSec: NOW });
    assert.deepEqual(result, { ok: false, reason: "mismatch" });
});

test("rejects a signature made with another secret", () => {
    const other = "whsec_" + Buffer.from("another-key").toString("base64");
    const result = verifyAlloSignature({ secret: SECRET, rawBody: body, headers: sign(body, "msg_1", NOW, other), nowSec: NOW });
    assert.equal(result.ok, false);
});

test("rejects a replay outside the 5 minute window", () => {
    const result = verifyAlloSignature({ secret: SECRET, rawBody: body, headers: sign(body), nowSec: NOW + 301 });
    assert.deepEqual(result, { ok: false, reason: "expired" });
});

test("rejects missing headers", () => {
    const result = verifyAlloSignature({
        secret: SECRET,
        rawBody: body,
        headers: { id: null, timestamp: String(NOW), signature: "v1,x" },
        nowSec: NOW,
    });
    assert.deepEqual(result, { ok: false, reason: "missing_headers" });
});

test("parses call.received (Allo docs example)", () => {
    const event = parseAlloEvent({
        topic: "call.received",
        version: "2.0",
        timestamp: "2025-03-15T14:30:00.000Z",
        data: {
            from_number: "+33612345678",
            to_number: "+33112345678",
            started_at: "2025-03-15T14:30:00.000Z",
            user_email: "John@Acme.com",
            person: { name: "Marie", last_name: "Dupont" },
            company: { name: "Acme Corp" },
        },
    });
    assert.equal(event.kind, "received");
    if (event.kind !== "received") return;
    assert.equal(event.callerNumber, "+33612345678");
    assert.equal(event.lineNumber, "+33112345678");
    assert.equal(event.userEmail, "john@acme.com");
    assert.equal(event.personName, "Marie Dupont");
    assert.equal(event.companyName, "Acme Corp");
    assert.equal(event.startedAt.toISOString(), "2025-03-15T14:30:00.000Z");
});

test("parses an inbound call.completed and derives answered/missed", () => {
    const answered = parseAlloEvent({
        topic: "call.completed",
        data: {
            id: "cll_1",
            from_number: "+33612345678",
            to: "+33112345678",
            type: "INBOUND",
            result: "ANSWERED",
            length_in_minutes: 5.5,
            summary: "Billing question.",
            recording_url: "https://storage.withallo.com/r.mp3",
        },
    });
    assert.equal(answered.kind, "completed");
    if (answered.kind !== "completed") return;
    assert.equal(answered.providerCallId, "cll_1");
    assert.equal(answered.lineNumber, "+33112345678");
    assert.equal(answered.durationSec, 330);
    assert.equal(answered.answered, true);

    const missed = parseAlloEvent({
        topic: "call.completed",
        data: { from_number: "+33612345678", to: "+33112345678", type: "INBOUND", result: "MISSED" },
    });
    assert.equal(missed.kind === "completed" && missed.answered, false);
});

test("ignores outbound calls — those are the SDR's own dials", () => {
    const completed = parseAlloEvent({
        topic: "call.completed",
        data: { from_number: "+33112345678", to: "+33612345678", type: "OUTBOUND" },
    });
    assert.equal(completed.kind, "ignored");

    const answered = parseAlloEvent({
        topic: "call.answered",
        data: { from_number: "+33112345678", to_number: "+33612345678", direction: "OUTBOUND" },
    });
    assert.equal(answered.kind, "ignored");
});

test("ignores unrelated topics and malformed bodies", () => {
    assert.equal(parseAlloEvent({ topic: "sms.received", data: {} }).kind, "ignored");
    assert.equal(parseAlloEvent(null).kind, "ignored");
    assert.equal(parseAlloEvent({ topic: "call.received", data: { to_number: "+331" } }).kind, "ignored");
});

test("isAnsweredResult", () => {
    assert.equal(isAnsweredResult("ANSWERED", 0), true);
    assert.equal(isAnsweredResult("NO_ANSWER", 0), false);
    assert.equal(isAnsweredResult("VOICEMAIL", 42), false);
    assert.equal(isAnsweredResult("missed", 0), false);
    assert.equal(isAnsweredResult(null, 0), false);
    assert.equal(isAnsweredResult(null, 12), true);
});
