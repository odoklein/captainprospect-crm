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
import { resetAbsenceOnReschedule } from "@/lib/meetings/feedbackHistory";
import { notifyManagersClientReschedule } from "@/lib/notifications";

export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(["CLIENT"], request);
    const { id: actionId } = await params;

    const body = await request.json().catch(() => ({}));
    const { newDate, reason } = body as { newDate?: string; reason?: string | null };

    if (!newDate) {
        return errorResponse("newDate is required", 400);
    }

    const parsed = new Date(newDate);
    if (Number.isNaN(parsed.getTime())) {
        return errorResponse("newDate is invalid", 400);
    }

    // Load action and verify it belongs to the current client's company
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

    const client = action.campaign.mission.client;
    if (!client) {
        throw new NotFoundError("Client introuvable pour ce rendez-vous");
    }

    const clientUserIds = client.users.map((u) => u.id);
    if (!clientUserIds.includes(session.user.id)) {
        throw new AuthError("Non autorisé à replanifier ce rendez-vous", 403);
    }

    // Just update callbackDate; we keep result = MEETING_BOOKED
    // Optionally append the client's reason to the note for internal context
    let nextNote = action.note ?? null;
    if (reason && String(reason).trim()) {
        const tag = `[Client demande report] ${String(reason).trim()}`;
        nextNote = nextNote ? `${nextNote}\n${tag}` : tag;
    }

    const oldCallbackDate = action.callbackDate?.toISOString() ?? null;

    const updated = await prisma.action.update({
        where: { id: actionId },
        data: {
            callbackDate: parsed,
            note: nextNote ?? undefined,
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

    // Absent RDV moved to a new date: back to "À venir", the absence archived.
    const absenceReset = await resetAbsenceOnReschedule({
        actionId,
        previousCallbackDate: action.callbackDate,
        newCallbackDate: parsed,
        replacedById: session.user.id,
    });

    const contactName = [updated.contact?.firstName, updated.contact?.lastName].filter(Boolean).join(" ") || "Contact";
    const companyName = updated.contact?.company?.name ?? "Entreprise";
    notifyManagersClientReschedule({
        clientName: updated.campaign.mission.client.name,
        contactName,
        companyName,
        missionName: updated.campaign.mission.name,
        meetingDate: oldCallbackDate,
        newDate: parsed.toISOString(),
        reason: reason ?? null,
    }).catch(() => {});

    return successResponse(absenceReset ? { ...updated, meetingFeedback: null } : updated);
});

