// ============================================
// SALES PLAYBOOK GENERATOR (OpenAI, JSON mode)
// Reusable, framework-agnostic service function
// ============================================

import { callJsonModel } from '@/lib/ai/json-call';
import { type Playbook, normalizePlaybook } from './leexi-types';

const MODEL = 'gpt-4.1-mini';
const MAX_INPUT_CHARS = 80_000;

export interface PlaybookContext {
  /** The agency running the prospecting (the brand name). */
  agencyName: string;
  /** "YYYY-MM-DD", Paris time. */
  today: string;
  internalDomains?: string[];
  /** Our own people on the call (Leexi participating users), when known: named in the prompt. */
  internalNames?: string[];
  /** Every CRM staff name: only used to drop them from the extracted contacts. */
  staffNames?: string[];
}

function systemPrompt(ctx: PlaybookContext): string {
  return `Tu es stratège commercial B2B chez ${ctx.agencyName}, une agence française de prospection externalisée (SDR, prise de rendez-vous).
On te donne le compte rendu d'un appel entre ${ctx.agencyName} et un client qui lui confie une mission de prospection.
Le « client » est l'entreprise qui achète la mission ; il vend ses propres produits ou services à ses prospects.
Le playbook décrit l'offre du CLIENT et la cible que ${ctx.agencyName} va prospecter pour lui.
Réponds uniquement par un objet JSON valide, sans markdown ni texte autour. Tout le contenu est en français.`;
}

function buildUserPrompt(recapText: string, ctx: PlaybookContext): string {
  const truncated =
    recapText.length > MAX_INPUT_CHARS
      ? recapText.slice(0, MAX_INPUT_CHARS) + '\n\n[... texte tronqué ...]'
      : recapText;
  const team = ctx.internalNames?.length ? ` (${ctx.internalNames.join(', ')})` : '';

  return `Date du jour : ${ctx.today}.

Compte rendu de l'appel :
"""
${truncated}
"""

Remplis le schéma JSON ci-dessous à partir de ce compte rendu.

Règles :
- company_name : le nom de l'entreprise cliente, jamais « ${ctx.agencyName} », jamais l'outil qui a enregistré ou résumé l'appel (Leexi, Gong, Modjo, Calendly…). Si un « Deal CRM » est indiqué, son nom commence en général par celui de l'entreprise cliente.
- key_contacts : uniquement les personnes de l'entreprise cliente. N'y mets jamais l'équipe ${ctx.agencyName}${team}. Email et téléphone seulement s'ils figurent dans le texte, sinon "".
- website : seulement s'il figure dans le texte ou se déduit d'une adresse email professionnelle du client, sinon "".
- N'invente aucune coordonnée, aucun chiffre, aucune date. Champ texte inconnu : "". Nombre inconnu : 0.
- mission_params.start_date : format AAAA-MM-JJ, seulement si une date ou une période de démarrage est dite (« lundi prochain », « début novembre »…), calculée à partir de la date du jour ; sinon "".
- mission_params : rdv_target_per_month, duration_months et working_days_per_month seulement s'ils sont dits ou clairement déductibles ; channel = CALL, EMAIL ou LINKEDIN selon le canal principal discuté.
- icp_description : la cible du client en une ou deux phrases (qui, quelle taille, où, quel besoin).
- pitch : 2 à 3 phrases qu'un SDR peut dire au téléphone pour présenter l'offre du client.
- phone_script : l'accroche des 30 premières secondes d'un appel à froid.
- call_scripts : exactement 2 chaînes de caractères (pas des objets) : [script de qualification, script de prise de rendez-vous], complets et prêts à lire.
- email_sequence : 4 emails (J1, J+3, J+6, J+10). Corps en texte brut avec des sauts de ligne. Variables autorisées : {{firstName}}, {{companyName}}, {{title}}, {{senderName}}. Pas de crochets.
- objection_handling : les objections probables des prospects du client, chacune avec une réponse courte.
- signals_from_call : signaux détectés dans l'appel (positive : budget validé, décideur présent, urgence… ; warning : prix, concurrent en place, délai…).
- next_steps : les engagements et prochaines étapes convenus pendant l'appel.
- Ne recopie jamais les exemples ou les noms de champs comme valeurs.

Schéma :
{
  "company_name": "",
  "website": "",
  "sector": "",
  "icp_description": "",
  "pitch": "",
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
  "call_scripts": ["", ""],
  "email_sequence": [{ "subject": "", "body": "" }],
  "mission_params": {
    "channel": "",
    "working_days_per_month": 0,
    "duration_months": 0,
    "rdv_target_per_month": 0,
    "start_date": ""
  },
  "signals_from_call": [{ "type": "positive", "text": "" }],
  "key_contacts": [{ "name": "", "role": "", "email": "", "phone": "" }],
  "next_steps": []
}`;
}

/**
 * Generate a structured Sales Playbook from a meeting recap (Leexi call,
 * pasted notes, email thread). Throws AiCallError (lib/ai/json-call) with a
 * code the route turns into an actionable French message.
 */
export async function generateSalesPlaybookFromRecap(
  recapText: string,
  ctx: PlaybookContext,
): Promise<Playbook> {
  if (!recapText || recapText.trim().length < 20) {
    throw new Error('Le récapitulatif est trop court pour être analysé');
  }

  const { parsed } = await callJsonModel({
    system: systemPrompt(ctx),
    user: buildUserPrompt(recapText, ctx),
    model: MODEL,
    temperature: 0.3,
    maxTokens: 8000,
    timeoutMs: 120_000,
  });

  return normalizePlaybook(parsed, {
    today: ctx.today,
    agencyName: ctx.agencyName,
    internalDomains: ctx.internalDomains,
    internalNames: [...(ctx.internalNames ?? []), ...(ctx.staffNames ?? [])],
  });
}
