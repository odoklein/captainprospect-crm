import { NextRequest } from 'next/server';
import { DateTime } from 'luxon';
import { prisma } from '@/lib/prisma';
import { portalVisibleMissionWhere } from '@/lib/portal-visibility';
import { Prisma } from '@prisma/client';
import { APP_TIMEZONE, addResult, conversionRate as tallyConversion, emptyTally, reachRate as tallyReach, yieldPer100 } from '@/lib/stats/metrics';
import {
    successResponse,
    requireRole,
    withErrorHandler,
    errorResponse,
} from '@/lib/api-utils';
import { validateApiKey, extractApiKey, logApiKeyUsage } from '@/lib/api-keys';
import { integrationKey } from "@/lib/integrations/keys";
import { fetchAlloCallMetricsByLine } from '@/lib/stats/allo-call-metrics';

// ============================================
// GET /api/stats - Dashboard statistics
// Supports both session auth and API key auth
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const startTime = Date.now();
    const endpoint = '/api/stats';

    // Try API key auth first
    const apiKey = extractApiKey(request);
    let session;
    let authType: 'session' | 'apikey' = 'session';
    let apiKeyId: string | undefined;
    let apiKeyClientId: string | null = null;
    let apiKeyMissionId: string | null = null;

    if (apiKey) {
        const validation = await validateApiKey(apiKey, endpoint, 'GET');
        if (!validation.valid) {
            if (validation.statusCode) {
                return errorResponse(validation.error || 'Unauthorized', validation.statusCode);
            }
            return errorResponse(validation.error || 'Unauthorized', 401);
        }

        session = {
            user: {
                id: `apikey:${validation.key!.id}`,
                role: validation.key!.role,
                clientId: validation.key!.clientId,
                missionId: validation.key!.missionId,
            },
        };
        authType = 'apikey';
        apiKeyId = validation.key!.id;
        apiKeyClientId = validation.key!.clientId;
        apiKeyMissionId = validation.key!.missionId;
    } else {
        session = await requireRole(['MANAGER', 'SDR', 'CLIENT'], request);
    }

    const userRole = session.user.role;
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const missionId = searchParams.get('missionId');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const period = searchParams.get('period') || 'month';
    // Allo call volume per SDR is a slow external crawl. The manager dashboard passes
    // callMetrics=0 and loads it separately (/api/stats/sdr-call-metrics) so the KPIs
    // never wait on it; other callers keep the historical behaviour.
    const includeCallMetrics = searchParams.get('callMetrics') !== '0';

    // Europe/Paris days, [from, to) instants — the same boundaries as the
    // Statistiques page and the manager home. Local-time setHours() shifted every
    // total by the machine's UTC offset (and by one hour around DST changes).
    let rangeFrom: DateTime;
    let rangeTo: DateTime;
    const parseDay = (value: string) => DateTime.fromISO(value, { zone: APP_TIMEZONE }).startOf('day');

    if (fromParam && toParam) {
        const parsedFrom = parseDay(fromParam);
        const parsedTo = parseDay(toParam);
        if (!parsedFrom.isValid || !parsedTo.isValid || parsedTo < parsedFrom) {
            return errorResponse('Période invalide', 400);
        }
        rangeFrom = parsedFrom;
        rangeTo = parsedTo.plus({ days: 1 });
    } else if (startDateParam && endDateParam) {
        const parsedFrom = parseDay(startDateParam);
        const parsedTo = parseDay(endDateParam);
        if (!parsedFrom.isValid || !parsedTo.isValid || parsedTo < parsedFrom) {
            return errorResponse('Période invalide', 400);
        }
        rangeFrom = parsedFrom;
        rangeTo = parsedTo.plus({ days: 1 });
    } else {
        const today = DateTime.now().setZone(APP_TIMEZONE).startOf('day');
        rangeFrom = today;
        rangeTo = today.plus({ days: 1 });
        switch (period) {
            case 'today':
                break;
            case 'week':
                rangeFrom = today.minus({ days: 7 });
                break;
            case 'month':
                rangeFrom = today.minus({ months: 1 });
                break;
            case 'quarter':
                rangeFrom = today.minus({ days: 90 });
                break;
            default:
                rangeFrom = today.minus({ months: 1 });
        }
    }

    const dateFrom = rangeFrom.toJSDate();
    const dateTo = rangeTo.toJSDate();

    // Every dashboard number is a CALL number: email/LinkedIn actions must not
    // dilute call volume, reach or conversion.
    const actionWhere: Prisma.ActionWhereInput = {
        channel: 'CALL',
        createdAt: { gte: dateFrom, lt: dateTo },
    };
    const campaignWhere: Prisma.CampaignWhereInput = {};

    if (userRole === 'SDR') {
        actionWhere.sdrId = userId.replace('apikey:', '');
    } else if (userRole === 'CLIENT' || (authType === 'apikey' && apiKeyClientId)) {
        const clientId = userRole === 'CLIENT'
            ? await getClientIdFromSession(userId)
            : apiKeyClientId;

        if (clientId) {
            campaignWhere.mission = {
                is: {
                    AND: [portalVisibleMissionWhere()],
                    client: {
                        id: clientId,
                    },
                },
            };
        }
    }

    if (authType === 'apikey' && apiKeyMissionId) {
        campaignWhere.missionId = apiKeyMissionId;
    }

    if (missionId) {
        campaignWhere.missionId = missionId;
    }

    if (Object.keys(campaignWhere).length > 0) {
        actionWhere.campaign = { is: campaignWhere };
    }

    const [
        totalActions,
        actionsByResult,
        meetingsBooked,
        meetingsConfirmed,
        opportunities,
        activeMissions,
        topSDRs,
        rdvBySdr,
        totalTalkTimeAgg,
        uniqueContacts,
    ] = await Promise.all([
        prisma.action.count({ where: actionWhere }),
        prisma.action.groupBy({
            by: ['result'],
            where: actionWhere,
            _count: true,
        }),
        // RDV pris = booked and not cancelled. Cancellations can be recorded either
        // as a new MEETING_CANCELLED action or by flipping confirmationStatus.
        prisma.action.count({
            where: {
                ...actionWhere,
                result: 'MEETING_BOOKED',
                confirmationStatus: { not: 'CANCELLED' },
            },
        }),
        prisma.action.count({
            where: {
                ...actionWhere,
                result: 'MEETING_BOOKED',
                confirmationStatus: 'CONFIRMED',
            },
        }),
        prisma.opportunity.count({
            where: {
                createdAt: { gte: dateFrom, lte: dateTo },
                ...(userRole === 'CLIENT' && {
                    contact: {
                        company: {
                            list: {
                                mission: {
                                    client: { users: { some: { id: userId } } },
                                },
                            },
                        },
                    },
                }),
            },
        }),
        prisma.mission.count({
            where: {
                isActive: true,
                ...(userRole === 'CLIENT' && {
                    client: { users: { some: { id: userId } } },
                }),
                ...(userRole === 'SDR' && {
                    sdrAssignments: { some: { sdrId: userId } },
                }),
            },
        }),
        userRole === 'MANAGER'
            ? prisma.action.groupBy({
                by: ['sdrId'],
                where: actionWhere,
                _count: { _all: true },
                orderBy: { _count: { sdrId: 'desc' } },
                take: 10,
            })
            : [],
        // Counted in the database: loading every RDV row to tally them in JS was
        // the slow part on long periods.
        userRole === 'MANAGER'
            ? prisma.action.groupBy({
                by: ['sdrId'],
                where: {
                    ...actionWhere,
                    result: 'MEETING_BOOKED',
                    confirmationStatus: { not: 'CANCELLED' },
                },
                _count: { _all: true },
                orderBy: { _count: { sdrId: 'desc' } },
                take: 10,
            })
            : [],
        prisma.action.aggregate({
            where: actionWhere,
            _sum: { duration: true },
        }),
        countDistinctContacts(
            dateFrom,
            dateTo,
            typeof actionWhere.sdrId === 'string' ? actionWhere.sdrId : null,
            campaignWhere,
        ),
    ]);

    const resultBreakdown: Record<string, number> = {
        NO_RESPONSE: 0,
        BAD_CONTACT: 0,
        INTERESTED: 0,
        CALLBACK_REQUESTED: 0,
        MEETING_BOOKED: 0,
        DISQUALIFIED: 0,
    };

    actionsByResult.forEach((item) => {
        resultBreakdown[item.result] = item._count;
    });
    // The raw groupBy cannot see confirmationStatus: make the "RDV obtenu" slice
    // equal the hero count instead of adding back RDV cancelled by status.
    resultBreakdown.MEETING_BOOKED = meetingsBooked;

    // One tally, built with the same rules as the Statistiques page: joints,
    // leads chauds and RDV come from outcome families, never from one raw code.
    const tally = emptyTally();
    for (const item of actionsByResult) addResult(tally, item.result, item._count);
    tally.seconds = totalTalkTimeAgg._sum.duration ?? 0;
    // Same RDV population as the hero: a cancelled-by-status RDV is not a RDV.
    tally.meetings = meetingsBooked;

    const conversionRate = tallyConversion(tally) ?? 0;
    const reachRate = tallyReach(tally);
    const rdvPer100Calls = yieldPer100(tally);

    const interestRate = totalActions > 0
        ? Math.round(((tally.meetings + tally.hot) / totalActions) * 1000) / 10
        : 0;

    const talkTimeSeconds = totalTalkTimeAgg._sum.duration ?? 0;

    let leaderboard: { id: string; name: string; calls: number; connectedCalls: number; actions: number }[] = [];
    let rdvLeaderboard: { id: string; name: string; rdv: number; actions: number }[] = [];
    const allSdrIds = [...new Set([...topSDRs.map((s) => s.sdrId), ...rdvBySdr.map((s) => s.sdrId)])];
    if (allSdrIds.length > 0) {
        const alloApiKey = integrationKey("ALLO_API_KEY");
        const sdrs = await prisma.user.findMany({
            where: { id: { in: allSdrIds } },
            select: { id: true, name: true, alloPhoneNumber: true },
        });
        const alloMetricsByNumber = new Map<string, { calls: number; connectedCalls: number }>();
        if (userRole === 'MANAGER' && includeCallMetrics && alloApiKey) {
            const uniqueAlloNumbers = [...new Set(
                sdrs
                    .map((u) => u.alloPhoneNumber?.trim())
                    .filter((n): n is string => !!n)
            )];
            if (uniqueAlloNumbers.length > 0) {
                const metrics = await fetchAlloCallMetricsByLine(
                    uniqueAlloNumbers,
                    dateFrom,
                    dateTo,
                    alloApiKey
                );
                for (const [number, value] of Object.entries(metrics)) {
                    alloMetricsByNumber.set(number, value);
                }
            }
        }
        const nameMap = new Map(sdrs.map((u) => [u.id, u.name]));
        const actionMap = new Map(topSDRs.map((s) => [s.sdrId, s._count._all]));
        const alloNumberByUser = new Map(sdrs.map((u) => [u.id, u.alloPhoneNumber?.trim() || null]));

        leaderboard = topSDRs.map((s) => ({
            calls: alloMetricsByNumber.get(alloNumberByUser.get(s.sdrId) || '')?.calls || 0,
            connectedCalls: alloMetricsByNumber.get(alloNumberByUser.get(s.sdrId) || '')?.connectedCalls || 0,
            id: s.sdrId,
            name: nameMap.get(s.sdrId) || 'Unknown',
            actions: s._count._all,
        }));

        rdvLeaderboard = rdvBySdr.map((s) => ({
            id: s.sdrId,
            name: nameMap.get(s.sdrId) || 'Unknown',
            rdv: s._count._all,
            actions: actionMap.get(s.sdrId) || 0,
        }));
    }

    let lastActivityDate: string | null = null;
    let contactsReached = 0;
    // No objective in the schema means no objective: keep null instead of a made-up 10.
    let monthlyObjective: number | null = null;
    if (userRole === 'CLIENT') {
        const lastAction = await prisma.action.findFirst({
            where: actionWhere,
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
        });
        lastActivityDate = lastAction?.createdAt?.toISOString() ?? null;
        contactsReached = uniqueContacts;

        const mission = await prisma.mission.findFirst({
            where: {
                isActive: true,
                client: { users: { some: { id: userId } } },
            },
            select: { objective: true },
        });
        const parsed = parseInt(mission?.objective ?? '', 10);
        if (!isNaN(parsed) && parsed > 0) monthlyObjective = parsed;
    }

    const response = successResponse({
        period,
        totalActions,
        totalCalls: tally.calls,
        joinedCalls: tally.joined,
        meetingsBooked,
        meetingsConfirmed,
        meetingsCancelled: resultBreakdown.MEETING_CANCELLED ?? 0,
        opportunities,
        activeMissions,
        // RDV / joints, the same rate the Statistiques page shows.
        conversionRate,
        reachRate,
        rdvPer100Calls,
        interestRate,
        uniqueContacts,
        talkTimeSeconds,
        resultBreakdown,
        leaderboard,
        rdvLeaderboard,
        lastActivityDate,
        contactsReached,
        monthlyObjective,
    });

    if (authType === 'apikey' && apiKeyId) {
        const responseTimeMs = Date.now() - startTime;
        const statusCode = 200;
        logApiKeyUsage(apiKeyId, endpoint, 'GET', statusCode, responseTimeMs, request).catch(console.error);
    }

    return response;
});

