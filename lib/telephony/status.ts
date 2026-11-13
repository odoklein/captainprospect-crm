// ============================================
// TELEPHONY — Twilio call status → TelephonyCallStatus. Pure.
//
// Twilio sends several callbacks per call (the PSTN leg's progress, then the
// <Dial> result) and does not guarantee their order. Final statuses never move
// back to a live one, and a live status only moves forward.
// ============================================

export const TELEPHONY_STATUSES = [
    "INITIATED",
    "RINGING",
    "IN_PROGRESS",
    "COMPLETED",
    "BUSY",
    "NO_ANSWER",
    "FAILED",
    "CANCELED",
] as const;

export type TelephonyStatus = (typeof TELEPHONY_STATUSES)[number];

const FINAL = new Set<TelephonyStatus>(["COMPLETED", "BUSY", "NO_ANSWER", "FAILED", "CANCELED"]);
const LIVE_RANK: Record<string, number> = { INITIATED: 0, RINGING: 1, IN_PROGRESS: 2 };

export function isFinalStatus(status: TelephonyStatus): boolean {
    return FINAL.has(status);
}

/**
 * Maps Twilio's CallStatus (leg status callback) or DialCallStatus (<Dial action>).
 * Returns null for anything unknown.
 */
export function mapTwilioStatus(raw: string | null | undefined): TelephonyStatus | null {
    switch ((raw ?? "").trim().toLowerCase()) {
        case "queued":
        case "initiated":
            return "INITIATED";
        case "ringing":
            return "RINGING";
        case "in-progress":
        case "answered":
            return "IN_PROGRESS";
        case "completed":
            return "COMPLETED";
        case "busy":
            return "BUSY";
        case "no-answer":
            return "NO_ANSWER";
        case "failed":
            return "FAILED";
        case "canceled":
            return "CANCELED";
        default:
            return null;
    }
}

/** The status to store when `next` arrives while the row holds `current`. */
export function nextStatus(current: TelephonyStatus, next: TelephonyStatus): TelephonyStatus {
    if (isFinalStatus(current)) {
        // A late "completed" may still correct a CANCELED written by the <Dial> action
        // when the leg was in fact answered; every other final status is kept.
        return current === "CANCELED" && next === "COMPLETED" ? next : current;
    }
    if (isFinalStatus(next)) return next;
    return (LIVE_RANK[next] ?? 0) > (LIVE_RANK[current] ?? 0) ? next : current;
}

/** French label for the call bar and history. */
export const TELEPHONY_STATUS_LABELS: Record<TelephonyStatus, string> = {
    INITIATED: "Connexion…",
    RINGING: "Sonnerie…",
    IN_PROGRESS: "En ligne",
    COMPLETED: "Appel terminé",
    BUSY: "Occupé",
    NO_ANSWER: "Pas de réponse",
    FAILED: "Échec de l'appel",
    CANCELED: "Appel annulé",
};

export function parseSeconds(raw: string | null | undefined): number | null {
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
