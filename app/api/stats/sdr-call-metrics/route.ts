import { NextRequest } from 'next/server';
import { DateTime } from 'luxon';
import { APP_TIMEZONE } from '@/lib/stats/metrics';
import { errorResponse, requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';
import { getSdrCallMetrics } from '@/lib/stats/allo-call-metrics';

// ============================================
// GET /api/stats/sdr-call-metrics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&sdrIds=a,b,c
// Allo call volume per SDR for the manager leaderboard. Split out of /api/stats
// because it crawls an external, rate-limited API: the dashboard renders its KPIs
// first and fills these tags in when they arrive.
// ============================================

const MAX_SDRS = 20;

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER'], request);

    const { searchParams } = new URL(request.url);
    const from = DateTime.fromISO(searchParams.get('startDate') ?? '', { zone: APP_TIMEZONE }).startOf('day');
    const to = DateTime.fromISO(searchParams.get('endDate') ?? '', { zone: APP_TIMEZONE }).startOf('day');
    if (!from.isValid || !to.isValid || to < from) {
        return errorResponse('Période invalide', 400);
    }

    const sdrIds = [...new Set(
        (searchParams.get('sdrIds') ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    )].slice(0, MAX_SDRS);

    // Same [from, to) Europe/Paris boundaries as /api/stats.
    const metrics = await getSdrCallMetrics(sdrIds, from.toJSDate(), to.plus({ days: 1 }).toJSDate());
    return successResponse({ metrics });
});
