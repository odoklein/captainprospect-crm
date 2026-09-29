import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { errorResponse, requireRole, withErrorHandler } from '@/lib/api-utils';
import { buildXlsx } from '@/lib/export/xlsx';
import { parseExportFilters } from '@/lib/prospection-export/filters';
import { loadProspectionExportData } from '@/lib/prospection-export/load';
import { buildExportCsv, buildExportSheets } from '@/lib/prospection-export/workbook';

// Large missions (tens of thousands of lines, full history) take a while to build.
export const maxDuration = 300;

function fileSlug(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'export';
}

// ============================================
// GET /api/missions/[id]/prospection-export
// Client deliverable: the lists in their original layout + Captain Prospect's
// follow-up (treated, status, call attempts, comments, history).
//   format=xlsx (default) | csv
//   summary=0 / history=0 to drop the Synthèse / Historique sheets (xlsx only)
//   + the filters documented in lib/prospection-export/filters.ts
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER'], request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const filters = parseExportFilters(searchParams);
    const data = await loadProspectionExportData(id, filters, { detail: 'full' });
    if (!data) return errorResponse('Mission introuvable', 404);
    if (data.selectedListIds.length === 0) return errorResponse('Aucune liste sélectionnée', 400);

    const format = searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';
    const exportedAt = new Date();
    const stamp = DateTime.fromJSDate(exportedAt).setZone('Europe/Paris').toFormat('yyyy-LL-dd');
    const singleList = data.selectedListIds.length === 1
        ? data.lists.find((l) => l.id === data.selectedListIds[0])?.name
        : null;
    const base = [data.mission.clientName, singleList ?? data.mission.name].filter(Boolean).map(fileSlug).join('_');
    const filename = `${base}_suivi_${stamp}.${format}`;

    let body: Buffer | string;
    let contentType: string;
    if (format === 'csv') {
        body = buildExportCsv(data);
        contentType = 'text/csv; charset=utf-8';
    } else {
        const sheets = buildExportSheets(data, {
            includeSummary: searchParams.get('summary') !== '0',
            includeHistory: searchParams.get('history') !== '0',
            exportedAt,
        });
        body = buildXlsx(sheets, {
            title: `Export prospection — ${data.mission.name}`,
            creator: 'Captain Prospect',
        });
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    return new NextResponse(typeof body === 'string' ? body : new Uint8Array(body), {
        headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
            'Cache-Control': 'no-store',
        },
    });
});
