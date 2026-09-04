// ============================================
// POST /api/ai/mistral/note-improve - Generate precise factual summary for SDR note
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

const noteImproveSchema = z.object({
    text: z.string().max(4000, 'Note trop longue').optional(),
    channel: z.enum(['CALL', 'EMAIL', 'LINKEDIN']).optional(),
    resultCode: z.string().optional(),
    resultLabel: z.string().optional(),
    callSummary: z.string().max(4000, "Résumé d'appel trop long").optional().nullable(),
    transcription: z.string().max(10000, 'Transcription trop longue').optional().nullable(),
});

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-large-latest';

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireAuth(request);

    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
        return errorResponse('MISTRAL_API_KEY non configurée', 503);
    }

    const { text, channel, resultCode, resultLabel, callSummary, transcription } =
        await validateRequest(request, noteImproveSchema);

    const rawText = text?.trim() ?? '';
    const rawCallSummary = callSummary?.trim() ?? '';
    const rawTranscription = transcription?.trim() ?? '';

    if (!rawText && !rawCallSummary && !rawTranscription) {
        return errorResponse("Texte ou données d'appel requis", 400);
    }

    const systemPrompt = `Tu es un assistant IA expert dans CaptainProspect, un CRM de prospection commerciale B2B.
Ta mission UNIQUE est de produire un RÉSUMÉ synthétique, factuel, direct et précis d'un échange commercial pour le compte-rendu interne du commercial (SDR).

DIRECTIVES STRICTES ET ABSOLUES :
1. AUCUNE INVENTION (ZÉRO HALLUCINATION) :
- Ne JAMAIS rien inventer. Reste STRICTEMENT et EXCLUSIVEMENT fidèle aux faits et éléments explicitement mentionnés dans les données fournies.
- Si une information n'est pas mentionnée, NE L'EXTRAPOLE PAS, NE L'INVENTE PAS.
- S'il y a peu de données ou des données très succinctes (ex: "occupé", "pas intéressé", "barrage secrétaire", "mauvais numéro"), ne brode pas, n'invente aucun motif fictif, aucun contexte d'entreprise imaginaire. Restitue simplement le fait brut de manière concise et factuelle.
- N'invente JAMAIS : pas de dates/heures imaginaires, pas de budget imaginaire, pas de noms fictifs, pas d'objections ou de projets non exprimés.

2. FORMAT RÉSUMÉ CONCIS UNIQUEMENT :
- Produis UNIQUEMENT un résumé concis, structuré et professionnel sous forme de note interne (compte-rendu d'échange).
- Longueur maximale : 500 caractères (contrainte stricte de la base CRM).
- Synthétise uniquement les points clés réels :
  • Statut / qualification (ce qui s'est réellement passé)
  • Raison ou retour précis du prospect (strictement ce qui est indiqué)
  • Prochaine étape concrète s'il y en a une (date de rappel, envoi d'email...)
- Aucun préambule, aucune formule de politesse, pas de "Voici le résumé :", pas de guillemets.
- Réponds UNIQUEMENT avec le texte brut du résumé.`;

    let userContent = `Voici les informations de l'échange commercial à résumer fidèlement (sans rien inventer) :\n`;
    if (channel) userContent += `- Canal : ${channel}\n`;
    if (resultLabel || resultCode) userContent += `- Résultat CRM : ${resultLabel || resultCode}\n`;
    if (rawTranscription) userContent += `- Transcription : ${rawTranscription.slice(0, 2000)}\n`;
    if (rawCallSummary) userContent += `- Résumé appel brut : ${rawCallSummary.slice(0, 1000)}\n`;
    if (rawText) userContent += `- Notes brutes : ${rawText}\n`;
    userContent += `\nConsigne : Fournis uniquement le résumé factuel et concis (max 500 caractères). Ne rien inventer.`;

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
                        content: userContent,
                    },
                ],
                temperature: 0.1,
                max_tokens: 300,
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('Mistral note-improve error:', err);
            return errorResponse(
                err.error?.message || 'Erreur Mistral AI',
                response.status
            );
        }

        const result = await response.json();
        let improved = result.choices?.[0]?.message?.content?.trim();

        if (!improved) {
            return errorResponse('Réponse vide de Mistral AI', 500);
        }

        // Trim to 500 chars to match note maxLength
        improved = improved.slice(0, 500);

        return successResponse({ improvedText: improved });
    } catch (error) {
        console.error('Mistral note-improve request failed:', error);
        return errorResponse('Erreur de connexion à Mistral AI', 500);
    }
});
