import { NextRequest } from 'next/server';
import {
  successResponse,
  errorResponse,
  requireRole,
  withErrorHandler,
  validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';
import { generateSalesPlaybookFromRecap } from '@/lib/playbook/generate-sales-playbook';

// ============================================
// SCHEMAS
// ============================================

const generatePlaybookSchema = z.object({
  recapText: z.string().min(20, 'Le récapitulatif doit contenir au moins 20 caractères'),
});

// ============================================
// POST /api/generate-playbook
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);

  if (!process.env.OPENAI_API_KEY) {
    return errorResponse(
      'OPENAI_API_KEY non configurée. Contactez l\'administrateur.',
      503,
    );
  }

  const { recapText } = await validateRequest(request, generatePlaybookSchema);

  try {
    const playbook = await generateSalesPlaybookFromRecap(recapText);
    return successResponse(playbook);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur lors de la génération du playbook';
    console.error('Generate playbook error:', err);
    return errorResponse(message, 500);
  }
});
