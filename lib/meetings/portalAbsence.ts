import { prisma } from "@/lib/prisma";
import { clientCountableMeetingWhere } from "@/lib/meetings/clientVisibility";
import { loadAbsenceHistory } from "@/lib/meetings/feedbackHistory";
import {
    foldReplacedRdvs,
    isStaleNoShow,
    sortHistory,
    staleAbsenceEntry,
    type ChainRow,
    type RdvHistoryEntry,
} from "@/lib/meetings/rdvHistory";

/** An absence as the client / commercial portals show it. */
export interface PortalAbsenceEntry {
    id: string;
    clientNote: string | null;
    reportedAt: string | null;
    previousCallbackDate: string | null;
    newCallbackDate: string | null;
    replacedAt: string | null;
}

const toPortal = (e: RdvHistoryEntry): PortalAbsenceEntry => ({
    id: e.id,
    clientNote: e.clientNote,
    reportedAt: e.reportedAt,
    previousCallbackDate: e.rdvDate,
    newCallbackDate: e.newDate,
    replacedAt: e.replacedAt,
});

/**
 * One RDV = one row in the client and commercial portals, whatever happened to it.
 *
 *  1. An absence that is still attached to a RDV that was since moved to a future
 *     date is lifted off it (so it reads "À venir", not "Absent") and kept as a
 *     history entry.
 *  2. A RDV closed as "replaced" whose replacement is confirmed is hidden — the
 *     new RDV carries its trace. Until the replacement is confirmed at the SAS
 *     the old row stays, so nothing vanishes from the portal.
 *  3. Absences archived when a RDV was moved in place are attached too.
 *
 * Rows must already be limited to what the portal may see.
 */
export async function foldPortalAbsences<M extends ChainRow & { meetingFeedback?: ChainRow["meetingFeedback"] }>(
    meetings: M[],
    now: Date = new Date()
): Promise<Array<Omit<M, "meetingFeedback"> & { meetingFeedback: M["meetingFeedback"] | null; absenceHistory: PortalAbsenceEntry[] }>> {
    const replacedContactIds = [
        ...new Set(
            meetings
                .filter((m) => m.cancellationReason === "replaced" && m.contactId)
                .map((m) => m.contactId as string)
        ),
    ];
    const successors = replacedContactIds.length > 0
        ? await prisma.action.findMany({
            where: { contactId: { in: replacedContactIds }, ...clientCountableMeetingWhere },
            select: { id: true, contactId: true, createdAt: true, callbackDate: true },
        })
        : [];

    const { visible, historyByHead } = foldReplacedRdvs(meetings, successors);
    const archived = await loadAbsenceHistory(visible.map((m) => m.id));

    return visible.map((m) => {
        const stale = isStaleNoShow(m.meetingFeedback, m.callbackDate, now);
        const entries: RdvHistoryEntry[] = [
            ...(historyByHead.get(m.id) ?? []),
            ...(archived.get(m.id) ?? []).map((h): RdvHistoryEntry => ({
                id: h.id,
                kind: "rescheduled",
                rdvDate: h.previousCallbackDate?.toISOString() ?? null,
                bookingNote: null,
                clientNote: h.clientNote,
                reportedAt: h.reportedAt.toISOString(),
                replacedAt: h.replacedAt.toISOString(),
                newDate: h.newCallbackDate.toISOString(),
            })),
            ...(stale ? [staleAbsenceEntry(m)] : []),
        ];
        return {
            ...m,
            meetingFeedback: stale ? null : (m.meetingFeedback ?? null),
            absenceHistory: sortHistory(entries).map(toPortal),
        };
    });
}
