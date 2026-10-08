// ============================================
// POST /api/ai/mistral/task-estimate - AI time estimation
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

const taskEstimateSchema = z.object({
    title: z.string().max(200),
    description: z.string().max(2000).optional(),
    projectContext: z.string().max(1000).optional(),
    similarTasks: z.array(z.object({
        title: z.string(),
        estimatedHours: z.number().optional(),
        actualHours: z.number().optional(),
    })).max(10).optional(),
});

const MISTRAL_API_URL = 'https://api.openai.com/v1/chat/completions';
const MISTRAL_MODEL = 'gpt-4.1-mini';

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireAuth(request);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return errorResponse('OPENAI_API_KEY non configurée', 503);
    }

    const { title, description, projectContext, similarTasks } =
        await validateRequest(request, taskEstimateSchema);

    if (!title?.trim()) {
        return errorResponse('Titre requis', 400);
    }

    const similarContext = similarTasks?.length
        ? `\n\nTâches similaires déjà réalisées :\n${similarTasks.map(t =>
            `- "${t.title}" : estimé ${t.estimatedHours || '?'}h, réel ${t.actualHours || '?'}h`
        ).join('\n')}`
        : '';

    const systemPrompt = `Tu es un expert en estimation de projets. On te donne une tâche et tu dois estimer le temps nécessaire.

${projectContext ? `Contexte : ${projectContext}` : ''}${similarContext}

Réponds UNIQUEMENT en JSON valide :
{
  "optimistic": number (heures, scénario optimiste),
  "likely": number (heures, scénario probable),
  "pessimistic": number (heures, scénario pessimiste),
  "confidence": "LOW" | "MEDIUM" | "HIGH",
  "reasoning": "Explication courte de l'estimation",
  "risks": ["risque 1", "risque 2"]
}

Contraintes :
- Estimations réalistes basées sur la complexité
- Répondre en français`;

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
                    {
                        role: 'user',
                        content: `Tâche à estimer :\nTitre : ${title.trim()}\n${description ? `Description : ${description.trim()}` : ''}`,
                    },
                ],
                temperature: 0.3,
                max_tokens: 800,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('Mistral task-estimate error:', err);
            return errorResponse(err.error?.message || 'Erreur OpenAI', response.status);
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content?.trim();

        if (!content) {
            return errorResponse('Réponse vide de OpenAI', 500);
        }

        const parsed = JSON.parse(content);
        return successResponse(parsed);
    } catch (error) {
        console.error('Mistral task-estimate request failed:', error);
        return errorResponse('Erreur de connexion à OpenAI', 500);
    }
});
