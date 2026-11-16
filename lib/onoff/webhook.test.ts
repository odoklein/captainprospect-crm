import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOnoffKey, matchOnoffUser, onoffRecordingRef, parseOnoffEvent, parseOnoffRecordingRef } from "./webhook";

// The body example of https://docs.onoffbusiness.com/webhook/reference/send-call-log
const docExample = {
    id: "12345",
    eventName: "CDR",
    onoffUserName: "John Doe",
    onoffUserEmail: "john.doe@example.com",
    onoffUserNumber: "1234567890",
    externalNumber: "0987654321",
    externalName: "John Smith",
    externalEmail: "smith@example.com",
    externalCompanyName: "Acme Corp",
    callStarted: "2023-05-20T14:30:00Z",
    callEnded: "2023-05-20T14:32:00Z",
    callDuration: 300,
    callDirection: "INBOUND",
    callStatus: "ANSWERED",
    callNotes: "Important notes about the call",
    voicemailUrl: "http://example.com/voicemail/12345",
    voicemailDuration: 60,
    callRecordingUrl: "http://example.com/recordings/12345",
    tags: [{ tagId: "17431723-0001", tagName: "Blue", tagColor: "#32A8FF" }],
};

test("parses Onoff's documented call log", () => {
    const e = parseOnoffEvent(docExample);
    assert.ok(e);
    assert.equal(e.id, "12345");
    assert.equal(e.event, "CDR");
    assert.equal(e.direction, "INBOUND");
    assert.equal(e.status, "ANSWERED");
    assert.equal(e.durationSec, 300);
    assert.equal(e.externalKey, "987654321");
    assert.equal(e.startedAt.toISOString(), "2023-05-20T14:30:00.000Z");
    assert.equal(e.notes, "Important notes about the call");
    assert.deepEqual(e.tags, [{ tagId: "17431723-0001", tagName: "Blue", tagColor: "#32A8FF" }]);
    // Plain-http audio links are dropped: the server fetches them later.
    assert.equal(e.recordingUrl, null);
    assert.equal(e.voicemailUrl, null);
});

test("keeps https recordings and recognises RECORDING / VM events", () => {
    const rec = parseOnoffEvent({ ...docExample, eventName: "recording", callRecordingUrl: "https://cdn.onoff.example/r/1.mp3" });
    assert.equal(rec?.event, "RECORDING");
    assert.equal(rec?.recordingUrl, "https://cdn.onoff.example/r/1.mp3");
    assert.equal(parseOnoffEvent({ ...docExample, eventName: "VM" })?.event, "VM");
});

test("French numbers match across formats (last 9 digits)", () => {
    const a = parseOnoffEvent({ ...docExample, externalNumber: "+33 6 12 34 56 78" });
    const b = parseOnoffEvent({ ...docExample, externalNumber: "0612345678" });
    assert.equal(a?.externalKey, "612345678");
    assert.equal(a?.externalKey, b?.externalKey);
});

test("unknown values fall back safely", () => {
    const e = parseOnoffEvent({ ...docExample, callStatus: "SOMETHING_NEW", callDirection: "sideways", callDuration: "-3" });
    assert.equal(e?.status, "UNKNOWN");
    assert.equal(e?.direction, "OUTBOUND");
    assert.equal(e?.durationSec, null);
});

test("anything that is not a call log is ignored, not thrown", () => {
    assert.equal(parseOnoffEvent(null), null);
    assert.equal(parseOnoffEvent("hello"), null);
    assert.equal(parseOnoffEvent({ ...docExample, id: "" }), null);
    assert.equal(parseOnoffEvent({ ...docExample, externalNumber: undefined }), null);
    assert.equal(parseOnoffEvent({ ...docExample, callStarted: "not a date" }), null);
});

test("the X-API-KEY header is the only gate", () => {
    const key = "k".repeat(32);
    assert.deepEqual(checkOnoffKey(key, key), { ok: true });
    assert.deepEqual(checkOnoffKey(` ${key} `, key), { ok: true });
    assert.equal(checkOnoffKey(key, "wrong").ok, false);
    assert.equal(checkOnoffKey(key, null).ok, false);
    const unset = checkOnoffKey(undefined, key);
    assert.equal(unset.ok, false);
    if (!unset.ok) assert.equal(unset.status, 503);
    const bad = checkOnoffKey(key, `${key}x`);
    if (!bad.ok) assert.equal(bad.status, 401);
});

test("matches the CRM user by e-mail first, then by Onoff number", () => {
    const users = [
        { id: "u1", email: "Camille.Morel@agence.fr", onoffPhoneNumber: null },
        { id: "u2", email: "hugo@agence.fr", onoffPhoneNumber: "+33 7 11 22 33 44" },
    ];
    assert.equal(matchOnoffUser({ onoffUserEmail: "camille.morel@agence.fr", onoffUserNumber: null }, users), "u1");
    assert.equal(matchOnoffUser({ onoffUserEmail: "hugo.perso@gmail.com", onoffUserNumber: "0711223344" }, users), "u2");
    assert.equal(matchOnoffUser({ onoffUserEmail: "nobody@x.fr", onoffUserNumber: "0600000000" }, users), null);
});

test("recording references round-trip and reject anything else", () => {
    assert.equal(parseOnoffRecordingRef(onoffRecordingRef("evt-42")), "evt-42");
    assert.equal(parseOnoffRecordingRef("https://evil.example/x"), null);
    assert.equal(parseOnoffRecordingRef("onoff:../../etc"), null);
    assert.equal(parseOnoffRecordingRef(null), null);
});
