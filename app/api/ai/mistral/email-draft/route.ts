// ============================================
// POST /api/ai/mistral/email-draft - Generate email body from instruction
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

const emailDraftSchema = z.object({
    instruction: z.string().min(1, 'Instruction requise'),
    subject: z.string().optional(),
});

const MISTRAL_API_URL = 'https://api.openai.com/v1/chat/completions';
const MISTRAL_MODEL = 'gpt-4.1-mini';

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireAuth(request);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return errorResponse('OPENAI_API_KEY non configurée', 503);
    }

    const { instruction, subject } = await validateRequest(request, emailDraftSchema);

    const systemPrompt = `Tu es un assistant qui rédige des emails professionnels en français. À partir de l'instruction de l'utilisateur (et éventuellement de l'objet de l'email), génère UNIQUEMENT le corps de l'email en HTML. Utilise des balises simples : <p>, <br>, <strong>, <em>. Pas de markdown, pas de préambule, pas de "Voici l'email :". Réponds UNIQUEMENT par le fragment HTML du corps du message.`;

    const userContent = subject
        ? `Objet de l'email : ${subject}\n\nInstruction : ${instruction}`
        : instruction;

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
                    { role: 'user', content: userContent },
                ],
                temperature: 0.5,
                max_tokens: 1500,
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('Mistral email-draft error:', err);
            return errorResponse(
                err.error?.message || 'Erreur OpenAI',
                response.status
            );
        }

        const result = await response.json();
        let bodyHtml = result.choices?.[0]?.message?.content?.trim();

        if (!bodyHtml) {
            return errorResponse('Réponse vide de OpenAI', 500);
        }

        // Strip markdown code blocks if model wrapped in ```html
        bodyHtml = bodyHtml.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim();

        return successResponse({ bodyHtml });
    } catch (error) {
        console.error('Mistral email-draft request failed:', error);
        return errorResponse('Erreur de connexion à OpenAI', 500);
    }
});
