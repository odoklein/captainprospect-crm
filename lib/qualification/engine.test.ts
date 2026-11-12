import { test } from "node:test";
import assert from "node:assert/strict";
import { qualify, relativeDay } from "./engine";
import { evaluateFit, parseTargeting } from "./targeting";
import { titleLevel } from "./titles";
import { isTrustworthy, signalsFromSummary } from "./signals";
import type { AiSignals, ProspectInput, ScoringContext } from "./types";

// Thursday 12 Nov 2026, 10:00 Paris (09:00Z).
const NOW = new Date("2026-11-12T09:00:00.000Z");
const ctx = (over: Partial<ScoringContext> = {}): ScoringContext => ({ now: NOW, targeting: null, maxAttempts: null, ...over });

function prospect(over: Partial<ProspectInput> = {}): ProspectInput {
    return {
        contact: { title: "Directeur général", completeness: "PARTIAL" },
        company: { industry: "Logiciel", size: "50-249", country: "France" },
        hasPhone: true,
        mobile: false,
        priority: "NEW",
        lastAction: null,
        attempts: { total: 0, consecutiveNoAnswer: 0 },
        ai: null,
        ...over,
    };
}

function ai(over: Partial<AiSignals> = {}): AiSignals {
    return {
        callId: "c1", at: "2026-11-10T10:00:00.000Z", interest: null, decisionMaker: null, need: null, timing: null, budget: null,
        objections: [], optOut: false, confidence: null, evidence: [], ...over,
    };
}

// ── headlines from the brief ───────────────────────────────────────────────

test("callback asked yesterday → « Priorité haute · Rappel demandé hier »", () => {
    const v = qualify(
        prospect({
            contact: { title: null, completeness: "PARTIAL" },
            priority: "CALLBACK",
            lastAction: { result: "CALLBACK_REQUESTED", createdAt: "2026-11-11T14:00:00.000Z", callbackDate: null },
            attempts: { total: 1, consecutiveNoAnswer: 0 },
        }),
        ctx(),
    );
    assert.equal(v.state, "PRIORITAIRE");
    assert.equal(v.headline, "Priorité haute · Rappel demandé hier");
});

test("untitled fresh contact → « À qualifier · Décideur non confirmé », still callable", () => {
    const v = qualify(prospect({ contact: { title: null, completeness: "PARTIAL" } }), ctx());
    assert.equal(v.state, "A_QUALIFIER");
    assert.equal(v.headline, "À qualifier · Décideur non confirmé");
    assert.equal(v.callable, true);
    assert.ok(v.unverified.includes("Décideur non confirmé"));
});

test("decision-maker matching the defined targeting → « Prêt à appeler · Correspond au ciblage »", () => {
    const v = qualify(prospect(), ctx({ targeting: parseTargeting(JSON.stringify({ industries: ["logiciel"] })) }));
    assert.equal(v.state, "PRET_A_APPELER");
    assert.equal(v.headline, "Prêt à appeler · Correspond au ciblage");
});

test("category refusal that proposes an exclusion → « À exclure · Refus catégorique », never callable", () => {
    const v = qualify(
        prospect({
            priority: "SKIP",
            lastAction: { result: "REFUS_CATEGORIQUE", createdAt: "2026-11-11T10:00:00.000Z", callbackDate: null, triggersExclusion: true },
            attempts: { total: 2, consecutiveNoAnswer: 0 },
        }),
        ctx(),
    );
    assert.equal(v.state, "NON_PERTINENT");
    assert.equal(v.headline, "À exclure · Refus catégorique");
    assert.equal(v.callable, false);
    assert.equal(v.dialEligible, false);
    assert.equal(v.score, 0);
    assert.equal(v.proposeExclusion, true);
});

// ── scheduling ─────────────────────────────────────────────────────────────

test("overdue callback names the day it was due", () => {
    const v = qualify(
        prospect({
            priority: "CALLBACK",
            lastAction: { result: "RAPPEL", createdAt: "2026-11-09T10:00:00.000Z", callbackDate: "2026-11-11T13:00:00.000Z" },
            attempts: { total: 1, consecutiveNoAnswer: 0 },
        }),
        ctx(),
    );
    assert.equal(v.scheduling.kind, "due");
    assert.match(v.headline, /Rappel en retard \(prévu hier\)/);
});

