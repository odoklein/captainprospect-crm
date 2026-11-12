// ============================================
// QUALIFICATION ENGINE — shared types. Pure: no I/O, safe on the client.
//
// Four concepts are kept apart on purpose, each read from its own source:
//   qualification  where the prospect stands for us        (Action history + AI signals)
//   scheduling     when we owe the next touch              (Action.callbackDate)
//   operational    what happened on the line               (TelephonyCall — dialer, not here)
//   pipeline       what the sale looks like                (MEETING_BOOKED / Opportunity)
// The view below is derived at read time from those sources, so it can never
// drift from them. Nothing here is written to the database.
// ============================================

export const QUALIFICATION_STATES = [
    "A_QUALIFIER",
    "PRIORITAIRE",
    "PRET_A_APPELER",
    "EN_COURS",
    "A_RELANCER",
    "QUALIFIE",
    "RDV_PRIS",
    "NON_PERTINENT",
] as const;

export type QualificationState = (typeof QUALIFICATION_STATES)[number];

export const QUALIFICATION_STATE_LABELS: Record<QualificationState, string> = {
    A_QUALIFIER: "À qualifier",
    PRIORITAIRE: "Prioritaire",
    PRET_A_APPELER: "Prêt à appeler",
    EN_COURS: "En cours",
    A_RELANCER: "À relancer",
    QUALIFIE: "Qualifié",
    RDV_PRIS: "RDV pris",
    NON_PERTINENT: "Non pertinent",
};

/** Queue priority as the queue routes already compute it (status config + absent-RDV recall). */
export type QueuePriority = "CALLBACK" | "FOLLOW_UP" | "NEW" | "RETRY" | "SKIP" | "ABSENT_RDV";

export type TitleLevel = "decision" | "influencer" | "gatekeeper" | "unknown";

/**
 * What a previous call taught us, already validated (lib/qualification/signals).
 * Every field is « as heard »: null means nobody said it, never « no ».
 */
export interface AiSignals {
    callId: string;
    /** ISO instant of the call. */
    at: string;
    interest: "high" | "medium" | "low" | null;
    /** confirmed: the person on the line decides · other_person: someone else does · null: not discussed */
    decisionMaker: "confirmed" | "other_person" | null;
    need: string | null;
    timing: string | null;
    budget: string | null;
    objections: string[];
    /** The prospect asked not to be contacted again. Only ever PROPOSES an exclusion. */
    optOut: boolean;
    /** 0..1 as reported by the model; null for summaries written before confidence existed. */
    confidence: number | null;
    /** Short quotes from the transcript backing the signals above. */
    evidence: string[];
}

export interface ProspectInput {
    contact: { title: string | null; completeness: "ACTIONABLE" | "PARTIAL" | "INCOMPLETE" | string } | null;
    company: { industry: string | null; size: string | null; country: string | null };
    /** A dialable number exists (contact, additional or company line). */
    hasPhone: boolean;
    /** The number is a French 06/07 line. */
    mobile: boolean;
    priority: QueuePriority;
    lastAction: {
        result: string;
        createdAt: string;
        callbackDate: string | null;
        /** Label of the result in the mission's status config, for « En pause (…) ». */
        label?: string | null;
        /** The status config proposes an exclusion for this result. */
        triggersExclusion?: boolean;
    } | null;
    attempts: { total: number; consecutiveNoAnswer: number };
    ai: AiSignals | null;
}

export interface Targeting {
    industries: string[];
    countries: string[];
    sizeBuckets: string[];
}

export interface ScoringContext {
    now: Date;
    /** Structured criteria defined by a manager; null = « Ciblage non défini ». */
    targeting: Targeting | null;
    /** Organisation cap on attempts; null = no cap. */
    maxAttempts?: number | null;
}

export interface Reason {
    code: string;
    label: string;
    /** Contribution to the score; 0 for facts shown without weight. */
    points: number;
    /** Where the fact comes from. AI facts always carry their evidence. */
    source: "crm" | "sdr" | "ai" | "targeting";
    evidence?: string;
}

export interface KnownFact {
    label: string;
    value: string;
    source: "sdr" | "ai";
    /** True when a human confirmed it; AI facts stay unverified until then. */
    verified: boolean;
    evidence?: string;
}

export interface QualificationView {
    state: QualificationState;
    stateLabel: string;
    /** 0..100. */
    score: number;
    tier: "haute" | "normale" | "basse";
    /** « Priorité haute · Rappel demandé hier » */
    headline: string;
    reasons: Reason[];
    /** A number exists and the row is not dead or parked: the SDR may call it. */
    callable: boolean;
    /** Safe for the parallel dialer to pick without a human choosing it. */
    dialEligible: boolean;
    blockers: string[];
    /** What we do not know and an SDR should find out. Never silently filled in. */
    unverified: string[];
    known: KnownFact[];
    scheduling: { kind: "none" | "due" | "later"; at: string | null };
    /** The data suggests an exclusion; applying it always needs a human confirmation. */
    proposeExclusion: boolean;
}
