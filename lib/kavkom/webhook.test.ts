import { test } from "node:test";
import assert from "node:assert/strict";
import {
    checkKavkomSecret,
    extensionOf,
    externalNumber,
    formatDestination,
    kavkomDate,
    kavkomRecordingRef,
    mapLiveState,
    parseDialFormat,
    parseKavkomEvent,
    parseKavkomRecordingRef,
    parseTranscriptionData,
    receivedSecret,
    statusFromHangup,
    unwrapBody,
} from "./webhook";
import { fileLinkOf, mapExtension } from "./api";

const NOW = new Date("2026-11-27T14:00:00Z");

// ── auth ─────────────────────────────────────────────────────────────────────

test("secret: refuses everything when none is configured, compares in constant time", () => {
    assert.deepEqual(checkKavkomSecret(undefined, "x"), { ok: false, status: 503, reason: "KAVKOM_WEBHOOK_SECRET not set" });
    assert.equal(checkKavkomSecret("a".repeat(24), "b".repeat(24)).ok, false);
    assert.equal(checkKavkomSecret("a".repeat(24), null).ok, false);
    assert.equal(checkKavkomSecret(" s3cret-s3cret-s3cret-s3 ", "s3cret-s3cret-s3cret-s3").ok, true);
});

test("secret: read from Authorization Bearer, or a plain header", () => {
    const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;
    assert.equal(receivedSecret(h({ authorization: "Bearer abc" })), "abc");
    assert.equal(receivedSecret(h({ authorization: "abc" })), "abc");
    assert.equal(receivedSecret(h({ "x-webhook-secret": "zz" })), "zz");
    assert.equal(receivedSecret(h({})), null);
});

// ── numbers ──────────────────────────────────────────────────────────────────

test("extensions and external numbers are told apart", () => {
    assert.equal(extensionOf("1001"), "1001");
    assert.equal(extensionOf("1001@acme.kavkom.com"), "1001");
    assert.equal(extensionOf("sip:204@x"), "204");
    assert.equal(extensionOf("0612345678"), null);
    assert.equal(externalNumber("0612345678"), "+33612345678");
    assert.equal(externalNumber("+33 6 12 34 56 78"), "+33612345678");
    assert.equal(externalNumber("0033612345678"), "+33612345678");
    assert.equal(externalNumber("33612345678"), "+33612345678");
    assert.equal(externalNumber("1001"), null);
});

test("destination formats", () => {
    assert.equal(parseDialFormat(undefined), "national");
    assert.equal(parseDialFormat("E164"), "e164");
    assert.equal(formatDestination("+33612345678", "national"), "0612345678");
    assert.equal(formatDestination("+32470123456", "national"), "0032470123456");
    assert.equal(formatDestination("+33612345678", "e164"), "+33612345678");
    assert.equal(formatDestination("+33612345678", "e164_plain"), "33612345678");
    assert.equal(formatDestination("+33612345678", "intl00"), "0033612345678");
});

test("dates: epochs in s or ms, and zone-less stamps read in Paris time", () => {
    assert.equal(kavkomDate(1795788000, NOW.getTime())?.toISOString(), "2026-11-27T14:00:00.000Z");
    assert.equal(kavkomDate("1795788000000", NOW.getTime())?.toISOString(), "2026-11-27T14:00:00.000Z");
    // 27 Nov: Paris is UTC+1
    assert.equal(kavkomDate("2026-11-27 15:00:00", NOW.getTime())?.toISOString(), "2026-11-27T14:00:00.000Z");
    // July: UTC+2
    assert.equal(kavkomDate("2026-07-10 15:00:00", NOW.getTime())?.toISOString(), "2026-07-10T13:00:00.000Z");
    assert.equal(kavkomDate("2026-11-27T15:00:00+01:00")?.toISOString(), "2026-11-27T14:00:00.000Z");
    assert.equal(kavkomDate(0), null);
    assert.equal(kavkomDate("garbage"), null);
});

// ── statuses ─────────────────────────────────────────────────────────────────

