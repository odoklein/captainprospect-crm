// npm run test:notetakers — pure mapping of note-taker payloads (no network, no DB).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOnboardingRecap } from "@/lib/leexi/normalize";
import { NOTETAKERS, NOTETAKER_IDS, notetakerForKey, notetakerImportId } from "./catalog";
import { INTEGRATION_KEY_NAMES } from "@/lib/integrations/catalog";
import { toCallDetail, toCallSummary, transcriptLines } from "./normalize";
import type { ProviderMeeting } from "./types";

const ctx = { internalDomains: ["suzali.fr"], internalNames: ["Odo Klein"] };

const meeting: ProviderMeeting = {
    id: "rec_1",
    title: "Closing Octofilms",
    date: "2026-10-20T09:00:00.000Z",
    durationSec: 1860,
    url: "https://example.com/rec_1",
    host: { name: "Marie Dupont", email: "marie@suzali.fr" },
    attendees: [
        { name: "Marie Dupont", email: "marie@suzali.fr" },
        { name: "Odo Klein", email: null },
        { name: "Paul Martin", email: "paul@octofilms.fr" },
        { name: "Fireflies.ai Notetaker", email: "fred@fireflies.ai" },
    ],
    summary: "## Contexte\nOctofilms veut 20 RDV par mois.",
    actionItems: ["Envoyer la proposition", "  "],
    transcript: "Marie Dupont : Bonjour\nPaul Martin : Bonjour",
};

test("our people, the client's people and bots are told apart", () => {
    const s = toCallSummary(meeting, ctx);
    assert.deepEqual(s.users, ["Marie Dupont", "Odo Klein"]);
    assert.deepEqual(s.customers.map((c) => c.name), ["Paul Martin"]);
    assert.equal(s.companyName, "Octofilms");
    assert.equal(s.duration, 1860);
    assert.equal(s.hasSummary, true);
    assert.equal(s.hasSalesPlaybook, false);
});

test("a list item without notes shows no « Sans résumé » badge", () => {
    const { summary: _s, ...light } = meeting;
    assert.equal(toCallSummary(light, ctx).hasSummary, true);
    assert.equal(toCallSummary({ ...meeting, summary: "" }, ctx).hasSummary, false);
});

test("detail feeds the recap the AI reads", () => {
    const d = toCallDetail(meeting, ctx);
    assert.deepEqual(d.followUpTasks, ["Envoyer la proposition"]);
    const recap = buildOnboardingRecap(d, "Suzali");
    assert.match(recap, /Équipe Suzali : Marie Dupont, Odo Klein/);
    assert.match(recap, /Paul Martin <paul@octofilms\.fr>/);
    assert.match(recap, /20 RDV par mois/);
    assert.match(recap, /- Envoyer la proposition/);
    assert.doesNotMatch(recap, /## Transcription/);
});

test("no notes: the transcript goes to the AI", () => {
    const recap = buildOnboardingRecap(toCallDetail({ ...meeting, summary: "", actionItems: [] }, ctx), "Suzali");
    assert.match(recap, /## Transcription\nMarie Dupont : Bonjour/);
});

test("transcript turns of one speaker are merged", () => {
    assert.equal(
        transcriptLines([
            { speaker: "A", text: "Bonjour" },
            { speaker: "A", text: "ça va ?" },
            { speaker: "B", text: " " },
            { speaker: "B", text: "Oui" },
        ]),
        "A : Bonjour ça va ?\nB : Oui",
    );
});

test("catalog: ids, import ids and keys", () => {
    assert.equal(NOTETAKER_IDS[0], "leexi");
    assert.equal(notetakerImportId("leexi", "abc"), "abc");
    assert.equal(notetakerImportId("grain", "abc"), "grain:abc");
    for (const n of NOTETAKERS) {
        for (const k of n.keys) {
            assert.ok((INTEGRATION_KEY_NAMES as readonly string[]).includes(k), `${k} missing from the integration catalog`);
            assert.equal(notetakerForKey(k)?.id, n.id);
        }
    }
});
