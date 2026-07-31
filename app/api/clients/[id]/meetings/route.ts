import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    requireRole,
    withErrorHandler,
    NotFoundError,
    AuthError,
} from '@/lib/api-utils';
import { filterRdvList } from '@/lib/utils/meetingFilters';
import { portalVisibleMissionWhere } from '@/lib/portal-visibility';

// ============================================
// GET /api/clients/[id]/meetings
// Get all meetings (RDV pris) for a client, grouped by mission and campaign
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['MANAGER', 'CLIENT'], request);
    const { id: clientId } = await params;

    // CLIENT users can only access their own client's meetings
    if (session.user.role === 'CLIENT') {
        if (session.user.clientId !== clientId) {
            throw new AuthError('Accès non autorisé', 403);
        }
    }

    // Verify client exists
    const client = await prisma.client.findUnique({
        where: { id: clientId },
    });

    if (!client) {
        throw new NotFoundError('Client introuvable');
    }

    // Get all missions for this client
    const missions = await prisma.mission.findMany({
        where: {
            clientId,
            ...(session.user.role === 'CLIENT' ? { AND: [portalVisibleMissionWhere()] } : {}),
        },
        select: { id: true },
    });

    const missionIds = missions.map(m => m.id);

    if (missionIds.length === 0) {
        return successResponse({
            totalMeetings: 0,
            byMission: [],
            byCampaign: [],
            allMeetings: [],
        });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || null;
    const startDateParam = searchParams.get('startDate')?.trim() || null;
    const endDateParam = searchParams.get('endDate')?.trim() || null;

    const meetingWhere: Record<string, unknown> = {
        result: { in: ['MEETING_BOOKED', 'MEETING_CANCELLED'] },
        // SAS RDV: clients see meetings only once confirmed
        confirmationStatus: 'CONFIRMED',
        campaign: {
            missionId: { in: missionIds },
        },
    };
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
        meetingWhere.createdAt = dateFilter;
    }
    if (search) {
        meetingWhere.contact = {
            OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { company: { name: { contains: search, mode: 'insensitive' } } },
            ],
        };
    }

    // Get all meetings (actions with MEETING_BOOKED / MEETING_CANCELLED) for this client's missions
    const rawMeetings = await prisma.action.findMany({
        where: meetingWhere,
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
                    mission: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
            sdr: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
            interlocuteur: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    title: true,
                },
            },
            meetingFeedback: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    const meetings = filterRdvList(rawMeetings);

    // Group by mission
    const byMission = new Map<string, {
        missionId: string;
        missionName: string;
        count: number;
        meetings: typeof meetings;
    }>();

    // Group by campaign
    const byCampaign = new Map<string, {
        campaignId: string;
        campaignName: string;
        missionId: string;
        missionName: string;
        count: number;
        meetings: typeof meetings;
    }>();

    for (const meeting of meetings) {
        const missionId = meeting.campaign.missionId;
        const missionName = meeting.campaign.mission.name;
        const campaignId = meeting.campaignId;
        const campaignName = meeting.campaign.name;

        // Group by mission
        if (!byMission.has(missionId)) {
            byMission.set(missionId, {
                missionId,
                missionName,
                count: 0,
                meetings: [],
            });
        }
        const missionGroup = byMission.get(missionId)!;
        missionGroup.count++;
        missionGroup.meetings.push(meeting);

        // Group by campaign
        if (!byCampaign.has(campaignId)) {
            byCampaign.set(campaignId, {
                campaignId,
                campaignName,
                missionId,
                missionName,
                count: 0,
                meetings: [],
            });
        }
        const campaignGroup = byCampaign.get(campaignId)!;
        campaignGroup.count++;
        campaignGroup.meetings.push(meeting);
    }

    return successResponse({
        totalMeetings: meetings.length,
        byMission: Array.from(byMission.values()),
        byCampaign: Array.from(byCampaign.values()),
        allMeetings: meetings.map((meeting) => ({
            ...meeting,
            interlocuteur: meeting.interlocuteur
                ? {
                    id: meeting.interlocuteur.id,
                    firstName: meeting.interlocuteur.firstName,
                    lastName: meeting.interlocuteur.lastName,
                    title: meeting.interlocuteur.title,
                }
                : null,
        })),
    });
});
