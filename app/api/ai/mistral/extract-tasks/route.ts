// ============================================
// POST /api/ai/mistral/extract-tasks
// AI-powered extraction of team tasks from CR / session content
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

const extractTasksSchema = z.object({
    content: z.string().min(10).max(50000),
    clientName: z.string().max(200).optional(),
    sessionType: z.string().max(100).optional(),
});

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest';

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireAuth(request);

    const { content, clientName, sessionType } =
        await validateRequest(request, extractTasksSchema);

    const systemPrompt = `Tu es un assistant expert en gestion de projet pour une agence de prospection commerciale B2B (Captain Prospect).

Analyse le contenu suivant (compte rendu de session${sessionType ? ` de type "${sessionType}"` : ''}${clientName ? ` avec le client "${clientName}"` : ''}) et extrais TOUTES les tâches mentionnées, qu'elles soient explicites ou implicites.

Pour chaque tâche identifiée, détermine :
1. **label** : Description claire et actionnable de la tâche
2. **assigneeRole** : À qui cette tâche incombe (un seul choix parmi) :
   - "SDR" → Tâches liées à la prospection, aux appels, aux emails, au suivi commercial, aux listes de contacts
   - "MANAGER" → Tâches de pilotage, stratégie, reporting, relation client, configuration campagnes, onboarding
   - "DEV" → Tâches techniques, intégrations, corrections de bugs, développement de fonctionnalités
   - "ALWAYS" → Tâches transversales qui concernent tout le monde ou qui ne relèvent d'aucun rôle spécifique
3. **assignee** : Nom de la personne spécifique mentionnée (si explicitement mentionné dans le texte), sinon null
4. **priority** : Niveau d'urgence :
   - "URGENT" → À faire immédiatement, bloque d'autres travaux
   - "HIGH" → À faire cette semaine, important
   - "MEDIUM" → À faire dans les 2 semaines
   - "LOW" → Nice-to-have, pas urgent

Réponds UNIQUEMENT en JSON valide :
{
  "tasks": [
    {
      "label": "Description de la tâche",
      "assigneeRole": "SDR" | "MANAGER" | "DEV" | "ALWAYS",
      "assignee": "Nom de la personne" | null,
      "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT"
    }
  ],
  "summary": "Brève synthèse des tâches identifiées (1-2 phrases)"
}

Contraintes :
- Extrais toutes les tâches, même les implicites ("il faudrait que...", "on devrait...")
- Chaque tâche doit être actionnable et claire
- Ne pas inventé de tâches qui ne sont pas dans le texte
- Répondre en français
- Maximum 20 tâches`;

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
                        contents: [{ parts: [{ text: `${systemPrompt}\n\nVoici le contenu à analyser :\n\n${content}` }] }],
                        generationConfig: {
                            temperature: 0.3,
                            maxOutputTokens: 4000,
                            responseMimeType: 'application/json',
                        },
                    }),
                }
            );

            if (geminiRes.ok) {
                const data = await geminiRes.json();
                const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed.tasks)) {
                        const validRoles = ['SDR', 'MANAGER', 'DEV', 'ALWAYS'];
                        const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
                        const tasks = parsed.tasks
                            .filter((t: any) => t.label && typeof t.label === 'string')
                            .map((t: any) => ({
                                label: t.label.trim(),
                                assigneeRole: validRoles.includes(t.assigneeRole) ? t.assigneeRole : 'ALWAYS',
                                assignee: t.assignee || null,
                                priority: validPriorities.includes(t.priority) ? t.priority : 'MEDIUM',
                            }));
                        return successResponse({ tasks, summary: parsed.summary || '' });
                    }
                }
            }
        } catch (e) {
            console.warn('Gemini extract-tasks failed, trying Mistral fallback:', e);
        }
    }

    if (!mistralApiKey) {
        return errorResponse('Aucune clé API IA configurée (GEMINI_API_KEY ou MISTRAL_API_KEY)', 503);
    }

    try {
        const response = await fetch(MISTRAL_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${mistralApiKey}`,
            },
            body: JSON.stringify({
                model: MISTRAL_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: `Voici le contenu à analyser :\n\n${content}`,
                    },
                ],
                temperature: 0.3,
                max_tokens: 4000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('Mistral extract-tasks error:', err);
            return errorResponse(
                err.error?.message || 'Erreur Mistral AI',
                response.status,
            );
        }

        const result = await response.json();
        const raw = result.choices?.[0]?.message?.content?.trim();

        if (!raw) {
            return errorResponse('Réponse vide de Mistral AI', 500);
        }

        const parsed = JSON.parse(raw);

        // Validate shape
        if (!Array.isArray(parsed.tasks)) {
            return errorResponse('Format de réponse invalide (tasks manquant)', 500);
        }

        // Normalize
        const validRoles = ['SDR', 'MANAGER', 'DEV', 'ALWAYS'];
        const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

        const tasks = parsed.tasks
            .filter((t: any) => t.label && typeof t.label === 'string')
            .map((t: any) => ({
                label: t.label.trim(),
                assigneeRole: validRoles.includes(t.assigneeRole)
                    ? t.assigneeRole
                    : 'ALWAYS',
                assignee: t.assignee || null,
                priority: validPriorities.includes(t.priority)
                    ? t.priority
                    : 'MEDIUM',
            }));

        return successResponse({
            tasks,
            summary: parsed.summary || '',
        });
    } catch (error) {
        console.error('Mistral extract-tasks request failed:', error);
        return errorResponse('Erreur de connexion à Mistral AI', 500);
    }
});
