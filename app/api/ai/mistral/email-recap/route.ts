// ============================================
// POST /api/ai/mistral/email-recap - Recap email content
// ============================================

import { NextRequest } from 'next/server';
import {
    successResponse,
    errorResponse,
    requireAuth,
    withErrorHandler,
    validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';

const emailRecapSchema = z.object({
    emailBodyText: z.string().min(1, 'Corps de l\'email requis'),
});

const MISTRAL_API_URL = 'https://api.openai.com/v1/chat/completions';
const MISTRAL_MODEL = 'gpt-4.1-mini';

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireAuth(request);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return errorResponse('OPENAI_API_KEY non configurée', 503);
    }

    const { emailBodyText } = await validateRequest(request, emailRecapSchema);

    const systemPrompt = `Tu es un assistant qui résume des emails. Pour le texte d'email fourni, rédige un résumé très court en français : 2 à 3 phrases maximum. Indique le sujet principal, la demande ou l'intention. Réponds UNIQUEMENT en texte brut, sans JSON ni formatage.`;

    try {
        const response = await fetch(MISTRAL_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: MISTRAL_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: emailBodyText.slice(0, 15000) },
                ],
                temperature: 0.3,
                max_tokens: 300,
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('Mistral email-recap error:', err);
            return errorResponse(
                err.error?.message || 'Erreur OpenAI',
                response.status
            );
        }

        const result = await response.json();
        const recap = result.choices?.[0]?.message?.content?.trim();

        if (!recap) {
            return errorResponse('Réponse vide de OpenAI', 500);
        }

        return successResponse({ recap });
    } catch (error) {
        console.error('Mistral email-recap request failed:', error);
        return errorResponse('Erreur de connexion à OpenAI', 500);
    }
});
