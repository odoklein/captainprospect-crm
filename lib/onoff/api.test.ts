/**
 * Onoff public API mapping (lib/onoff/api.ts):
 *     npm run test:onoff
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    OnoffApiClient, OnoffApiError, addDays, dayChunks, e164ish, isDay, isSameCall, mapApiStatus, mapCallDetails, mapCallLog, needsDetails, onoffApiErrorMessage, parseOnoffDate,
} from "./api";

const member = { id: "m1", firstName: "Anaïs", lastName: "Martin", email: "Anais@Agence.fr", numberIdRefs: ["33612345678"] };

test("dates without offset are read as UTC, dates with one are kept", () => {
    assert.equal(parseOnoffDate("2025-10-08T14:30:00")?.toISOString(), "2025-10-08T14:30:00.000Z");
    assert.equal(parseOnoffDate("2025-10-08T14:30:00+02:00")?.toISOString(), "2025-10-08T12:30:00.000Z");
    assert.equal(parseOnoffDate("2025-10-08T14:30:00Z")?.toISOString(), "2025-10-08T14:30:00.000Z");
    assert.equal(parseOnoffDate(""), null);
    assert.equal(parseOnoffDate("nope"), null);
});

test("day helpers", () => {
    assert.equal(addDays("2026-02-28", 1), "2026-03-01");
    assert.equal(isDay("2026-11-23"), true);
    assert.equal(isDay("2026-13-01"), false);
    assert.equal(isDay("23/11/2026"), false);
    assert.deepEqual(dayChunks("2026-01-01", "2026-01-01", 31), [["2026-01-01", "2026-01-01"]]);
    assert.deepEqual(dayChunks("2026-01-01", "2026-02-15", 31), [["2026-01-01", "2026-01-31"], ["2026-02-01", "2026-02-15"]]);
    assert.deepEqual(dayChunks("2026-02-02", "2026-02-01", 31), []);
});

test("numbers get their + back", () => {
    assert.equal(e164ish("33612345678"), "+33612345678");
    assert.equal(e164ish("+33612345678"), "+33612345678");
    assert.equal(e164ish(" "), null);
});

test("API call states become webhook outcomes", () => {
    assert.equal(mapApiStatus("ANSWER", 12), "ANSWERED");
    assert.equal(mapApiStatus("END", 30), "ANSWERED");
    assert.equal(mapApiStatus("END", 0), "MISSED_CALL");
    assert.equal(mapApiStatus("BUSY", 0), "BUSY");
    assert.equal(mapApiStatus("VMS", 0), "VMS");
    assert.equal(mapApiStatus("UNKNOWN_SUBSCRIBER", 0), "WRONG_NUMBER");
    assert.equal(mapApiStatus("ABORT", 0), "MISSED_CALL");
    assert.equal(mapApiStatus("IVR", 0), "UNKNOWN");
    assert.equal(mapApiStatus(undefined, null), "UNKNOWN");
});

test("a list row maps to a call, with the member's e-mail lowercased", () => {
    const c = mapCallLog(
        { id: "c1", memberIdRef: "m1", numberIdRef: "33612345678", externalPhoneNumber: "33698765432", direction: "outbound", duration: 125, startedDate: "2026-11-02T10:00:00", endedDate: "2026-11-02T10:02:05", status: "ANSWER" },
        member,
    );
    assert.ok(c);
    assert.equal(c.apiCallId, "c1");
    assert.equal(c.onoffUserEmail, "anais@agence.fr");
    assert.equal(c.onoffUserNumber, "+33612345678");
    assert.equal(c.externalNumber, "+33698765432");
    assert.equal(c.externalKey, "698765432");
    assert.equal(c.direction, "OUTBOUND");
    assert.equal(c.status, "ANSWERED");
    assert.equal(c.durationSec, 125);
    assert.equal(c.startedAt.toISOString(), "2026-11-02T10:00:00.000Z");
    assert.equal(mapCallLog({ id: "c2", startedDate: "2026-11-02T10:00:00" }, member), null, "no number");
    assert.equal(mapCallLog({ id: "c3", externalPhoneNumber: "33698765432" }, member), null, "no start");
});

test("only calls that can carry audio cost a details request", () => {
    assert.equal(needsDetails({ durationSec: 0, status: "MISSED_CALL" }), false);
    assert.equal(needsDetails({ durationSec: null, status: "BUSY" }), false);
    assert.equal(needsDetails({ durationSec: 4, status: "ANSWERED" }), true);
    assert.equal(needsDetails({ durationSec: 0, status: "VMS" }), true);
});

test("details: AI summary with action items, transcript lines, score, tags", () => {
    const d = mapCallDetails({
        id: "c1",
        note: " Rappeler mardi ",
        tags: ["chaud", ""],
        callRecordingId: "c1",
        callTranscription: {
            summarization: "Le prospect veut une démo.",
            diarization: [
                { speakerLabel: "Agent", speakerIndex: 0, text: "Bonjour", startTime: "00:00:02" },
                { speakerIndex: 1, text: "Oui ?" },
                { speakerLabel: "Agent", text: "  " },
            ],
            actionItems: [{ action: "Envoyer la plaquette", done: false }, { action: "" }],
        },
        callEvaluation: { totalScore: 8.5, summarization: "Bon appel" },
    });
    assert.equal(d.notes, "Rappeler mardi");
    assert.deepEqual(d.tags, [{ tagName: "chaud" }]);
    assert.equal(d.recordingId, "c1");
    assert.equal(d.voicemailId, null);
    assert.equal(d.summary, "Le prospect veut une démo.\n\nActions à suivre :\n- Envoyer la plaquette");
    assert.equal(d.transcription, "[00:00:02] Agent : Bonjour\nInterlocuteur 2 : Oui ?");
    assert.equal(d.evaluationScore, 8.5);
});

test("details without AI stay empty, not blank strings", () => {
    const d = mapCallDetails({ id: "c1", callTranscription: null, callEvaluation: null });
    assert.equal(d.summary, null);
    assert.equal(d.transcription, null);
    assert.equal(d.evaluationScore, null);
    assert.equal(d.evaluation, null);
    assert.equal(d.tags, null);
});

test("a webhook call and its API twin are recognised, a neighbour is not", () => {
    const t = new Date("2026-11-02T10:00:00Z");
    const hook = { externalKey: "698765432", startedAt: new Date(t.getTime() + 30_000), onoffUserEmail: "anais@agence.fr", onoffUserNumber: null };
    const api = { externalKey: "698765432", startedAt: t, onoffUserEmail: "anais@agence.fr", onoffUserNumber: "+33612345678" };
    assert.equal(isSameCall(hook, api), true);
    assert.equal(isSameCall({ ...hook, startedAt: new Date(t.getTime() + 120_000) }, api), false, "too far apart");
    assert.equal(isSameCall({ ...hook, externalKey: "600000000" }, api), false, "other prospect");
    assert.equal(isSameCall({ ...hook, onoffUserEmail: "autre@agence.fr" }, api), false, "other SDR");
    assert.equal(isSameCall({ ...hook, onoffUserEmail: null, onoffUserNumber: "0612345678" }, api), true, "same line");
});

test("client: key header, pagination by nextOffset, 429 retried", async () => {
    const seen: string[] = [];
    let first429 = true;
    const fake = (async (url: URL, init?: RequestInit) => {
        seen.push(`${url.pathname}?${url.searchParams.toString()}`);
        assert.equal((init?.headers as Record<string, string>)["x-api-key"], "k");
        if (url.pathname === "/api/v1/members") {
            if (first429) {
                first429 = false;
                return new Response("{}", { status: 429 });
            }
            const offset = url.searchParams.get("offset");
            return Response.json(offset ? { members: [{ id: "m2" }] } : { members: [{ id: "m1" }], nextOffset: "m1" });
        }
        return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    const api = new OnoffApiClient("k", "https://example.test", fake, 0);
    const members = await api.listMembers();
    assert.deepEqual(members.map((m) => m.id), ["m1", "m2"]);
    assert.equal(seen.length, 3);
    await assert.rejects(api.recordingUrl("x"), (e: unknown) => e instanceof OnoffApiError && e.status === 404);
});

test("errors read as French a manager can act on", () => {
    assert.match(onoffApiErrorMessage(new OnoffApiError(401, "The apikey is invalid")), /MAX/);
    assert.match(onoffApiErrorMessage(new OnoffApiError(429, "")), /réessayez/);
    assert.match(onoffApiErrorMessage(new Error("boom")), /joindre Onoff/);
});
