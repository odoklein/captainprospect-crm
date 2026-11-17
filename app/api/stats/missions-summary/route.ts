import { NextRequest } from 'next/server';
import { DateTime } from 'luxon';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { APP_TIMEZONE } from '@/lib/stats/metrics';
import {
    successResponse,
    requireRole,
    withErrorHandler,
    errorResponse,
} from '@/lib/api-utils';
import { validateApiKey, extractApiKey, logApiKeyUsage } from '@/lib/api-keys';

// ============================================
// GET /api/stats/missions-summary
// Returns active missions with actionsThisWeek, meetingsThisWeek, lastActionAt for dashboard
// Supports both session auth and API key auth
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const startTime = Date.now();
    const endpoint = '/api/stats/missions-summary';
    
    // Try API key auth first
    const apiKey = extractApiKey(request);
    let authType: 'session' | 'apikey' = 'session';
    let apiKeyId: string | undefined;

    if (apiKey) {
        const validation = await validateApiKey(apiKey, endpoint, 'GET');
        if (!validation.valid) {
            return errorResponse(validation.error || 'Unauthorized', validation.statusCode || 401);
        }
        authType = 'apikey';
        apiKeyId = validation.key!.id;
    } else {
        // Fall back to session auth
        await requireRole(['MANAGER'], request);
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 50);

    // Europe/Paris days, [from, to) — identical to /api/stats and the manager home.
    const today = DateTime.now().setZone(APP_TIMEZONE).startOf('day');
    let rangeFrom = today;
    let rangeTo = today.plus({ days: 1 });

    if (startDateParam && endDateParam) {
        const parsedFrom = DateTime.fromISO(startDateParam, { zone: APP_TIMEZONE }).startOf('day');
        const parsedTo = DateTime.fromISO(endDateParam, { zone: APP_TIMEZONE }).startOf('day');
        if (parsedFrom.isValid && parsedTo.isValid && parsedTo >= parsedFrom) {
            rangeFrom = parsedFrom;
            rangeTo = parsedTo.plus({ days: 1 });
        }
    } else {
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
    const rangeToDate = rangeTo.toJSDate();

    const missions = await prisma.mission.findMany({
        where: { isActive: true },
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
            id: true,
            name: true,
            isActive: true,
            client: { select: { id: true, name: true } },
            _count: { select: { sdrAssignments: true } },
        },
    });

    // Aggregated in the database, for these missions only. This used to load every
    // call of the period (all missions, with a campaign join) and tally in JS, which
    // took seconds on long periods.
    const byMission: Record<
        string,
        { actionsCount: number; meetingsCount: number; lastActionAt: Date | null }
    > = {};
    if (missions.length > 0) {
        const rows = await prisma.$queryRaw<
            { missionId: string; actions: number; meetings: number; lastActionAt: Date | null }[]
        >`
            SELECT c."missionId" AS "missionId",
                   COUNT(*)::int AS actions,
                   COUNT(*) FILTER (
                       WHERE a."result" = 'MEETING_BOOKED' AND a."confirmationStatus" <> 'CANCELLED'
                   )::int AS meetings,
                   MAX(a."createdAt") AS "lastActionAt"
            FROM "Action" a
            JOIN "Campaign" c ON c.id = a."campaignId"
            WHERE a."channel" = 'CALL'
              AND a."createdAt" >= ${dateFrom} AND a."createdAt" < ${rangeToDate}
              AND c."missionId" IN (${Prisma.join(missions.map((m) => m.id))})
            GROUP BY c."missionId"
        `;
        for (const r of rows) {
            // Cancelled RDV (either a MEETING_CANCELLED row or a CANCELLED status) are
            // not "meetings this period"; they are counted on the RDV screen instead.
            byMission[r.missionId] = {
                actionsCount: Number(r.actions),
                meetingsCount: Number(r.meetings),
                lastActionAt: r.lastActionAt ? new Date(r.lastActionAt) : null,
            };
        }
    }

    const data = missions.map((m) => ({
        id: m.id,
        name: m.name,
        isActive: m.isActive,
        client: m.client,
        sdrCount: m._count.sdrAssignments,
        actionsThisPeriod: byMission[m.id]?.actionsCount ?? 0,
        meetingsThisPeriod: byMission[m.id]?.meetingsCount ?? 0,
        lastActionAt: byMission[m.id]?.lastActionAt?.toISOString() ?? null,
    }));

    const response = successResponse({ missions: data, period });

    // Log API key usage if applicable
    if (authType === 'apikey' && apiKeyId) {
        const responseTimeMs = Date.now() - startTime;
        logApiKeyUsage(apiKeyId, endpoint, 'GET', 200, responseTimeMs, request).catch(console.error);
    }

    return response;
});
