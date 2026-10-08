import { prisma } from "@/lib/prisma";

/**
 * A RDV flagged absent (NO_SHOW) that is moved to a new future date is a fresh
 * RDV again: it must come back under "À venir" without the old absence status
 * or the client's old comment. The absence is not erased though — it is
 * archived in MeetingFeedbackHistory (what the client wrote, when the absence
 * was reported, which slot was missed, when the RDV was replaced).
 *
 * Fail-open: if the history table does not exist yet (migration unapplied) the
 * archive insert throws, nothing is deleted and the reschedule itself still
 * goes through — the RDV just keeps its "absent" status as before.
 */
export async function resetAbsenceOnReschedule(opts: {
    actionId: string;
    previousCallbackDate: Date | null;
    newCallbackDate: Date | null | undefined;
    replacedById?: string | null;
    now?: Date;
}): Promise<boolean> {
    const { actionId, previousCallbackDate, newCallbackDate } = opts;
    const now = opts.now ?? new Date();
    if (!newCallbackDate || newCallbackDate.getTime() <= now.getTime()) return false;
    if (previousCallbackDate && previousCallbackDate.getTime() === newCallbackDate.getTime()) return false;

    try {
        const feedback = await prisma.meetingFeedback.findUnique({ where: { actionId } });
        if (!feedback || feedback.outcome !== "NO_SHOW") return false;

        await prisma.$transaction([
            prisma.meetingFeedbackHistory.create({
                data: {
                    actionId,
                    outcome: feedback.outcome,
                    recontactRequested: feedback.recontactRequested,
                    clientNote: feedback.clientNote,
                    source: feedback.source,
                    reportedAt: feedback.createdAt,
                    previousCallbackDate,
                    newCallbackDate,
                    replacedAt: now,
                    replacedById: opts.replacedById ?? null,
                },
            }),
            prisma.meetingFeedback.delete({ where: { actionId } }),
        ]);
        return true;
    } catch (err) {
        console.warn(`[feedbackHistory] absence of ${actionId} not archived, left as is:`, err);
        return false;
    }
}

export interface AbsenceHistoryEntry {
    id: string;
    actionId: string;
    outcome: string;
    clientNote: string | null;
    reportedAt: Date;
    previousCallbackDate: Date | null;
    newCallbackDate: Date;
    replacedAt: Date;
}

/** Past absences of the given RDVs, newest first, keyed by action id. Empty when the table is missing. */
export async function loadAbsenceHistory(actionIds: string[]): Promise<Map<string, AbsenceHistoryEntry[]>> {
    const out = new Map<string, AbsenceHistoryEntry[]>();
    if (actionIds.length === 0) return out;
    try {
        const rows = await prisma.meetingFeedbackHistory.findMany({
            where: { actionId: { in: actionIds } },
            orderBy: { replacedAt: "desc" },
            select: {
                id: true,
                actionId: true,
                outcome: true,
                clientNote: true,
                reportedAt: true,
                previousCallbackDate: true,
                newCallbackDate: true,
                replacedAt: true,
            },
        });
        for (const r of rows) {
            const list = out.get(r.actionId) ?? [];
            list.push(r);
            out.set(r.actionId, list);
        }
    } catch (err) {
        console.warn("[feedbackHistory] history unavailable (migration unapplied?):", err);
    }
    return out;
}
