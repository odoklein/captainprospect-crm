import { NextRequest } from 'next/server';
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';

// ============================================
// SCHEMAS
// ============================================

const analyzeClientSchema = z.object({
    // Basic client info (fiche client)
    name: z.string().min(1, 'Nom du client requis'),
    industry: z.string().optional(),
    website: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),

    // Targets/ICP if already filled
    icp: z.string().optional(),
    targetIndustries: z.array(z.string()).optional(),
    targetCompanySize: z.string().optional(),
    targetJobTitles: z.array(z.string()).optional(),
    targetGeographies: z.array(z.string()).optional(),

    // Analysis type
    analysisType: z.enum(['full', 'icp', 'listing', 'scripts', 'strategy']).optional().default('full'),
});

// ============================================
// Mistral API Configuration
// ============================================

const MISTRAL_API_URL = 'https://api.openai.com/v1/chat/completions';
const MISTRAL_MODEL = 'gpt-4.1-mini';

// ============================================
// System prompts for different analysis types
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
5. Les zones géographiques stratégiques`;
            break;

        case 'listing':
            analysisRequest = `
Analyse ces informations et génère des recommandations pour la construction de la base de données prospects.
Propose:
1. Les meilleures sources de données à utiliser (Apollo, LinkedIn, Clay, etc.)
2. Les critères de recherche optimaux
3. Le volume de contacts estimé réaliste
4. Les filtres de qualification à appliquer
5. Les signaux d'achat à surveiller`;
            break;

        case 'scripts':
            analysisRequest = `
Analyse ces informations et génère des suggestions pour les scripts de prospection.
Propose pour chaque canal (Appel, Email, LinkedIn):
1. L'accroche principale à utiliser
2. Les pain points à adresser
3. La proposition de valeur clé
4. Les objections probables et réponses
5. Le CTA optimal`;
            break;

        case 'strategy':
            analysisRequest = `
Analyse ces informations et génère une stratégie de prospection complète.
Propose:
1. Le canal prioritaire recommandé (et pourquoi)
2. La séquence multi-canal optimale
3. Le timing et la cadence recommandés
4. Les KPIs à suivre
5. Les quick wins identifiés`;
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
        "quickWins": [
            "Action rapide 1",
            "Action rapide 2",
            "Action rapide 3"
        ],
        "risks": [
            "Risque potentiel 1",
            "Risque potentiel 2"
        ]
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
// POST /api/ai/mistral/onboarding - Analyze client for suggestions
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER', 'BUSINESS_DEVELOPER'], request);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return errorResponse('Configuration OpenAI manquante. Contactez l\'administrateur.', 500);
    }

    const data = await validateRequest(request, analyzeClientSchema);

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(data);

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
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 3000,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error('Mistral API error:', error);
            return errorResponse(
                `Erreur OpenAI: ${error.error?.message || 'Erreur inconnue'}`,
                response.status
            );
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content;

        if (!content) {
            return errorResponse('Réponse vide de OpenAI', 500);
        }

        // Parse JSON response
        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch {
            console.error('Failed to parse Mistral response:', content);
            return errorResponse('Impossible de parser la réponse de OpenAI', 500);
        }

        return successResponse({
            analysis: parsed,
            clientName: data.name,
            analysisType: data.analysisType,
            usage: result.usage,
        });

    } catch (error) {
        console.error('Mistral API request failed:', error);
        return errorResponse('Erreur de connexion à OpenAI', 500);
    }
});
