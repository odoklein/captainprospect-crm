// ============================================
// POST /api/ai/mistral/task-suggest - AI task suggestions
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

const taskSuggestSchema = z.object({
    projectName: z.string().max(200),
    projectDescription: z.string().max(2000).optional(),
    existingTasks: z.array(z.object({
        title: z.string(),
        status: z.string(),
        priority: z.string().optional(),
    })).max(50).optional(),
    focusArea: z.string().max(500).optional(),
});

const MISTRAL_API_URL = 'https://api.openai.com/v1/chat/completions';
const MISTRAL_MODEL = 'gpt-4.1-mini';

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireAuth(request);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return errorResponse('OPENAI_API_KEY non configurée', 503);
    }

    const { projectName, projectDescription, existingTasks, focusArea } =
        await validateRequest(request, taskSuggestSchema);

    const existingContext = existingTasks?.length
        ? `\n\nTâches existantes :\n${existingTasks.map((t, i) =>
            `${i + 1}. [${t.status}] ${t.title}${t.priority ? ` (${t.priority})` : ''}`
        ).join('\n')}`
        : '';

    const systemPrompt = `Tu es un chef de projet expert. Analyse le projet et les tâches existantes pour suggérer des tâches manquantes ou des améliorations.

${focusArea ? `Focus demandé : ${focusArea}` : ''}

Réponds UNIQUEMENT en JSON valide :
{
  "suggestions": [
    {
      "title": "Titre de la tâche suggérée",
      "description": "Pourquoi cette tâche est importante",
      "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      "category": "missing" | "improvement" | "risk_mitigation" | "optimization",
      "estimatedHours": number
    }
  ],
  "analysis": "Brève analyse du projet et des gaps identifiés"
}

Contraintes :
- 3 à 6 suggestions maximum
- Chaque suggestion doit apporter de la valeur
- Ne pas répéter les tâches existantes
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
                        content: `Projet : ${projectName}\n${projectDescription ? `Description : ${projectDescription}` : ''}${existingContext}`,
                    },
                ],
                temperature: 0.5,
                max_tokens: 2000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('Mistral task-suggest error:', err);
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
        console.error('Mistral task-suggest request failed:', error);
        return errorResponse('Erreur de connexion à OpenAI', 500);
    }
});
