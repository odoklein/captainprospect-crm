import { SUPPORTED_TEMPLATE_VARIABLES } from './constants';

// ============================================
// TEMPLATE RENDERING (pure, no DB: safe in client components)
// lib/email/services/template-variables.ts adds the DB-backed variable map.
// The ONE renderer for {{variable}} placeholders — used by quick-send, the
// sequence engine, sequence previews and test sends.
//
// Syntax
//   {{firstName}}            → value, or empty
//   {{ firstName }}          → spaces tolerated, key is case-insensitive
//   {{firstName|Madame}}     → fallback when the value is empty
//   {{custom.secteur}}       → contact/company CSV custom fields
// French aliases ({{prenom}}, {{entreprise}}, …) resolve to the same keys.
// An empty value also swallows the single space before it, so
// "Bonjour {{firstName}}," never renders as "Bonjour ,".
// ============================================

/** Plain data shape accepted by {@link buildVariablesFromData} (no DB access). */
export interface VariableData {
    contact?: {
        firstName?: string | null;
        lastName?: string | null;
        title?: string | null;
        email?: string | null;
        phone?: string | null;
        linkedin?: string | null;
        customData?: unknown;
    } | null;
    company?: {
        name?: string | null;
        industry?: string | null;
        website?: string | null;
        country?: string | null;
        size?: string | null;
        phone?: string | null;
        customData?: unknown;
    } | null;
    sender?: { name?: string | null; email?: string | null; phone?: string | null; title?: string | null } | null;
    mailbox?: { email?: string | null; displayName?: string | null } | null;
    mission?: { name?: string | null; clientName?: string | null } | null;
    custom?: Record<string, string> | null;
    now?: Date;
    timezone?: string;
}

const TOKEN_RE = /( ?)\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g;

/** French / legacy spellings → canonical key (lowercased lookup). */
const ALIASES: Record<string, string> = {
    prenom: 'firstName',
    'prénom': 'firstName',
    contactfirstname: 'firstName',
    nom: 'lastName',
    contactlastname: 'lastName',
    nomcomplet: 'fullName',
    contactname: 'fullName',
    poste: 'title',
    fonction: 'title',
    telephone: 'phone',
    'téléphone': 'phone',
    entreprise: 'companyName',
    societe: 'companyName',
    'société': 'companyName',
    nom_entreprise: 'companyName',
    secteur: 'industry',
    siteweb: 'website',
    site: 'website',
    pays: 'country',
    sdrname: 'senderName',
    expediteur: 'senderName',
    mission: 'missionName',
    client: 'clientName',
    date: 'currentDate',
};

/** Extra variables the sequence editor offers on top of SUPPORTED_TEMPLATE_VARIABLES. */
export const EXTRA_TEMPLATE_VARIABLES = [
    { name: 'senderName', description: "Nom de l'expéditeur", category: 'sender' },
    { name: 'senderFirstName', description: "Prénom de l'expéditeur", category: 'sender' },
    { name: 'senderEmail', description: "Email de l'expéditeur", category: 'sender' },
    { name: 'senderPhone', description: "Téléphone de l'expéditeur", category: 'sender' },
    { name: 'senderTitle', description: "Poste de l'expéditeur", category: 'sender' },
    { name: 'missionName', description: 'Nom de la mission', category: 'mission' },
    { name: 'clientName', description: 'Nom du client', category: 'mission' },
] as const;

function str(v: unknown): string {
    if (v === null || v === undefined) return '';
    return String(v).trim();
}

function addCustom(target: Record<string, string>, data: unknown) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (typeof value === 'string' || typeof value === 'number') {
            target[`custom.${key}`] = String(value);
        }
    }
}

function datePart(now: Date, timezone: string, opts: Intl.DateTimeFormatOptions): string {
    try {
        return now.toLocaleDateString('fr-FR', { ...opts, timeZone: timezone });
    } catch {
        return now.toLocaleDateString('fr-FR', opts);
    }
}

/** Build the variable map from already-loaded data (pure, no DB). */
export function buildVariablesFromData(data: VariableData): Record<string, string> {
    const v: Record<string, string> = {};
    const c = data.contact;
    const co = data.company;

    if (c) {
        v.firstName = str(c.firstName);
        v.lastName = str(c.lastName);
        v.fullName = [str(c.firstName), str(c.lastName)].filter(Boolean).join(' ');
        v.title = str(c.title);
        v.email = str(c.email);
        v.phone = str(c.phone);
        v.linkedin = str(c.linkedin);
    }
    if (co) {
        v.company = str(co.name);
        v.companyName = str(co.name);
        v.industry = str(co.industry);
        v.website = str(co.website);
        v.country = str(co.country);
        v.companySize = str(co.size);
        v.companyPhone = str(co.phone);
        addCustom(v, co.customData);
    }
    if (c) addCustom(v, c.customData); // contact fields win over company ones

    const senderName = str(data.sender?.name) || str(data.mailbox?.displayName);
    v.senderName = senderName;
    v.senderFirstName = senderName.split(/\s+/)[0] || '';
    v.senderLastName = senderName.split(/\s+/).slice(1).join(' ');
    v.senderEmail = str(data.mailbox?.email) || str(data.sender?.email);
    v.senderPhone = str(data.sender?.phone);
    // No job title on User today: empty unless a caller provides one (use {{senderTitle|…}}).
    v.senderTitle = str(data.sender?.title);
    v.missionName = str(data.mission?.name);
    v.clientName = str(data.mission?.clientName);

    const now = data.now ?? new Date();
    const tz = data.timezone || 'Europe/Paris';
    v.currentDate = datePart(now, tz, { day: '2-digit', month: '2-digit', year: 'numeric' });
    v.currentDay = datePart(now, tz, { weekday: 'long' });
    v.currentMonth = datePart(now, tz, { month: 'long' });
    v.currentYear = datePart(now, tz, { year: 'numeric' });

    if (data.custom) {
        for (const [key, value] of Object.entries(data.custom)) {
            if (key.startsWith('__')) continue; // engine bookkeeping, never a variable
            if (typeof value === 'string' || typeof value === 'number') v[key] = String(value);
        }
    }
    return v;
}

