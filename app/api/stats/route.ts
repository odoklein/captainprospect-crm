import { NextRequest } from 'next/server';
import { DateTime } from 'luxon';
import { prisma } from '@/lib/prisma';
import { portalVisibleMissionWhere } from '@/lib/portal-visibility';
import type { Prisma } from '@prisma/client';
import { APP_TIMEZONE, addResult, conversionRate as tallyConversion, emptyTally, reachRate as tallyReach, yieldPer100 } from '@/lib/stats/metrics';
import {
    successResponse,
    requireRole,
    withErrorHandler,
    errorResponse,
} from '@/lib/api-utils';
import { validateApiKey, extractApiKey, logApiKeyUsage } from '@/lib/api-keys';
import { parseAlloCallsListResponse } from '@/lib/call-enrichment/allo-response';
import { integrationKey } from "@/lib/integrations/keys";

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
        totalTalkTimeAgg,
        uniqueContactsById,
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
        prisma.action.aggregate({
            where: actionWhere,
            _sum: { duration: true },
        }),
        prisma.action.groupBy({
            by: ['contactId'],
            where: {
                ...actionWhere,
                contactId: { not: null },
            },
            _count: true,
        }),
    ]);

    let rdvBySdr: { sdrId: string; _count: { _all: number } }[] = [];
    if (userRole === 'MANAGER') {
        const rdvRows = await prisma.action.findMany({
            where: {
                ...actionWhere,
                result: 'MEETING_BOOKED',
                confirmationStatus: { not: 'CANCELLED' },
            },
            select: { sdrId: true },
        });

        const rdvCounts = new Map<string, number>();
        rdvRows.forEach((row) => {
            if (!row.sdrId) return;
            rdvCounts.set(row.sdrId, (rdvCounts.get(row.sdrId) ?? 0) + 1);
        });

        rdvBySdr = [...rdvCounts.entries()]
            .map(([sdrId, count]) => ({ sdrId, _count: { _all: count } }))
            .sort((a, b) => b._count._all - a._count._all)
            .slice(0, 10);
    }

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

    const uniqueContacts = uniqueContactsById.length;
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
        if (userRole === 'MANAGER' && alloApiKey) {
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

async function getClientIdFromSession(userId: string): Promise<string | null> {
    const cleanId = userId.replace('apikey:', '');
    const user = await prisma.user.findUnique({
        where: { id: cleanId },
        select: { clientId: true },
    });
    return user?.clientId || null;
}

const ALLO_BASE_URL = 'https://api.withallo.com';
// Stats only needs recent data — 10 pages × 100 calls = 1 000 appels par ligne, largement suffisant.
// Surcharge possible via STATS_ALLO_MAX_PAGES (indépendant de CALL_ENRICHMENT_ALLO_MAX_PAGES).
const ALLO_CONNECTED_RESULTS = new Set([
    'ANSWERED',
    'TRANSFERRED_AI',
    'TRANSFERRED_EXTERNAL',
    'RECEIVED',
    'CLOSED',
]);
const ALLO_MAX_PAGES = Math.max(1, parseInt(process.env.STATS_ALLO_MAX_PAGES ?? '10', 10));
// Gap entre les pages pour ne pas saturer Allo (300ms par défaut pour les stats).
const ALLO_STATS_PAGE_GAP_MS = Math.max(0, parseInt(process.env.STATS_ALLO_PAGE_GAP_MS ?? '300', 10));
// Cache TTL en ms (défaut 5 min). Évite de refaire 300 requêtes à chaque reload du dashboard.
const ALLO_STATS_CACHE_TTL_MS = Math.max(0, parseInt(process.env.STATS_ALLO_CACHE_TTL_MS ?? '300000', 10));

/** Module-level in-process cache for Allo metrics (keyed by alloNumber|fromISO|toISO). */
const alloMetricsCache = new Map<string, { data: { calls: number; connectedCalls: number }; expiresAt: number }>();

function normalizeIsoDate(d: Date): string {
    return d.toISOString().split('T')[0];
}

async function fetchAlloCallMetricsByLine(
    alloNumbers: string[],
    dateFrom: Date,
    dateTo: Date,
    apiKey: string
): Promise<Record<string, { calls: number; connectedCalls: number }>> {
    const byNumber: Record<string, { calls: number; connectedCalls: number }> = {};
    const fromIso = normalizeIsoDate(dateFrom);
    const toIso = normalizeIsoDate(dateTo);
    const now = Date.now();

    for (const alloNumber of alloNumbers) {
        const cacheKey = `${alloNumber}|${fromIso}|${toIso}`;
        const cached = alloMetricsCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            byNumber[alloNumber] = cached.data;
            continue;
        }

        const totals = { calls: 0, connectedCalls: 0 };
        let page = 0;

        while (page < ALLO_MAX_PAGES) {
            const url = new URL(`${ALLO_BASE_URL}/v1/api/calls`);
            url.searchParams.set('allo_number', alloNumber);
            url.searchParams.set('size', '100');
            url.searchParams.set('page', String(page));

            const res = await fetch(url.toString(), {
                headers: { Authorization: apiKey },
                cache: 'no-store',
            });
            if (!res.ok) break;

            const body = await res.json();
            const parsed = parseAlloCallsListResponse(body);
            if (!parsed.rawCalls.length) break;

            let oldestCallDateOnPage: Date | null = null;
            for (const call of parsed.rawCalls) {
                const rawStart = call.start_date ?? call.start_time ?? call.created_at ?? call.date;
                if (!rawStart) continue;
                const callDate = new Date(String(rawStart));
                if (Number.isNaN(callDate.getTime())) continue;

                if (!oldestCallDateOnPage || callDate < oldestCallDateOnPage) {
                    oldestCallDateOnPage = callDate;
                }

                const callDay = normalizeIsoDate(callDate);
                if (callDay < fromIso || callDay > toIso) continue;

                totals.calls += 1;
                const result = typeof call.result === 'string' ? call.result.toUpperCase() : '';
                if (ALLO_CONNECTED_RESULTS.has(result)) totals.connectedCalls += 1;
            }

            if (oldestCallDateOnPage && oldestCallDateOnPage < dateFrom) break;

            page += 1;
            // Inter-page gap: évite les rafales sur le quota Allo
            if (page < ALLO_MAX_PAGES && ALLO_STATS_PAGE_GAP_MS > 0) {
                await new Promise<void>((r) => setTimeout(r, ALLO_STATS_PAGE_GAP_MS));
            }
        }

        byNumber[alloNumber] = totals;
        if (ALLO_STATS_CACHE_TTL_MS > 0) {
            alloMetricsCache.set(cacheKey, { data: totals, expiresAt: Date.now() + ALLO_STATS_CACHE_TTL_MS });
        }
    }

    return byNumber;
}
