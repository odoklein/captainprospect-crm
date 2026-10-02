import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, requirePlanningAccess, withErrorHandler } from '@/lib/api-utils';
import {
    DATE_KEY_RE,
    computeMissionConsumption,
    daysBetweenKeys,
    isTestAccountName,
    keyToUtcDate,
    parisTodayKey,
    utcDateToKey,
    type BoardSnapshot,
} from '@/lib/planning/board-shared';

/** Live = not cancelled and not a rejected suggestion. */
const LIVE_BLOCK = {
    status: { not: 'CANCELLED' as const },
    OR: [
        { suggestionStatus: null },
        { suggestionStatus: { in: ['SUGGESTED' as const, 'CONFIRMED' as const] } },
    ],
};

/**
 * GET /api/planning/board?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Everything the planning board needs for one visible range: the people to
 * show, the missions that can be planned, the live blocks, absences, and each
 * mission's all-time contract consumption for the mission dock.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requirePlanningAccess(request);
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') ?? '';
    const to = searchParams.get('to') ?? '';

    if (!DATE_KEY_RE.test(from) || !DATE_KEY_RE.test(to) || from > to) {
        return errorResponse('Paramètres from/to requis (YYYY-MM-DD, from ≤ to)', 400);
    }
    if (daysBetweenKeys(from, to) > 62) {
        return errorResponse('Période trop longue (62 jours maximum)', 400);
    }

    const fromDate = keyToUtcDate(from);
    const toDate = keyToUtcDate(to);
    const today = parisTodayKey();

    const [blocks, sdrs, absences, missions] = await Promise.all([
        prisma.scheduleBlock.findMany({
            where: { date: { gte: fromDate, lte: toDate }, ...LIVE_BLOCK },
            select: { id: true, sdrId: true, missionId: true, date: true, startTime: true, endTime: true, createdAt: true },
            orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        }),
        prisma.user.findMany({
            where: { isActive: true, role: { in: ['SDR', 'BUSINESS_DEVELOPER'] } },
            select: { id: true, name: true, role: true, isActive: true },
        }),
        prisma.sdrAbsence.findMany({
            where: { impactsPlanning: true, startDate: { lte: toDate }, endDate: { gte: fromDate } },
            select: { id: true, sdrId: true, startDate: true, endDate: true, type: true },
        }),
        prisma.mission.findMany({
            where: { isActive: true, startDate: { lte: toDate }, endDate: { gte: fromDate } },
            select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                createdAt: true,
                totalContractDays: true,
                client: { select: { name: true } },
                sdrAssignments: { select: { sdrId: true } },
            },
        }),
    ]);

    // People and missions referenced by a block but outside the default lists
    // (a manager planned as an SDR, a mission since deactivated) still render.
    const knownSdrIds = new Set(sdrs.map((s) => s.id));
    const extraSdrIds = [...new Set(blocks.map((b) => b.sdrId).filter((id) => !knownSdrIds.has(id)))];
    const knownMissionIds = new Set(missions.map((m) => m.id));
    const extraMissionIds = [...new Set(blocks.map((b) => b.missionId).filter((id) => !knownMissionIds.has(id)))];

    const [extraSdrs, extraMissions] = await Promise.all([
        extraSdrIds.length
            ? prisma.user.findMany({ where: { id: { in: extraSdrIds } }, select: { id: true, name: true, role: true, isActive: true } })
            : Promise.resolve([]),
        extraMissionIds.length
            ? prisma.mission.findMany({
                where: { id: { in: extraMissionIds } },
                select: {
                    id: true,
                    name: true,
                    startDate: true,
                    endDate: true,
                    createdAt: true,
                    totalContractDays: true,
                    client: { select: { name: true } },
                    sdrAssignments: { select: { sdrId: true } },
                },
            })
            : Promise.resolve([]),
    ]);

    const allMissions = [
        ...missions.map((m) => ({ ...m, paintable: true })),
        ...extraMissions.map((m) => ({ ...m, paintable: false })),
    ];
    const allSdrs = [...sdrs, ...extraSdrs];

    // Contract consumption needs every live block of these missions — plus the
    // other missions sharing those SDR-days, so a split day counts ½ each.
    let consumption = new Map<string, { usedDays: number; plannedDays: number }>();
    if (allMissions.length > 0) {
        const windowStart = new Date(Math.min(...allMissions.map((m) => m.startDate.getTime())));
        const windowEnd = new Date(Math.max(...allMissions.map((m) => m.endDate.getTime())));
        const windowBlocks = await prisma.scheduleBlock.findMany({
            where: { date: { gte: windowStart, lte: windowEnd }, ...LIVE_BLOCK },
            select: { sdrId: true, missionId: true, date: true, startTime: true, endTime: true },
        });
        consumption = computeMissionConsumption(
            windowBlocks.map((b) => ({ ...b, date: utcDateToKey(b.date) })),
            today,
        );
    }

    const snapshot: BoardSnapshot = {
        from,
        to,
        today,
        sdrs: allSdrs
            .map((s) => ({ ...s, isTest: isTestAccountName(s.name) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
        missions: allMissions.map((m) => ({
            id: m.id,
            name: m.name.trim(),
            clientName: m.client.name.trim(),
            startDate: utcDateToKey(m.startDate),
            endDate: utcDateToKey(m.endDate),
            createdAt: m.createdAt.toISOString(),
            totalContractDays: m.totalContractDays,
            usedDays: consumption.get(m.id)?.usedDays ?? 0,
            plannedDays: consumption.get(m.id)?.plannedDays ?? 0,
            assignedSdrIds: m.sdrAssignments.map((a) => a.sdrId),
            paintable: m.paintable,
        })),
        blocks: blocks.map((b) => ({
            id: b.id,
            sdrId: b.sdrId,
            missionId: b.missionId,
            date: utcDateToKey(b.date),
            startTime: b.startTime,
            endTime: b.endTime,
            createdAt: b.createdAt.toISOString(),
        })),
        absences: absences.map((a) => ({
            id: a.id,
            sdrId: a.sdrId,
            startDate: utcDateToKey(a.startDate),
            endDate: utcDateToKey(a.endDate),
            type: a.type,
        })),
        canEditAbsences: session.user.role === 'MANAGER',
    };

    return successResponse(snapshot);
});
