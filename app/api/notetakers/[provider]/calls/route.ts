import { NextRequest } from 'next/server';
import { requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';
import { listProviderCalls, notetakerErrorResponse } from '@/lib/notetakers/service';

// ============================================
// GET /api/notetakers/[provider]/calls?q=&days=
// Without q: the most recent recordings. With q: recordings of the last `days`
// days (default 180) whose title, company, participants or emails contain every
// word of q. Each call says which CRM client it was already imported into.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ provider: string }> }) => {
  await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);
  const { provider } = await context.params;
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() || '';
  const days = Math.min(730, Math.max(7, parseInt(searchParams.get('days') || '180', 10) || 180));

  try {
    return successResponse(await listProviderCalls(provider, { query, days }));
  } catch (err) {
    return notetakerErrorResponse(err);
  }
});
