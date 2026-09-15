/**
 * ============================================================
 * NO-SHOW REPORTING WINDOW
 * ============================================================
 * A client / commercial can flag a meeting as "Contact absent" from their
 * portal only for a limited time after the meeting was supposed to happen.
 * Past that window the signal has to go through the manager space
 * (`/manager/rdv-absences`), which keeps late no-shows attributable instead of
 * letting them land silently weeks after the fact.
 *
 * Single source of truth for both the API guards and the portal UI, so the
 * button never offers something the server will refuse.
 */

/** Delay, in hours, during which a portal user can report a no-show themselves. */
export const NO_SHOW_REPORT_WINDOW_HOURS = 48;

export const NO_SHOW_REPORT_WINDOW_MS = NO_SHOW_REPORT_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * Whether the self-service no-show window is still open for a meeting.
 * A meeting with no date is always reportable — there is nothing to count from.
 */
export function isNoShowReportWindowOpen(
    meetingDate: Date | string | null | undefined,
    now: number = Date.now(),
): boolean {
    if (!meetingDate) return true;
    const ts = meetingDate instanceof Date ? meetingDate.getTime() : new Date(meetingDate).getTime();
    if (Number.isNaN(ts)) return true;
    return now - ts <= NO_SHOW_REPORT_WINDOW_MS;
}

/** Message shown (UI) or returned (API) when the window has closed. */
export const NO_SHOW_WINDOW_CLOSED_MESSAGE =
    `Ce rendez-vous a eu lieu il y a plus de ${NO_SHOW_REPORT_WINDOW_HOURS}h, ce signalement n'est plus possible depuis le portail. Contactez votre manager.`;
