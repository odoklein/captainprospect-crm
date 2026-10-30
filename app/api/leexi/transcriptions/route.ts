import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  successResponse,
  requireRole,
  withErrorHandler,
} from '@/lib/api-utils';
import { listLeexiCalls } from '@/lib/leexi/service';
import { recapMatchesClient } from '@/lib/leexi/matching';
import { leexiErrorResponse } from '@/lib/leexi/route-helpers';

// ============================================
// GET /api/leexi/transcriptions?clientId=xxx
// Returns Leexi calls formatted as LeexiTranscription[]
// Optionally filtered by client company name.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');

  try {
    // Most recent 100 calls from Leexi
    const { data } = await listLeexiCalls(1, 100);
    const allCalls = data.calls;

    // If clientId given, keep the calls that look like this client's
    let filteredCalls = allCalls;
    if (clientId) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { name: true },
      });
      if (client?.name) {
        const matched = allCalls.filter((call) => recapMatchesClient(client.name, call));
        // Fall back to all calls if no match found (user can still pick manually)
        filteredCalls = matched.length > 0 ? matched : allCalls;
      }
    }

    const transcriptions = filteredCalls.map((call) => ({
      id: call.id,
      title: call.title,
      date: call.date || new Date().toISOString(),
      duration: call.duration,
      participants: [...call.customers.map((p) => p.name), ...call.users],
      recordingUrl: undefined as string | undefined,
    }));

    return successResponse(transcriptions);
  } catch (err) {
    return leexiErrorResponse(err);
  }
});
