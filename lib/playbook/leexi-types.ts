// ============================================
// SALES PLAYBOOK TYPES (from Leexi Recap)
// Shared across API route, service, and UI
// ============================================

export interface PlaybookEmailStep {
  subject: string;
  body: string;
}

export interface PlaybookSignal {
  type: 'positive' | 'warning' | 'neutral';
  text: string;
}

export interface PlaybookMissionParams {
  channel: 'CALL' | 'EMAIL' | 'LINKEDIN' | '';
  working_days_per_month: number;
  duration_months: number;
  rdv_target_per_month: number;
  start_date: string;
}

export interface PlaybookObjectionHandling {
  objection: string;
  response: string;
}

export interface PlaybookContact {
  name: string;
  role: string;
  email: string;
  phone: string;
}

export interface Playbook {
  company_name: string;
  website: string;
  sector: string;
  /** Who the client sells to, in one or two sentences (the form's « Profil client idéal »). */
  icp_description: string;
  /** 2–3 sentence pitch an SDR says on the phone. */
  pitch: string;
  target_roles: string[];
  target_sectors: string[];
  company_size_min: number;
  company_size_max: number;
  geography: string[];
  value_proposition: string;
  competitors: string[];
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  persona_objectives: string[];
  persona_pains: string[];
  objections: string[];
  objection_handling: PlaybookObjectionHandling[];
  differentiators: string[];
  phone_script: string;
  /** [qualification, prise de RDV] */
  call_scripts: string[];
  email_sequence: PlaybookEmailStep[];
  mission_params: PlaybookMissionParams;
  signals_from_call: PlaybookSignal[];
  /** People on the client's side (never the agency's own team). */
  key_contacts: PlaybookContact[];
  /** Commitments and next steps agreed on the call. */
  next_steps: string[];
}

export function emptyPlaybook(): Playbook {
  return {
    company_name: '',
    website: '',
    sector: '',
    icp_description: '',
    pitch: '',
    target_roles: [],
    target_sectors: [],
    company_size_min: 0,
    company_size_max: 0,
    geography: [],
    value_proposition: '',
    competitors: [],
    strengths: [],
    weaknesses: [],
    opportunities: [],
    threats: [],
    persona_objectives: [],
    persona_pains: [],
    objections: [],
    objection_handling: [],
    differentiators: [],
    phone_script: '',
    call_scripts: [],
    email_sequence: [],
    mission_params: {
      channel: '',
      working_days_per_month: 0,
      duration_months: 0,
      rdv_target_per_month: 0,
      start_date: '',
    },
    signals_from_call: [],
    key_contacts: [],
    next_steps: [],
  };
}

export interface NormalizePlaybookOptions {
  /** "YYYY-MM-DD" — start dates before it (minus a week) or a year past it are dropped. */
  today?: string;
  /** The agency's own name, domains and people: never client contacts. */
  agencyName?: string;
  internalDomains?: string[];
  internalNames?: string[];
}

