/**
 * Pre-call brief pure parts:
 *     npm run test:sdr-assistant
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { briefHash, briefPrompt, normalizeBrief } from "./brief";

const input = {
    prospect: { nom: "Sophie Martin", poste: "Directrice commerciale", société: "NovaTech", secteur: null, taille: null, pays: "FR", site: null },
    history: [{ date: "2026-11-01", status: "Rappel demandé", note: "Rappeler après lecture de la présentation", summary: null }],
    mission: { name: "PME – Q1", objective: "RDV", offer: "Externalisation de la prospection", target: "PME 10–50", script: null },
};

test("the prompt carries only provided data and says when it is a first contact", () => {
    const p = briefPrompt(input);
    assert.match(p, /- nom : Sophie Martin/);
    assert.doesNotMatch(p, /secteur/); // empty fields are left out, not sent as "null"
    assert.match(p, /Rappel demandé · note : « Rappeler après lecture/);
    assert.match(briefPrompt({ ...input, history: [] }), /aucun échange enregistré \(premier contact\)/);
});

test("the cache key changes when anything it is built from changes", () => {
    const a = briefHash(input);
    assert.equal(a, briefHash(JSON.parse(JSON.stringify(input))));
    assert.notEqual(a, briefHash({ ...input, history: [...input.history, { date: "2026-11-07", status: "Pas de réponse", note: null, summary: null }] }));
});

test("briefs are validated and capped", () => {
    assert.equal(normalizeBrief({ angle: "x" }), null);
    const b = normalizeBrief({ context: "Premier contact.", angle: "Parler du recrutement", talkingPoints: ["a", "b", "c", "d"], questions: [1, "Combien de vendeurs ?"], watchOut: "x" });
    assert.deepEqual(b, { context: "Premier contact.", angle: "Parler du recrutement", talkingPoints: ["a", "b", "c"], questions: ["Combien de vendeurs ?"], watchOut: [] });
});
