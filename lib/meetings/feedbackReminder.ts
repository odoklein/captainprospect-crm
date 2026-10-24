/**
 * ============================================================
 * MANDATORY CLIENT FEEDBACK — REMINDER RULES
 * ============================================================
 * A confirmed RDV that took place and has no « Mon avis » yet is owed a
 * feedback by the client. The reminder is loud while the no-show window is
 * still open: a no-show not reported within 48 h counts as honoured, and so
 * is billed. Past the window the meeting stays in the list (feedback is still
 * useful) but no longer triggers the modal.
 *
 * Pure: shared by GET /api/portal/meetings/feedback-pending and the portal UI.
 */

import { NO_SHOW_REPORT_WINDOW_MS, isNoShowReportWindowOpen } from "./noShowWindow";

/** How far back a meeting without feedback is still chased. */
export const REMINDER_LOOKBACK_DAYS = 14;

/** A meeting is owed a feedback this long after it starts (it has to be over). */
export const DUE_AFTER_START_MIN = 60;

const HOUR_MS = 60 * 60 * 1000;

/** Meeting-date bounds of the pending query: [now − 14 d, now − 60 min]. */
export function reminderDateRange(now: number = Date.now()): { from: Date; to: Date } {
    return {
        from: new Date(now - REMINDER_LOOKBACK_DAYS * 24 * HOUR_MS),
        to: new Date(now - DUE_AFTER_START_MIN * 60 * 1000),
    };
}

export interface ReminderTiming {
    /** Meeting date + 48 h: last moment a no-show can be reported from the portal. */
    noShowDeadline: Date;
    /** Whole hours left before the deadline, rounded down; negative once it has passed. */
    hoursLeft: number;
    windowOpen: boolean;
    /** Window still open: the meeting triggers the modal, not only the banner. */
    urgent: boolean;
}

export function toReminderItem(
    meeting: { callbackDate: Date | string },
    now: number = Date.now(),
): ReminderTiming {
    const start = new Date(meeting.callbackDate).getTime();
    const deadline = start + NO_SHOW_REPORT_WINDOW_MS;
    const windowOpen = isNoShowReportWindowOpen(meeting.callbackDate, now);
    return {
        noShowDeadline: new Date(deadline),
        hoursLeft: Math.floor((deadline - now) / HOUR_MS),
        windowOpen,
        urgent: windowOpen,
    };
}

/** Countdown chip text for a pending meeting. */
export function formatNoShowCountdown(hoursLeft: number): string {
    if (hoursLeft < 0) return "Délai de signalement d'absence dépassé";
    if (hoursLeft < 1) return "Absence signalable moins d'1 h";
    return `Absence signalable encore ${hoursLeft} h`;
}

/**
 * Most urgent first: open windows by nearest deadline, then closed ones from
 * the most recent meeting back.
 */
export function compareReminderItems(
    a: { windowOpen: boolean; noShowDeadline: Date | string },
    b: { windowOpen: boolean; noShowDeadline: Date | string },
): number {
    if (a.windowOpen !== b.windowOpen) return a.windowOpen ? -1 : 1;
    const da = new Date(a.noShowDeadline).getTime();
    const db = new Date(b.noShowDeadline).getTime();
    return a.windowOpen ? da - db : db - da;
}
