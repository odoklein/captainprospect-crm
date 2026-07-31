import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    requireRole,
    withErrorHandler,
} from '@/lib/api-utils';
import { portalVisibleMissionWhere } from '@/lib/portal-visibility';

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['CLIENT'], request);
    const clientId = (session.user as { clientId?: string }).clientId;
    if (!clientId) return successResponse([]);

    const missions = await prisma.mission.findMany({
        where: { clientId, AND: [portalVisibleMissionWhere()] },
        select: { id: true, startDate: true, objective: true },
    });

    if (missions.length === 0) return successResponse([]);

    const missionIds = missions.map((m) => m.id);
    const earliestStart = new Date(
        Math.min(...missions.map((m) => m.startDate.getTime()))
    );

    const actions = await prisma.action.findMany({
        where: {
            campaign: { missionId: { in: missionIds } },
            createdAt: { gte: earliestStart },
        },
        select: {
            createdAt: true,
            result: true,
            contactId: true,
        },
    });

    const monthMap = new Map<string, {
        month: number;
        year: number;
        meetingsBooked: number;
        callsMade: number;
        contactsReached: Set<string>;
    }>();

    for (const action of actions) {
        const d = new Date(action.createdAt);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!monthMap.has(key)) {
            monthMap.set(key, {
                month: d.getMonth() + 1,
                year: d.getFullYear(),
                meetingsBooked: 0,
                callsMade: 0,
                contactsReached: new Set(),
            });
        }
        const entry = monthMap.get(key)!;
        entry.callsMade++;
        if (action.result === 'MEETING_BOOKED') entry.meetingsBooked++;
        if (action.contactId) entry.contactsReached.add(action.contactId);
    }

    const parsed = parseInt(missions[0]?.objective ?? '', 10);
    const objective = !isNaN(parsed) && parsed > 0 ? parsed : 10;

    const result = Array.from(monthMap.values())
        .map((e) => ({
            month: e.month,
            year: e.year,
            meetingsBooked: e.meetingsBooked,
            callsMade: e.callsMade,
            contactsReached: e.contactsReached.size,
            objective,
        }))
        .sort((a, b) => a.year - b.year || a.month - b.month);

    return successResponse(result);
});
