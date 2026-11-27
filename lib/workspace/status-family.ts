// ============================================
// STATUS FAMILIES — how loud a call or action status is, everywhere it shows
// (journal rows, the Appels control center, the status bar).
//
// Colour signals a state someone has to act on. Red is not « no »: a refusal
// is a normal outcome and stays quiet, so the real alarms (a missed inbound
// call, a call nobody qualified) are the only red in a page.
//
//   positive   RDV, interest, a project to follow   tinted green
//   pending    a callback, an email to send          tinted amber
//   negative   refusal, disqualified, wrong contact  plain, ink-2
//   noreach    no answer, gatekeeper, sent           plain, ink-3
//   alert      set by the row, not by a status       tinted red
//
// A status's family comes from its reporting category (Paramètres →
// Téléphonie → Statuts), then from the built-in code, then « negative ».
// ============================================

export type StatusFamily = "positive" | "pending" | "negative" | "noreach" | "alert";

const BY_CATEGORY: Record<string, StatusFamily> = {
    RDV_PRIS: "positive",
    INTERESSE: "positive",
    PROJET_A_SUIVRE: "positive",
    RAPPEL: "pending",
    EMAIL: "pending",
    REFUS: "negative",
    DISQUALIFIE: "negative",
    ANNULATION: "negative",
    PAS_DE_REPONSE: "noreach",
    BARRAGE: "noreach",
    LINKEDIN: "noreach",
};

const BY_CODE: Record<string, StatusFamily> = {
    MEETING_BOOKED: "positive",
    INTERESTED: "positive",
    REPLIED: "positive",
    CALLBACK_REQUESTED: "pending",
    RAPPEL: "pending",
    ENVOIE_MAIL: "pending",
    MAIL_DOC: "pending",
    PROJET_A_SUIVRE: "positive",
    NOT_INTERESTED: "negative",
    DISQUALIFIED: "negative",
    BAD_CONTACT: "negative",
    MEETING_CANCELLED: "negative",
    NO_RESPONSE: "noreach",
    // Nobody to talk to: a gatekeeper or a dead number is not a conversation.
    BARRAGE_STANDARD: "noreach",
    BARRAGE_SECRETAIRE: "noreach",
    NUMERO_KO: "noreach",
    FAUX_NUMERO: "noreach",
    MAIL_ENVOYE: "noreach",
    CONNECTION_SENT: "noreach",
    MESSAGE_SENT: "noreach",
};

export function statusFamily(code: string, category?: string | null): StatusFamily {
    return (category ? BY_CATEGORY[category] : undefined) ?? BY_CODE[code] ?? "negative";
}

/** The prospect picked up (anything but « no answer »): the base of a reach rate. */
export function isReached(code: string, category?: string | null): boolean {
    return statusFamily(code, category) !== "noreach";
}

/** Fallback dot colour when a status has none configured. */
export const FAMILY_DOT: Record<StatusFamily, string> = {
    positive: "var(--ds-success)",
    pending: "var(--ds-warning)",
    negative: "var(--brand-neutral-400)",
    noreach: "var(--brand-neutral-300)",
    alert: "var(--ds-danger)",
};
