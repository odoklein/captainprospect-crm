// ============================================
// SALES PLAYBOOK GENERATOR (OpenAI)
// Reusable, framework-agnostic service function
// ============================================

import { type Playbook, normalizePlaybook } from './leexi-types';

const MISTRAL_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4.1-mini';
const MAX_INPUT_CHARS = 80_000;

const SYSTEM_PROMPT = `You are a B2B sales strategist specialized in French outbound prospecting agencies.
Your task is to analyze a meeting recap and extract a structured Sales Playbook that covers: company info, ICP, mission parameters, pitch, objections, scripts, email sequences, and signals from the call.
You must return ONLY valid JSON. Do not include markdown, explanations, or text outside JSON.
Generate all text content in French.`;

function buildUserPrompt(recapText: string): string {
  const truncated =
    recapText.length > MAX_INPUT_CHARS
      ? recapText.slice(0, MAX_INPUT_CHARS) + '\n\n[... texte tronqué ...]'
      : recapText;

  return `Voici le récapitulatif Leexi d'un appel de closing / qualification :

${truncated}

Extrais et structure TOUTES les informations commerciales dans le schéma JSON ci-dessous.
Si une information est manquante, infère intelligemment à partir du contexte.
Si impossible, laisse le champ vide / à 0.
Génère les scripts et emails en français, prêts à être utilisés par un SDR.
Génère 4 emails pour la séquence (J1, J+3, J+6, J+10).
Génère 2 scripts d'appel (qualification + prise de RDV).

Pour les signals_from_call, identifie les signaux positifs (budget confirmé, décideur identifié...) et les warnings (concurrent en place, sensibilité prix...) détectés dans l'appel.

Required JSON schema:
{
  "company_name": "",
  "website": "",
  "sector": "",
  "target_roles": [],
  "target_sectors": [],
  "company_size_min": 0,
  "company_size_max": 0,
  "geography": [],
  "value_proposition": "",
  "competitors": [],
  "strengths": [],
  "weaknesses": [],
  "opportunities": [],
  "threats": [],
  "persona_objectives": [],
  "persona_pains": [],
  "objections": [],
  "objection_handling": [{ "objection": "", "response": "" }],
  "differentiators": [],
  "phone_script": "",
  "call_scripts": ["Script qualification...", "Script prise de RDV..."],
  "email_sequence": [
    { "subject": "", "body": "" }
  ],
  "mission_params": {
    "channel": "CALL|EMAIL|LINKEDIN",
    "working_days_per_month": 0,
    "duration_months": 0,
    "rdv_target_per_month": 0,
    "start_date": ""
  },
  "signals_from_call": [
    { "type": "positive|warning|neutral", "text": "" }
  ],
  "key_contacts": [
    { "name": "", "role": "", "email": "" }
  ]
}`;
}

/**
 * Generate a structured Sales Playbook from a Leexi meeting recap.
 * Calls OpenAI server-side (requires OPENAI_API_KEY env var).
 * Returns a strictly typed Playbook with safe defaults for missing fields.
 */
export async function generateSalesPlaybookFromRecap(
  recapText: string
): Promise<Playbook> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY non configurée');
  }

  if (!recapText || recapText.trim().length < 20) {
    throw new Error('Le récapitulatif est trop court pour être analysé');
  }

  const response = await fetch(MISTRAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(recapText) },
      ],
      temperature: 0.3,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Mistral API error (${response.status}): ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content || typeof content !== 'string') {
    throw new Error('Réponse Mistral vide ou invalide');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Impossible de parser le JSON retourné par Mistral');
  }

  return normalizePlaybook(parsed);
}
