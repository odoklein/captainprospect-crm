/**
 * Softphone pure logic, no database:
 *     npm run test:telephony
 *
 * The cases that matter most are the gates: which numbers may be dialled
 * (toll fraud), which identity may place a call, and that a final status never
 * flips back to a live one when Twilio callbacks arrive out of order.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { getExpectedTwilioSignature, validateRequest } from "twilio/lib/webhooks/webhooks";
import { checkDialNumber, isE164, parseAllowedCountries, phonesInField, toE164 } from "./phone";
import { mapTwilioStatus, nextStatus } from "./status";
import { dialTwiml, identityFor, isTwilioRecordingUrl, recordingMediaUrl, userIdFromIdentity } from "./twilio";
import { softphoneErrorMessage } from "./client-errors";

// ── phone ───────────────────────────────────────────────────────────────────

test("French numbers as typed in the CRM normalise to E.164", () => {
    for (const raw of ["06 12 34 56 78", "+33 6 12 34 56 78", "0033612345678", "06.12.34.56.78", "+33 (0)6 12 34 56 78"]) {
        const r = checkDialNumber(raw);
        assert.equal(r.ok, true, raw);
        if (r.ok) assert.equal(r.e164, "+33612345678", raw);
    }
});

test("landlines and Belgian numbers pass with the default allowlist", () => {
    assert.equal(checkDialNumber("01 42 68 53 00").ok, true);
    assert.equal(checkDialNumber("+32 2 555 12 12").ok, true);
});

test("countries outside the allowlist are refused", () => {
    const r = checkDialNumber("+1 212 555 0123");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "country");
    assert.equal(checkDialNumber("+1 212 555 0123", { allowedCountries: ["US"] }).ok, true);
});

test("premium-rate numbers are refused", () => {
    const r = checkDialNumber("08 99 23 45 67");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "premium");
});

test("garbage is invalid", () => {
    for (const raw of ["", "abc", "12", "+33 1"]) {
        const r = checkDialNumber(raw);
        assert.equal(r.ok, false, raw);
    }
});

test("allowlist parsing falls back to the default", () => {
    assert.deepEqual(parseAllowedCountries("fr, be  ch"), ["FR", "BE", "CH"]);
    assert.deepEqual(parseAllowedCountries(""), ["FR", "BE", "CH", "LU", "MC"]);
    assert.deepEqual(parseAllowedCountries("nope,123"), ["FR", "BE", "CH", "LU", "MC"]);
});

test("caller ids must be E.164", () => {
    assert.equal(isE164("+33186761234"), true);
    assert.equal(isE164("0186761234"), false);
    assert.equal(isE164("+33 1 86"), false);
    assert.equal(isE164(null), false);
});

test("caller ids and CRM phone fields normalise however they were typed", () => {
    assert.equal(toE164("06 12 34 56 78"), "+33612345678");
    assert.equal(toE164("+33 1 86 76 12 34"), "+33186761234");
    assert.equal(toE164("n/a"), null);
    assert.deepEqual(phonesInField("07 57 59 24 77 / +33 1 42 68 53 00"), ["+33757592477", "+33142685300"]);
    assert.deepEqual(phonesInField(null), []);
});

// ── status ──────────────────────────────────────────────────────────────────

test("Twilio statuses map onto the call log", () => {
    assert.equal(mapTwilioStatus("ringing"), "RINGING");
    assert.equal(mapTwilioStatus("in-progress"), "IN_PROGRESS");
    assert.equal(mapTwilioStatus("answered"), "IN_PROGRESS");
    assert.equal(mapTwilioStatus("no-answer"), "NO_ANSWER");
    assert.equal(mapTwilioStatus("canceled"), "CANCELED");
    assert.equal(mapTwilioStatus("whatever"), null);
});

test("live statuses only move forward", () => {
    assert.equal(nextStatus("INITIATED", "RINGING"), "RINGING");
    assert.equal(nextStatus("IN_PROGRESS", "RINGING"), "IN_PROGRESS");
    assert.equal(nextStatus("RINGING", "INITIATED"), "RINGING");
});

test("a final status is never overwritten by a late live callback", () => {
    assert.equal(nextStatus("COMPLETED", "RINGING"), "COMPLETED");
    assert.equal(nextStatus("NO_ANSWER", "IN_PROGRESS"), "NO_ANSWER");
    assert.equal(nextStatus("BUSY", "COMPLETED"), "BUSY");
});

test("a late 'completed' corrects a CANCELED written first", () => {
    assert.equal(nextStatus("CANCELED", "COMPLETED"), "COMPLETED");
});

// ── identity, TwiML, recordings ─────────────────────────────────────────────

test("identity round-trips and rejects anything else", () => {
    const id = "cmm0exu5f00nhl404et347e3j";
    assert.equal(userIdFromIdentity(`client:${identityFor(id)}`), id);
    assert.equal(userIdFromIdentity("client:someone"), null);
    assert.equal(userIdFromIdentity("+33612345678"), null);
    assert.equal(userIdFromIdentity(undefined), null);
});

test("dial TwiML dials the stored number with the caller id, recording only when asked", () => {
    const urls = {
        dialAction: "https://app.example.com/api/webhooks/twilio/status?leg=dial&callId=c1",
        legStatus: "https://app.example.com/api/webhooks/twilio/status?leg=child&callId=c1",
        recording: "https://app.example.com/api/webhooks/twilio/recording?callId=c1",
        notice: "https://app.example.com/api/webhooks/twilio/notice",
    };
    const plain = dialTwiml({ to: "+33612345678", callerId: "+33186761234", record: false, urls }).toString();
    assert.match(plain, /<Dial [^>]*callerId="\+33186761234"/);
    assert.match(plain, /answerOnBridge="true"/);
    assert.match(plain, /<Number [^>]*>\+33612345678<\/Number>/);
    assert.doesNotMatch(plain, /record=/);
    assert.match(plain, /leg=dial&amp;callId=c1/); // escaped in XML

    const recorded = dialTwiml({ to: "+33612345678", callerId: "+33186761234", record: true, urls }).toString();
    assert.match(recorded, /record="record-from-answer-dual"/);
    assert.match(recorded, /url="https:\/\/app\.example\.com\/api\/webhooks\/twilio\/notice"/);
});

test("recording URLs are only built from well-formed SIDs and only match our account", () => {
    const ac = `AC${"a".repeat(32)}`;
    const re = `RE${"b".repeat(32)}`;
    const url = recordingMediaUrl(ac, re);
    assert.ok(url);
    assert.equal(isTwilioRecordingUrl(new URL(url!), ac), true);
    assert.equal(isTwilioRecordingUrl(new URL(url!), `AC${"c".repeat(32)}`), false);
    assert.equal(recordingMediaUrl(ac, "../../etc"), null);
    assert.equal(isTwilioRecordingUrl(new URL("https://evil.example.com/2010-04-01/Accounts/x"), ac), false);
});

test("Twilio signature check (the webhooks' only gate) rejects tampering", () => {
    const token = "test_auth_token";
    const url = "https://app.example.com/api/webhooks/twilio/voice";
    const params = { CallSid: "CA123", From: "client:u_abc", callId: "c1" };
    const sig = getExpectedTwilioSignature(token, url, params);
    assert.equal(validateRequest(token, sig, url, params), true);
    assert.equal(validateRequest(token, sig, url, { ...params, callId: "c2" }), false);
    assert.equal(validateRequest("other_token", sig, url, params), false);
    assert.equal(validateRequest(token, sig, `${url}?x=1`, params), false);
});

test("SDK errors read in French", () => {
    assert.match(softphoneErrorMessage(31401), /micro/);
    assert.match(softphoneErrorMessage(99999, "boom"), /boom/);
    assert.equal(softphoneErrorMessage(undefined), "Appel interrompu.");
});
