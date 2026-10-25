// ============================================
// TEMPLATE BODY HELPERS (client-side)
// bodyHtml is what quick-send injects into the email, so plain text written in
// "Texte" mode is converted to <p>/<br> on save, and simple HTML (only p/br)
// opens back as plain text.
// ============================================

import { findUnknownVariables, renderTemplateString } from "@/lib/email/template-render";

export function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeHtml(text: string): string {
    return text
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");
}

/** Plain text → email HTML: blank lines split paragraphs, single newlines become <br>. */
export function textToHtml(text: string): string {
    const normalized = text.replace(/\r\n/g, "\n").trim();
    if (!normalized) return "";
    return normalized
        .split(/\n{2,}/)
        .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
        .join("\n");
}

/** True when the HTML only uses <p> and <br> (or no tags at all): safe to edit as text. */
export function isSimpleHtml(html: string): boolean {
    const tags = html.match(/<\/?[a-z][^>]*>/gi) ?? [];
    return tags.every((tag) => /^<\/?(p|br)\s*\/?>$/i.test(tag));
}

/** Simple HTML → plain text (inverse of textToHtml). */
export function htmlToText(html: string): string {
    return unescapeHtml(
        html
            .replace(/\r\n/g, "\n")
            .replace(/<\/p>\s*<p>/gi, "\n\n")
            .replace(/<br\s*\/?>\s*\n?/gi, "\n")
            .replace(/<\/?p>/gi, ""),
    ).trim();
}

/** Any HTML → readable text (drops formatting). Used for snippets and bodyText. */
export function stripHtml(html: string): string {
    return unescapeHtml(
        html
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, ""),
    )
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function snippet(html: string, max = 180): string {
    const text = stripHtml(html).replace(/\s+/g, " ");
    return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Variables used in a text that the sender will not fill (they become empty).
 *  Same rule as the sender: lib/email/template-render.ts. */
export function unknownVariables(text: string): string[] {
    return findUnknownVariables(text);
}

export const PREVIEW_SAMPLE: Record<string, string> = {
    firstName: "Jean",
    lastName: "Dupont",
    fullName: "Jean Dupont",
    title: "Directeur commercial",
    email: "jean.dupont@exemple.fr",
    phone: "+33 6 12 34 56 78",
    linkedin: "https://linkedin.com/in/jeandupont",
    company: "Acme SAS",
    companyName: "Acme SAS",
    companyPhone: "+33 1 23 45 67 89",
    industry: "Logiciels",
    website: "https://acme.fr",
    country: "France",
    companySize: "50-200",
    senderName: "Camille Martin",
    senderFirstName: "Camille",
    senderEmail: "camille.martin@exemple.fr",
    senderPhone: "+33 6 98 76 54 32",
    missionName: "Prospection PME",
    clientName: "Client exemple",
};

function dateVariables(): Record<string, string> {
    const now = new Date();
    return {
        currentDate: now.toLocaleDateString("fr-FR"),
        currentDay: now.toLocaleDateString("fr-FR", { weekday: "long" }),
        currentMonth: now.toLocaleDateString("fr-FR", { month: "long" }),
        currentYear: String(now.getFullYear()),
    };
}

/** Same renderer as the sender (aliases, {{x|fallback}}); unknown variables become empty. */
export function substituteSample(text: string): string {
    return renderTemplateString(text, { ...PREVIEW_SAMPLE, ...dateVariables() });
}

/** Wraps an email body in a minimal document for a sandboxed <iframe srcDoc>. */
export function previewDocument(bodyHtml: string): string {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:20px 22px;font:14px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:rgb(31 41 55);background:white;word-wrap:break-word}
p{margin:0 0 12px}a{color:rgb(37 99 235)}img{max-width:100%;height:auto}
</style></head><body>${bodyHtml || '<p style="color:rgb(156 163 175)">Aucun contenu.</p>'}</body></html>`;
}
