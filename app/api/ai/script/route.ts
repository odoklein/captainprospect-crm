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

const generateScriptSchema = z.object({
    channel: z.enum(['CALL', 'EMAIL', 'LINKEDIN']),
    clientName: z.string().min(1, 'Nom du client requis'),
    missionName: z.string().optional(),
    campaignName: z.string().optional(),
    campaignDescription: z.string().optional(),
    icp: z.string().min(1, 'ICP requis'),
    pitch: z.string().min(1, 'Pitch requis'),
    context: z.string().optional(),
    section: z.enum(['intro', 'discovery', 'objection', 'closing', 'all']).optional().default('all'),
    suggestionsCount: z.number().int().min(1).max(5).optional().default(3),
});

// ============================================
// PROMPTS
// ============================================

function buildSystemPrompt(channel: string): string {
    const channelGuide = {
        CALL: `Tu es un expert en cold calling B2B. Tu génères des scripts de prospection téléphonique professionnels, 
naturels et efficaces. Les scripts doivent être adaptés au marché français/francophone, 
respecter les bonnes pratiques de cold calling et être concis mais impactants.`,
        EMAIL: `Tu es un expert en cold emailing B2B. Tu génères des emails de prospection professionnels,
personnalisés et efficaces. Les emails doivent être adaptés au marché français/francophone,
respecter les bonnes pratiques (objet accrocheur, corps concis, CTA clair) et éviter les spams.`,
        LINKEDIN: `Tu es un expert en social selling LinkedIn B2B. Tu génères des messages de prospection LinkedIn
professionnels et engageants. Les messages doivent être adaptés au contexte LinkedIn,
être personnalisés, courts (moins de 300 caractères idéalement) et inciter à la conversation.`,
    };
    return channelGuide[channel as keyof typeof channelGuide] || channelGuide.CALL;
}

function buildUserPrompt(
    channel: string,
    clientName: string,
    icp: string,
    pitch: string,
    section: string,
    context?: string,
    missionName?: string,
    campaignName?: string,
    campaignDescription?: string,
    suggestionsCount: number = 3
): string {
    const baseContext = `
Client: ${clientName}
${missionName ? `Mission: ${missionName}` : ''}
${campaignName ? `Campagne: ${campaignName}` : ''}
${campaignDescription ? `Description campagne: ${campaignDescription}` : ''}
Canal: ${channel === 'CALL' ? 'Appel téléphonique' : channel === 'EMAIL' ? 'Email' : 'LinkedIn'}
ICP (Profil client idéal): ${icp}
Proposition de valeur/Pitch: ${pitch}
${context ? `Contexte additionnel: ${context}` : ''}
`;

    const sectionInstructions = {
        intro: `Génère UNIQUEMENT l'introduction/accroche du script. Elle doit captiver l'attention dès les premières secondes.`,
        discovery: `Génère UNIQUEMENT les questions de découverte. Elles doivent qualifier le prospect et découvrir ses besoins/douleurs.`,
        objection: `Génère UNIQUEMENT les réponses aux objections courantes (pas le temps, pas intéressé, on a déjà un prestataire, envoyez-moi un email, c'est trop cher).`,
        closing: `Génère UNIQUEMENT le closing/conclusion. Il doit proposer une action concrète (RDV, démo, rappel).`,
        all: `Génère un script complet avec les 4 sections : introduction, questions de découverte, gestion des objections, et closing.`,
    };

    const outputFormat = section === 'all'
        ? `Réponds UNIQUEMENT en JSON valide avec ce format exact (chaque section contient ${suggestionsCount} suggestions):
{
    "intro": ["Suggestion 1...", "Suggestion 2...", "Suggestion 3..."],
    "discovery": ["Suggestion 1...", "Suggestion 2...", "Suggestion 3..."],
    "objection": ["Suggestion 1...", "Suggestion 2...", "Suggestion 3..."],
    "closing": ["Suggestion 1...", "Suggestion 2...", "Suggestion 3..."]
}`
        : `Réponds UNIQUEMENT en JSON valide avec ce format exact (retourne ${suggestionsCount} suggestions):
{
    "${section}": ["Suggestion 1...", "Suggestion 2...", "Suggestion 3..."]
}`;

    return `${baseContext}

${sectionInstructions[section as keyof typeof sectionInstructions]}

${outputFormat}

Important:
- Écris en français
- Sois professionnel mais naturel
- Adapte le ton au canal de communication
- Les suggestions doivent être différentes (angles/accroches/structures), pas juste des paraphrases
- Ne génère QUE le JSON, sans texte avant ou après`;
}