test("live states and hangup causes", () => {
    assert.equal(mapLiveState("RINGING"), "ringing");
    assert.equal(mapLiveState("CS_EXECUTE"), "answered");
    assert.equal(mapLiveState("answered"), "answered");
    assert.equal(mapLiveState("HANGUP"), "ended");
    assert.equal(mapLiveState("weird"), null);
    assert.equal(statusFromHangup("NORMAL_CLEARING", true), "COMPLETED");
    assert.equal(statusFromHangup("USER_BUSY", false), "BUSY");
    assert.equal(statusFromHangup("ORIGINATOR_CANCEL", false), "CANCELED");
    assert.equal(statusFromHangup("UNALLOCATED_NUMBER", false), "FAILED");
    assert.equal(statusFromHangup("NO_ANSWER", false), "NO_ANSWER");
    assert.equal(statusFromHangup(null, false), "NO_ANSWER");
});

// ── events ───────────────────────────────────────────────────────────────────

test("an outbound CDR (FusionPBX field names)", () => {
    const e = parseKavkomEvent(
        {
            event: "cdr",
            xml_cdr_uuid: "0f6c0d5e-7b37-4a52-9d55-6f0b9b2b7e10",
            direction: "outbound",
            caller_id_number: "1001",
            destination_number: "0612345678",
            start_epoch: "1795788000",
            answer_epoch: "1795788010",
            end_epoch: "1795788130",
            duration: "130",
            billsec: "120",
            hangup_cause: "NORMAL_CLEARING",
            recording_url: "https://records.kavkom.com/abc.mp3",
        },
        NOW,
    );
    assert.ok(e && e.kind === "cdr");
    assert.equal(e.cdrUuid, "0f6c0d5e-7b37-4a52-9d55-6f0b9b2b7e10");
    assert.equal(e.direction, "OUTBOUND");
    assert.equal(e.extension, "1001");
    assert.equal(e.external, "+33612345678");
    assert.equal(e.status, "COMPLETED");
    assert.equal(e.talkSec, 120);
    assert.equal(e.answeredAt?.toISOString(), "2026-11-27T14:00:10.000Z");
    assert.equal(e.endedAt?.toISOString(), "2026-11-27T14:02:10.000Z");
    assert.equal(e.hasRecording, true);
    assert.equal(e.recordingUrl, "https://records.kavkom.com/abc.mp3");
});

test("an unanswered inbound CDR, with outside_number and stamps", () => {
    const e = parseKavkomEvent(
        {
            xml_cdr_uuid: "11111111-2222-4333-8444-555555555555",
            direction: "inbound",
            caller_id_number: "+33142424242",
            destination_number: "1002",
            start_stamp: "2026-11-27 15:00:00",
            billsec: 0,
            hangup_cause: "NO_ANSWER",
            recording_url: "http://insecure.example/x.mp3",
        },
        NOW,
    );
    assert.ok(e && e.kind === "cdr");
    assert.equal(e.direction, "INBOUND");
    assert.equal(e.extension, "1002");
    assert.equal(e.external, "+33142424242");
    assert.equal(e.status, "NO_ANSWER");
    assert.equal(e.answeredAt, null);
    assert.equal(e.recordingUrl, null, "http links are dropped");
    assert.equal(e.startedAt.toISOString(), "2026-11-27T14:00:00.000Z");
});

test("a live event (WebSocket-style names), nested under data", () => {
    const e = parseKavkomEvent({ data: { callUuid: "c0ffee00-1234-4abc-8def-0123456789ab", state: "ANSWERED", direction: "outbound", number: "0612345678", presenceId: "1001@acme" } }, NOW);
    assert.ok(e && e.kind === "live");
    assert.equal(e.state, "answered");
    assert.equal(e.extension, "1001");
    assert.equal(e.external, "+33612345678");
});

test("live inbound ringing (webhook names)", () => {
    const e = parseKavkomEvent({ callId: "abcdef12-0000-4000-8000-000000000001", number: "0142424242", extension: "1003", state: "ringing", direction: "inbound" }, NOW);
    assert.ok(e && e.kind === "live");
    assert.equal(e.direction, "INBOUND");
    assert.equal(e.extension, "1003");
    assert.equal(e.external, "+33142424242");
});

