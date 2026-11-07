import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  successResponse,
  requireRole,
  withErrorHandler,
} from '@/lib/api-utils';
import { listLeexiCalls } from '@/lib/leexi/service';
import { matchRecapsToClients } from '@/lib/leexi/matching';
import { leexiErrorResponse } from '@/lib/leexi/route-helpers';

// ============================================
// GET /api/leexi/recaps
// The 50 latest Leexi calls with an external participant, matched to CRM
// clients. `recapText` is a short preview; the wizard loads the full call.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireRole(['MANAGER'], request);

  try {
    const [{ data, warning }, clients] = await Promise.all([
      listLeexiCalls(1, 50),
      prisma.client.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Internal meetings (nobody outside the agency) are not client recaps.
    const recaps = data.calls
      .filter((c) => c.customers.length > 0 || c.deal)
      .map((c) => ({
        id: c.id,
        title: c.title,
        date: c.date ?? '',
        duration: c.duration,
        recapText: c.preview,
        companyName: c.companyName,
        matchKeys: c.matchKeys,
        customers: c.customers.map((p) => p.name),
        deal: c.deal,
        url: c.url,
      }));

    const matched = matchRecapsToClients(clients, recaps);
    const unmatched = recaps.filter(
      (r) => !matched.some((m) => m.recaps.some((mr) => mr.id === r.id)),
    );

    return successResponse({
      matched,
      unmatched,
      totalRecaps: recaps.length,
      totalMatched: matched.reduce((acc, m) => acc + m.recaps.length, 0),
      warning,
    });
  } catch (err) {
    return leexiErrorResponse(err);
  }
});
