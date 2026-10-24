import { NextRequest } from 'next/server';
import { DateTime } from 'luxon';
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

    const [missions, actionsInPeriod] = await Promise.all([
        prisma.mission.findMany({
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
        }),
        prisma.action.findMany({
            where: {
                channel: 'CALL',
                createdAt: { gte: dateFrom, lt: rangeToDate },
            },
            select: {
                result: true,
                confirmationStatus: true,
                createdAt: true,
                campaign: { select: { missionId: true } },
            },
        }),
    ]);

    const missionIds = new Set(missions.map((m) => m.id));
    const byMission: Record<
        string,
        { actionsCount: number; meetingsCount: number; lastActionAt: Date | null }
    > = {};
    for (const m of missions) {
        byMission[m.id] = { actionsCount: 0, meetingsCount: 0, lastActionAt: null };
    }
    for (const a of actionsInPeriod) {
        const missionId = a.campaign?.missionId;
        if (!missionId || !missionIds.has(missionId)) continue;
        const row = byMission[missionId];
        if (!row) continue;
        row.actionsCount += 1;
        // Cancelled RDV (either a MEETING_CANCELLED row or a CANCELLED status) are
        // not "meetings this period"; they are counted on the RDV screen instead.
        if (a.result === 'MEETING_BOOKED' && a.confirmationStatus !== 'CANCELLED') row.meetingsCount += 1;
        if (!row.lastActionAt || a.createdAt > row.lastActionAt) {
            row.lastActionAt = a.createdAt;
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
