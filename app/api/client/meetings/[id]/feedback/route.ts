import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    requireRole,
    withErrorHandler,
    NotFoundError,
    AuthError,
} from '@/lib/api-utils';
import {
    notifyManagersClientSignal,
    notifyManagersClientFeedback,
} from '@/lib/notifications';
import {
    isNoShowReportWindowOpen,
    NO_SHOW_WINDOW_CLOSED_MESSAGE,
} from '@/lib/meetings/noShowWindow';

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['CLIENT'], request);
    const { id: actionId } = await params;

    const action = await prisma.action.findUnique({
        where: { id: actionId },
        include: {
            campaign: {
                include: {
                    mission: {
                        include: { client: { include: { users: { select: { id: true } } } } },
                    },
                },
            },
        },
    });

    if (!action) throw new NotFoundError('Action not found');

    if (action.confirmationStatus !== 'CONFIRMED') {
        throw new AuthError("Ce rendez-vous n'est pas encore confirmé", 403);
    }

    const clientUserIds = action.campaign.mission.client.users.map((u) => u.id);
    if (!clientUserIds.includes(session.user.id)) {
        throw new AuthError('Not authorized to access feedback for this meeting', 403);
    }

    const feedback = await prisma.meetingFeedback.findUnique({
        where: { actionId },
    });

    return successResponse(feedback);
});

export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['CLIENT'], request);
    const { id: actionId } = await params;
    const body = await request.json();

    const { outcome, recontactRequested, clientNote } = body;

    if (!outcome) {
        throw new NotFoundError('outcome is required');
    }

    const validOutcomes = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'NO_SHOW'];
    const validRecontact = ['YES', 'NO', 'MAYBE'];

    if (!validOutcomes.includes(outcome)) {
        throw new NotFoundError('Invalid outcome value');
    }
    const recontact = recontactRequested ?? 'NO';
    if (!validRecontact.includes(recontact)) {
        throw new NotFoundError('Invalid recontactRequested value');
    }

    const action = await prisma.action.findUnique({
        where: { id: actionId },
        include: {
            campaign: {
                include: {
                    mission: {
                        include: { client: { include: { users: { select: { id: true } } } } },
                    },
                },
            },
        },
    });

    if (!action) throw new NotFoundError('Action not found');

    if (action.confirmationStatus !== 'CONFIRMED') {
        throw new AuthError("Ce rendez-vous n'est pas encore confirmé", 403);
    }

    const clientUserIds = action.campaign.mission.client.users.map((u) => u.id);
    if (!clientUserIds.includes(session.user.id)) {
        throw new AuthError('Not authorized to provide feedback for this meeting');
    }

    if (outcome === 'NO_SHOW' && !isNoShowReportWindowOpen(action.callbackDate)) {
        throw new AuthError(NO_SHOW_WINDOW_CLOSED_MESSAGE, 403);
    }

    const feedback = await prisma.meetingFeedback.upsert({
        where: { actionId },
        create: {
            actionId,
            outcome,
            recontactRequested: recontact,
            clientNote: clientNote || null,
            source: 'PORTAL_CLIENT',
            reportedById: session.user.id,
        },
        update: {
            outcome,
            recontactRequested: recontact,
            clientNote: clientNote || null,
            source: 'PORTAL_CLIENT',
            reportedById: session.user.id,
        },
    });

    const contact = await prisma.action.findUnique({
        where: { id: actionId },
        select: {
            callbackDate: true,
            contact: { select: { firstName: true, lastName: true, company: { select: { name: true } } } },
            campaign: { select: { mission: { select: { name: true, client: { select: { name: true } } } } } },
        },
    });
    if (contact) {
        const contactName = [contact.contact?.firstName, contact.contact?.lastName].filter(Boolean).join(" ") || "Contact";
        const companyName = contact.contact?.company?.name ?? "Entreprise";
        const clientName = contact.campaign.mission.client.name;
        const alertData = {
            clientName,
            contactName,
            companyName,
            missionName: contact.campaign.mission.name,
            meetingDate: contact.callbackDate?.toISOString() ?? null,
        };
        if (outcome === "NO_SHOW") {
            notifyManagersClientSignal({ ...alertData, outcome, recontact, clientNote: clientNote || null }).catch(() => {});
        } else {
            notifyManagersClientFeedback({ ...alertData, outcome, clientNote: clientNote || null }).catch(() => {});
        }
    }

    return successResponse(feedback);
});
