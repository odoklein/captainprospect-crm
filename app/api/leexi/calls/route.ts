import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  successResponse,
  requireRole,
  withErrorHandler,
} from '@/lib/api-utils';
import { listLeexiCalls, searchLeexiCalls, type LeexiCallSummary } from '@/lib/leexi/service';
import { leexiErrorResponse } from '@/lib/leexi/route-helpers';

// ============================================
// GET /api/leexi/calls?q=&days=&page=
// Without q: the 50 most recent calls (page = Leexi page).
// With q: calls of the last `days` days (default 180) whose title, company,
// deal, participants or emails contain every word of q.
// Each call says which CRM client it was already imported into, if any.
// ============================================

async function withImports(calls: LeexiCallSummary[]) {
  const imports = calls.length
    ? await prisma.leexiCallImport.findMany({
        where: { leexiCallId: { in: calls.map((c) => c.id) } },
        select: { leexiCallId: true, client: { select: { id: true, name: true } } },
      })
    : [];
  const byCall = new Map(imports.filter((i) => i.client).map((i) => [i.leexiCallId, i.client!]));
  return calls.map((c) => ({ ...c, importedClient: byCall.get(c.id) ?? null }));
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const days = Math.min(730, Math.max(7, parseInt(searchParams.get('days') || '180', 10) || 180));

  try {
    if (query) {
      const { data, warning } = await searchLeexiCalls(query, { days });
      return successResponse({ calls: await withImports(data.calls), total: data.calls.length, scanned: data.scanned, days, warning });
    }
    const { data, warning } = await listLeexiCalls(page, 50);
    return successResponse({ calls: await withImports(data.calls), total: data.total, page, warning });
  } catch (err) {
    return leexiErrorResponse(err);
  }
});
