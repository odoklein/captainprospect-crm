import { prisma } from "@/lib/prisma";
import { resetAbsenceOnReschedule } from "@/lib/meetings/feedbackHistory";
import { createClientPortalNotification, sendRdvRescheduledEmailNotification } from "@/lib/notifications";

/**
 * An absent RDV that the SDR books again is the SAME RDV, not a second one.
 *
 * Booking a prospect whose last RDV on this mission was reported absent does
 * not create a new Action: the absent one is updated with the new slot. So
 *  - no duplicate in the SAS (/manager/rdv) nor in "Mes RDV" (SDR, client,
 *    commercial): the row leaves "Absents" and comes back under "À venir";
 *  - no new SAS validation: the RDV was already confirmed once, it stays (or
 *    becomes) CONFIRMED;
 *  - the client's feedback is reset (the absence is archived in
 *    MeetingFeedbackHistory by resetAbsenceOnReschedule), so a second absence
 *    sends it back to "Absences à traiter" like the first one;
 *  - nothing is lost: the archived absence keeps the missed slot, the client's
 *    comment and the dates, and the first booking note stays in the note under
 *    the new one.
 *
 * Only a future slot qualifies — a past date is an import or a correction, and
 * goes through the normal creation path.
 */

export interface AbsentRebookInput {
    contactId?: string | null;
    companyId?: string | null;
    campaignId: string;
    newCallbackDate: Date | null | undefined;
    note?: string | null;
    meetingType?: string | null;
    meetingCategory?: string | null;
    meetingAddress?: string | null;
    meetingJoinUrl?: string | null;
    meetingPhone?: string | null;
    interlocuteurId?: string | null;
    /** Who re-booked it (kept on the archived absence). */
    actorId: string;
    now?: Date;
}

export interface AbsentRebookResult {
    actionId: string;
    previousCallbackDate: Date | null;
}

const frDate = (d: Date) =>
    d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });

/**
 * The new booking note goes first; the first one is kept under it, so the
 * history of what was said on the first call stays readable on the RDV.
 */
export function mergeRebookNote(previous: string | null | undefined, next: string | null | undefined, missedAt: Date | null): string | null {
    const prev = previous?.trim() || "";
    const fresh = next?.trim() || "";
    if (!fresh || fresh === prev) return prev || null;
    if (!prev) return fresh;
    const label = missedAt ? `Note du RDV précédent (absent le ${frDate(missedAt)})` : "Note du RDV précédent";
    return `${fresh}\n\n— ${label} —\n${prev}`;
}

/** The open absence this booking replaces: same prospect, same mission, latest slot first. */
async function findAbsentToRebook(input: AbsentRebookInput) {
    if (!input.contactId && !input.companyId) return null;
    const campaign = await prisma.campaign.findUnique({
        where: { id: input.campaignId },
        select: { missionId: true },
    });
    if (!campaign) return null;

    return prisma.action.findFirst({
        where: {
            result: "MEETING_BOOKED",
            meetingFeedback: { is: { outcome: "NO_SHOW" } },
            campaign: { is: { missionId: campaign.missionId } },
            ...(input.contactId
                ? { contactId: input.contactId }
                : { companyId: input.companyId!, contactId: null }),
        },
        orderBy: { callbackDate: "desc" },
        select: {
            id: true,
            note: true,
            callbackDate: true,
            confirmationStatus: true,
            confirmedAt: true,
            meetingType: true,
            meetingJoinUrl: true,
            meetingAddress: true,
            meetingPhone: true,
            interlocuteurId: true,
            contact: { select: { firstName: true, lastName: true, company: { select: { name: true } } } },
            company: { select: { name: true } },
            campaign: { select: { mission: { select: { name: true, clientId: true } } } },
        },
    });
}

/**
 * Re-books an absent RDV in place when there is one. Returns null when the
 * booking is not a re-booking — the caller then creates the Action as usual.
 */
export async function rebookAbsentRdvInPlace(input: AbsentRebookInput): Promise<AbsentRebookResult | null> {
    const now = input.now ?? new Date();
    const newDate = input.newCallbackDate;
    if (!newDate || newDate.getTime() <= now.getTime()) return null;

    const absent = await findAbsentToRebook(input);
    if (!absent) return null;

    const previousCallbackDate = absent.callbackDate;
    const wasConfirmed = absent.confirmationStatus === "CONFIRMED";

    await prisma.action.update({
        where: { id: absent.id },
        data: {
            callbackDate: newDate,
            note: mergeRebookNote(absent.note, input.note, previousCallbackDate),
            ...(input.meetingType && { meetingType: input.meetingType }),
            ...(input.meetingCategory && { meetingCategory: input.meetingCategory }),
            // The details belong to the chosen format: a new format replaces them all.
            ...(input.meetingType && {
                meetingAddress: input.meetingAddress ?? null,
                meetingJoinUrl: input.meetingJoinUrl ?? null,
                meetingPhone: input.meetingPhone ?? null,
            }),
            ...(input.interlocuteurId && { interlocuteurId: input.interlocuteurId }),
            cancellationReason: null,
            // A re-booking does not go back through the SAS.
            ...(!wasConfirmed && {
                confirmationStatus: "CONFIRMED" as const,
                confirmationUpdatedAt: now,
                confirmedAt: absent.confirmedAt ?? now,
            }),
        },
    });

    // Archives the absence (comment, missed slot, report date) and clears the
    // live feedback: the RDV reads "À venir" again for everyone.
    await resetAbsenceOnReschedule({
        actionId: absent.id,
        previousCallbackDate,
        newCallbackDate: newDate,
        replacedById: input.actorId,
        now,
    });

    // Same pair as any other move of a RDV the client knows about.
    const clientId = absent.campaign?.mission?.clientId;
    if (clientId) {
        try {
            await createClientPortalNotification(clientId, {
                title: "RDV déplacé",
                message: "Un rendez-vous de vos missions a été déplacé à une nouvelle date.",
                type: "info",
                link: "/client/portal/meetings",
            });
        } catch (err) {
            console.warn(`[absentRebook] portal notification for ${absent.id} failed:`, err);
        }
        const type = input.meetingType ?? absent.meetingType;
        void sendRdvRescheduledEmailNotification(clientId, {
            contactFirstName: absent.contact?.firstName ?? null,
            contactLastName: absent.contact?.lastName ?? null,
            companyName: absent.contact?.company?.name ?? absent.company?.name ?? null,
            missionName: absent.campaign?.mission?.name ?? null,
            scheduledAt: newDate,
            previousScheduledAt: previousCallbackDate ?? null,
            meetingType: (type as "VISIO" | "PHYSIQUE" | "TELEPHONIQUE" | null) ?? null,
            meetingJoinUrl: input.meetingType ? input.meetingJoinUrl ?? null : absent.meetingJoinUrl,
            meetingAddress: input.meetingType ? input.meetingAddress ?? null : absent.meetingAddress,
            meetingPhone: input.meetingType ? input.meetingPhone ?? null : absent.meetingPhone,
            interlocuteurId: input.interlocuteurId ?? absent.interlocuteurId ?? undefined,
        });
    }

    return { actionId: absent.id, previousCallbackDate };
}
