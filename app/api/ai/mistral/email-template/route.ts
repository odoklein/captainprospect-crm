// ============================================
// POST /api/ai/mistral/email-template
// Generate a well-designed HTML email template for a mission
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

const schema = z.object({
    instruction: z.string().min(1, 'Instruction requise'),
    subject: z.string().optional(),
    category: z.string().optional(),
    missionName: z.string().optional(),
    clientName: z.string().optional(),
    icp: z.string().optional(),
    pitch: z.string().optional(),
    currentBody: z.string().optional(),
});

const MISTRAL_API_URL = 'https://api.openai.com/v1/chat/completions';
const MISTRAL_MODEL = 'gpt-4.1-mini';

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireAuth(request);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return errorResponse('OPENAI_API_KEY non configurée', 503);
    }

    const data = await validateRequest(request, schema);

    const systemPrompt = `Tu es un expert en cold emailing B2B et en design d'emails HTML. 
Tu rédiges des emails de prospection professionnels en français, bien structurés et visuellement soignés.

RÈGLES STRICTES pour le HTML que tu génères :
- Utilise UNIQUEMENT des styles inline (pas de <style> ni de classes CSS)
- Structure : <div> wrapper avec max-width 600px, font-family Arial/sans-serif
- Couleurs sobres et professionnelles (bleu foncé #1a2e5a, gris #f8f9fc, blanc #ffffff)
- Paragraphes avec line-height: 1.6, font-size: 15px
- Un CTA (bouton ou lien) clair et visible
- Variables de personnalisation : {{firstName}}, {{lastName}}, {{fullName}}, {{company}}, {{title}}
- Signature professionnelle avec {{senderName}} et {{senderTitle}}
- PAS de markdown, PAS de backticks, PAS de préambule — UNIQUEMENT le HTML

Réponds UNIQUEMENT avec le HTML du corps de l'email (sans <html>, <head>, <body>).`;

    const contextParts: string[] = [];
    if (data.missionName) contextParts.push(`Mission : ${data.missionName}`);
    if (data.clientName) contextParts.push(`Client : ${data.clientName}`);
    if (data.icp) contextParts.push(`ICP : ${data.icp}`);
    if (data.pitch) contextParts.push(`Proposition de valeur : ${data.pitch}`);
    if (data.category) contextParts.push(`Catégorie : ${data.category}`);
    if (data.subject) contextParts.push(`Objet : ${data.subject}`);
    if (data.currentBody) contextParts.push(`\nEmail actuel à améliorer :\n${data.currentBody}`);

    const userContent = [
        contextParts.join('\n'),
        `\nInstruction : ${data.instruction}`,
    ].join('\n');

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
                temperature: 0.6,
                max_tokens: 2500,
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('Mistral email-template error:', err);
            return errorResponse(err.error?.message || 'Erreur OpenAI', response.status);
        }

        const result = await response.json();
        let bodyHtml = result.choices?.[0]?.message?.content?.trim();

        if (!bodyHtml) {
            return errorResponse('Réponse vide de OpenAI', 500);
        }

        // Strip markdown code fences if model wrapped output
        bodyHtml = bodyHtml
            .replace(/^```(?:html)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        // Auto-extract subject suggestion if model included one in a <!-- subject: ... --> comment
        let suggestedSubject: string | undefined;
        const subjectMatch = bodyHtml.match(/<!--\s*subject:\s*(.+?)\s*-->/i);
        if (subjectMatch) {
            suggestedSubject = subjectMatch[1].trim();
            bodyHtml = bodyHtml.replace(subjectMatch[0], '').trim();
        }

        return successResponse({ bodyHtml, suggestedSubject });
    } catch (error) {
        console.error('Mistral email-template request failed:', error);
        return errorResponse('Erreur de connexion à OpenAI', 500);
    }
});
