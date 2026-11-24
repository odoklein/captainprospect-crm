import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAnswers } from "@/lib/client-onboarding/questionnaire";
import { missionBriefSchema } from "./self-service-schema";
import {
    briefFromState, completion, composeAudience, emptyState, readLocalDraft, sectionDone, stateFromBrief, validateState, type StudioState,
} from "./mission-studio";

const filled = (): StudioState => ({
    ...emptyState(),
    name: "Conquête Rhône-Alpes", objective: "20 rendez-vous qualifiés avec des DAF", missionType: "RDV",
    sectors: ["J", "M"], sizes: ["10-49"], jobTitles: ["DAF", "Directeur général"], audienceNotes: "Plutôt des ESN",
    territory: { all: false, codes: ["69", "38", "01", "03", "07", "15", "26", "42", "43", "63", "73", "74"], note: "" },
    channels: ["CALL", "EMAIL"], startDate: "2027-01-04", endDate: "2027-03-31", targetMeetings: 20,
    pitch: "Nous automatisons la clôture comptable.", offerDetail: "Abonnement annuel", valueProposition: "Clôture en 3 jours",
    benefits: ["Moins d'erreurs", "", "Intégré à Sage"], proof: "120 clients",
});

test("a full page state makes a valid brief with readable texts for the agency", () => {
    const { brief, issues } = validateState(filled());
    assert.deepEqual(issues, { fields: {}, sections: [] });
    assert.ok(brief);
    assert.equal(brief.targetAudience, "Secteurs : Tech & médias, Conseil & ingénierie\nTaille : 10-49 salariés\nInterlocuteurs : DAF, Directeur général\nPrécisions : Plutôt des ESN");
    assert.equal(brief.geography, "Auvergne-Rhône-Alpes (région entière)");
    assert.equal(brief.offer, "Nous automatisons la clôture comptable.\n\nAbonnement annuel");
    assert.equal(brief.differentiators, "Clôture en 3 jours\n\nMoins d'erreurs\n\nIntégré à Sage\n\n120 clients");
    const segment = brief.questionnaire?.segments[0];
    assert.deepEqual(segment?.regions, ["Auvergne-Rhône-Alpes"]);
    assert.deepEqual(segment?.sectors, ["J", "M"]);
    assert.equal(brief.questionnaire?.mission.type, "RDV");
    assert.deepEqual(brief.territory?.codes, ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"]);
});

test("the brief round-trips through the page state", () => {
    const { brief } = validateState(filled());
    const again = stateFromBrief(brief);
    assert.deepEqual({ ...again, territory: { ...again.territory, codes: [...again.territory.codes].sort() } },
        { ...filled(), territory: { ...filled().territory, codes: [...filled().territory.codes].sort() } });
});

test("a brief written with the former form keeps its free texts", () => {
    const legacy = missionBriefSchema.parse({
        name: "Ancienne", objective: "Objectif", channels: ["CALL"], startDate: "2026-12-01", endDate: "2026-12-31",
        targetAudience: "DRH de PME industrielles", geography: "Belgique francophone", offer: "Formation RH", differentiators: "Depuis 2010",
    });
    const state = stateFromBrief(legacy);
    assert.equal(state.audienceNotes, "DRH de PME industrielles");
    assert.equal(state.territory.note, "Belgique francophone");
    assert.equal(state.offerDetail, "Formation RH");
    assert.equal(state.proof, "Depuis 2010");
    const { brief } = validateState(state);
    assert.equal(brief?.targetAudience, "DRH de PME industrielles", "no « Précisions : » prefix without structured choices");
    assert.equal(brief?.geography, "Belgique francophone");
});

test("questionnaire answers the page does not edit are kept", () => {
    const previous = normalizeAnswers(briefFromState(filled()).questionnaire);
    previous.referent.name = "Alice";
    previous.segments.push({ id: "other", name: "Autre cible", sectors: ["Q"], sizes: [], regions: [], jobTitles: [], notes: "" });
    const next = normalizeAnswers(briefFromState({ ...filled(), sectors: ["K"] }, previous).questionnaire);
    assert.equal(next.referent.name, "Alice");
    assert.deepEqual(next.segments.map((s) => s.id), ["mission-brief", "other"]);
    assert.deepEqual(next.segments[0].sectors, ["K"]);
});

test("issues point at their section and field, in page order, in kind French", () => {
    const { brief, issues } = validateState({ ...emptyState(), channels: [] });
    assert.equal(brief, null);
    assert.deepEqual(issues.sections, ["objective", "target", "channels", "offer"]);
    assert.equal(issues.fields.name, "Nommez votre mission.");
    assert.equal(issues.fields.startDate, "Choisissez une date.");
    assert.equal(issues.fields.channels, "Choisissez au moins un canal.");
    assert.match(issues.fields.audience, /au moins un secteur/);
    assert.match(issues.fields.pitch, /en une phrase/);
    const reversed = validateState({ ...filled(), endDate: "2026-12-01" });
    assert.equal(reversed.issues.fields.endDate, "La date de fin doit suivre la date de début.");
});

test("rail ticks and completion follow the essentials of each section", () => {
    const s = emptyState();
    assert.equal(completion(s), 0);
    assert.equal(sectionDone("territory", { ...s, territory: { all: true, codes: [], note: "" } }), true);
    assert.equal(sectionDone("target", { ...s, audienceNotes: "court" }), false);
    assert.equal(sectionDone("channels", { ...s, startDate: "2027-02-01", endDate: "2027-01-01" }), false);
    assert.equal(completion(filled()), 1);
    assert.equal(sectionDone("review", filled()), true);
    assert.equal(composeAudience({ sectors: [], sizes: [], jobTitles: [], audienceNotes: "  " }), "");
});

test("local drafts are read defensively", () => {
    assert.equal(readLocalDraft(null), null);
    assert.equal(readLocalDraft("{oops"), null);
    assert.equal(readLocalDraft(JSON.stringify({ version: 2, savedAt: 1, state: {} })), null);
    const draft = readLocalDraft(JSON.stringify({ version: 1, savedAt: 5, state: { name: "x" } }));
    assert.equal(draft?.state.name, "x");
    assert.deepEqual(draft?.state.channels, ["CALL"], "missing fields fall back to defaults");
});
