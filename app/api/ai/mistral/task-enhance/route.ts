// ============================================
// POST /api/ai/mistral/task-enhance - Enhance task description with AI
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

const taskEnhanceSchema = z.object({
    title: z.string().max(200),
    description: z.string().max(2000).optional(),
    projectContext: z.string().max(1000).optional(),
});

const MISTRAL_API_URL = 'https://api.openai.com/v1/chat/completions';
const MISTRAL_MODEL = 'gpt-4.1-mini';

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireAuth(request);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return errorResponse('OPENAI_API_KEY non configurée', 503);
    }

    const { title, description, projectContext } = await validateRequest(request, taskEnhanceSchema);

    if (!title?.trim()) {
        return errorResponse('Titre requis', 400);
    }

    const systemPrompt = `Tu es un chef de projet expert. On te donne une tâche (titre et éventuellement description brève) et tu dois produire une version améliorée.

${projectContext ? `Contexte du projet : ${projectContext}` : ''}

Réponds UNIQUEMENT en JSON valide avec ce format :
{
  "enhancedTitle": "Titre amélioré, clair et spécifique",
  "enhancedDescription": "Description détaillée incluant :\\n- Objectif\\n- Critères d'acceptation\\n- Notes d'implémentation si pertinent",
  "suggestedPriority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  "suggestedLabels": ["label1", "label2"],
  "estimatedHours": number
}

Contraintes :
- Le titre doit être concis mais précis
- La description doit inclure des critères d'acceptation vérifiables
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
                        content: `Titre : ${title.trim()}\n${description ? `Description actuelle : ${description.trim()}` : 'Pas de description'}`,
                    },
                ],
                temperature: 0.3,
                max_tokens: 1500,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('Mistral task-enhance error:', err);
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
        console.error('Mistral task-enhance request failed:', error);
        return errorResponse('Erreur de connexion à OpenAI', 500);
    }
});