type ScriptSectionKey = 'intro' | 'discovery' | 'objection' | 'closing';
type ScriptSuggestions = Partial<Record<ScriptSectionKey, string[]>>;

function normalizeSuggestions(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((v) => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)))
            .map((s) => s.trim())
            .filter(Boolean);
    }
    if (typeof value === 'string') return [value.trim()].filter(Boolean);
    if (value == null) return [];
    return [JSON.stringify(value)].map((s) => s.trim()).filter(Boolean);
}

function buildScriptFromSuggestions(suggestions: ScriptSuggestions): Record<ScriptSectionKey, string> {
    return {
        intro: suggestions.intro?.[0] ?? '',
        discovery: suggestions.discovery?.[0] ?? '',
        objection: suggestions.objection?.[0] ?? '',
        closing: suggestions.closing?.[0] ?? '',
    };
}

// ============================================
// GEMINI
// ============================================

async function callGeminiScript(data: z.infer<typeof generateScriptSchema>) {
    const apiKey = process.env.GEMINI_API_KEY!;
    const systemPrompt = buildSystemPrompt(data.channel);
    const userPrompt = buildUserPrompt(
        data.channel,
        data.clientName,
        data.icp,
        data.pitch,
        data.section,
        data.context,
        data.missionName,
        data.campaignName,
        data.campaignDescription,
        data.suggestionsCount
    );
    const { text, usage } = await geminiGenerate(apiKey, systemPrompt, userPrompt, {
        temperature: 0.7,
        maxOutputTokens: 2000,
        json: true,
    });
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        console.error('Gemini script: failed to parse', text?.slice(0, 200));
        throw new Error('Impossible de parser la réponse de Gemini');
    }
    return { parsed, usage };
}

// ============================================
// MISTRAL
// ============================================

const MISTRAL_API_URL = 'https://api.openai.com/v1/chat/completions';
const MISTRAL_MODEL = 'gpt-4.1-mini';

async function callMistralScript(data: z.infer<typeof generateScriptSchema>) {
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
                { role: 'system', content: buildSystemPrompt(data.channel) },
                { role: 'user', content: buildUserPrompt(data.channel, data.clientName, data.icp, data.pitch, data.section, data.context, data.missionName, data.campaignName, data.campaignDescription, data.suggestionsCount) },
            ],
            temperature: 0.7,
            max_tokens: 2000,
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
    return { parsed, usage: result.usage };
}

// ============================================
// POST /api/ai/script – Gemini if configured, else Mistral
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

    const data = await validateRequest(request, generateScriptSchema);

    try {
        const { parsed, usage } = geminiKey
            ? await callGeminiScript(data)
            : await callMistralScript(data);

        const suggestions: ScriptSuggestions = {};
        const sectionKeys: ScriptSectionKey[] = ['intro', 'discovery', 'objection', 'closing'];

        if (data.section === 'all') {
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const obj = parsed as Record<string, unknown>;
                for (const key of sectionKeys) {
                    suggestions[key] = normalizeSuggestions(obj[key]);
                }
            }
        } else {
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const obj = parsed as Record<string, unknown>;
                suggestions[data.section as ScriptSectionKey] = normalizeSuggestions(obj[data.section]);
            }
        }

        return successResponse({
            script: buildScriptFromSuggestions(suggestions),
            suggestions,
            section: data.section,
            usage,
            provider: geminiKey ? 'gemini' : 'mistral',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur IA';
        console.error('AI script error:', err);
        return errorResponse(message, 500);
    }
});
