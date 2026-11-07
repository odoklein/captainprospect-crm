import { NextRequest } from 'next/server';
import { requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';
import { listNotetakers } from '@/lib/notetakers/service';

// ============================================
// GET /api/notetakers
// The meeting recorders a closing call can be imported from, and whether this
// agency has connected each one (Leexi: its own settings; the others: a key in
// Paramètres › Intégrations).
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);
  return successResponse(await listNotetakers());
});
