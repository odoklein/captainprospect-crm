import { NextRequest } from 'next/server';
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';

const organizePitchSchema = z.object({
    rawText: z.string().min(1, 'Texte à organiser requis'),
    clientName: z.string().optional(),
    channel: z.string().optional(),
    icp: z.string().optional(),
});

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-large-latest';

/**
 * Robust heuristic segmentation when offline or without Mistral API key
 */
function heuristicOrganize(rawText: string) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    const paragraphs = rawText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

    let hook = '';
    let pain = '';
    let solution = '';
    let proof = '';
    let cta = '';

    if (paragraphs.length >= 4) {
        hook = paragraphs[0] || '';
        pain = paragraphs[1] || '';
        solution = paragraphs[2] || '';
        if (paragraphs.length >= 5) {
            proof = paragraphs[3] || '';
            cta = paragraphs.slice(4).join('\n\n');
        } else {
            cta = paragraphs[3] || '';
        }
    } else if (paragraphs.length === 3) {
        hook = paragraphs[0] || '';
        solution = paragraphs[1] || '';
        cta = paragraphs[2] || '';
    } else if (paragraphs.length === 2) {
        hook = paragraphs[0] || '';
        solution = paragraphs[1] || '';
    } else {
        hook = rawText.trim();
    }

    // Look for cues in text
    for (const p of paragraphs) {
        const lower = p.toLowerCase();
        if (lower.startsWith('problème') || lower.includes('difficulté') || lower.includes('défi') || lower.includes('perte de temps')) {
            pain = p;
        } else if (lower.startsWith('solution') || lower.includes('notre offre') || lower.includes('plateforme') || lower.includes('nous vous proposons')) {
            solution = p;
        } else if (lower.startsWith('résultat') || lower.includes('clients') || lower.includes('%') || lower.includes('métrique') || lower.includes('preuve')) {
            proof = p;
        } else if (lower.startsWith('contact') || lower.includes('rendez-vous') || lower.includes('échange') || lower.includes('créneau') || lower.includes('cta')) {
            cta = p;
        }
    }

    return { hook, pain, solution, proof, cta };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
    await requireRole(['SUPERADMIN', 'ADMIN', 'MANAGER', 'SALES_OPS', 'TEAM_LEAD', 'SDR']);

    const body = await req.json();
    const data = validateRequest(organizePitchSchema, body);

    const apiKey = process.env.MISTRAL_API_KEY;

    if (!apiKey) {
        const result = heuristicOrganize(data.rawText);
        return successResponse(result, 'Pitch organisé (mode heuristique local)');
    }

    try {
        const systemPrompt = `Tu es un expert en communication commerciale B2B et cold outreach. 
Ton rôle est d'analyser un texte brut (pitch, notes, brief client, offre copiée d'un document) et de le restructurer en 5 blocs distincts, percutants et clairs :
1. "hook" : Accroche percutante & Proposition de valeur clé (1-2 phrases percutantes pour capter l'attention)
2. "pain" : Problème identifié ou douleur vécue par la cible (pourquoi la cible a besoin d'aide)
3. "solution" : La solution concrète et ce que l'entreprise apporte (l'offre)
4. "proof" : Preuves chiffrées, références, métriques de succès ou réassurance
5. "cta" : Appel à l'action clair (demande de 15-20 min, démo, prochaine étape)

Conserve fidèlement le fond et les informations réelles fournies. Évite le jargon inutile.
Réponds STRICTEMENT en JSON valide avec ce schéma :
{
    "hook": "...",
    "pain": "...",
    "solution": "...",
    "proof": "...",
    "cta": "..."
}`;

        const userPrompt = `Texte brut à structurer :
"""
${data.rawText}
"""
${data.clientName ? `Nom du client : ${data.clientName}` : ''}
${data.icp ? `Cible (ICP) : ${data.icp}` : ''}
${data.channel ? `Canal : ${data.channel}` : ''}`;

        const res = await fetch(MISTRAL_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: MISTRAL_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3,
                response_format: { type: 'json_object' }
            }),
        });

        if (!res.ok) {
            console.warn("Mistral API error, falling back to heuristic organize:", res.status);
            const result = heuristicOrganize(data.rawText);
            return successResponse(result, 'Pitch organisé (fallback heuristique)');
        }

        const json = await res.json();
        const rawContent = json.choices?.[0]?.message?.content;
        const parsed = JSON.parse(rawContent);

        return successResponse({
            hook: parsed.hook || '',
            pain: parsed.pain || '',
            solution: parsed.solution || '',
            proof: parsed.proof || '',
            cta: parsed.cta || '',
        }, 'Pitch structuré avec succès par IA');
    } catch (err) {
        console.error("Failed Mistral call for pitch organize:", err);
        const result = heuristicOrganize(data.rawText);
        return successResponse(result, 'Pitch organisé (fallback heuristique)');
    }
});