function safeString(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function safeNumber(v: unknown): number {
  if (typeof v === 'number' && !isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (!isNaN(n)) return n;
  }
  return 0;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Text out of whatever the model returned: a string, or an object such as
 * { title, script } / { type, content } — the old normalizer stored those as
 * "[object Object]".
 */
function toText(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join('\n');
  if (v && typeof v === 'object') {
    const values = Object.values(v as Record<string, unknown>).map(toText).filter(Boolean);
    if (values.length === 2 && values[0].length < 80 && !values[0].includes('\n')) {
      return `${values[0]}\n${values[1]}`;
    }
    return values.join('\n\n');
  }
  return '';
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(toText).filter(Boolean);
}

/** The schema's own examples, echoed back by the model instead of real content. */
const PLACEHOLDER = /^(script (de )?(qualification|prise de rdv)\s*(\.\.\.|…)?|\.\.\.|…|n\/a|non (précisé|renseigné|mentionné)|inconnu)$/i;

function isPlaceholder(text: string): boolean {
  return PLACEHOLDER.test(text.trim());
}

/** [Prénom] / [Entreprise] / [Votre nom] → the {{variables}} the email renderer knows. */
const BRACKET_VARIABLES: Array<[RegExp, string]> = [
  [/\[(pr[ée]nom( du (contact|prospect))?|first ?name)\]/gi, '{{firstName}}'],
  [/\[(nom( du (contact|prospect))?|last ?name)\]/gi, '{{lastName}}'],
  [/\[(nom de l'entreprise|entreprise|soci[ée]t[ée]|company)\]/gi, '{{companyName}}'],
  [/\[(votre (pr[ée]nom|nom)|pr[ée]nom (du )?sdr|nom (du )?sdr|signature|exp[ée]diteur)\]/gi, '{{senderName}}'],
  [/\[(poste|fonction)\]/gi, '{{title}}'],
];

export function bracketsToVariables(text: string): string {
  return BRACKET_VARIABLES.reduce((acc, [re, variable]) => acc.replace(re, variable), text);
}

function safeEmailSequence(v: unknown): PlaybookEmailStep[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (!item || typeof item !== 'object') return { subject: '', body: '' };
      const o = item as Record<string, unknown>;
      return {
        subject: bracketsToVariables(safeString(o.subject)),
        body: bracketsToVariables(toText(o.body ?? o.content ?? o.text)),
      };
    })
    .filter((e) => e.subject || e.body);
}

function safeObjectArray<T>(v: unknown, normalizer: (item: unknown) => T): T[] {
  if (!Array.isArray(v)) return [];
  return v.map(normalizer);
}

function normalizeSignal(item: unknown): PlaybookSignal {
  if (typeof item === 'string') return { type: 'neutral', text: item.trim() };
  if (!item || typeof item !== 'object') return { type: 'neutral', text: '' };
  const o = item as Record<string, unknown>;
  const type = safeString(o.type);
  return {
    type: (type === 'positive' || type === 'warning' || type === 'neutral') ? type : 'neutral',
    text: safeString(o.text),
  };
}

function normalizeObjectionHandling(item: unknown): PlaybookObjectionHandling {
  if (typeof item === 'string') return { objection: item.trim(), response: '' };
  if (!item || typeof item !== 'object') return { objection: '', response: '' };
  const o = item as Record<string, unknown>;
  return { objection: toText(o.objection), response: toText(o.response) };
}

function normalizeContact(item: unknown): PlaybookContact {
  if (!item || typeof item !== 'object') return { name: '', role: '', email: '', phone: '' };
  const o = item as Record<string, unknown>;
  const email = safeString(o.email).toLowerCase();
  return {
    name: safeString(o.name),
    role: safeString(o.role),
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : '',
    phone: safeString(o.phone),
  };
}

function normalizeMissionParams(v: unknown, today?: string): PlaybookMissionParams {
  if (!v || typeof v !== 'object') return emptyPlaybook().mission_params;
  const o = v as Record<string, unknown>;
  const ch = safeString(o.channel).toUpperCase();
  return {
    channel: (ch === 'CALL' || ch === 'EMAIL' || ch === 'LINKEDIN') ? ch : '',
    working_days_per_month: clamp(safeNumber(o.working_days_per_month), 0, 23),
    duration_months: clamp(safeNumber(o.duration_months), 0, 36),
    rdv_target_per_month: clamp(safeNumber(o.rdv_target_per_month), 0, 500),
    start_date: plausibleStartDate(safeString(o.start_date), today),
  };
}

/**
 * The model used to invent start dates in 2023–2024 for 2026 clients: keep a
 * date only if it is a real day between a week ago and a year from today.
 */
export function plausibleStartDate(value: string, today?: string): string {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return '';
  if (!today) return day;
  const diff = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return diff >= -7 && diff <= 365 ? day : '';
}

/** "acme.fr" / "www.acme.fr/" → "https://www.acme.fr"; prose or emails → "". */
export function normalizeWebsite(value: string): string {
  const v = value.trim().replace(/\/+$/, '');
  if (!v || /\s|@/.test(v)) return '';
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(withProto);
    return url.hostname.includes('.') ? `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}` : '';
  } catch {
    return '';
  }
}

/** Accents, case and hyphens ignored: "Jean-François" is "Jean Francois". */
function personKey(name: string): string {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isInternalContact(c: PlaybookContact, opts: NormalizePlaybookOptions): boolean {
  const domain = c.email.split('@')[1];
  if (domain && (opts.internalDomains ?? []).some((d) => d.toLowerCase() === domain)) return true;
  const name = personKey(c.name);
  if (name && (opts.internalNames ?? []).some((n) => personKey(n) === name)) return true;
  const agency = opts.agencyName?.toLowerCase();
  return !!agency && `${c.role} ${c.name}`.toLowerCase().includes(agency);
}

/**
 * Normalize raw AI output into a strictly typed Playbook.
 * Missing/invalid fields fall back to safe empty defaults.
 */
/** Call recorders and the agency itself, sometimes returned as « the client ». */
const NOT_A_CLIENT = /^(leexi|gong|modjo|calendly|zoom|google meet|microsoft teams|teams)$/i;

function clientCompanyName(value: string, agencyName?: string): string {
  if (NOT_A_CLIENT.test(value)) return '';
  if (agencyName && value.toLowerCase() === agencyName.toLowerCase()) return '';
  return value;
}

export function normalizePlaybook(raw: unknown, opts: NormalizePlaybookOptions = {}): Playbook {
  if (!raw || typeof raw !== 'object') return emptyPlaybook();
  const o = raw as Record<string, unknown>;
  return {
    company_name: clientCompanyName(safeString(o.company_name), opts.agencyName),
    website: normalizeWebsite(safeString(o.website)),
    sector: safeString(o.sector),
    icp_description: toText(o.icp_description),
    pitch: toText(o.pitch),
    target_roles: safeStringArray(o.target_roles),
    target_sectors: safeStringArray(o.target_sectors),
    company_size_min: Math.max(0, safeNumber(o.company_size_min)),
    company_size_max: Math.max(0, safeNumber(o.company_size_max)),
    geography: safeStringArray(o.geography),
    value_proposition: toText(o.value_proposition),
    competitors: safeStringArray(o.competitors),
    strengths: safeStringArray(o.strengths),
    weaknesses: safeStringArray(o.weaknesses),
    opportunities: safeStringArray(o.opportunities),
    threats: safeStringArray(o.threats),
    persona_objectives: safeStringArray(o.persona_objectives),
    persona_pains: safeStringArray(o.persona_pains),
    objections: safeStringArray(o.objections),
    objection_handling: safeObjectArray(o.objection_handling, normalizeObjectionHandling).filter((h) => h.objection),
    differentiators: safeStringArray(o.differentiators),
    phone_script: bracketsToVariables(toText(o.phone_script)),
    call_scripts: safeStringArray(o.call_scripts).filter((s) => !isPlaceholder(s)).map(bracketsToVariables),
    email_sequence: safeEmailSequence(o.email_sequence),
    mission_params: normalizeMissionParams(o.mission_params, opts.today),
    signals_from_call: safeObjectArray(o.signals_from_call, normalizeSignal).filter((s) => s.text),
    key_contacts: safeObjectArray(o.key_contacts, normalizeContact)
      .filter((c) => c.name || c.email)
      .filter((c) => !isInternalContact(c, opts)),
    next_steps: safeStringArray(o.next_steps),
  };
}
