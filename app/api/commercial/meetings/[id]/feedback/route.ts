import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    requireRole,
    withErrorHandler,
    NotFoundError,
    AuthError,
    ValidationError,
} from '@/lib/api-utils';
import { notifyManagersCommercialAbsent, notifyManagersClientFeedback } from '@/lib/notifications';
import {
    isNoShowReportWindowOpen,
    NO_SHOW_WINDOW_CLOSED_MESSAGE,
} from '@/lib/meetings/noShowWindow';

async function verifyCommercialAccessToAction(actionId: string, interlocuteurId: string) {
    const interlocuteur = await prisma.clientInterlocuteur.findUnique({
        where: { id: interlocuteurId },
        select: { clientId: true, firstName: true, lastName: true },
    });

    if (!interlocuteur) throw new AuthError('Interlocuteur introuvable', 403);

    const action = await prisma.action.findUnique({
        where: { id: actionId },
        include: {
            contact: { select: { firstName: true, lastName: true, company: { select: { name: true } } } },
            campaign: {
                include: { mission: { select: { clientId: true, name: true, client: { select: { name: true } } } } },
            },
        },
    });

    if (!action) throw new NotFoundError('Rendez-vous introuvable');
    if (action.campaign.mission.clientId !== interlocuteur.clientId) {
        throw new AuthError('Accès non autorisé', 403);
    }

    return { action, interlocuteur };
}

// ============================================
// GET /api/commercial/meetings/[id]/feedback
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['COMMERCIAL'], request);
    const { id: actionId } = await params;

    const interlocuteurId = session.user.interlocuteurId;
    if (!interlocuteurId) throw new AuthError('Profil commercial introuvable', 403);

    await verifyCommercialAccessToAction(actionId, interlocuteurId);

    const feedback = await prisma.meetingFeedback.findUnique({ where: { actionId } });
    return successResponse(feedback);
});

function buildAlertData(action: any, interlocuteur: any) {
    const contactName = [action.contact?.firstName, action.contact?.lastName].filter(Boolean).join(" ") || "Contact";
    const companyName = action.contact?.company?.name || "Entreprise";
    const clientName = action.campaign?.mission?.client?.name || "Client";
    const commercialName = [interlocuteur.firstName, interlocuteur.lastName].filter(Boolean).join(" ") || "Commercial";
    return { contactName, companyName, clientName, missionName: action.campaign?.mission?.name, meetingDate: action.callbackDate?.toISOString?.() ?? null, commercialName };
}

// ============================================
// POST /api/commercial/meetings/[id]/feedback
// ============================================

export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['COMMERCIAL'], request);
    const { id: actionId } = await params;

    const interlocuteurId = session.user.interlocuteurId;
    if (!interlocuteurId) throw new AuthError('Profil commercial introuvable', 403);

    const body = await request.json();
    const { outcome, recontactRequested, clientNote } = body;

    if (!outcome || !recontactRequested) {
        throw new ValidationError('outcome et recontactRequested sont requis');
    }

    const validOutcomes = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'NO_SHOW'];
    const validRecontact = ['YES', 'NO', 'MAYBE'];

    if (!validOutcomes.includes(outcome)) {
        throw new ValidationError('Valeur outcome invalide');
    }
    if (!validRecontact.includes(recontactRequested)) {
        throw new ValidationError('Valeur recontactRequested invalide');
    }

    const { action, interlocuteur } = await verifyCommercialAccessToAction(actionId, interlocuteurId);

    if (action.confirmationStatus !== 'CONFIRMED') {
        throw new AuthError("Ce rendez-vous n'est pas encore confirmé", 403);
    }

    // Same 48h self-service window as the client portal: past it, the no-show
    // has to be raised by a manager from /manager/rdv-absences.
    if (outcome === 'NO_SHOW' && !isNoShowReportWindowOpen(action.callbackDate)) {
        throw new AuthError(NO_SHOW_WINDOW_CLOSED_MESSAGE, 403);
    }

    const existing = await prisma.meetingFeedback.findUnique({ where: { actionId } });
    if (existing) {
        throw new AuthError('Un feedback a déjà été soumis pour ce rendez-vous');
    }

    const feedback = await prisma.meetingFeedback.create({
        data: {
            actionId,
            outcome,
            recontactRequested,
            clientNote: clientNote || null,
            source: 'PORTAL_COMMERCIAL',
            reportedById: session.user.id,
        },
    });

    const alertData = buildAlertData(action, interlocuteur);
    if (outcome === 'NO_SHOW') {
        notifyManagersCommercialAbsent({ ...alertData, recontact: recontactRequested, clientNote }).catch(() => {});
    } else {
        notifyManagersClientFeedback({ ...alertData, outcome, clientNote }).catch(() => {});
    }

    return successResponse(feedback);
});

// ============================================
// PATCH /api/commercial/meetings/[id]/feedback
// Update existing feedback
// ============================================

export const PATCH = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['COMMERCIAL'], request);
    const { id: actionId } = await params;

    const interlocuteurId = session.user.interlocuteurId;
    if (!interlocuteurId) throw new AuthError('Profil commercial introuvable', 403);

    const { action, interlocuteur } = await verifyCommercialAccessToAction(actionId, interlocuteurId);

    const body = await request.json();
    const { outcome, recontactRequested, clientNote } = body;

    const validOutcomes = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'NO_SHOW'];
    const validRecontact = ['YES', 'NO', 'MAYBE'];

    if (outcome && !validOutcomes.includes(outcome)) {
        throw new ValidationError('Valeur outcome invalide');
    }
    if (recontactRequested && !validRecontact.includes(recontactRequested)) {
        throw new ValidationError('Valeur recontactRequested invalide');
    }

    const existing = await prisma.meetingFeedback.findUnique({ where: { actionId } });
    if (!existing) {
        throw new NotFoundError('Aucun feedback trouvé pour ce rendez-vous');
    }

    // Switching an existing feedback to NO_SHOW is a new no-show signal, so it
    // is bound by the same window as creating one.
    if (
        outcome === 'NO_SHOW' &&
        existing.outcome !== 'NO_SHOW' &&
        !isNoShowReportWindowOpen(action.callbackDate)
    ) {
        throw new AuthError(NO_SHOW_WINDOW_CLOSED_MESSAGE, 403);
    }

    const updated = await prisma.meetingFeedback.update({
        where: { actionId },
        data: {
            ...(outcome && { outcome }),
            ...(recontactRequested && { recontactRequested }),
            ...(clientNote !== undefined && { clientNote: clientNote || null }),
            source: 'PORTAL_COMMERCIAL',
            reportedById: session.user.id,
        },
    });

    const finalOutcome = outcome || existing.outcome;
    if (finalOutcome === 'NO_SHOW' && existing.outcome !== 'NO_SHOW') {
        const alertData = buildAlertData(action, interlocuteur);
        notifyManagersCommercialAbsent({
            ...alertData,
            recontact: recontactRequested || existing.recontactRequested,
            clientNote: clientNote ?? existing.clientNote,
        }).catch(() => {});
    }

    return successResponse(updated);
});
