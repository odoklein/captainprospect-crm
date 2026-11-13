// ============================================
// QUALIFICATION ENGINE — one prospect in, an explained view out. Pure.
//
// Rules of the house:
//   • Every point of score has a Reason with its source. No hidden weights.
//   • Missing data is reported (unverified[]), never filled in.
//   • AI signals weigh on the score only with evidence and confidence ≥ 0.6.
//   • Nothing here disqualifies on an AI opinion. The only AI-driven effects are
//     « held out of AUTOMATIC dialing » and « exclusion PROPOSED » — both end in a human.
// ============================================

import { DateTime } from "luxon";
import { evaluateFit } from "./targeting";
import { isTrustworthy } from "./signals";
import { titleLevel } from "./titles";
import {
    QUALIFICATION_STATE_LABELS,
    type KnownFact,
    type ProspectInput,
    type QualificationState,
    type QualificationView,
    type Reason,
    type ScoringContext,
} from "./types";

const TZ = "Europe/Paris";
const BASE_SCORE = 40;
export const HIGH_PRIORITY_SCORE = 75;
export const NORMAL_PRIORITY_SCORE = 50;

const MEETING = new Set(["MEETING_BOOKED"]);
const POSITIVE = new Set(["INTERESTED", "PROJET_A_SUIVRE", "REPLIED"]);
const CALLBACK = new Set(["CALLBACK_REQUESTED", "RAPPEL", "RELANCE"]);
const DEAD_LABELS: Record<string, string> = {
    DISQUALIFIED: "Disqualifié",
    INVALIDE: "Lead invalide",
    NUMERO_KO: "Numéro invalide",
    FAUX_NUMERO: "Faux numéro",
    BAD_CONTACT: "Mauvais contact",
    REFUS_CATEGORIQUE: "Refus catégorique",
    NOT_INTERESTED: "Pas intéressé",
};

/** « aujourd'hui », « hier », « il y a 3 j », « demain », « dans 2 j » — Paris calendar days. */
export function relativeDay(iso: string, now: Date): string {
    const d = DateTime.fromISO(iso, { zone: TZ }).startOf("day");
    const today = DateTime.fromJSDate(now, { zone: TZ }).startOf("day");
    const diff = Math.round(d.diff(today, "days").days);
    if (diff === 0) return "aujourd'hui";
    if (diff === -1) return "hier";
    if (diff === -2) return "avant-hier";
    if (diff === 1) return "demain";
    return diff < 0 ? `il y a ${-diff} j` : `dans ${diff} j`;
}

function hhmm(iso: string): string {
    return DateTime.fromISO(iso, { zone: TZ }).toFormat("HH:mm");
}

function plural(n: number, one: string, many: string): string {
    return `${n} ${n > 1 ? many : one}`;
}

