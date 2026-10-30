import { NextRequest } from 'next/server';
import {
  successResponse,
  errorResponse,
  requireRole,
  withErrorHandler,
} from '@/lib/api-utils';
import { getLeexiCall } from '@/lib/leexi/service';
import { leexiErrorResponse } from '@/lib/leexi/route-helpers';

// ============================================
// GET /api/leexi/transcript/[id]
// Returns the full transcript/recap for a Leexi call.
// Used by the CR generation flow to get the raw text.
// ============================================

export const GET = withErrorHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);

    const { id } = await context.params;

    let call;
    try {
      ({ data: call } = await getLeexiCall(id));
    } catch (err) {
      return leexiErrorResponse(err);
    }

    // Priority: full transcript > summary
    const transcript = call.transcript || call.summary;

    if (!transcript) {
      return errorResponse(
        'Aucune transcription disponible pour cet appel. Le traitement Leexi est peut-être encore en cours.',
        404,
      );
    }

    return successResponse({
      transcript,
      title: call.title,
      date: call.date,
      duration: call.duration,
    });
  },
);
