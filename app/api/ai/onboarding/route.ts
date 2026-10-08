import { NextRequest } from 'next/server';
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';
import { geminiGenerate } from '@/lib/ai/gemini';

// ============================================
// SCHEMAS
// ============================================

const analyzeClientSchema = z.object({
    name: z.string().min(1, 'Nom du client requis'),
    industry: z.string().optional(),
    website: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    icp: z.string().optional(),
    targetIndustries: z.array(z.string()).optional(),
    targetCompanySize: z.string().optional(),
    targetJobTitles: z.array(z.string()).optional(),
    targetGeographies: z.array(z.string()).optional(),
    analysisType: z.enum(['full', 'icp', 'listing', 'scripts', 'strategy']).optional().default('full'),
});

// ============================================
// PROMPTS (shared)
// ============================================

function buildSystemPrompt(): string {
    return `Tu es un expert en stratégie commerciale B2B et en développement commercial outbound.
Tu analyses les informations des clients pour proposer des recommandations stratégiques personnalisées.
Tu génères des insights actionnables basés sur l'industrie, la taille, et le positionnement du client.
Tes recommandations sont toujours concrètes, mesurables et adaptées au contexte français/francophone.
Tu es pragmatique et orienté résultats.`;
}

function buildUserPrompt(data: z.infer<typeof analyzeClientSchema>): string {
    const clientInfo = `
INFORMATIONS CLIENT:
- Nom: ${data.name}
${data.industry ? `- Secteur: ${data.industry}` : ''}
${data.website ? `- Site web: ${data.website}` : ''}
${data.email ? `- Email: ${data.email}` : ''}
${data.icp ? `- ICP déjà défini: ${data.icp}` : ''}
${data.targetIndustries?.length ? `- Industries cibles: ${data.targetIndustries.join(', ')}` : ''}
${data.targetCompanySize ? `- Taille d'entreprise cible: ${data.targetCompanySize}` : ''}
${data.targetJobTitles?.length ? `- Fonctions cibles: ${data.targetJobTitles.join(', ')}` : ''}
${data.targetGeographies?.length ? `- Zones géographiques: ${data.targetGeographies.join(', ')}` : ''}
`;

    let analysisRequest = '';

    switch (data.analysisType) {
        case 'icp':
            analysisRequest = `
Analyse ces informations et génère des suggestions pour le Profil Client Idéal (ICP).
Propose:
1. Une description ICP détaillée basée sur l'industrie du client
2. Les industries cibles les plus pertinentes
3. Les tailles d'entreprise recommandées
4. Les fonctions/titres à cibler en priorité
5. Les zones géographiques stratégiques.
Réponds en JSON avec: { "recommendations": { "icp": { "description", "industries", "companySize", "jobTitles", "geographies", "reasoning" } } }`;
            break;

        case 'listing':
            analysisRequest = `
Analyse ces informations et génère des recommandations pour la construction de la base de données prospects.
Propose:
1. Les meilleures sources de données à utiliser (Apollo, LinkedIn, Clay, etc.)
2. Les critères de recherche optimaux
3. Le volume de contacts estimé réaliste
4. Les filtres de qualification à appliquer
5. Les signaux d'achat à surveiller.
Réponds en JSON avec: { "recommendations": { "listing": { "sources", "estimatedContacts", "criteria", "signals" } } }`;
            break;

        case 'scripts':
            analysisRequest = `
Analyse ces informations et génère des suggestions pour les scripts de prospection.
Propose pour chaque canal (Appel, Email, LinkedIn):
1. L'accroche principale à utiliser
2. Les pain points à adresser
3. La proposition de valeur clé
4. Les objections probables et réponses
5. Le CTA optimal.`;
            break;

        case 'strategy':
            analysisRequest = `
Analyse ces informations et génère une stratégie de prospection complète.
Propose:
1. Le canal prioritaire recommandé (et pourquoi)
2. La séquence multi-canal optimale
3. Le timing et la cadence recommandés
4. Les KPIs à suivre
5. Les quick wins identifiés.`;
            break;

        case 'full':
        default:
            analysisRequest = `
Analyse ces informations et génère des recommandations complètes pour l'onboarding de ce client.

Réponds en JSON avec ce format exact:
{
    "summary": "Résumé exécutif de l'analyse en 2-3 phrases",
    "confidence": 85,
    "recommendations": {
        "icp": {
            "description": "Description du profil client idéal suggéré",
            "industries": ["Industrie 1", "Industrie 2", "Industrie 3"],
            "companySize": "Taille recommandée (ex: 50-200 employés)",
            "jobTitles": ["Titre 1", "Titre 2", "Titre 3", "Titre 4"],
            "geographies": ["France", "Belgique", "Suisse"],
            "reasoning": "Explication du raisonnement"
        },
        "listing": {
            "sources": ["Source 1", "Source 2"],
            "estimatedContacts": "500-1000",
            "criteria": "Critères de recherche suggérés",
            "signals": ["Signal d'achat 1", "Signal d'achat 2"]
        },
        "strategy": {
            "primaryChannel": "CALL ou EMAIL ou LINKEDIN",
            "channelReasoning": "Pourquoi ce canal",
            "sequence": ["Étape 1", "Étape 2", "Étape 3"],
            "cadence": "Rythme suggéré (ex: 1 email/semaine)",
            "expectedConversion": "2-5%"
        },
        "quickWins": ["Action rapide 1", "Action rapide 2", "Action rapide 3"],
        "risks": ["Risque potentiel 1", "Risque potentiel 2"]
    },
    "nextSteps": [
        {
            "order": 1,
            "action": "Action à réaliser",
            "details": "Détails de l'action",
            "priority": "high ou medium ou low",
            "estimatedTime": "Temps estimé"
        }
    ]
}`;
    }

    return `${clientInfo}\n\n${analysisRequest}\n\nImportant:
- Sois concret et actionnable
- Base-toi sur les meilleures pratiques du marché français
- Priorise les recommandations par impact
- Si des informations manquent, fais des hypothèses raisonnables basées sur l'industrie
- Ne génère QUE le JSON demandé, sans texte avant ou après`;
}

// ============================================
// GEMINI
// ============================================

async function callGemini(data: z.infer<typeof analyzeClientSchema>) {
    const apiKey = process.env.GEMINI_API_KEY!;
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(data);
    const isFull = data.analysisType === 'full';
    const { text, usage } = await geminiGenerate(apiKey, systemPrompt, userPrompt, {
        temperature: 0.7,
        maxOutputTokens: 3000,
        json: isFull || data.analysisType === 'icp' || data.analysisType === 'listing',
    });
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        console.error('Gemini onboarding: failed to parse', text?.slice(0, 200));
        throw new Error('Impossible de parser la réponse de Gemini');
    }
    return { analysis: parsed, usage };
}

// ============================================
// MISTRAL (fallback)
// ============================================

const MISTRAL_API_URL = 'https://api.openai.com/v1/chat/completions';
const MISTRAL_MODEL = 'gpt-4.1-mini';

async function callMistral(data: z.infer<typeof analyzeClientSchema>) {
    const apiKey = process.env.OPENAI_API_KEY!;
    const response = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: MISTRAL_MODEL,
            messages: [
                { role: 'system', content: buildSystemPrompt() },
                { role: 'user', content: buildUserPrompt(data) },
            ],
            temperature: 0.7,
            max_tokens: 3000,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error((error as { error?: { message?: string } })?.error?.message || 'Erreur OpenAI');
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error('Réponse vide OpenAI');
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error('Impossible de parser la réponse OpenAI');
    }
    return { analysis: parsed, usage: result.usage };
}

// ============================================
// POST /api/ai/onboarding – Gemini if configured, else Mistral
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);

    const geminiKey = process.env.GEMINI_API_KEY;
    const mistralKey = process.env.OPENAI_API_KEY;
    if (!geminiKey && !mistralKey) {
        return errorResponse(
            'Aucune configuration IA (GEMINI_API_KEY ou OPENAI_API_KEY). Contactez l\'administrateur.',
            500
        );
    }

    const data = await validateRequest(request, analyzeClientSchema);

    try {
        const { analysis, usage } = geminiKey
            ? await callGemini(data)
            : await callMistral(data);

        return successResponse({
            analysis,
            clientName: data.name,
            analysisType: data.analysisType,
            usage,
            provider: geminiKey ? 'gemini' : 'mistral',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur IA';
        console.error('AI onboarding error:', err);
        return errorResponse(message, 500);
    }
});
