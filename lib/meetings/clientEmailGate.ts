/**
 * ============================================================
 * CLIENT EMAIL GATE — no automatic mail before confirmation
 * ============================================================
 * A RDV is created PENDING and only becomes CONFIRMED once someone has
 * validated it (manager action in /manager/rdv, or the 24h auto-confirm).
 * Until then the client must not receive any automatic email about it: a
 * booking that is still being checked, or that gets corrected or dropped an
 * hour later, would have already landed in their inbox.
 *
 * This gate covers the *emails* only. In-app portal notifications are
 * deliberately left alone — they live inside the CRM, where an unconfirmed
 * RDV is visible as such, and they are what the teams work from.
 *
 * Single source of truth for every send site (booking, manager update,
 * reschedule), so the rule cannot drift between them.
 */

import type { MeetingConfirmationStatus } from "@prisma/client";

type ConfirmationStatusLike = MeetingConfirmationStatus | string | null | undefined;

/**
 * Whether an automatic client email may go out for this RDV.
 * Anything other than CONFIRMED — PENDING, CANCELLED, or missing — stays silent.
 */
export function canEmailClientAboutMeeting(status: ConfirmationStatusLike): boolean {
    return status === "CONFIRMED";
}

/** Log line used when a send is skipped, so a missing email is explainable. */
export function meetingEmailSkippedReason(actionId: string, status: ConfirmationStatusLike): string {
    return `[clientEmailGate] RDV ${actionId}: mail client non envoyé, RDV non confirmé (${status ?? "inconnu"}).`;
}
