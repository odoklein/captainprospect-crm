import { NextRequest } from 'next/server';
import { requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';
import { testNotetaker } from '@/lib/notetakers/service';

// ============================================
// POST /api/notetakers/[provider]/test
// Paramètres › Intégrations « Tester » : one list call with the saved key.
// Always 200: { ok, message } says whether the provider accepted it.
// ============================================

export const POST = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ provider: string }> }) => {
  await requireRole(['MANAGER'], request);
  const { provider } = await context.params;
  return successResponse(await testNotetaker(provider));
});
