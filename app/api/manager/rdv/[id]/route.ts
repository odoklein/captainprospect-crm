import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  errorResponse,
  requireRole,
  withErrorHandler,
  validateRequest,
  NotFoundError,
} from "@/lib/api-utils";
import { z } from "zod";
import { detectMeetingCategoryFromNote } from "@/lib/services/ActionService";
import {
  createClientPortalNotification,
  sendNewRdvEmailNotification,
  sendRdvRescheduledEmailNotification,
} from "@/lib/notifications";

const updateSchema = z.object({
  note: z.string().optional(),
  managerNote: z.string().optional(),
  callbackDate: z.string().datetime().optional(),
  meetingType: z.enum(["VISIO", "PHYSIQUE", "TELEPHONIQUE"]).optional(),
  meetingCategory: z.enum(["EXPLORATOIRE", "BESOIN"]).nullable().optional(),
  result: z.enum(["MEETING_BOOKED", "MEETING_CANCELLED"]).optional(),
  confirmationStatus: z.enum(["PENDING", "CONFIRMED", "CANCELLED"]).optional(),
  sdrId: z.string().cuid().optional(),
  // Keep this permissive: some imported legacy contacts may not use CUID format.
  contactId: z.string().min(1).optional().nullable(),
  meetingAddress: z.string().optional(),
  meetingJoinUrl: z.string().optional(),
  meetingPhone: z.string().optional(),
  channel: z.enum(["CALL", "EMAIL", "LINKEDIN"]).optional(),
  cancellationReason: z.string().nullable().optional(),
  feedbackOutcome: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "NO_SHOW"]).optional(),
  feedbackRecontact: z.enum(["YES", "NO", "MAYBE"]).optional(),
  feedbackNote: z.string().optional(),
  rdvFiche: z.record(z.string(), z.any()).nullable().optional(),
  interlocuteurId: z.string().cuid().nullable().optional(),
  callRecordingUrl: z.string().nullable().optional(),
  callSummary: z.string().nullable().optional(),
  callTranscription: z.string().nullable().optional(),
});

