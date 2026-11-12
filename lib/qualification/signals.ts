// Turns a stored call summary into the signals the qualification engine may use. Pure.

import type { CallAiSummary } from "@/lib/telephony/summary-shape";
import type { AiSignals } from "./types";

/** Below this the signals are shown as « à vérifier » and never move a score. */
export const MIN_SIGNAL_CONFIDENCE = 0.6;

export function signalsFromSummary(callId: string, at: Date | string, summary: CallAiSummary): AiSignals {
    const evidence = (summary.evidence ?? []).filter((e) => typeof e === "string" && e.trim()).map((e) => e.trim().slice(0, 240)).slice(0, 4);
    const confidence = typeof summary.confidence === "number" && summary.confidence >= 0 && summary.confidence <= 1 ? summary.confidence : null;

    // Older summaries only hold a free-text decision-maker: it is a fact « as heard », not a confirmation.
    const decisionMaker = summary.decisionMakerStatus === "confirmed" || summary.decisionMakerStatus === "other_person" ? summary.decisionMakerStatus : null;

    return {
        callId,
        at: typeof at === "string" ? at : at.toISOString(),
        interest: summary.interest === "high" || summary.interest === "medium" || summary.interest === "low" ? summary.interest : null,
        decisionMaker,
        need: summary.qualification.need,
        timing: summary.qualification.timing,
        budget: summary.qualification.budget,
        objections: summary.objections,
        optOut: summary.optOut === true,
        confidence,
        evidence,
    };
}

/** True when the signals are backed well enough to weigh on a score. */
export function isTrustworthy(ai: AiSignals | null): boolean {
    return Boolean(ai && ai.evidence.length > 0 && ai.confidence !== null && ai.confidence >= MIN_SIGNAL_CONFIDENCE);
}
