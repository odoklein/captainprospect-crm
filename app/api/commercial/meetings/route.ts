import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    requireRole,
    withErrorHandler,
    AuthError,
} from '@/lib/api-utils';
import { filterRdvList } from '@/lib/utils/meetingFilters';
import { portalVisibleMissionWhere } from '@/lib/portal-visibility';

// ============================================
// GET /api/commercial/meetings
// Fetch confirmed meetings for a commercial's client
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['COMMERCIAL'], request);

    const interlocuteurId = session.user.interlocuteurId;
    if (!interlocuteurId) {
        throw new AuthError('Profil commercial introuvable', 403);
    }

    // Get the interlocuteur to find the clientId
    const interlocuteur = await prisma.clientInterlocuteur.findUnique({
        where: { id: interlocuteurId },
        select: { clientId: true, firstName: true, lastName: true },
    });

    if (!interlocuteur) {
        throw new AuthError('Interlocuteur introuvable', 403);
    }

    const { clientId } = interlocuteur;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || null;
    const startDateParam = searchParams.get('startDate')?.trim() || null;
    const endDateParam = searchParams.get('endDate')?.trim() || null;
    // Scope:
    // - By default (no scope param): only meetings explicitly assigned to this interlocuteur.
    // - scope=client: all client meetings (legacy behaviour).
    const scope = searchParams.get('scope')?.trim() || null;
    const scopedToMe = scope !== 'client';

    // Get all missions for this client
    const missions = await prisma.mission.findMany({
        where: { clientId, AND: [portalVisibleMissionWhere()] },
        select: { id: true },
    });

    const missionIds = missions.map((m) => m.id);

    if (missionIds.length === 0) {
        return successResponse({ total: 0, allMeetings: [] });
    }

    const where: Record<string, unknown> = {
        result: { in: ['MEETING_BOOKED', 'MEETING_CANCELLED'] },
        confirmationStatus: 'CONFIRMED',
        campaign: { missionId: { in: missionIds } },
    };

    if (scopedToMe) {
        where.interlocuteurId = interlocuteurId;
    }

    if (startDateParam || endDateParam) {
        const dateFilter: { gte?: Date; lte?: Date } = {};
        if (startDateParam) {
            const from = new Date(startDateParam);
            from.setHours(0, 0, 0, 0);
            dateFilter.gte = from;
        }
        if (endDateParam) {
            const to = new Date(endDateParam);
            to.setHours(23, 59, 59, 999);
            dateFilter.lte = to;
        }
        where.callbackDate = dateFilter;
    }

    if (search) {
        where.OR = [
            { contact: { firstName: { contains: search, mode: 'insensitive' } } },
            { contact: { lastName: { contains: search, mode: 'insensitive' } } },
            { contact: { company: { name: { contains: search, mode: 'insensitive' } } } },
        ];
    }

    const rawMeetings = await prisma.action.findMany({
        where,
        include: {
            contact: {
                include: {
                    company: {
                        select: {
                            id: true,
                            name: true,
                            phone: true,
                            industry: true,
                            country: true,
                            website: true,
                            size: true,
                            customData: true,
                        },
                    },
                },
            },
            company: {
                select: {
                    id: true,
                    name: true,
                    phone: true,
                    industry: true,
                    country: true,
                    website: true,
                    size: true,
                    customData: true,
                },
            },
            campaign: {
                select: {
                    id: true,
                    name: true,
                    missionId: true,
                    mission: { select: { id: true, name: true } },
                },
            },
            sdr: { select: { id: true, name: true } },
            meetingFeedback: true,
            interlocuteur: {
                select: { id: true, firstName: true, lastName: true, title: true },
            },
        },
        orderBy: { callbackDate: 'asc' },
    });

    const meetings = filterRdvList(rawMeetings);
    return successResponse({ total: meetings.length, allMeetings: meetings });
});
