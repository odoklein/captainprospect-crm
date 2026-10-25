/**
 * Grounded-answer verification — pure, no model, no database.
 *     npm run test:assistant
 *
 * The cases are the traps a fluent model falls into: the right number for the
 * wrong period, the right total attributed to one person, a percentage with
 * the wrong denominator, a date or a name that no source contains.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { extractFacts } from "../evidence/facts";
import { annotateAnswer } from "./annotate";
import { verifyAnswer, type VerifiableEvidence } from "./verifier";

const NOW = new Date("2026-10-25T09:00:00Z");

const METRICS_30 = {
    periodeJours: 30,
    periode: { du: "2026-09-25", au: "2026-10-25", jours: 30, mode: "jours" },
    totaux: { actions: 420, connects: 96, rdvPris: 14, rdvAnnules: 2, tauxConnectPct: 22.9, tauxRdvSurConnectPct: 14.6 },
    parResultat: [
        { resultat: "MEETING_BOOKED", nombre: 14 },
        { resultat: "FAUX_NUMERO", nombre: 40 },
    ],
    parSdr: [
        { sdr: "Julie Martin", actions: 180, rdv: 7 },
        { sdr: "Karim Benali", actions: 150, rdv: 4 },
        { sdr: "Léa Roux", actions: 90, rdv: 3 },
    ],
};

const MONTH_TO_DATE = {
    periodeJours: 24,
    periode: { du: "2026-10-01", au: "2026-10-25", jours: 24, mode: "depuis" },
    totaux: { actions: 350, connects: 80, rdvPris: 11 },
};

const MEETINGS = {
    rdv: [
        { actionId: "a1", date: "28/10 10:00", societe: "Boulangeries Durand", contact: "Sophie Durand", sdr: "Julie Martin" },
        { actionId: "a2", date: "29/10 14:30", societe: "Transports Garnier", contact: "Marc Garnier", sdr: "Karim Benali" },
        { actionId: "a3", date: "04/11 09:00", societe: "Hôtel du Lac", contact: "Nadia Benoît", sdr: "Léa Roux" },
    ],
};

function strings(data: unknown): string[] {
    const out: string[] = [];
    const walk = (v: unknown) => {
        if (typeof v === "string") out.push(v);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(data);
    return out;
}

function ev(label: string, data: unknown, withStrings = true): VerifiableEvidence {
    const facts = extractFacts(data, NOW);
    return { label, status: "OK", facts, strings: withStrings ? strings(data) : null, period: facts[0]?.period ?? null };
}

function verify(answer: string, evidence: VerifiableEvidence[], question = "Fais le point") {
    return verifyAnswer(answer, evidence, { question, now: NOW, knownNames: ["Acme Énergie", "Camille"] });
}

function statuses(answer: string, evidence: VerifiableEvidence[], question?: string) {
    return verify(answer, evidence, question).numbers.map((n) => `${n.token.raw}:${n.status}`);
}

// -- Facts --------------------------------------------------------------------

test("facts carry path, unit, entity and the declared period", () => {
    const facts = extractFacts(METRICS_30, NOW);
    const rdv = facts.find((f) => f.path === "totaux.rdvPris")!;
    assert.equal(rdv.value, 14);
    assert.equal(rdv.unit, "count");
    assert.deepEqual(rdv.period, { kind: "rolling", from: "2026-09-25", to: "2026-10-25", days: 30 });
    assert.equal(facts.find((f) => f.key === "tauxConnectPct")!.unit, "pct");
    assert.equal(facts.find((f) => f.path === "parSdr[].rdv" && f.entity === "Karim Benali")!.value, 4);
    assert.equal(facts.find((f) => f.path === "parSdr[].rdv:sum")!.value, 14);
    assert.ok(!facts.some((f) => f.key === "periodeJours"), "the window length is metadata, not a fact");
});

test("a month-to-date window is recognised as such", () => {
    const facts = extractFacts(MONTH_TO_DATE, NOW);
    assert.equal(facts[0].period?.kind, "month_to_date");
});

// -- Numbers ------------------------------------------------------------------

test("verifies a figure with its stated period and metric", () => {
    assert.deepEqual(statuses("Sur les 30 derniers jours, 14 RDV ont été pris [E1].", [ev("E1", METRICS_30)]), ["14:verified"]);
});

test("the right number for the wrong period fails", () => {
    const r = verify("Ce mois-ci, 14 RDV ont été pris [E1].", [ev("E1", METRICS_30)]);
    assert.equal(r.numbers[0].status, "mismatch_period");
    assert.match(r.numbers[0].reason, /30 derniers jours/);
});

test("an answer without a period inherits the question's", () => {
    assert.deepEqual(statuses("14 RDV ont été pris [E1].", [ev("E1", METRICS_30)], "Combien de RDV ce mois-ci ?"), ["14:mismatch_period"]);
});

test("month to date verifies against a since-the-1st window", () => {
    assert.deepEqual(statuses("Ce mois-ci, 11 RDV ont été pris [E1].", [ev("E1", MONTH_TO_DATE)]), ["11:verified"]);
});

test("a percentage recomputed from two counts is verified", () => {
    assert.deepEqual(statuses("Sur 30 jours, 3,3 % des actions ont abouti à un RDV.", [ev("E1", METRICS_30)]), ["3,3 %:verified"]);
});

test("a percentage with the wrong denominator fails", () => {
    const r = verify("Sur 30 jours, 14,6 % des actions ont abouti à un RDV.", [ev("E1", METRICS_30)]);
    assert.equal(r.numbers[0].status, "mismatch_metric");
});

test("a stored rate verifies, including when rounded", () => {
    assert.deepEqual(statuses("Le taux de connect sur 30 jours est de 22,9 %.", [ev("E1", METRICS_30)]), ["22,9 %:verified"]);
    assert.deepEqual(statuses("Le taux de connect sur 30 jours est d'environ 23 %.", [ev("E1", METRICS_30)]), ["23 %:verified"]);
});

test("another person's figure fails on the entity", () => {
    assert.deepEqual(statuses("Sur 30 jours, Karim a pris 7 RDV.", [ev("E1", METRICS_30)]), ["7:mismatch_entity"]);
    assert.deepEqual(statuses("Sur 30 jours, Karim Benali a pris 4 RDV.", [ev("E1", METRICS_30)]), ["4:verified"]);
});

test("the team total attributed to one person fails", () => {
    assert.deepEqual(statuses("Sur 30 jours, Julie a pris 14 RDV.", [ev("E1", METRICS_30)]), ["14:mismatch_entity"]);
});

test("list items and tables take their metric from the header", () => {
    const list = "Sur les 30 derniers jours, RDV par SDR :\n- Julie Martin : 7\n- Karim Benali : 4\n- Léa Roux : 3";
    assert.deepEqual(statuses(list, [ev("E1", METRICS_30)]), ["7:verified", "4:verified", "3:verified"]);

    const table = "Sur 30 jours :\n\n| SDR | Actions | RDV |\n|---|---|---|\n| Julie Martin | 180 | 7 |\n| Karim Benali | 150 | 4 |";
    assert.deepEqual(statuses(table, [ev("E1", METRICS_30)]), ["180:verified", "7:verified", "150:verified", "4:verified"]);
});

test("a figure absent from every source is unsupported", () => {
    assert.deepEqual(statuses("Vous avez 12 RDV sur 30 jours.", [ev("E1", METRICS_30)]), ["12:unsupported"]);
    assert.deepEqual(statuses("Vous avez 12 RDV.", []), ["12:unsupported"]);
});

test("counting rows of a list verifies against its length", () => {
    assert.deepEqual(statuses("Il y a 3 RDV à venir.", [ev("E1", MEETINGS)]), ["3:verified"]);
});

test("dates, times, years, list markers, ids and quoted titles are not claims", () => {
    const answer = "1. Boulangeries Durand le 28/10 à 10:00 (Q4, 2026) [E1]\n2. Brouillon « Relance Q4 2 » envoyé le 28 oct.";
    assert.deepEqual(verify(answer, [ev("E1", MEETINGS)]).numbers, []);
});

// -- CRM data tools (public API shapes) ---------------------------------------

const SALES_MTD = {
    period: { label: "ce mois-ci", from: "2026-09-30T22:00:00.000Z", to: NOW.toISOString(), timezone: "Europe/Paris", days: 24.5 },
    totals: { actions: 350, calls: 350, appointments_booked: 11, appointments_cancelled: 1, appointments_per_100_calls: 3.1 },
    unique_called: { contacts: 260, companies: 208, calls_per_contact: 1.3 },
    reach: { reached_calls: 80, reach_rate_pct: 22.9, definition: "Calls ending in a conversation." },
    by_user: [
        { id: "u1", name: "Julie Martin", actions: 150, calls: 150, appointments_booked: 6 },
        { id: "u2", name: "Karim Benali", actions: 125, calls: 125, appointments_booked: 3 },
    ],
    comparison: {
        previous_period: { from: "2026-08-31T22:00:00.000Z", to: "2026-09-30T21:59:59.999Z" },
        appointments_booked: { now: 11, before: 12, change_pct: -8.3 },
    },
};

const SALES_30 = {
    period: { label: "30 derniers jours", from: "2026-09-25T22:00:00.000Z", to: NOW.toISOString(), timezone: "Europe/Paris", days: 29.5 },
    totals: { actions: 420, calls: 420, appointments_booked: 14 },
};

test("sales report: month to date, distinct contacts, reach rate", () => {
    const e = [ev("E1", SALES_MTD)];
    assert.deepEqual(statuses("Ce mois-ci, 11 RDV ont été pris [E1] pour 350 appels.", e), ["11:verified", "350:verified"]);
    assert.deepEqual(statuses("Ce mois-ci, 260 contacts distincts ont été appelés.", e), ["260:verified"]);
    assert.deepEqual(statuses("Ce mois-ci, le taux de joignabilité est de 22,9 %.", e), ["22,9 %:verified"]);
    assert.deepEqual(statuses("Ce mois-ci, Julie Martin a passé 150 appels et pris 6 RDV.", e), ["150:verified", "6:verified"]);
});

test("sales report: the previous period's figure and the change", () => {
    const e = [ev("E1", SALES_MTD)];
    assert.deepEqual(
        statuses("Ce mois-ci, 11 RDV contre 12 le mois dernier, soit une baisse de 8,3 %.", e),
        ["11:verified", "12:verified", "8,3 %:verified"],
    );
    // The previous period's figure presented as this month's.
    assert.deepEqual(statuses("Ce mois-ci, 12 RDV ont été pris.", e), ["12:mismatch_period"]);
});

test("a calendar 30-day preset matches '30 derniers jours' but not 'ce mois-ci'", () => {
    assert.deepEqual(statuses("Sur les 30 derniers jours : 14 RDV.", [ev("E1", SALES_30)]), ["14:verified"]);
    assert.deepEqual(statuses("Ce mois-ci : 14 RDV.", [ev("E1", SALES_30)]), ["14:mismatch_period"]);
});

test("a window given only in the arguments is used when the payload has none", async () => {
    const { periodFromArgs } = await import("../evidence/facts");
    const period = periodFromArgs({ period: "this_month" }, NOW);
    assert.equal(period?.kind, "month_to_date");
    const facts = extractFacts({ total: 11, buckets: { no_show: 1 } }, NOW, period);
    const e: VerifiableEvidence[] = [{ label: "E1", status: "OK", facts, strings: [], period }];
    assert.deepEqual(statuses("Ce mois-ci : 11 RDV, dont 1 absence.", e), ["11:verified", "1:verified"]);
});

// -- Citations, dates, names --------------------------------------------------

test("an invented citation is reported and removed", () => {
    const r = verify("Sur 30 jours, 14 RDV [E1] [E9].", [ev("E1", METRICS_30)]);
    assert.deepEqual(r.citedLabels, ["E1"]);
    assert.deepEqual(r.invalidCitations.map((c) => c.label), ["E9"]);
    assert.ok(!annotateAnswer("Sur 30 jours, 14 RDV [E1] [E9].", r).includes("[E9]"));
});

test("dates and names must appear in the retrieved payloads", () => {
    const r = verify("Prochain RDV le 28/10 avec Sophie Durand, puis le 30/10 avec Jean Dupont.", [ev("E1", MEETINGS)]);
    const byRaw = Object.fromEntries(r.others.map((o) => [o.raw, o.status]));
    assert.equal(byRaw["28/10"], "verified");
    assert.equal(byRaw["30/10"], "unsupported");
    assert.equal(byRaw["Sophie Durand"], "verified");
    assert.equal(byRaw["Jean Dupont"], "unsupported");
});

test("names known from context (client, user) are not flagged", () => {
    const r = verify("Pour Acme Énergie, Camille a demandé un point.", [ev("E1", MEETINGS)]);
    assert.ok(r.others.every((o) => o.status === "verified"));
});

// -- Annotation ---------------------------------------------------------------

test("unverified figures are marked in place and listed", () => {
    const answer = "Ce mois-ci, 14 RDV ont été pris [E1].";
    const out = annotateAnswer(answer, verify(answer, [ev("E1", METRICS_30)]));
    assert.match(out, /14 \*\(non vérifié\)\* RDV/);
    assert.match(out, /\*\*À vérifier\*\*/);
    assert.match(out, /30 derniers jours/);
});

test("a fully verified answer is left untouched", () => {
    const answer = "Sur les 30 derniers jours, 14 RDV ont été pris [E1].";
    assert.equal(annotateAnswer(answer, verify(answer, [ev("E1", METRICS_30)])), answer);
});