test("a callback planned for a later day sinks the row and keeps it out of automatic dialing", () => {
    const later = qualify(
        prospect({
            priority: "CALLBACK",
            lastAction: { result: "RAPPEL", createdAt: "2026-11-11T10:00:00.000Z", callbackDate: "2026-11-16T09:00:00.000Z" },
            attempts: { total: 1, consecutiveNoAnswer: 0 },
        }),
        ctx(),
    );
    assert.equal(later.state, "A_RELANCER");
    assert.equal(later.scheduling.kind, "later");
    assert.equal(later.dialEligible, false);
    assert.equal(later.callable, true, "a human may still call it");
    assert.ok(later.score < 50);
});

test("a callback agreed for later today is due (it comes up on its day)", () => {
    const v = qualify(
        prospect({
            priority: "CALLBACK",
            lastAction: { result: "RAPPEL", createdAt: "2026-11-11T10:00:00.000Z", callbackDate: "2026-11-12T15:30:00.000Z" },
            attempts: { total: 1, consecutiveNoAnswer: 0 },
        }),
        ctx(),
    );
    assert.equal(v.scheduling.kind, "due");
    assert.match(v.headline, /Rappel convenu aujourd'hui à 16:30/);
});

test("missed meeting is recalled first", () => {
    const v = qualify(prospect({ priority: "ABSENT_RDV", attempts: { total: 2, consecutiveNoAnswer: 0 } }), ctx());
    assert.equal(v.state, "PRIORITAIRE");
    assert.match(v.headline, /RDV manqué/);
});

// ── AI never decides alone ─────────────────────────────────────────────────

test("AI interest without evidence moves nothing and is flagged as unverified", () => {
    const base = qualify(prospect(), ctx());
    const v = qualify(prospect({ ai: ai({ interest: "high", confidence: 0.95, evidence: [] }) }), ctx());
    assert.equal(v.score, base.score);
    assert.ok(v.unverified.some((u) => u.startsWith("Signaux de l'appel précédent")));
});

test("AI interest below the confidence floor moves nothing", () => {
    const base = qualify(prospect(), ctx());
    const v = qualify(prospect({ ai: ai({ interest: "high", confidence: 0.4, evidence: ["« oui ça m'intéresse »"] }) }), ctx());
    assert.equal(v.score, base.score);
});

test("AI interest with evidence and confidence adds points and carries its evidence", () => {
    const base = qualify(prospect(), ctx());
    const v = qualify(prospect({ ai: ai({ interest: "high", confidence: 0.8, evidence: ["« envoyez-moi une proposition »"] }) }), ctx());
    assert.equal(v.score, base.score + 20);
    const r = v.reasons.find((x) => x.code === "ai_interest_high");
    assert.equal(r?.source, "ai");
    assert.equal(r?.evidence, "« envoyez-moi une proposition »");
});

test("a negative AI reading never lowers the score nor disqualifies", () => {
    const base = qualify(prospect(), ctx());
    const v = qualify(prospect({ ai: ai({ interest: "low", confidence: 0.9, evidence: ["« pas pour le moment »"] }) }), ctx());
    assert.equal(v.score, base.score);
    assert.notEqual(v.state, "NON_PERTINENT");
});

test("a suspected opt-out, even uncertain, holds the row out of AUTOMATIC dialing but never disqualifies it", () => {
    const v = qualify(prospect({ ai: ai({ optOut: true, confidence: 0.3 }) }), ctx());
    assert.equal(v.dialEligible, false);
    assert.equal(v.callable, true);
    assert.notEqual(v.state, "NON_PERTINENT");
    assert.equal(v.proposeExclusion, true);
    assert.match(v.headline, /^À vérifier/);
});

test("what the AI heard stays unverified; what was not said is listed, not invented", () => {
    const v = qualify(prospect({ attempts: { total: 1, consecutiveNoAnswer: 0 }, priority: "RETRY", ai: ai({ need: "Remplacer son CRM", confidence: 0.9, evidence: ["« notre CRM est dépassé »"] }) }), ctx());
    const need = v.known.find((k) => k.label === "Besoin");
    assert.equal(need?.verified, false);
    assert.ok(v.unverified.includes("Budget non évoqué"));
    assert.ok(v.unverified.includes("Échéance inconnue"));
    assert.ok(!v.known.some((k) => k.label === "Budget"));
});

// ── eligibility & safeguards ───────────────────────────────────────────────

test("no phone number: not callable, qualifies as data to enrich", () => {
    const v = qualify(prospect({ hasPhone: false }), ctx());
    assert.equal(v.callable, false);
    assert.equal(v.dialEligible, false);
    assert.equal(v.state, "A_QUALIFIER");
    assert.ok(v.blockers.includes("Aucun numéro"));
});

test("organisation attempt cap blocks automatic dialing only", () => {
    const v = qualify(prospect({ priority: "RETRY", attempts: { total: 6, consecutiveNoAnswer: 6 } }), ctx({ maxAttempts: 6 }));
    assert.equal(v.dialEligible, false);
    assert.equal(v.callable, true);
    assert.ok(v.blockers.some((b) => b.includes("Plafond")));
});

test("consecutive no-answers cost points up to a floor", () => {
    const one = qualify(prospect({ priority: "RETRY", attempts: { total: 1, consecutiveNoAnswer: 1 } }), ctx());
    const many = qualify(prospect({ priority: "RETRY", attempts: { total: 9, consecutiveNoAnswer: 9 } }), ctx());
    assert.ok(many.score < one.score);
    assert.equal(many.reasons.find((r) => r.code === "no_answer_streak")?.points, -15);
});

test("a parked status (mail only…) is neither callable nor dead", () => {
    const v = qualify(prospect({ priority: "SKIP", lastAction: { result: "MAIL_UNIQUEMENT", label: "Mail uniquement", createdAt: "2026-11-10T10:00:00.000Z", callbackDate: null }, attempts: { total: 1, consecutiveNoAnswer: 0 } }), ctx());
    assert.equal(v.state, "EN_COURS");
    assert.equal(v.callable, false);
    assert.ok(v.blockers[0].includes("Mail uniquement"));
});

test("booked meeting: out of the dialing pool, state RDV_PRIS", () => {
    const v = qualify(prospect({ priority: "SKIP", lastAction: { result: "MEETING_BOOKED", createdAt: "2026-11-10T10:00:00.000Z", callbackDate: "2026-11-20T10:00:00.000Z" }, attempts: { total: 3, consecutiveNoAnswer: 0 } }), ctx());
    assert.equal(v.state, "RDV_PRIS");
    assert.equal(v.dialEligible, false);
});

test("interest logged by the SDR → Qualifié", () => {
    const v = qualify(prospect({ priority: "FOLLOW_UP", lastAction: { result: "INTERESTED", createdAt: "2026-11-10T10:00:00.000Z", callbackDate: null }, attempts: { total: 2, consecutiveNoAnswer: 0 } }), ctx());
    assert.equal(v.state, "QUALIFIE");
});

test("score always stays within 0..100", () => {
    const high = qualify(
        prospect({
            priority: "ABSENT_RDV", mobile: true, contact: { title: "CEO", completeness: "ACTIONABLE" },
            ai: ai({ interest: "high", decisionMaker: "confirmed", confidence: 0.9, evidence: ["x"] }),
        }),
        ctx({ targeting: parseTargeting(JSON.stringify({ industries: ["logiciel"], countries: ["france"], sizeBuckets: ["50-249"] })) }),
    );
    const low = qualify(prospect({ hasPhone: false, priority: "RETRY", attempts: { total: 20, consecutiveNoAnswer: 20 }, contact: null }), ctx());
    assert.ok(high.score <= 100 && high.score >= 0);
    assert.ok(low.score <= 100 && low.score >= 0);
});

test("reasons add up exactly to the score (no hidden weight)", () => {
    const v = qualify(prospect({ mobile: true, contact: { title: "Gérant", completeness: "ACTIONABLE" } }), ctx());
    assert.equal(v.score, Math.max(0, Math.min(100, 40 + v.reasons.reduce((s, r) => s + r.points, 0))));
});

// ── targeting ──────────────────────────────────────────────────────────────

test("without structured targeting there is no fit score, and the row says so", () => {
    const v = qualify(prospect(), ctx());
    assert.ok(v.reasons.some((r) => r.code === "no_targeting" && r.points === 0));
    assert.ok(!v.reasons.some((r) => r.code.startsWith("fit_")));
});

test("a defined criterion that mismatches lowers the score but does not exclude", () => {
    const t = parseTargeting(JSON.stringify({ industries: ["restauration"] }));
    const v = qualify(prospect(), ctx({ targeting: t }));
    assert.ok(v.reasons.some((r) => r.code === "fit_industry_miss"));
    assert.equal(v.callable, true);
});

test("missing company data is reported, not assumed to match", () => {
    const fit = evaluateFit({ industry: null, size: null, country: null }, parseTargeting(JSON.stringify({ industries: ["logiciel"], sizeBuckets: ["50-249"] })));
    assert.deepEqual(fit.unknown.sort(), ["Effectif inconnu", "Secteur inconnu"]);
    assert.equal(fit.allMatch, false);
    assert.equal(fit.anyMismatch, false);
});

test("targeting parser rejects junk and empty criteria", () => {
    assert.equal(parseTargeting(null), null);
    assert.equal(parseTargeting("not json"), null);
    assert.equal(parseTargeting(JSON.stringify({ industries: [] })), null);
    assert.deepEqual(parseTargeting(JSON.stringify({ countries: ["FR", 3, " "] }))?.countries, ["FR"]);
});

test("country codes and names match each other, accents ignored", () => {
    const t = parseTargeting(JSON.stringify({ countries: ["FR"], industries: ["Santé"] }));
    const fit = evaluateFit({ industry: "Sante et bien-être", size: null, country: "France" }, t);
    assert.ok(fit.reasons.some((r) => r.code === "fit_country"));
    assert.ok(fit.reasons.some((r) => r.code === "fit_industry"));
});

// ── helpers ────────────────────────────────────────────────────────────────

test("title levels: gatekeeper beats decision word", () => {
    assert.equal(titleLevel("Assistante de direction"), "gatekeeper");
    assert.equal(titleLevel("Gérant"), "decision");
    assert.equal(titleLevel("Directrice générale"), "decision");
    assert.equal(titleLevel("Responsable achats"), "influencer");
    assert.equal(titleLevel("Comptable"), "unknown");
    assert.equal(titleLevel(null), "unknown");
});

test("relativeDay counts Paris calendar days", () => {
    assert.equal(relativeDay("2026-11-12T22:30:00.000Z", NOW), "aujourd'hui"); // 23:30 Paris, still the 12th
    assert.equal(relativeDay("2026-11-12T23:30:00.000Z", NOW), "demain"); // 00:30 Paris on the 13th
    assert.equal(relativeDay("2026-11-11T23:30:00.000Z", NOW), "aujourd'hui"); // 00:30 Paris on the 12th
    assert.equal(relativeDay("2026-11-11T10:00:00.000Z", NOW), "hier");
    assert.equal(relativeDay("2026-11-09T10:00:00.000Z", NOW), "il y a 3 j");
    assert.equal(relativeDay("2026-11-14T10:00:00.000Z", NOW), "dans 2 j");
});

test("signals: legacy summaries have no confidence and so never weigh on a score", () => {
    const s = signalsFromSummary("c1", NOW, {
        summary: "x", keyPoints: [], objections: [], nextSteps: [],
        qualification: { need: "CRM", currentSolution: null, timing: null, decisionMaker: "Le gérant", budget: null },
        suggestedStatus: null,
    });
    assert.equal(s.confidence, null);
    assert.equal(s.decisionMaker, null, "free-text decision-maker is a fact as heard, not a confirmation");
    assert.equal(isTrustworthy(s), false);
});