export function qualify(input: ProspectInput, ctx: ScoringContext): QualificationView {
    const { now } = ctx;
    const reasons: Reason[] = [];
    const blockers: string[] = [];
    const unverified: string[] = [];
    const known: KnownFact[] = [];
    const add = (r: Reason) => reasons.push(r);

    const last = input.lastAction;
    const result = last?.result ?? null;
    const dead = result !== null && result in DEAD_LABELS;
    const meeting = result !== null && MEETING.has(result);
    const positive = result !== null && POSITIVE.has(result);
    const callbackLike = input.priority === "CALLBACK" || input.priority === "FOLLOW_UP" || input.priority === "ABSENT_RDV" || (result !== null && CALLBACK.has(result));
    const parked = input.priority === "SKIP" && !dead && !meeting;
    const ai = input.ai;
    const trusted = ai !== null && isTrustworthy(ai);

    if (last) known.push({ label: "Dernier résultat", value: last.label ?? last.result, source: "sdr", verified: true });

    // ── scheduling ──────────────────────────────────────────────────────
    let scheduling: QualificationView["scheduling"] = { kind: "none", at: null };
    if (callbackLike && !meeting && last?.callbackDate) {
        const endOfToday = DateTime.fromJSDate(now, { zone: TZ }).endOf("day").toMillis();
        const at = new Date(last.callbackDate).getTime();
        scheduling = { kind: at <= endOfToday ? "due" : "later", at: last.callbackDate };
    }

    // ── follow-up commitments ───────────────────────────────────────────
    if (input.priority === "ABSENT_RDV") {
        add({ code: "absent_rdv", label: "RDV manqué : à relancer", points: 45, source: "crm" });
    } else if (callbackLike && scheduling.kind === "due" && scheduling.at) {
        const at = new Date(scheduling.at).getTime();
        const dayLabel = relativeDay(scheduling.at, now);
        add(
            at <= now.getTime() && dayLabel !== "aujourd'hui"
                ? { code: "callback_overdue", label: `Rappel en retard (prévu ${dayLabel})`, points: 40, source: "sdr" }
                : { code: "callback_due", label: `Rappel convenu aujourd'hui à ${hhmm(scheduling.at)}`, points: at <= now.getTime() ? 40 : 30, source: "sdr" },
        );
    } else if (callbackLike && scheduling.kind === "later" && scheduling.at) {
        add({ code: "callback_later", label: `Rappel prévu ${relativeDay(scheduling.at, now)} à ${hhmm(scheduling.at)}`, points: -20, source: "sdr" });
    } else if (callbackLike && last) {
        add({ code: "callback_requested", label: `Rappel demandé ${relativeDay(last.createdAt, now)}`, points: 35, source: "sdr" });
    }

    if (positive) add({ code: "interest_sdr", label: "Intérêt exprimé (qualifié par le SDR)", points: 25, source: "sdr" });
    if (input.priority === "NEW" && input.attempts.total === 0) add({ code: "fresh", label: "Jamais contacté", points: 15, source: "crm" });

    if (input.attempts.consecutiveNoAnswer > 0) {
        const n = input.attempts.consecutiveNoAnswer;
        add({ code: "no_answer_streak", label: `${plural(n, "tentative sans réponse", "tentatives sans réponse")}`, points: -Math.min(15, 3 * n), source: "crm" });
    }
    const capped = ctx.maxAttempts != null && input.attempts.total >= ctx.maxAttempts;
    if (capped) blockers.push(`Plafond de ${ctx.maxAttempts} tentatives atteint`);

    // ── who we would reach ──────────────────────────────────────────────
    const level = input.contact ? titleLevel(input.contact.title) : "unknown";
    let needsQualification = false;
    if (!input.contact) {
        needsQualification = true;
        unverified.push("Aucun contact identifié");
        add({ code: "no_contact", label: "Aucun contact identifié", points: -5, source: "crm" });
    } else if (trusted && ai.decisionMaker === "confirmed") {
        add({ code: "dm_confirmed", label: "Décideur confirmé en appel", points: 10, source: "ai", evidence: ai.evidence[0] });
    } else if (trusted && ai.decisionMaker === "other_person") {
        add({ code: "dm_other", label: "Un autre décideur a été cité en appel", points: 0, source: "ai", evidence: ai.evidence[0] });
        unverified.push("Décideur à joindre");
    } else if (level === "decision") {
        add({ code: "dm_title", label: `Décideur probable (${input.contact.title})`, points: 10, source: "crm" });
    } else if (level === "influencer") {
        add({ code: "influencer_title", label: `Responsable (${input.contact.title})`, points: 3, source: "crm" });
        unverified.push("Décideur non confirmé");
    } else if (level === "gatekeeper") {
        needsQualification = true;
        add({ code: "gatekeeper_title", label: `Interlocuteur non décisionnel (${input.contact.title})`, points: -8, source: "crm" });
        unverified.push("Décideur non confirmé");
    } else {
        needsQualification = true;
        unverified.push("Décideur non confirmé");
    }

    // ── contactability & data quality ───────────────────────────────────
    if (!input.hasPhone) {
        blockers.push("Aucun numéro");
        needsQualification = true;
        add({ code: "no_phone", label: "Aucun numéro à appeler", points: -50, source: "crm" });
    } else if (input.mobile) {
        add({ code: "mobile", label: "Ligne mobile", points: 4, source: "crm" });
    }
    if (input.contact?.completeness === "ACTIONABLE") add({ code: "complete", label: "Fiche complète", points: 4, source: "crm" });
    else if (input.contact?.completeness === "INCOMPLETE") add({ code: "incomplete", label: "Fiche incomplète", points: -4, source: "crm" });

    // ── fit with the mission's structured targeting ─────────────────────
    const fit = evaluateFit(input.company, ctx.targeting);
    if (ctx.targeting) {
        reasons.push(...fit.reasons);
        if (fit.allMatch) add({ code: "fit_all", label: "Correspond au ciblage", points: 0, source: "targeting" });
        for (const u of fit.unknown) unverified.push(u);
    } else {
        add({ code: "no_targeting", label: "Ciblage non défini pour cette mission", points: 0, source: "targeting" });
    }

    // ── what earlier calls taught us ────────────────────────────────────
    let optOutSuspected = false;
    if (ai) {
        if (ai.need) known.push({ label: "Besoin", value: ai.need, source: "ai", verified: false, evidence: ai.evidence[0] });
        else unverified.push("Besoin non exprimé");
        if (ai.timing) known.push({ label: "Échéance", value: ai.timing, source: "ai", verified: false });
        else unverified.push("Échéance inconnue");
        if (ai.budget) known.push({ label: "Budget", value: ai.budget, source: "ai", verified: false });
        else unverified.push("Budget non évoqué");
        for (const o of ai.objections.slice(0, 2)) known.push({ label: "Objection", value: o, source: "ai", verified: false });

        if (trusted) {
            if (ai.interest === "high") add({ code: "ai_interest_high", label: "Fort intérêt exprimé en appel", points: 20, source: "ai", evidence: ai.evidence[0] });
            else if (ai.interest === "medium") add({ code: "ai_interest_medium", label: "Intérêt modéré exprimé en appel", points: 10, source: "ai", evidence: ai.evidence[0] });
            else if (ai.interest === "low") add({ code: "ai_interest_low", label: "Intérêt faible exprimé en appel", points: 0, source: "ai", evidence: ai.evidence[0] });
        } else if (ai.interest || ai.decisionMaker) {
            unverified.push("Signaux de l'appel précédent à confirmer (sans preuve ou confiance faible)");
        }
        if (ai.optOut) {
            optOutSuspected = true;
            blockers.push("Opposition au démarchage possible : à vérifier avant d'appeler");
            add({ code: "ai_opt_out", label: "Opposition au démarchage détectée (à confirmer)", points: 0, source: "ai", evidence: ai.evidence[0] });
        }
    } else if (input.attempts.total > 0 && !positive && !meeting && !dead) {
        // Called before, but nothing was ever said that could be analysed.
        unverified.push("Aucune conversation analysée");
    }

    // ── eligibility ─────────────────────────────────────────────────────
    if (parked) blockers.push(`En pause (${last?.label ?? last?.result ?? "statut"})`);
    const callable = input.hasPhone && !dead && !meeting && !parked;
    const dialEligible = callable && !capped && !optOutSuspected && scheduling.kind !== "later";

    // ── score ───────────────────────────────────────────────────────────
    const raw = BASE_SCORE + reasons.reduce((s, r) => s + r.points, 0);
    let score = Math.max(0, Math.min(100, raw));
    if (dead || meeting) score = 0;
    const tier = score >= HIGH_PRIORITY_SCORE ? "haute" : score >= NORMAL_PRIORITY_SCORE ? "normale" : "basse";

    // ── state ───────────────────────────────────────────────────────────
    let state: QualificationState;
    if (dead) state = "NON_PERTINENT";
    else if (meeting) state = "RDV_PRIS";
    else if (parked) state = "EN_COURS";
    else if (positive && scheduling.kind !== "due") state = "QUALIFIE";
    else if (callbackLike) state = scheduling.kind !== "later" && tier === "haute" ? "PRIORITAIRE" : "A_RELANCER";
    else if (input.attempts.total > 0) state = "EN_COURS";
    else if (needsQualification) state = "A_QUALIFIER";
    else state = tier === "haute" ? "PRIORITAIRE" : "PRET_A_APPELER";

    const proposeExclusion = optOutSuspected || Boolean(last?.triggersExclusion);

    // ── headline ────────────────────────────────────────────────────────
    const top = [...reasons].filter((r) => r.points > 0).sort((a, b) => b.points - a.points)[0];
    let prefix = QUALIFICATION_STATE_LABELS[state];
    let because: string | undefined;
    if (state === "PRIORITAIRE") prefix = "Priorité haute";
    if (state === "NON_PERTINENT") {
        prefix = proposeExclusion ? "À exclure" : "Non pertinent";
        because = result ? DEAD_LABELS[result] : undefined;
    } else if (state === "A_QUALIFIER") {
        because = blockers[0] ?? unverified[0];
    } else if (state === "PRET_A_APPELER") {
        because = fit.allMatch ? "Correspond au ciblage" : top?.label;
    } else {
        because = top?.label ?? blockers[0];
    }
    if (optOutSuspected && state !== "NON_PERTINENT") prefix = "À vérifier";
    const headline = because ? `${prefix} · ${because}` : prefix;

    return {
        state,
        stateLabel: QUALIFICATION_STATE_LABELS[state],
        score,
        tier,
        headline,
        reasons: [...reasons].sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
        callable,
        dialEligible,
        blockers,
        unverified: [...new Set(unverified)],
        known,
        scheduling,
        proposeExclusion,
    };
}