export function lookup(variables: Record<string, string>, rawName: string): string | undefined {
    if (rawName in variables) return variables[rawName];
    const lower = rawName.toLowerCase();
    const alias = ALIASES[lower];
    if (alias && alias in variables) return variables[alias];
    for (const key of Object.keys(variables)) {
        if (key.toLowerCase() === lower) return variables[key];
    }
    return undefined;
}

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Render one string. `html: true` escapes the substituted values (the template
 * itself is trusted). Unknown variables render as their fallback or empty.
 */
export function renderTemplateString(
    text: string,
    variables: Record<string, string>,
    options: { html?: boolean } = {},
): string {
    if (!text) return text;
    return text.replace(TOKEN_RE, (_match, space: string, name: string, fallback: string | undefined) => {
        const raw = (lookup(variables, name) ?? '').trim();
        const value = raw || (fallback ?? '').trim();
        if (!value) return '';
        return space + (options.html ? escapeHtml(value) : value);
    });
}

/** Back-compat name used by older callers. */
export function substituteVariables(text: string, variables: Record<string, string>): string {
    return renderTemplateString(text, variables);
}

// Extract all variable names from text
export function extractVariables(text: string): string[] {
    const variables: string[] = [];
    if (!text) return variables;
    for (const match of text.matchAll(TOKEN_RE)) {
        if (!variables.includes(match[2])) variables.push(match[2]);
    }
    return variables;
}

/** Variables in `text` that the renderer does not know (typos like {{prenon}}). */
export function findUnknownVariables(text: string): string[] {
    const known = new Set<string>([
        ...SUPPORTED_TEMPLATE_VARIABLES.map((v) => v.name.toLowerCase()),
        ...EXTRA_TEMPLATE_VARIABLES.map((v) => v.name.toLowerCase()),
        'senderlastname', 'companyphone',
        ...Object.keys(ALIASES),
    ]);
    return extractVariables(text).filter((name) => !name.startsWith('custom.') && !known.has(name.toLowerCase()));
}

// ============================================
// TEXT ⇄ HTML
// ============================================

const HTML_TAG_RE = /<\s*(p|div|br|table|ul|ol|li|h[1-6]|span|a|strong|b|em|i|img)\b[^>]*>/i;

export function looksLikeHtml(text: string): boolean {
    return HTML_TAG_RE.test(text || '');
}

function linkify(escaped: string): string {
    return escaped.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]]/g, (url) => `<a href="${url}">${url}</a>`);
}

/**
 * Plain text → email HTML: blank lines become paragraphs, single newlines <br>,
 * bare URLs become links. HTML input is returned unchanged. Variables
 * ({{...}}) survive untouched so the result can still be rendered.
 */
export function textToHtml(text: string): string {
    if (!text) return '';
    if (looksLikeHtml(text)) return text;
    const normalized = text.replace(/\r\n?/g, '\n').trim();
    return normalized
        .split(/\n{2,}/)
        .map((para) => `<p style="margin:0 0 12px 0">${linkify(escapeHtml(para)).replace(/\n/g, '<br>')}</p>`)
        .join('');
}

/** HTML → readable plain text (for bodyText and for editing legacy HTML bodies). */
export function htmlToText(html: string): string {
    if (!html) return '';
    if (!looksLikeHtml(html)) return html;
    return html
        .replace(/\r\n?/g, '\n')
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\s*\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, '\n\n')
        .replace(/<\s*li[^>]*>/gi, '• ')
        .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (_m, href: string, label: string) =>
            label.replace(/<[^>]*>/g, '').trim() === href ? href : `${label} (${href})`,
        )
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Render a full email (subject + body) from a stored step/template.
 * `body` may be plain text or HTML; the HTML version always keeps line breaks.
 */
export function renderEmailContent(
    input: { subject: string; bodyHtml?: string | null; bodyText?: string | null },
    variables: Record<string, string>,
): { subject: string; bodyHtml: string; bodyText: string } {
    const source = input.bodyText && !looksLikeHtml(input.bodyText) ? input.bodyText : input.bodyHtml || input.bodyText || '';
    const html = textToHtml(source);
    const bodyHtml = renderTemplateString(html, variables, { html: true });
    const bodyText = renderTemplateString(looksLikeHtml(source) ? htmlToText(source) : source, variables);
    return {
        subject: renderTemplateString(input.subject || '', variables).replace(/\s+/g, ' ').trim(),
        bodyHtml,
        bodyText,
    };
}

// Get a preview with variable highlights
export function getVariablePreview(text: string, variables: Record<string, string>): string {
    return text.replace(/\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g, (match, varName: string, fallback?: string) => {
        const value = lookup(variables, varName) || (fallback ?? '').trim();
        if (value) {
            return `<span class="bg-success-soft text-success-ink px-1 rounded">${escapeHtml(value)}</span>`;
        }
        return `<span class="bg-warning-soft text-warning-ink px-1 rounded">${escapeHtml(match)}</span>`;
    });
}

// Re-export for documentation / backward compatibility
export const SUPPORTED_VARIABLES = SUPPORTED_TEMPLATE_VARIABLES;
