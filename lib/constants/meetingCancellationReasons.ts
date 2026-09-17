/**
 * Predefined reasons for cancelling a meeting (RDV).
 * Used when SDR cancels a MEETING_BOOKED action (e.g. by mistake).
 */

export const MEETING_CANCELLATION_REASONS = [
    { code: "by_mistake", label: "Créé par erreur" },
    { code: "wrong_contact", label: "Mauvais contact" },
    { code: "client_cancelled", label: "Le client a annulé" },
    { code: "double_booking", label: "Double réservation" },
    // The RDV did not hold and a new one was booked in its place. Closing the
    // old one this way is what takes it off the no-show boards.
    { code: "replaced", label: "RDV replacé" },
    { code: "other", label: "Autre" },
] as const;

export type MeetingCancellationReasonCode = (typeof MEETING_CANCELLATION_REASONS)[number]["code"];

export const MEETING_CANCELLATION_REASON_CODES: MeetingCancellationReasonCode[] =
    MEETING_CANCELLATION_REASONS.map((r) => r.code);

export function getMeetingCancellationLabel(code: string | null | undefined): string {
    if (!code) return "";
    const found = MEETING_CANCELLATION_REASONS.find((r) => r.code === code);
    return found ? found.label : code;
}
