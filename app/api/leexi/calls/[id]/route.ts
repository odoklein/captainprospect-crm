import { NextRequest } from 'next/server';
import {
  successResponse,
  requireRole,
  withErrorHandler,
} from '@/lib/api-utils';
import { getBrand } from '@/lib/brand/server';
import { getLeexiCall } from '@/lib/leexi/service';
import { buildOnboardingRecap, websiteFromCustomers } from '@/lib/leexi/normalize';
import { leexiErrorResponse } from '@/lib/leexi/route-helpers';

// ============================================
// GET /api/leexi/calls/[id]
// One call, ready for the onboarding wizard: `recapText` is what the playbook
// extractor reads (participants, deal, Leexi summary + sales playbook, tasks).
// The raw transcript stays server-side (it can be 100k+ characters).
// ============================================

export const GET = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
  await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);
  const { id } = await context.params;

  try {
    const [{ data: call, warning }, brand] = await Promise.all([getLeexiCall(id), getBrand()]);
    const { transcript, ...rest } = call;
    return successResponse({
      call: { ...rest, hasTranscript: transcript.length > 0 },
      recapText: buildOnboardingRecap(call, brand.name),
      websiteHint: websiteFromCustomers(call.customers),
      warning,
    });
  } catch (err) {
    return leexiErrorResponse(err);
  }
});
