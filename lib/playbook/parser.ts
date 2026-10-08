// ============================================
// PLAYBOOK PARSER (AI)
// Parses Notion/markdown sales playbook into structured CRM entities
// Uses Mistral API (OPENAI_API_KEY)
// ============================================

import type { ParsedPlaybook } from './types';

const MISTRAL_API_URL = 'https://api.openai.com/v1/chat/completions';
const MISTRAL_MODEL = 'gpt-4.1-mini';
const MAX_INPUT_CHARS = 120000; // ~30k tokens safety

function getMistralKey(): string | undefined {
  return process.env.OPENAI_API_KEY;
}

/**
 * Truncate content to stay within context limits.
 */
function truncateContent(content: string): string {
  if (content.length <= MAX_INPUT_CHARS) return content;
  return content.slice(0, MAX_INPUT_CHARS) + '\n\n[... document tronqué ...]';
}

const SYSTEM_PROMPT = `Tu es un assistant qui extrait des données structurées d'un document "Sales Playbook" (Notion export markdown ou similaire).
Le document peut être en français ou en anglais. Il décrit un client, des missions (Appel, Email), un ICP/ciblage, des scripts téléphoniques, des objections, et une séquence d'emails.

Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni texte autour. Utilise null pour les champs ou sections absents.

Structure attendue (JSON):
{
  "client": {
    "name": "string (obligatoire si client trouvé)",
    "website": "string | null (ex: upikajob.com)",
    "sector": "string | null (ex: SIRH / SaaS / IA)",
    "industry": "string | null",
    "description": "string | null (forces/faiblesses, résumé)",
    "email": "string | null",
    "phone": "string | null"
  } | null,
  "missions": [
    { "name": "string", "channel": "CALL" | "EMAIL" | "LINKEDIN", "objective": "string | null" }
  ],
  "campaign": {
    "icp": "string (profil idéal: postes, secteurs, taille, zone)",
    "postesCibles": ["string"],
    "secteurs": ["string"],
    "taille": "string | null (ex: 500-2000 collab.)",
    "zone": "string | null (ex: France)",
    "pitch": "string | null"
  } | null,
  "script": {
    "sections": [ { "title": "string", "content": "string" } ],
    "objections": ["string"],
    "intro": "string | null (script d'intro / premier contact)",
    "discovery": "string | null (questions découverte)",
    "objection": "string | null (réponses aux objections, peut agréger la liste objections)",
    "closing": "string | null (prise de RDV / closing)"
  } | null,
  "emailTemplates": [
    { "name": "string", "subject": "string", "bodyHtml": "string", "bodyText": "string | null", "delayLabel": "string | null (ex: J+1, J+3)", "order": number }
  ],
  "valueProposition": "string | null (pitch + proposition de valeur, stocké comme note client)",
  "unknownSections": ["string (titres des sections non reconnues)"]
}

Règles:
- Si le playbook mentionne "Call + Email" ou "Appel" et "Email", crée 2 entrées dans missions: une avec channel "CALL", une avec "EMAIL".
- Agrége les scripts d'appel (Appel 1, Appel 2, etc.) dans script.sections ou mappe intro/discovery/objection/closing si identifiable.
- Les objections doivent apparaître dans script.objections ET peuvent être concaténées dans script.objection.
- emailTemplates: extraire sujet et corps pour chaque email de la séquence (J+1, J+3, J+6, J+10 etc.); order = 1, 2, 3, 4.
- Ne invente pas de données: si une section manque, mets null ou tableau vide.`;

/**
 * Parse a playbook markdown string into structured ParsedPlaybook using Mistral.
 */
export async function parsePlaybook(content: string): Promise<ParsedPlaybook> {
  const apiKey = getMistralKey();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY non configurée');
  }

  const truncated = truncateContent(content);
  const userPrompt = `Extrais les données du playbook suivant:\n\n${truncated}`;

  const response = await fetch(MISTRAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Mistral API error: ${response.status} ${err}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') {
    throw new Error('Réponse Mistral invalide');
  }

  const raw = stripJsonMarkdown(text);
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  return normalizeParsedPlaybook(parsed);
}

