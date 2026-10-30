import { NextRequest } from 'next/server';
import {
  successResponse,
  errorResponse,
  requireRole,
  withErrorHandler,
  validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';
import { AiCallError } from '@/lib/ai/json-call';
import { friendlyAiError } from '@/lib/analyse-ia/errors';
import { getBrand } from '@/lib/brand/server';
import { staffNames } from '@/lib/leexi/service';
import { parisDayOf } from '@/lib/onboarding/checklist-template';
import { generateSalesPlaybookFromRecap } from '@/lib/playbook/generate-sales-playbook';

// ============================================
// SCHEMAS
// ============================================

const generatePlaybookSchema = z.object({
  recapText: z.string().min(20, 'Le récapitulatif doit contenir au moins 20 caractères'),
  /** Our own people on the call (from Leexi), so they are never taken for client contacts. */
  internalNames: z.array(z.string()).max(30).optional(),
});

// ============================================
// POST /api/generate-playbook
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);

  const { recapText, internalNames } = await validateRequest(request, generatePlaybookSchema);
  const [brand, staff] = await Promise.all([getBrand(), staffNames()]);
  let website = '';
  try {
    website = new URL(brand.web.website).hostname.replace(/^www\./, '');
  } catch {
    // no website configured
  }

  try {
    const playbook = await generateSalesPlaybookFromRecap(recapText, {
      agencyName: brand.name,
      today: parisDayOf(new Date()),
      internalDomains: [...brand.email.domains, website].filter(Boolean),
      internalNames,
      staffNames: staff,
    });
    return successResponse(playbook);
  } catch (err) {
    console.error('Generate playbook error:', err);
    if (err instanceof AiCallError) {
      const friendly = friendlyAiError(err.toStored());
      return errorResponse(`${friendly.title}. ${friendly.detail}`, err.status >= 400 && err.status < 600 ? err.status : 502);
    }
    const message = err instanceof Error ? err.message : 'Erreur lors de la génération du playbook';
    return errorResponse(message, 500);
  }
});
