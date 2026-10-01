import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    withErrorHandler,
    requireRole,
    NotFoundError,
    AuthError,
    errorResponse,
} from "@/lib/api-utils";
import {
    MEETING_CANCELLATION_REASON_CODES,
    getMeetingCancellationLabel,
    type MeetingCancellationReasonCode,
} from "@/lib/constants/meetingCancellationReasons";
import { notifyManagersClientCancel, sendRdvCancelledEmailNotification } from "@/lib/notifications";

export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(["CLIENT"], request);
    const { id: actionId } = await params;

    const body = await request.json().catch(() => ({}));
    const { cancellationReason, note } = body as { cancellationReason?: string; note?: string | null };

    if (!cancellationReason || !MEETING_CANCELLATION_REASON_CODES.includes(cancellationReason as MeetingCancellationReasonCode)) {
        return errorResponse("cancellationReason invalide ou manquant", 400);
    }

    const action = await prisma.action.findUnique({
        where: { id: actionId },
        include: {
            campaign: {
                include: {
                    mission: {
                        include: {
                            client: {
                                include: { users: { select: { id: true } } },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!action) {
        throw new NotFoundError("Action introuvable");
    }

    if (action.confirmationStatus !== "CONFIRMED") {
        throw new AuthError("Ce rendez-vous n'est pas encore confirmé", 403);
    }

    if (action.result !== "MEETING_BOOKED") {
        return errorResponse("Ce rendez-vous est déjà annulé", 400);
    }

    const client = action.campaign.mission.client;
    if (!client) {
        throw new NotFoundError("Client introuvable pour ce rendez-vous");
    }

    const clientUserIds = client.users.map((u) => u.id);
    if (!clientUserIds.includes(session.user.id)) {
        throw new AuthError("Non autorisé à annuler ce rendez-vous", 403);
    }

    const updated = await prisma.action.update({
        where: { id: actionId },
        data: {
            result: "MEETING_CANCELLED",
            cancellationReason: cancellationReason,
            note: note && String(note).trim() ? (action.note ? `${action.note}\n${String(note).trim()}` : String(note).trim()) : action.note ?? undefined,
            confirmationStatus: "CANCELLED",
            confirmationUpdatedAt: new Date(),
        },
        include: {
            contact: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    company: { select: { name: true } },
                },
            },
            campaign: {
                select: {
                    id: true,
                    name: true,
                    mission: { select: { id: true, name: true, client: { select: { name: true } } } },
                },
            },
        },
    });

    const contactName = [updated.contact?.firstName, updated.contact?.lastName].filter(Boolean).join(" ") || "Contact";
    const companyName = updated.contact?.company?.name ?? "Entreprise";
    notifyManagersClientCancel({
        clientName: updated.campaign.mission.client.name,
        contactName,
        companyName,
        missionName: updated.campaign.mission.name,
        meetingDate: action.callbackDate?.toISOString() ?? null,
        cancellationReason: getMeetingCancellationLabel(cancellationReason),
    }).catch(() => {});

    // The commercial this RDV was assigned to learns it is off (and that it must
    // leave their agenda). Only them: the admin who cancelled does not need a mail
    // about their own action. Gated by the pre-update CONFIRMED check above.
    if (action.interlocuteurId) {
        void sendRdvCancelledEmailNotification(client.id, {
            contactFirstName: updated.contact?.firstName ?? null,
            contactLastName: updated.contact?.lastName ?? null,
            companyName: updated.contact?.company?.name ?? null,
            missionName: updated.campaign.mission.name,
            scheduledAt: action.callbackDate ?? null,
            meetingChannel: action.channel,
            meetingType: action.meetingType as "VISIO" | "PHYSIQUE" | "TELEPHONIQUE" | null,
            interlocuteurId: action.interlocuteurId,
            audience: "interlocuteur",
        });
    }

    return successResponse(updated);
});
