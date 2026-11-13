import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse, requireRole, withErrorHandler, NotFoundError } from '@/lib/api-utils';
import { parsePeriod } from '@/lib/missions/insights';
import { getMissionInsights } from '@/lib/missions/insights.server';
import { denyMissionRead, MISSION_READ_ROLES } from '../_access';

// ============================================
// GET /api/missions/[id]/insights?period=7|30|90|all (default 30)
//   series, current vs previous window, pulse (whole-mission funnel, period
//   funnel, agency benchmark), team stats over the window, per-list
//   performance. Same access rules as GET /api/missions/[id].
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(MISSION_READ_ROLES, request);
    const { id } = await params;
    const period = parsePeriod(request.nextUrl.searchParams.get('period'));

    const mission = await prisma.mission.findUnique({
        where: { id },
        select: {
            id: true,
            clientId: true,
            startDate: true,
            portalVisibleAt: true,
            sdrAssignments: { select: { sdrId: true } },
        },
    });
    if (!mission) {
        throw new NotFoundError('Mission introuvable');
    }

    const denied = await denyMissionRead(session.user, mission);
    if (denied) return denied;

    const insights = await getMissionInsights(prisma, {
        missionId: id,
        period,
        missionStart: mission.startDate,
    });
    return successResponse(insights);
});
