import { NextRequest } from 'next/server';
import { requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';
import { getBrand } from '@/lib/brand/server';
import { buildOnboardingRecap, websiteFromCustomers } from '@/lib/leexi/normalize';
import { getProviderCall, notetakerErrorResponse } from '@/lib/notetakers/service';

// ============================================
// GET /api/notetakers/[provider]/calls/[id]
// One recording, ready for the onboarding wizard: `recapText` is what the
// playbook extractor reads (participants, AI notes, action items; the
// transcript when the provider has no notes). The raw transcript stays here.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ provider: string; id: string }> }) => {
  await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);
  const { provider, id } = await context.params;

  try {
    const [{ call, warning }, brand] = await Promise.all([getProviderCall(provider, id), getBrand()]);
    const { transcript, ...rest } = call;
    return successResponse({
      call: { ...rest, hasTranscript: transcript.length > 0 },
      recapText: buildOnboardingRecap(call, brand.name),
      websiteHint: websiteFromCustomers(call.customers),
      warning,
    });
  } catch (err) {
    return notetakerErrorResponse(err);
  }
});
