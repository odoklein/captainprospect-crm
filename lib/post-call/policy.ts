// ============================================
// POST-CALL AUTOMATION POLICY — what the system may do by itself after a call. Pure.
//
// One mode per kind of action:
//   off      never proposed
//   suggest  shown to the SDR, applied on their click (the default for everything)
//   auto     applied by the server, but only when the proposal is eligible (see proposals.ts)
//
// Each kind also has a CEILING that no organisation setting can raise. Anything
// irreversible for the prospect, visible to a client, or sent outside the CRM tops
// out at « suggest ». The ceiling is applied when the policy is read, so a tampered
// or stale stored value cannot grant more than the code allows.
//
// Stored in SystemConfig "automation.postCall" as JSON; a missing or unreadable
// value means every kind is « suggest » — today's behaviour.
// ============================================

export const POLICY_KEY = "automation.postCall";

export const PROPOSAL_KINDS = [
    "SET_DISPOSITION_PROVIDER", // outcome known from the telephony provider alone: no answer, busy
    "SET_DISPOSITION_AI", // outcome read from the conversation by the model
    "CREATE_TASK", // a commitment the SDR made on the call
    "PREPARE_EMAIL", // a drafted follow-up email (never sent from here)
    "RECORD_FACTS", // what the prospect said: role, need, timing, budget, decision-maker
    "PROPOSE_MEETING", // a meeting was agreed: confirmed in the booking form, never here
    "PROPOSE_EXCLUSION", // the prospect asked not to be contacted
] as const;

export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export type AutomationMode = "off" | "suggest" | "auto";

const RANK: Record<AutomationMode, number> = { off: 0, suggest: 1, auto: 2 };

/** The most any organisation may allow. */
export const CEILING: Record<ProposalKind, AutomationMode> = {
    SET_DISPOSITION_PROVIDER: "auto",
    SET_DISPOSITION_AI: "suggest", // feeds client reports: a human signs it
    CREATE_TASK: "auto",
    PREPARE_EMAIL: "suggest", // externally consequential once sent
    RECORD_FACTS: "auto",
    PROPOSE_MEETING: "suggest", // needs a date, a type and the client's calendar
    PROPOSE_EXCLUSION: "suggest", // durable « ne plus contacter » rule: always a human
};

export type AutomationPolicy = Record<ProposalKind, AutomationMode>;

export const DEFAULT_POLICY: AutomationPolicy = Object.fromEntries(PROPOSAL_KINDS.map((k) => [k, "suggest"])) as AutomationPolicy;

function clamp(kind: ProposalKind, mode: AutomationMode): AutomationMode {
    return RANK[mode] > RANK[CEILING[kind]] ? CEILING[kind] : mode;
}

/** Reads the stored JSON. Unknown keys and modes are ignored; every mode is capped by its ceiling. */
export function parsePolicy(raw: string | null | undefined): AutomationPolicy {
    const policy: AutomationPolicy = { ...DEFAULT_POLICY };
    if (!raw) return policy;
    try {
        const o = JSON.parse(raw) as Record<string, unknown>;
        for (const kind of PROPOSAL_KINDS) {
            const v = o[kind];
            if (v === "off" || v === "suggest" || v === "auto") policy[kind] = clamp(kind, v);
        }
    } catch {
        // unreadable: keep the conservative default
    }
    return policy;
}

export function serializePolicy(policy: AutomationPolicy): string {
    return JSON.stringify(Object.fromEntries(PROPOSAL_KINDS.map((k) => [k, clamp(k, policy[k])])));
}

export const KIND_LABELS: Record<ProposalKind, string> = {
    SET_DISPOSITION_PROVIDER: "Résultat des appels sans réponse",
    SET_DISPOSITION_AI: "Résultat déduit de la conversation",
    CREATE_TASK: "Tâches pour les engagements pris",
    PREPARE_EMAIL: "Brouillon d'email de suivi",
    RECORD_FACTS: "Informations de qualification",
    PROPOSE_MEETING: "Rendez-vous évoqué",
    PROPOSE_EXCLUSION: "Opposition au démarchage",
};
