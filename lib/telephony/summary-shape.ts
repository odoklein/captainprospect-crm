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
}

export type SummaryState =
    | { status: "none" }
    | { status: "pending" }
    | { status: "done"; data: CallAiSummary; at: string | null }
    | { status: "skipped"; reason: string }
    | { status: "failed"; reason: string };
