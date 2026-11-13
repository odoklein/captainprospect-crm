// Shape of a call's AI summary. Pure (no Prisma, no AI client): safe to
// import from client components. The engine lives in ./summary.

export interface Qualification {
    need: string | null;
    currentSolution: string | null;
    timing: string | null;
    decisionMaker: string | null;
    budget: string | null;
}

export const QUALIFICATION_LABELS: Record<keyof Qualification, string> = {
    need: "Besoin",
    currentSolution: "Solution actuelle",
    timing: "Échéance",
    decisionMaker: "Décideur",
    budget: "Budget",
};

export interface CallAiSummary {
    summary: string;
    keyPoints: string[];
    objections: string[];
    nextSteps: string[];
    /** What the call revealed, field by field; null = not discussed. */
    qualification: Qualification;
    /** One of the mission's status codes the AI would log, or null. A suggestion: the SDR decides. */
    suggestedStatus: string | null;
    /** Callback agreed during the call, Paris wall time "YYYY-MM-DDTHH:MM"; null when none was. */
    callbackAt?: string | null;

    // ── Structured post-call intelligence (all optional: summaries stored before it exist keep parsing) ──
    /** Interest the prospect showed, judged from what was said; null = cannot tell. */
    interest?: "high" | "medium" | "low" | null;
    /** The person on the line is the decision-maker / someone else decides; null = not discussed. */
    decisionMakerStatus?: "confirmed" | "other_person" | null;
    /** Role the prospect stated for themselves, only when said aloud. */
    statedRole?: string | null;
    /** The prospect asked not to be called again. */
    optOut?: boolean;
    /** Something either party committed to (« je vous envoie la plaquette »). */
    promises?: { by: "sdr" | "prospect"; what: string }[];
    /** A meeting was agreed during the call; datetime in Paris wall time, only when both a day and an hour were said. */
    meeting?: { at: string | null; mentioned: boolean } | null;
    /** The model's confidence in the structured fields above, 0..1. */
    confidence?: number | null;
    /** Short verbatim quotes from the transcript that back the structured fields. */
    evidence?: string[];
}

export type SummaryState =
    | { status: "none" }
    | { status: "pending" }
    | { status: "done"; data: CallAiSummary; at: string | null }
    | { status: "skipped"; reason: string }
    | { status: "failed"; reason: string };
