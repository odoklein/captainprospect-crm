import { NextRequest } from 'next/server';
import { successResponse, errorResponse, requireRole, withErrorHandler } from '@/lib/api-utils';
import { buildDailyReport, parseDailyReportQuery } from '@/lib/client/daily-report';

// ============================================
// GET /api/client/daily-report?day=YYYY-MM-DD&today=YYYY-MM-DD&tz=<offset>
// "Rapport de la veille" for the client's main portal. `day` is the reported
// (local) day, `today` drives the "aujourd'hui à l'agenda" block, `tz` is the
// browser's getTimezoneOffset(). See lib/client/daily-report.ts.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['CLIENT'], request);
    const clientId = session.user.clientId;
    if (!clientId) return errorResponse('Aucun espace client rattaché', 403);

    const query = parseDailyReportQuery(request.nextUrl.searchParams);
    if (!query) return errorResponse('Période invalide', 400);

    return successResponse(await buildDailyReport(clientId, query));
});
