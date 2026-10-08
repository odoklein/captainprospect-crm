// ============================================
// POST /api/playbook/parse — Parse playbook markdown (Manager only)
// ============================================

import { NextRequest } from 'next/server';
import { requireRole, withErrorHandler, errorResponse, successResponse } from '@/lib/api-utils';
import { parsePlaybook, isPlaybookParsingAvailable } from '@/lib/playbook/parser';
import { z } from 'zod';

const bodySchema = z.object({
  content: z.string().min(1, 'Contenu requis').max(500000, 'Document trop volumineux'),
  sourceFileName: z.string().optional().nullable(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireRole(['MANAGER'], request);

  if (!isPlaybookParsingAvailable()) {
    return errorResponse('OPENAI_API_KEY non configurée. L\'analyse des playbooks est indisponible.', 503);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(', ');
    return errorResponse(msg, 400);
  }

  const { content, sourceFileName } = parsed.data;

  try {
    const data = await parsePlaybook(content);
    if (sourceFileName) {
      data.sourceFileName = sourceFileName;
    }
    return successResponse(data);
  } catch (err) {
    console.error('Playbook parse error:', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de l\'analyse du playbook';
    return errorResponse(message, 500);
  }
});
