/**
 * Pure helpers for « Nouveau client » (POST /api/clients) — no database,
 * npm run test:client-onboarding.
 */

export interface ScriptSections {
    intro?: string;
    discovery?: string;
    objection?: string;
    closing?: string;
}

/**
 * The campaign script in the delimiter format every script reader parses
 * (ScriptBlockEditor, /api/actions/next): « --- Introduction --- » …
 */
export function buildCampaignScript(scripts: ScriptSections | Record<string, unknown> | undefined | null): string {
    if (!scripts || typeof scripts !== "object") return "";
    const s = scripts as Record<string, unknown>;
    if (typeof s.base === "string" && s.base.trim()) return s.base;
    return [
        ["Introduction", s.intro],
        ["Decouverte", s.discovery],
        ["Objections", s.objection],
        ["Closing", s.closing],
    ]
        .map(([label, value]) => (typeof value === "string" && value.trim() ? `--- ${label} ---\n${value.trim()}` : null))
        .filter((v): v is string => Boolean(v))
        .join("\n\n");
}

/** « Objection » → réponse, one block per objection, for the Objections script section. */
export function formatObjectionHandling(items: Array<{ objection: string; response: string }>): string {
    return items
        .filter((i) => i.objection.trim())
        .map((i) => `« ${i.objection.trim().replace(/^[«"“]\s*|\s*[»"”]$/g, "")} »${i.response.trim() ? `\n→ ${i.response.trim()}` : ""}`)
        .join("\n\n");
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const LOOKS_LIKE_HTML = /<\/?(p|br|div|ul|ol|li|strong|em|a|span|table)\b/i;

/** AI emails are plain text: blank lines → paragraphs, single newlines → <br>. HTML is kept as is. */
export function plainTextToHtml(text: string): string {
    const t = text.replace(/\r\n/g, "\n").trim();
    if (!t) return "";
    if (LOOKS_LIKE_HTML.test(t)) return t;
    return t
        .split(/\n{2,}/)
        .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
        .join("");
}

/** {{variable}} names used in a template, without duplicates. */
export function templateVariables(...texts: string[]): string[] {
    const found = new Set<string>();
    for (const t of texts) {
        for (const m of t.matchAll(/\{\{\s*([\w.]+)\s*(?:\|[^}]*)?\}\}/g)) found.add(m[1]);
    }
    return [...found];
}

/** Days of the generated sequence: J1, J+3, J+6, J+10. */
const SEQUENCE_DAYS = [1, 3, 6, 10];

export function sequenceEmailName(index: number, clientName: string): string {
    const day = SEQUENCE_DAYS[index];
    const label = day === undefined ? `Email ${index + 1}` : day === 1 ? "J1" : `J+${day}`;
    return `${clientName} · ${label}`;
}

/** Calendar months, clamped to the last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
    const d = new Date(date.getTime());
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
    return d;
}

export function defaultMissionName(clientName: string): string {
    return `Mission ${clientName.trim()}`;
}