/** Strip optional markdown code fence around JSON. */
function stripJsonMarkdown(s: string): string {
  const t = s.trim();
  if (t.startsWith('```')) {
    const end = t.indexOf('```', 3);
    return end > 0 ? t.slice(3, end).replace(/^json\s*\n?/i, '').trim() : t.replace(/^```\w*\n?/i, '').trim();
  }
  return t;
}

/**
 * Normalize and validate the AI output into ParsedPlaybook shape.
 */
function normalizeParsedPlaybook(raw: Record<string, unknown>): ParsedPlaybook {
  const client = raw.client && typeof raw.client === 'object'
    ? {
        name: String((raw.client as Record<string, unknown>).name ?? ''),
        website: nullableString((raw.client as Record<string, unknown>).website),
        sector: nullableString((raw.client as Record<string, unknown>).sector),
        industry: nullableString((raw.client as Record<string, unknown>).industry),
        description: nullableString((raw.client as Record<string, unknown>).description),
        email: nullableString((raw.client as Record<string, unknown>).email),
        phone: nullableString((raw.client as Record<string, unknown>).phone),
      }
    : null;

  const missions = Array.isArray(raw.missions)
    ? (raw.missions as unknown[]).map((m: unknown) => {
        const o = m as Record<string, unknown>;
        const ch = String(o.channel ?? 'CALL').toUpperCase();
        const channel = ch === 'EMAIL' ? 'EMAIL' : ch === 'LINKEDIN' ? 'LINKEDIN' : 'CALL';
        return {
          name: String(o.name ?? ''),
          channel,
          objective: nullableString(o.objective),
        };
      })
    : [];

  const campaign = raw.campaign && typeof raw.campaign === 'object'
    ? {
        icp: String((raw.campaign as Record<string, unknown>).icp ?? ''),
        postesCibles: arrayOfStrings((raw.campaign as Record<string, unknown>).postesCibles),
        secteurs: arrayOfStrings((raw.campaign as Record<string, unknown>).secteurs),
        taille: nullableString((raw.campaign as Record<string, unknown>).taille),
        zone: nullableString((raw.campaign as Record<string, unknown>).zone),
        pitch: nullableString((raw.campaign as Record<string, unknown>).pitch),
      }
    : null;

  const script = raw.script && typeof raw.script === 'object'
    ? {
        sections: arrayOfScriptSections((raw.script as Record<string, unknown>).sections),
        objections: arrayOfStrings((raw.script as Record<string, unknown>).objections),
        fullScript: nullableString((raw.script as Record<string, unknown>).fullScript),
        intro: nullableString((raw.script as Record<string, unknown>).intro),
        discovery: nullableString((raw.script as Record<string, unknown>).discovery),
        objection: nullableString((raw.script as Record<string, unknown>).objection),
        closing: nullableString((raw.script as Record<string, unknown>).closing),
      }
    : null;

  const emailTemplates = Array.isArray(raw.emailTemplates)
    ? (raw.emailTemplates as unknown[]).map((e: unknown, i: number) => {
        const o = e as Record<string, unknown>;
        return {
          name: String(o.name ?? `Email ${i + 1}`),
          subject: String(o.subject ?? ''),
          bodyHtml: String(o.bodyHtml ?? ''),
          bodyText: nullableString(o.bodyText),
          delayLabel: nullableString(o.delayLabel),
          order: typeof o.order === 'number' ? o.order : i + 1,
        };
      })
    : [];

  const valueProposition = nullableString(raw.valueProposition);
  const unknownSections = arrayOfStrings(raw.unknownSections);

  return {
    client,
    missions,
    campaign,
    script,
    emailTemplates,
    valueProposition,
    unknownSections,
    sourceFileName: null,
  };
}

function nullableString(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v);
}

function arrayOfStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

function arrayOfScriptSections(v: unknown): { title?: string; content: string }[] {
  if (!Array.isArray(v)) return [];
  return v.map((x: unknown) => {
    const o = x as Record<string, unknown>;
    return {
      title: nullableString(o.title) ?? undefined,
      content: String(o.content ?? ''),
    };
  });
}

export function isPlaybookParsingAvailable(): boolean {
  return !!getMistralKey();
}
