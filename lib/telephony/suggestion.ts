// ============================================
// TELEPHONY — the result to propose when a call ends. Pure.
//
// The card under the call island shows it; the SDR confirms (it is saved as
// the call's qualification) or ignores it. Nothing is ever saved without
// that click.
//
//   not answered  Twilio's own outcome, instantly: no answer, busy, hung up
//                 after it rang → « Pas de réponse », with a factual note.
//   answered      the AI summary's suggested status (one of the mission's)
//                 and its summary as the note, plus the callback time if one
//                 was agreed.
//
// A booked meeting is never confirmed from here: it needs the booking form.
// ============================================

import type { SummaryState } from "./summary-shape";
import { isFinalStatus, type TelephonyStatus } from "./status";

export interface SuggestableStatus {
    code: string;
    label: string;
    color: string | null;
    requiresNote: boolean;
    triggersCallback: boolean;
}

export type CallSuggestion =
    | { state: "saved" }
    | { state: "waiting"; reason: string }
    | { state: "none"; reason: string }
    | {
          state: "ready";
          source: "twilio" | "ai";
          status: SuggestableStatus;
          note: string;
          /** Paris wall time "YYYY-MM-DDTHH:MM", or null. */
          callbackAt: string | null;
          /** False for a booked meeting: it is planned in the fiche, not confirmed here. */
          confirmable: boolean;
      };

export interface SuggestionInput {
    /** Inbound: the prospect called us. Missed, it is a call back to make, not an outcome to log. */
    direction?: "OUTBOUND" | "INBOUND";
    status: TelephonyStatus;
    answeredAt: Date | null;
    startedAt: Date;
    endedAt: Date | null;
    actionId: string | null;
    campaignId: string | null;
    summary: SummaryState;
    statuses: SuggestableStatus[];
}

/** The mission's « no answer » status (NRP). */
const NO_ANSWER_CODES = ["NO_RESPONSE"];
/** Below this, a call cancelled by the SDR is a misdial, not an unanswered call. */
const MIN_RING_SEC = 15;
const NOTE_MAX = 500;

function ringSeconds(input: SuggestionInput): number | null {
    if (!input.endedAt) return null;
    return Math.max(0, Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 1000));
}

export function suggestCallResult(input: SuggestionInput): CallSuggestion {
    if (input.actionId) return { state: "saved" };
    if (!isFinalStatus(input.status) && !input.endedAt) return { state: "waiting", reason: "Appel en cours" };
    if (!input.campaignId) return { state: "none", reason: "Appel sans campagne : qualifiez-le depuis la fiche" };

    const byCode = new Map(input.statuses.map((s) => [s.code, s]));

    if (input.direction === "INBOUND" && !input.answeredAt) {
        return { state: "none", reason: "Appel entrant manqué : rappelez le prospect" };
    }

    if (!input.answeredAt) {
        const nrp = NO_ANSWER_CODES.map((c) => byCode.get(c)).find(Boolean);
        if (!nrp) return { state: "none", reason: "Aucun statut « pas de réponse » sur cette mission" };
        const ring = ringSeconds(input);
        let note: string;
        switch (input.status) {
            case "BUSY":
                note = "Ligne occupée.";
                break;
            case "NO_ANSWER":
                note = ring ? `Pas de réponse après ${ring} s de sonnerie.` : "Pas de réponse.";
                break;
            case "CANCELED":
                if (ring === null || ring < MIN_RING_SEC) return { state: "none", reason: "Appel coupé avant de sonner" };
                note = `Pas de réponse, raccroché après ${ring} s de sonnerie.`;
                break;
            case "FAILED":
                return { state: "none", reason: "L'appel n'a pas abouti" };
            default:
                note = "Pas de réponse.";
        }
        return { state: "ready", source: "twilio", status: nrp, note, callbackAt: null, confirmable: true };
    }

    switch (input.summary.status) {
        case "none":
        case "pending":
            return { state: "waiting", reason: "Analyse de la conversation…" };
        case "skipped":
            return { state: "none", reason: input.summary.reason };
        case "failed":
            return { state: "none", reason: `Résumé indisponible : ${input.summary.reason}` };
        case "done": {
            const code = input.summary.data.suggestedStatus;
            const status = code ? byCode.get(code) : undefined;
            if (!status) return { state: "none", reason: "L'IA ne propose pas de résultat clair pour cet appel" };
            return {
                state: "ready",
                source: "ai",
                status,
                note: input.summary.data.summary.slice(0, NOTE_MAX),
                callbackAt: status.triggersCallback ? input.summary.data.callbackAt ?? null : null,
                confirmable: status.code !== "MEETING_BOOKED",
            };
        }
    }
}
