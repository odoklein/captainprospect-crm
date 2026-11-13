// ============================================
// POST-CALL PROPOSALS — from a finished call to the CRM actions that follow it. Pure.
//
//   Appel → Analyse → Qualification → Action → Prochain prospect
//
// Inputs are facts already validated upstream: the provider's outcome, and the AI
// summary after its evidence quotes were checked against the transcript. Outputs
// are deterministic, typed proposals. Nothing here free-forms an action: a model's
// sentence can only ever fill a field of one of the fixed kinds, and the kind's
// ceiling, the organisation policy and the eligibility rules decide whether it may
// run on its own. Everything else waits for a click.
// ============================================

import { parseLocalCallback } from "@/lib/focus/focus";
import { MIN_SIGNAL_CONFIDENCE } from "@/lib/qualification/signals";
import type { CallSuggestion } from "@/lib/telephony/suggestion";
import type { CallAiSummary } from "@/lib/telephony/summary-shape";
import { CEILING, type AutomationMode, type AutomationPolicy, type ProposalKind } from "./policy";

export interface Proposal {
    /** Deterministic: the same call and payload always give the same key, so storing twice is harmless. */
    key: string;
    kind: ProposalKind;
    /** One French line. */
    title: string;
    detail: string | null;
    payload: Record<string, unknown>;
    /** Verbatim transcript quotes backing it (AI-derived proposals only). */
    evidence: string[];
    confidence: number | null;
    source: "provider" | "ai" | "sdr_commitment";
    /** What the server may do with it right now. */
    mode: "suggest" | "auto";
    /** Why a person must look at it, when it is not automatic. */
    holdReason: string | null;
    /** It cannot be applied as it stands (date in the past, address missing…). */
    blocked: string | null;
}

export interface ProposalSet {
    proposals: Proposal[];
    /** What is still unknown and only the SDR can settle — shown, never filled in. */
    gaps: string[];
}

export interface ProposalInput {
    callId: string;
    now: Date;
    /** From suggestCallResult(): the call's outcome as proposed today. */
    disposition: CallSuggestion;
    summary: CallAiSummary | null;
    contact: { firstName: string | null; email: string | null } | null;
    policy: AutomationPolicy;
}

const MAX_CALLBACK_DAYS = 90;
const DAY_MS = 86_400_000;
const SEND_WORDS = /\b(mail|e-?mail|courriel|envoy|transmet|documentation|plaquette|devis|proposition|pr[ée]sentation|brochure|tarifs?)/i;

const NATURE_HOLD: Partial<Record<ProposalKind, string>> = {
    SET_DISPOSITION_AI: "Le résultat est signé par le SDR : il alimente les rapports client.",
    PREPARE_EMAIL: "Un email part à l'extérieur : relecture obligatoire.",
    PROPOSE_MEETING: "Le rendez-vous se confirme dans la fiche (date, type, calendrier du client).",
    PROPOSE_EXCLUSION: "Une exclusion est durable : elle doit être confirmée par une personne.",
};

function fnv(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
}

