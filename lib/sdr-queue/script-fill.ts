// ============================================
// Script placeholders — « Bonjour {prénom}, je suis [votre prénom] de … ».
// Splits a script into text and placeholder pieces and fills those it can from
// the prospect on screen. Pure (unit-tested): the reader only renders pieces.
// ============================================

export interface ScriptVars {
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    /** The SDR's own first name (« je suis [votre prénom] »). */
    me?: string | null;
}

export type ScriptPiece =
    | { kind: "text"; text: string }
    /** A placeholder: `value` when filled, null when nothing on file matches. */
    | { kind: "field"; raw: string; value: string | null };

const TOKEN = /\{\{\s*([^{}]{1,40}?)\s*\}\}|\{([^{}\n]{1,40})\}|\[([^[\]\n]{1,40})\]/g;

function norm(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .trim();
}

/** Which variable a placeholder asks for, or null when it is not one we know. */
export function placeholderKey(inner: string): keyof ScriptVars | null {
    const n = norm(inner);
    if (/\b(votre|mon|ton) (prenom|nom)\b|\bsdr\b|\bcommercial\b|\bconseiller\b/.test(n)) return "me";
    if (/\b(prenom|first ?name)\b/.test(n)) return "firstName";
    if (/\b(societe|entreprise|company|structure|enseigne)\b/.test(n)) return "company";
    if (/\b(nom|last ?name)\b/.test(n)) return "lastName";
    return null;
}

export function fillScript(text: string, vars: ScriptVars): ScriptPiece[] {
    const pieces: ScriptPiece[] = [];
    let last = 0;
    for (const m of text.matchAll(TOKEN)) {
        const inner = (m[1] ?? m[2] ?? m[3] ?? "").trim();
        const key = placeholderKey(inner);
        // A bracket that is not a placeholder ("[pause]", "[si oui]") stays plain text.
        if (!key) continue;
        const at = m.index ?? 0;
        if (at > last) pieces.push({ kind: "text", text: text.slice(last, at) });
        const value = vars[key]?.trim() || null;
        pieces.push({ kind: "field", raw: m[0], value });
        last = at + m[0].length;
    }
    if (last < text.length) pieces.push({ kind: "text", text: text.slice(last) });
    return pieces;
}

/** « 1. Introduction / Accroche » → « Introduction » (for the jump bar). */
export function shortSectionTitle(title: string): string {
    const t = title.replace(/^\s*\d+[.)]\s*/, "").split(/\s+\/\s+|\s+[–—-]\s+/)[0].trim();
    return t.length > 26 ? `${t.slice(0, 25)}…` : t;
}