/**
 * COUNT(DISTINCT contactId) in SQL. The previous groupBy returned one row per
 * contact (tens of thousands on long periods) only to read its length.
 */
async function countDistinctContacts(
    from: Date,
    to: Date,
    sdrId: string | null,
    campaignWhere: Prisma.CampaignWhereInput,
): Promise<number> {
    let campaignFilter = Prisma.empty;
    if (Object.keys(campaignWhere).length > 0) {
        const campaigns = await prisma.campaign.findMany({ where: campaignWhere, select: { id: true } });
        if (campaigns.length === 0) return 0;
        campaignFilter = Prisma.sql`AND a."campaignId" IN (${Prisma.join(campaigns.map((c) => c.id))})`;
    }
    const sdrFilter = sdrId ? Prisma.sql`AND a."sdrId" = ${sdrId}` : Prisma.empty;
    const rows = await prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(DISTINCT a."contactId")::int AS n
        FROM "Action" a
        WHERE a."channel" = 'CALL'
          AND a."createdAt" >= ${from} AND a."createdAt" < ${to}
          AND a."contactId" IS NOT NULL
        ${sdrFilter}
        ${campaignFilter}
    `;
    return Number(rows[0]?.n ?? 0);
}

async function getClientIdFromSession(userId: string): Promise<string | null> {
    const cleanId = userId.replace('apikey:', '');
    const user = await prisma.user.findUnique({
        where: { id: cleanId },
        select: { clientId: true },
    });
    return user?.clientId || null;
}
