/**
 * Pure logic behind the history shown on a RDV in the SDR "Mes RDV" drawer.
 *
 * A RDV that did not hold can be replaced in two ways, and both must read as
 * ONE RDV with a trace, not as two rows:
 *  - the same Action is moved to a new date (absence archived in
 *    MeetingFeedbackHistory — see feedbackHistory.ts);
 *  - a brand-new Action is booked and the old one is closed as cancelled with
 *    the "replaced" reason. That old row is hidden from the list and folded
 *    into the new RDV's history (booking note, absence, client comment).
 */

export interface RdvHistoryEntry {
    id: string;
    kind: "rescheduled" | "replaced";
    /** The slot that was missed. */
    rdvDate: string | null;
    /** Note written when the old RDV was booked ("replaced" entries only). */
    bookingNote: string | null;
    /** What the client wrote when reporting the absence. */
    clientNote: string | null;
    /** When the absence was reported. */
    reportedAt: string | null;
    /** When the RDV was replaced. */
    replacedAt: string | null;
    /** The slot it was moved / re-booked to. */
    newDate: string | null;
}

export interface ChainRow {
    id: string;
    contactId: string | null;
    result: string;
    createdAt: Date;
    cancellationReason: string | null;
    callbackDate: Date | null;
    note: string | null;
    confirmationUpdatedAt: Date | null;
    meetingFeedback?: { outcome: string; clientNote: string | null; createdAt: Date } | null;
}

/** A live booking that may have taken the place of a replaced RDV (any SDR). */
export interface Successor {
    id: string;
    contactId: string | null;
    createdAt: Date;
    callbackDate: Date | null;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Splits the list into the rows to display and the history folded into each
 * surviving RDV. A replaced RDV with no live successor stays visible: hiding
 * it would make the booking disappear altogether.
 */
export function foldReplacedRdvs<M extends ChainRow>(
    meetings: M[],
    successors: Successor[]
): { visible: M[]; historyByHead: Map<string, RdvHistoryEntry[]> } {
    const byContact = new Map<string, Successor[]>();
    for (const s of successors) {
        if (!s.contactId) continue;
        const list = byContact.get(s.contactId) ?? [];
        list.push(s);
        byContact.set(s.contactId, list);
    }

    const historyByHead = new Map<string, RdvHistoryEntry[]>();
    const visible: M[] = [];

    for (const m of meetings) {
        const isReplaced = m.result === "MEETING_CANCELLED" && m.cancellationReason === "replaced";
        const head = isReplaced && m.contactId
            ? (byContact.get(m.contactId) ?? [])
                .filter((s) => s.id !== m.id && s.createdAt.getTime() > m.createdAt.getTime())
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
            : undefined;

        if (!head) {
            visible.push(m);
            continue;
        }

        const fb = m.meetingFeedback;
        const entry: RdvHistoryEntry = {
            id: m.id,
            kind: "replaced",
            rdvDate: iso(m.callbackDate),
            bookingNote: m.note?.trim() || null,
            clientNote: fb?.clientNote?.trim() || null,
            reportedAt: fb ? iso(fb.createdAt) : null,
            replacedAt: iso(m.confirmationUpdatedAt ?? head.createdAt),
            newDate: iso(head.callbackDate),
        };
        const list = historyByHead.get(head.id) ?? [];
        list.push(entry);
        historyByHead.set(head.id, list);
    }

    return { visible, historyByHead };
}

/** Oldest first, so the drawer reads like a timeline. */
export function sortHistory(entries: RdvHistoryEntry[]): RdvHistoryEntry[] {
    const key = (e: RdvHistoryEntry) => new Date(e.rdvDate ?? e.reportedAt ?? e.replacedAt ?? 0).getTime();
    return entries.slice().sort((a, b) => key(a) - key(b));
}

/**
 * An absence still attached to a RDV whose date is in the future and later than
 * the absence itself: the RDV was moved before absences were archived on
 * reschedule (or the archive was unavailable). It is NOT absent any more — it is
 * an upcoming RDV carrying an old absence. A real no-show can only be reported
 * once the date has passed, so this can never hide a genuine absence.
 */
export function isStaleNoShow(
    fb: { outcome: string; createdAt: Date } | null | undefined,
    callbackDate: Date | null | undefined,
    now: Date = new Date()
): boolean {
    if (!fb || fb.outcome !== "NO_SHOW" || !callbackDate) return false;
    return callbackDate.getTime() > now.getTime() && callbackDate.getTime() > fb.createdAt.getTime();
}

/** The trace of a stale absence, in the same shape as an archived one. */
export function staleAbsenceEntry(m: {
    id: string;
    callbackDate: Date | null;
    meetingFeedback?: { clientNote: string | null; createdAt: Date } | null;
}): RdvHistoryEntry {
    return {
        id: `stale-${m.id}`,
        kind: "rescheduled",
        rdvDate: null,
        bookingNote: null,
        clientNote: m.meetingFeedback?.clientNote?.trim() || null,
        reportedAt: iso(m.meetingFeedback?.createdAt),
        replacedAt: null,
        newDate: iso(m.callbackDate),
    };
}
