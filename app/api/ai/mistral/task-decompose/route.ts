// ============================================
// POST /api/ai/mistral/task-decompose - AI-powered task decomposition
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

const taskDecomposeSchema = z.object({
    title: z.string().max(200),
    description: z.string().max(2000).optional(),
    projectName: z.string().max(200).optional(),
    projectDescription: z.string().max(2000).optional(),
    existingTasks: z.array(z.string()).max(50).optional(),
});

const MISTRAL_API_URL = 'https://api.openai.com/v1/chat/completions';
const MISTRAL_MODEL = 'gpt-4.1-mini';

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireAuth(request);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return errorResponse('OPENAI_API_KEY non configurée', 503);
    }

    const { title, description, projectName, projectDescription, existingTasks } =
        await validateRequest(request, taskDecomposeSchema);

    if (!title?.trim()) {
        return errorResponse('Titre de la tâche requis', 400);
    }

    const existingContext = existingTasks?.length
        ? `\n\nTâches existantes dans le projet :\n${existingTasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
        : '';

    const systemPrompt = `Tu es un chef de projet expert. On te donne une tâche à décomposer en sous-tâches actionnables.

Contexte du projet : ${projectName || 'Non spécifié'}
${projectDescription ? `Description du projet : ${projectDescription}` : ''}${existingContext}

Ta mission : décomposer la tâche en 3 à 8 sous-tâches claires, concrètes et actionnables.

Réponds UNIQUEMENT en JSON valide avec ce format exact :
{
  "subtasks": [
    {
      "title": "Titre clair et concis",
      "description": "Description détaillée avec critères d'acceptation",
      "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      "estimatedHours": number (estimation en heures)
    }
  ],
  "summary": "Résumé bref de la décomposition"
}

Contraintes :
- Chaque sous-tâche doit être indépendante et vérifiable
- Les priorités doivent refléter l'ordre logique d'exécution
- Les estimations doivent être réalistes
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
                        content: `Tâche à décomposer :\nTitre : ${title.trim()}\n${description ? `Description : ${description.trim()}` : ''}`,
                    },
                ],
                temperature: 0.4,
                max_tokens: 2000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('Mistral task-decompose error:', err);
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
        console.error('Mistral task-decompose request failed:', error);
        return errorResponse('Erreur de connexion à OpenAI', 500);
    }
});