test("a transcription posted as a form whose value is JSON", () => {
    const body = { payload: JSON.stringify({ cdr_uuid: "0f6c0d5e-7b37-4a52-9d55-6f0b9b2b7e10", transcription_data: { segments: [{ speaker: "agent", text: "Bonjour", start: 0.5 }, { speaker: "client", text: "Oui bonjour", start: 2 }], summary: "Rappel lundi" } }) };
    const e = parseKavkomEvent(body, NOW);
    assert.ok(e && e.kind === "transcription");
    assert.equal(e.cdrUuid, "0f6c0d5e-7b37-4a52-9d55-6f0b9b2b7e10");
    assert.deepEqual(e.lines.map((l) => [l.speaker, l.text]), [["sdr", "Bonjour"], ["prospect", "Oui bonjour"]]);
    assert.equal(e.summary, "Rappel lundi");
});

test("transcription data in its other shapes", () => {
    assert.deepEqual(parseTranscriptionData("Bonjour, je vous appelle"), { lines: [{ speaker: "mixed", text: "Bonjour, je vous appelle", offsetSec: null }], summary: null });
    assert.equal(parseTranscriptionData('[{"text":"a","channel":0},{"text":"b","channel":1}]').lines.map((l) => l.speaker).join(","), "sdr,prospect");
    assert.equal(parseTranscriptionData({ text: "tout le texte" }).lines[0].text, "tout le texte");
    assert.deepEqual(parseTranscriptionData(null), { lines: [], summary: null });
});

test("unwrapBody: a form whose only key is the JSON", () => {
    assert.deepEqual(unwrapBody({ '{"a":1}': "" }), { a: 1 });
    assert.deepEqual(unwrapBody('{"b":2}'), { b: 2 });
});

test("nothing usable → null (Kavkom's « Tester » sends an empty request)", () => {
    assert.equal(parseKavkomEvent(null), null);
    assert.equal(parseKavkomEvent({}), null);
    assert.equal(parseKavkomEvent({ state: "ringing" }), null, "no call id");
    assert.equal(parseKavkomEvent({ event: "cdr", xml_cdr_uuid: "0f6c0d5e-7b37-4a52-9d55-6f0b9b2b7e10" }), null, "no start");
});

test("recording references", () => {
    const ref = kavkomRecordingRef("0f6c0d5e-7b37-4a52-9d55-6f0b9b2b7e10");
    assert.equal(ref, "kavkom:0f6c0d5e-7b37-4a52-9d55-6f0b9b2b7e10");
    assert.equal(parseKavkomRecordingRef(ref), "0f6c0d5e-7b37-4a52-9d55-6f0b9b2b7e10");
    assert.equal(parseKavkomRecordingRef("onoff:123456"), null);
    assert.equal(parseKavkomRecordingRef("kavkom:../../etc"), null);
});

// ── API response shapes ──────────────────────────────────────────────────────

test("extension rows, with or without a linked user", () => {
    assert.deepEqual(mapExtension({ extension_uuid: "u1", extension: "1001", enabled: "true", user: { user_email: "Anais@Agence.fr", username: "anais" } }), {
        uuid: "u1", extension: "1001", enabled: true, callerIdNumber: null, name: "anais", userEmail: "anais@agence.fr",
    });
    assert.equal(mapExtension({ extension_uuid: "u2", extension: "1002", enabled: "false" })?.enabled, false);
    assert.equal(mapExtension({ extension: "1003" }), null);
});

test("file link in any key", () => {
    assert.equal(fileLinkOf({ success: true, data: { link: "https://x.kavkom.com/r.mp3" } }), "https://x.kavkom.com/r.mp3");
    assert.equal(fileLinkOf({ url: "https://y/r.wav" }), "https://y/r.wav");
    assert.equal(fileLinkOf({ data: "https://z/r.mp3" }), "https://z/r.mp3");
    assert.equal(fileLinkOf({ data: { link: "http://insecure/r.mp3" } }), null);
});