/** One line, no markup, no control characters: model text is data, never a template. */
export function plain(text: string, max = 200): string {
    return text.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function trustedSummary(summary: CallAiSummary | null): boolean {
    return Boolean(summary && (summary.evidence?.length ?? 0) > 0 && (summary.confidence ?? 0) >= MIN_SIGNAL_CONFIDENCE);
}

function resolveMode(kind: ProposalKind, policy: AutomationPolicy, eligible: { ok: boolean; why?: string }, blocked: string | null): { mode: "suggest" | "auto"; holdReason: string | null } | null {
    const asked: AutomationMode = policy[kind] ?? "suggest";
    if (asked === "off") return null;
    const allowed: AutomationMode = asked === "auto" && CEILING[kind] === "auto" ? "auto" : "suggest";
    if (allowed === "auto" && eligible.ok && !blocked) return { mode: "auto", holdReason: null };
    const why = asked === "auto" && CEILING[kind] === "auto" ? eligible.why ?? (blocked ?? null) : NATURE_HOLD[kind] ?? null;
    return { mode: "suggest", holdReason: why };
}

export function buildProposals(input: ProposalInput): ProposalSet {
    const { callId, now, disposition, summary, contact, policy } = input;
    const out: Proposal[] = [];
    const gaps: string[] = [];
    const trusted = trustedSummary(summary);
    const evidence = summary?.evidence ?? [];
    const confidence = summary?.confidence ?? null;

    const push = (p: Omit<Proposal, "key" | "mode" | "holdReason">, eligible: { ok: boolean; why?: string }) => {
        const resolved = resolveMode(p.kind, policy, eligible, p.blocked);
        if (!resolved) return;
        out.push({ ...p, ...resolved, key: `${callId}:${p.kind}:${fnv(JSON.stringify(p.payload))}` });
    };

    // ── the call's outcome ──────────────────────────────────────────────
    let meetingProposed = false;
    if (disposition.state === "ready") {
        const d = disposition;
        const wall = d.callbackAt;
        const callbackAt = wall ? parseLocalCallback(wall, now) : null;
        const callbackBlocked = wall && !callbackAt ? "Date de rappel dépassée ou illisible : à corriger" : null;
        const farAway = callbackAt && new Date(callbackAt).getTime() - now.getTime() > MAX_CALLBACK_DAYS * DAY_MS;
        if (d.status.triggersCallback && !wall) gaps.push("Date de rappel non convenue : à choisir avec le prospect");
        if (callbackBlocked) gaps.push(callbackBlocked);

        if (d.source === "twilio") {
            push(
                {
                    kind: "SET_DISPOSITION_PROVIDER",
                    title: `Enregistrer « ${d.status.label} »`,
                    detail: d.note,
                    payload: { statusCode: d.status.code, note: d.note, callbackAt: null },
                    evidence: [],
                    confidence: null,
                    source: "provider",
                    blocked: null,
                },
                { ok: d.confirmable },
            );
        } else if (d.status.code === "MEETING_BOOKED" || !d.confirmable) {
            meetingProposed = true;
            const at = summary?.meeting?.at ? parseLocalCallback(summary.meeting.at, now) : null;
            push(
                {
                    kind: "PROPOSE_MEETING",
                    title: at ? "Confirmer le rendez-vous évoqué" : "Un rendez-vous a été évoqué",
                    detail: at ? null : "Aucun jour et horaire précis n'ont été dits : à fixer dans la fiche.",
                    payload: { statusCode: d.status.code, at, note: plain(d.note, 500) },
                    evidence,
                    confidence,
                    source: "ai",
                    blocked: null,
                },
                { ok: false },
            );
        } else {
            push(
                {
                    kind: "SET_DISPOSITION_AI",
                    title: `Enregistrer « ${d.status.label} »`,
                    detail: plain(d.note, 500),
                    payload: { statusCode: d.status.code, note: plain(d.note, 500), callbackAt },
                    evidence,
                    confidence,
                    source: "ai",
                    blocked: callbackBlocked,
                },
                { ok: trusted, why: "Confiance insuffisante ou aucune citation vérifiée" },
            );
            if (farAway) gaps.push(`Rappel à plus de ${MAX_CALLBACK_DAYS} jours : à confirmer`);
        }
    }

    if (summary) {
        // ── a meeting the model heard, not already proposed through the status ──
        if (!meetingProposed && summary.meeting?.mentioned) {
            const meetingAt = summary.meeting.at ? parseLocalCallback(summary.meeting.at, now) : null;
            push(
                {
                    kind: "PROPOSE_MEETING",
                    title: meetingAt ? "Confirmer le rendez-vous évoqué" : "Un rendez-vous a été évoqué",
                    detail: meetingAt ? null : "Aucun jour et horaire précis n'ont été dits : à fixer dans la fiche.",
                    payload: { statusCode: "MEETING_BOOKED", at: meetingAt, note: plain(summary.summary, 500) },
                    evidence,
                    confidence,
                    source: "ai",
                    blocked: null,
                },
                { ok: false },
            );
        }

        // ── the prospect asked not to be contacted ──
        if (summary.optOut) {
            push(
                {
                    kind: "PROPOSE_EXCLUSION",
                    title: "Le prospect demande à ne plus être contacté",
                    detail: trusted ? "Opposition exprimée pendant l'appel." : "Possible opposition détectée, non confirmée par une citation : à vérifier dans l'enregistrement.",
                    payload: { target: "CONTACT", reason: "Opposition au démarchage exprimée en appel" },
                    evidence,
                    confidence,
                    source: "ai",
                    blocked: null,
                },
                { ok: false },
            );
        }

        // ── what the SDR committed to ──
        const seen = new Set<string>();
        for (const promise of summary.promises ?? []) {
            if (promise.by !== "sdr") continue;
            const what = plain(promise.what, 140);
            const norm = what.toLowerCase();
            if (what.length < 5 || seen.has(norm) || seen.size >= 3) continue;
            seen.add(norm);

            push(
                {
                    kind: "CREATE_TASK",
                    title: `Tâche : ${what}`,
                    detail: "Engagement pris pendant l'appel.",
                    payload: { title: `À faire (suite d'appel) : ${what}`, dueAt: null },
                    evidence,
                    confidence,
                    source: "sdr_commitment",
                    blocked: null,
                },
                { ok: trusted, why: "Engagement non étayé par une citation vérifiée" },
            );

            if (SEND_WORDS.test(what)) {
                const hello = contact?.firstName ? `Bonjour ${plain(contact.firstName, 60)},` : "Bonjour,";
                if (!contact?.email) gaps.push("Email du contact manquant : le brouillon ne peut pas être préparé");
                push(
                    {
                        kind: "PREPARE_EMAIL",
                        title: "Préparer l'email promis",
                        detail: what,
                        payload: {
                            to: contact?.email ?? null,
                            subject: "Suite à notre échange",
                            body: `${hello}\n\nSuite à notre échange téléphonique, je reviens vers vous comme convenu :\n— ${what}\n\nBien cordialement,`,
                        },
                        evidence,
                        confidence,
                        source: "sdr_commitment",
                        blocked: contact?.email ? null : "Aucune adresse email pour ce contact",
                    },
                    { ok: false },
                );
            }
        }

        // ── what the prospect said ──
        const facts: Record<string, unknown> = {};
        if (summary.decisionMakerStatus) facts.decisionMaker = summary.decisionMakerStatus;
        if (summary.statedRole) facts.statedRole = summary.statedRole;
        if (summary.interest) facts.interest = summary.interest;
        if (summary.qualification.need) facts.need = summary.qualification.need;
        if (summary.qualification.timing) facts.timing = summary.qualification.timing;
        if (summary.qualification.budget) facts.budget = summary.qualification.budget;
        const prospectPromises = (summary.promises ?? []).filter((p) => p.by === "prospect").map((p) => plain(p.what, 140)).filter(Boolean);
        if (prospectPromises.length) facts.prospectPromises = prospectPromises;
        if (Object.keys(facts).length > 0) {
            push(
                {
                    kind: "RECORD_FACTS",
                    title: "Mettre à jour la qualification",
                    detail: trusted ? null : "À vérifier : aucune citation ne confirme ces informations.",
                    payload: { facts },
                    evidence,
                    confidence,
                    source: "ai",
                    blocked: null,
                },
                { ok: trusted, why: "Informations non étayées par une citation vérifiée" },
            );
        }
    }

    return { proposals: out, gaps: [...new Set(gaps)] };
}
