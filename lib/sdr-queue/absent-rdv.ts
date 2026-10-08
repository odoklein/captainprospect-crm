import { prisma } from "@/lib/prisma";

/**
 * Absent RDVs to call back, shared by the SDR table queue (/api/sdr/action-queue)
 * and the card view (/api/actions/next): they go first, labelled ABSENT_RDV.
 *
 * A row qualifies when its last action is still the booked RDV and that RDV was
 * flagged absent with a recontact asked for (YES or MAYBE) and not set aside by
 * a manager (stand by / hors scope). Whoever works the mission gets it, not only
 * the SDR who booked it: the booker is often no longer planned on that mission,
 * and the absence then sat in nobody's queue. "Ne pas recontacter" absences stay
 * out, and so do those of a mission that has since been stopped. Once anything is logged on the row, its last action is no longer the
 * booking and the usual priority/cooldown rules take over.
 */
export async function findAbsentRdvRecalls(
    rows: Array<{ contact_id: string | null; company_id: string; last_action_result: string | null }>
): Promise<{ contactIds: Set<string>; companyIds: Set<string> }> {
    const bookedContactIds = rows
        .filter((r) => r.last_action_result === "MEETING_BOOKED" && r.contact_id)
        .map((r) => r.contact_id!);
    const bookedCompanyIds = rows
        .filter((r) => r.last_action_result === "MEETING_BOOKED" && !r.contact_id)
        .map((r) => r.company_id);

    if (bookedContactIds.length === 0 && bookedCompanyIds.length === 0) {
        return { contactIds: new Set(), companyIds: new Set() };
    }

    const absentActions = await prisma.action.findMany({
        where: {
            result: "MEETING_BOOKED",
            // A stopped mission (paused, completed, archived) takes its absences
            // out of the call queue with it.
            campaign: { is: { mission: { is: { isActive: true } } } },
            meetingFeedback: {
                outcome: "NO_SHOW",
                recontactRequested: { in: ["YES", "MAYBE"] },
                standByAt: null,
                outOfScopeAt: null,
            },
            OR: [
                ...(bookedContactIds.length > 0 ? [{ contactId: { in: bookedContactIds } }] : []),
                ...(bookedCompanyIds.length > 0 ? [{ companyId: { in: bookedCompanyIds }, contactId: null }] : []),
            ],
        },
        select: { contactId: true, companyId: true },
    });

    return {
        contactIds: new Set(absentActions.filter((a) => a.contactId).map((a) => a.contactId!)),
        companyIds: new Set(absentActions.filter((a) => !a.contactId && a.companyId).map((a) => a.companyId!)),
    };
}
