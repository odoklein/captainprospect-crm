/**
 * Pure helpers of the assistant memory (Captain AI v4): how a memory is
 * normalised and keyed so the same fact is stored once per scope, and which
 * contents are refused outright (credentials, bank details, raw numbers).
 */

import { createHash } from "node:crypto";

export type MemoryScope = "AGENCY" | "FOLDER" | "USER";

const LIGATURES: Array<[RegExp, string]> = [
    [/œ/g, "oe"],
    [/æ/g, "ae"],
    [/ß/g, "ss"],
];

/** Lowercase, accents and punctuation stripped, whitespace collapsed. */
export function normalizeMemoryContent(text: string): string {
    let s = text.toLowerCase();
    for (const [re, repl] of LIGATURES) s = s.replace(re, repl);
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** sha1 of the normalised content: "Préfère les CR courts." and "prefere les cr courts" share it. */
export function memoryContentKey(text: string): string {
    return createHash("sha1").update(normalizeMemoryContent(text)).digest("hex");
}

/**
 * "SCOPE:folderId|userId|" — AGENCY ignores both ids, FOLDER needs a folder,
 * USER needs a user. The unique key (scopeKey, contentKey) hangs on it.
 */
export function memoryScopeKey(scope: MemoryScope, folderId?: string | null, userId?: string | null): string {
    switch (scope) {
        case "AGENCY":
            return "AGENCY:||";
        case "FOLDER":
            if (!folderId) throw new Error("Un souvenir de dossier doit indiquer son dossier.");
            return `FOLDER:${folderId}||`;
        case "USER":
            if (!userId) throw new Error("Un souvenir utilisateur doit indiquer son utilisateur.");
            return `USER:|${userId}|`;
        default:
            throw new Error(`Périmètre de mémoire inconnu : ${String(scope)}`);
    }
}

const FORBIDDEN: Array<{ re: RegExp; reason: string }> = [
    { re: /\b(mots? de passe|password|passwd|mdp)\b/i, reason: "mot de passe" },
    { re: /\b(api[ _-]?keys?|cl[ée]s? ?api|private[ _-]?keys?|secret[ _-]?keys?)\b/i, reason: "clé d'API ou secret" },
    { re: /\b(secret|token|bearer|jeton)\b\s*[:=]/i, reason: "identifiant secret" },
    { re: /\b(sk|pk|rk|xox[abp])[-_](live|test|proj)?[-_]?[A-Za-z0-9]{12,}/, reason: "clé secrète" },
    { re: /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){3,7}(?:[ -]?[A-Z0-9]{1,4})?\b/, reason: "IBAN" },
    { re: /\b(?:\d[ -]?){15}\d\b/, reason: "numéro de carte bancaire" },
];

/** The French reason a content is refused, or null when it may be remembered. */
export function forbiddenMemoryReason(text: string): string | null {
    for (const { re, reason } of FORBIDDEN) {
        if (re.test(text)) return reason;
    }
    const compact = text.replace(/\s+/g, "");
    if (compact.length >= 6) {
        const digits = (compact.match(/\d/g) ?? []).length;
        if (digits / compact.length > 0.5) return "suite de chiffres sans contexte";
    }
    return null;
}

/** Credentials, IBAN, card numbers, passwords and digit-heavy strings are never memorised. */
export function isForbiddenMemory(text: string): boolean {
    return forbiddenMemoryReason(text) !== null;
}
