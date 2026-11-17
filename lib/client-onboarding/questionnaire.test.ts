import { test } from "node:test";
import assert from "node:assert/strict";
import {
    completion, definedSegments, emptyAnswers, icpSummary, missingScreens, normalizeAnswers,
    parseExclusions, pitchSummary, prefillAnswers, readState, scriptOpener, screenIssues, stillPrefilled,
} from "./questionnaire";
import { normalizeFilters, registryQuery, toSample } from "./market";

function filled() {
    const a = emptyAnswers();
    a.company.pitch = "Nous installons des bornes de recharge pour flottes";
    a.channels = ["CALL"];
    a.referent = { name: "Thomas Mercier", role: "DG", email: "thomas@acme.fr", phone: "" };
    a.segments = [{ id: "s1", name: "Industriels", sectors: ["C"], sizes: ["50-249"], regions: ["Bretagne"], jobTitles: ["DAF"], notes: "" }];
    a.message.valueProposition = "Nous divisons par deux le coût de recharge des flottes.";
    a.meetings.criteria = ["Décideur présent"];
    a.goals.launchDate = "2026-12-01";
    return a;
}

test("empty answers have every section and block on the required screens", () => {
    const a = emptyAnswers();
    assert.deepEqual(a.segments, []);
    assert.deepEqual(missingScreens(a), ["pitch", "channels", "referent", "targets", "value", "meetings", "goals"]);
    assert.equal(completion(a), 0);
});

test("a complete questionnaire has nothing missing; optional screens count only once written", () => {
    const a = filled();
    assert.deepEqual(missingScreens(a), []);
    const before = completion(a);
    a.company.offer = "Abonnement maintenance";
    a.exclusions.text = "Acme\nBeta";
    a.message.objections = [{ objection: "C'est trop cher", answer: "" }];
    assert.ok(completion(a) > before);
    assert.equal(completion(a), 100);
});

test("referent email must look like an email", () => {
    const a = filled();
    a.referent.email = "thomas";
    assert.equal(screenIssues("referent", a).length, 1);
});

test("a segment counts once it has a sector or a real description", () => {
    const a = emptyAnswers();
    a.segments = [{ id: "s1", name: "", sectors: [], sizes: [], regions: [], jobTitles: [], notes: "PME" }];
    assert.equal(definedSegments(a).length, 0);
    a.segments[0].notes = "PME industrielles du Grand Ouest";
    assert.equal(definedSegments(a).length, 1);
});

test("normalizeAnswers never throws and drops invalid shapes", () => {
    assert.deepEqual(normalizeAnswers("nope"), emptyAnswers());
    assert.deepEqual(normalizeAnswers({ channels: ["FAX"] }), emptyAnswers());
    assert.equal(normalizeAnswers({ goals: { monthlyMeetings: "15" } }).goals.monthlyMeetings, "15");
});

test("exclusions are split on lines, commas and semicolons and de-duplicated", () => {
    assert.deepEqual(parseExclusions("Acme\nacme; Beta, \"Gamma SA\"\n\nx"), ["Acme", "Beta", "Gamma SA"]);
});

test("summaries for the CRM cover every segment, the pitch and the opener", () => {
    const a = filled();
    a.segments.push({ id: "s2", name: "Logisticiens", sectors: ["H"], sizes: [], regions: [], jobTitles: [], notes: "" });
    a.samples = [{ siren: "1", name: "Rhonalog", verdict: "yes" }];
    const icp = icpSummary(a);
    assert.match(icp, /Industriels\n- Secteurs : Industrie/);
    assert.match(icp, /Logisticiens\n- Secteurs : Transport & logistique\n- Zones : France entière/);
    assert.match(icp, /Exemples pertinents : Rhonalog/);
    assert.match(pitchSummary(a), /Proposition de valeur : Nous divisons/);
    assert.match(scriptOpener(a, "Acme"), /^Bonjour, je vous appelle de la part de Acme\. Nous installons/);
});

test("prefill uses what the agency knows and stops flagging edited answers", () => {
    const { answers, prefilled } = prefillAnswers({ pitch: "Bornes de recharge", icp: "Flottes de plus de 20 véhicules", email: "bad", launchDate: "2026-12-01" });
    assert.equal(answers.company.pitch, "Bornes de recharge");
    assert.equal(answers.segments[0].notes, "Flottes de plus de 20 véhicules");
    assert.equal(answers.goals.launchDate, "2026-12-01");
    assert.deepEqual(prefilled, ["company.pitch", "segments", "goals.launchDate"]);
    const edited = structuredClone(answers);
    edited.company.pitch = "Autre chose";
    assert.deepEqual(stillPrefilled(prefilled, answers, edited), ["segments", "goals.launchDate"]);
});

test("readState repairs unknown screens", () => {
    assert.equal(readState({ screen: "nope" })?.screen, "pitch");
    assert.equal(readState(null), null);
});

test("registry query maps sectors, size groups and regions to registry codes", () => {
    const f = normalizeFilters({ sectors: ["H", "C", "ZZ"], sizes: ["50-249"], regions: ["Bretagne", "Atlantis"] });
    assert.deepEqual(f, { sectors: ["C", "H"], sizes: ["50-249"], regions: ["Bretagne"] });
    const qs = registryQuery(f);
    assert.equal(qs.get("section_activite_principale"), "C,H");
    assert.equal(qs.get("tranche_effectif_salarie"), "21,22,31");
    assert.equal(qs.get("departement"), "22,29,35,56");
    assert.equal(qs.get("etat_administratif"), "A");
    // No size picked: companies with employees only, never the one-person shells.
    assert.ok(!registryQuery(normalizeFilters({ sectors: [], sizes: [], regions: [] })).get("tranche_effectif_salarie")!.includes("NN"));
});

test("registry rows become readable samples", () => {
    assert.deepEqual(
        toSample({ siren: "1", nom_complet: "RHONALOG SAS", section_activite_principale: "H", tranche_effectif_salarie: "22", siege: { libelle_commune: "LYON 3EME" } }),
        { siren: "1", name: "Rhonalog Sas", city: "Lyon 3eme", headcount: "100-199 salariés", sector: "Transport & logistique" },
    );
});
