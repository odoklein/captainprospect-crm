import { NextRequest } from 'next/server';
import {
  successResponse,
  errorResponse,
  requireRole,
  withErrorHandler,
  validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';

// ============================================
// POST /api/ai/generate-cr
// Generates a Compte Rendu (CR) + summary email from a Leexi transcript.
// Uses Mistral large model.
// Body: { prompt: string }
// Returns: { success: true, data: { text: string } }
// ============================================

const schema = z.object({
  prompt: z.string().min(10, 'Prompt requis'),
});

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest';

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);

  const { prompt } = await validateRequest(request, schema);

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const mistralApiKey = process.env.MISTRAL_API_KEY;

  // 1. Try free Gemini 2.0 Flash model first
  if (geminiApiKey) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 4096,
            },
          }),
        }
      );

      if (geminiRes.ok) {
        const data = await geminiRes.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          return successResponse({ text });
        }
      } else {
        console.warn('Gemini generate-cr fallback to Mistral:', await geminiRes.text());
      }
    } catch (e) {
      console.warn('Gemini generate-cr error, trying Mistral fallback:', e);
    }
  }

  // 2. Fallback to free/low-cost Mistral model (mistral-small-latest)
  if (!mistralApiKey) {
    return errorResponse('Aucune clé API IA configurée (GEMINI_API_KEY ou MISTRAL_API_KEY)', 503);
  }

  const response = await fetch(MISTRAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mistralApiKey}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('Mistral generate-cr error:', err);
    return errorResponse(
      err?.error?.message || 'Erreur Mistral AI',
      response.status,
    );
  }

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content?.trim();

  if (!text) {
    return errorResponse('Réponse vide de l\'IA', 500);
  }

  return successResponse({ text });
});