export const PUT = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, updateSchema);

    const action = await prisma.action.findUnique({ where: { id } });
    if (!action) throw new NotFoundError("RDV introuvable");

    const previousCallbackDate = action.callbackDate;
    const actionUpdate: Record<string, unknown> = {};
    if (body.note !== undefined) actionUpdate.note = body.note;
    // Backward compatibility: accept managerNote payloads from UI and store in note.
    if (body.managerNote !== undefined) actionUpdate.note = body.managerNote;
    if (body.contactId !== undefined) actionUpdate.contactId = body.contactId;
    if (body.callbackDate !== undefined) actionUpdate.callbackDate = new Date(body.callbackDate);
    if (body.meetingType !== undefined) actionUpdate.meetingType = body.meetingType;
    if (body.result !== undefined) actionUpdate.result = body.result;
    if (body.confirmationStatus !== undefined) {
      actionUpdate.confirmationStatus = body.confirmationStatus;
      actionUpdate.confirmationUpdatedAt = new Date();
      if (body.confirmationStatus === "CONFIRMED") {
        actionUpdate.confirmedAt = new Date();
        actionUpdate.confirmedById = session.user.id;
      }
      if (body.confirmationStatus !== "CONFIRMED") {
        actionUpdate.confirmedAt = null;
        actionUpdate.confirmedById = null;
      }
    }
    if (body.sdrId !== undefined) actionUpdate.sdrId = body.sdrId;
    if (body.meetingAddress !== undefined) actionUpdate.meetingAddress = body.meetingAddress;
    if (body.meetingJoinUrl !== undefined) actionUpdate.meetingJoinUrl = body.meetingJoinUrl;
    if (body.meetingPhone !== undefined) actionUpdate.meetingPhone = body.meetingPhone;
    if (body.channel !== undefined) actionUpdate.channel = body.channel;
    if (body.cancellationReason !== undefined) actionUpdate.cancellationReason = body.cancellationReason;
    if (body.rdvFiche !== undefined) {
      actionUpdate.rdvFiche = body.rdvFiche;
      actionUpdate.rdvFicheUpdatedAt = new Date();
    }
    if (body.interlocuteurId !== undefined) actionUpdate.interlocuteurId = body.interlocuteurId;
    if (body.callRecordingUrl !== undefined) actionUpdate.callRecordingUrl = body.callRecordingUrl;
    if (body.callSummary !== undefined) actionUpdate.callSummary = body.callSummary;
    if (body.callTranscription !== undefined) actionUpdate.callTranscription = body.callTranscription;
    if (body.meetingCategory !== undefined) {
      actionUpdate.meetingCategory = body.meetingCategory;
    } else if (body.note !== undefined && !action.meetingCategory) {
      const detected = detectMeetingCategoryFromNote(body.note);
      if (detected) actionUpdate.meetingCategory = detected;
    }

    const updated = await prisma.action.update({
      where: { id },
      data: actionUpdate,
      include: {
        contact: { include: { company: true } },
        sdr: { select: { id: true, name: true, email: true } },
        campaign: { include: { mission: { include: { client: true } } } },
        meetingFeedback: true,
        interlocuteur: { select: { id: true, firstName: true, lastName: true, title: true } },
      },
    });

    // Date moved: tell the client, so they are not left with the old slot in
    // their calendar. Only for real meetings, and only when the date actually
    // changed (saving the fiche without touching the date sends nothing).
    const newCallbackDate = updated.callbackDate;
    const dateChanged =
        body.callbackDate !== undefined &&
        newCallbackDate instanceof Date &&
        previousCallbackDate?.getTime() !== newCallbackDate.getTime();

    if (dateChanged && updated.result === "MEETING_BOOKED") {
        const clientId = updated.campaign?.mission?.clientId;
        if (clientId) {
            await createClientPortalNotification(clientId, {
                title: "RDV déplacé",
                message: `Le rendez-vous avec ${updated.contact?.firstName ?? "le contact"} ${updated.contact?.lastName ?? ""}`.trim()
                    + " a été déplacé à une nouvelle date.",
                type: "info",
                link: "/client/portal/meetings",
            });

            void sendRdvRescheduledEmailNotification(clientId, {
                contactFirstName: updated.contact?.firstName ?? null,
                contactLastName: updated.contact?.lastName ?? null,
                companyName: updated.contact?.company?.name ?? null,
                missionName: updated.campaign?.mission?.name ?? null,
                scheduledAt: newCallbackDate,
                previousScheduledAt: previousCallbackDate ?? null,
                meetingChannel: (updated.channel as any) ?? "CALL",
                meetingType: (updated.meetingType as any) ?? null,
                meetingJoinUrl: updated.meetingJoinUrl ?? null,
                meetingAddress: updated.meetingAddress ?? null,
                meetingPhone: updated.meetingPhone ?? null,
                interlocuteurId:
                    updated.interlocuteur?.id ?? (updated as any).interlocuteurId ?? undefined,
            });
        }
    }

    // SAS RDV: notify client ONLY when RDV becomes CONFIRMED
    if (
      body.confirmationStatus === "CONFIRMED" &&
      action.confirmationStatus !== "CONFIRMED" &&
      updated.result === "MEETING_BOOKED"
    ) {
      const clientId = updated.campaign?.mission?.clientId;
      if (clientId) {
        await createClientPortalNotification(clientId, {
          title: "Nouveau RDV confirmé",
          message: "Un rendez-vous a été confirmé pour une de vos missions.",
          type: "success",
          link: "/client/portal/meetings",
        });

        void sendNewRdvEmailNotification(clientId, {
          contactFirstName: updated.contact?.firstName ?? null,
          contactLastName: updated.contact?.lastName ?? null,
          companyName: updated.contact?.company?.name ?? null,
          missionName: updated.campaign?.mission?.name ?? null,
          scheduledAt: updated.callbackDate ?? null,
          meetingChannel: (updated.channel as any) ?? "CALL",
          meetingType: (updated.meetingType as any) ?? null,
          meetingJoinUrl: updated.meetingJoinUrl ?? null,
          meetingAddress: updated.meetingAddress ?? null,
          meetingPhone: updated.meetingPhone ?? null,
          interlocuteurId: updated.interlocuteur?.id ?? (updated as any).interlocuteurId ?? undefined,
        });
      }
    }

    if (
      body.feedbackOutcome !== undefined ||
      body.feedbackRecontact !== undefined ||
      body.feedbackNote !== undefined
    ) {
      await prisma.meetingFeedback.upsert({
        where: { actionId: id },
        create: {
          actionId: id,
          outcome: (body.feedbackOutcome as any) ?? "NEUTRAL",
          recontactRequested: (body.feedbackRecontact as any) ?? "NO",
          clientNote: body.feedbackNote ?? null,
          source: "MANAGER",
          reportedById: session.user.id,
        },
        update: {
          ...(body.feedbackOutcome !== undefined && { outcome: body.feedbackOutcome as any }),
          ...(body.feedbackRecontact !== undefined && { recontactRequested: body.feedbackRecontact as any }),
          ...(body.feedbackNote !== undefined && { clientNote: body.feedbackNote }),
          source: "MANAGER",
          reportedById: session.user.id,
        },
      });
    }

    return successResponse(updated);
  }
);

export const DELETE = withErrorHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;

    const action = await prisma.action.findUnique({ where: { id } });
    if (!action) throw new NotFoundError("RDV introuvable");

    await prisma.action.delete({ where: { id } });
    return successResponse({ deleted: true });
  }
);
