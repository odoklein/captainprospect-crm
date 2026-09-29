import { NextRequest } from 'next/server';
import { errorResponse, requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';
import { parseExportFilters } from '@/lib/prospection-export/filters';
import { loadProspectionExportData } from '@/lib/prospection-export/load';
import { buildExportPreview } from '@/lib/prospection-export/workbook';

// ============================================
// GET /api/missions/[id]/prospection-export/preview
// What an export with these filters would contain: the mission's lists (with
// counts for the selected ones), line totals and current-status counts.
// Same query string as the download route.
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER'], request);
    const { id } = await params;
    const filters = parseExportFilters(new URL(request.url).searchParams);

    const data = await loadProspectionExportData(id, filters, { detail: 'counts' });
    if (!data) return errorResponse('Mission introuvable', 404);

    return successResponse(buildExportPreview(data));
});
