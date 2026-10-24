import { NextRequest } from 'next/server';
import { successResponse, requireRole, withErrorHandler } from '@/lib/api-utils';
import { computeBulkHealthSummaries } from '@/lib/services/ListHealthService';

// ============================================
// GET /api/lists/health
// ============================================
// Returns lightweight health summaries for multiple lists.
// Used by the lists table and health dashboard.
//
// Query params:
//   missionId       — filter to a single mission
//   clientId        — filter to all missions of a client
//   listIds[]       — filter to specific list IDs (at most MAX_LIST_IDS are read).
//                     Omit it to get every non-archived list in the scope: the
//                     server picks them, so callers never build a giant URL.
//   sdrIds[]        — scope actions to specific SDRs
//   includeArchived — include archived lists (default: false)
//
// Response: ListHealthSummary[]
// Roles: MANAGER, DEVELOPER

const MAX_LIST_IDS = 200;

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER', 'DEVELOPER'], request);
    const { searchParams } = new URL(request.url);

    const missionId = searchParams.get('missionId') ?? undefined;
    const clientId = searchParams.get('clientId') ?? undefined;
    const listIds = [...new Set(searchParams.getAll('listIds[]'))].slice(0, MAX_LIST_IDS);
    const sdrIds = searchParams.getAll('sdrIds[]');
    const includeArchived = searchParams.get('includeArchived') === 'true';

    const summaries = await computeBulkHealthSummaries({
        missionId,
        clientId,
        listIds: listIds.length > 0 ? listIds : undefined,
        sdrIds: sdrIds.length > 0 ? sdrIds : undefined,
        includeArchived,
    });

    return successResponse(summaries);
});
