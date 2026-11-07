/**
 * Pure logic of the composer's two menus: « / » commands (a message that is a
 * lone slash word) and « @ » file mentions (the word under the caret). No
 * React — covered by composer-logic.test.ts.
 */

import { normalizeSearch } from "./model";

// ============================================
// Slash commands
// ============================================

export interface SlashCommand {
    id: string;
    command: string;
    label: string;
    hint: string;
    /** What the box holds once the command is picked. */
    template: string;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
    { id: "pdf", command: "/pdf", label: "En faire un PDF", hint: "Met la dernière réponse en document PDF", template: "Fais-en un PDF" },
    {
        id: "bilan",
        command: "/bilan",
        label: "Bilan",
        hint: "Bilan chiffré de la période, sources à l’appui",
        template: "Fais-moi le bilan de cette semaine : RDV, appels, et ce qui demande mon attention.",
    },
    { id: "resume", command: "/resume", label: "Résumé", hint: "Les points clés de cette conversation", template: "Résume cette conversation en 5 points clés." },
    { id: "visuel", command: "/visuel", label: "Visuel", hint: "Un graphique ou un tableau de chiffres", template: "Montre-moi ça sous forme de graphique." },
    { id: "memoire", command: "/memoire", label: "Mémoire", hint: "Faire retenir une information au dossier", template: "Retiens pour ce dossier : " },
];

/** "/re" → "re", "/" → "". Null unless the whole box is one slash word being typed. */
export function slashQuery(text: string): string | null {
    const match = /^\/([\p{L}\p{N}-]*)$/u.exec(text);
    return match ? normalizeSearch(match[1]) : null;
}

/** Commands whose name starts with the query, then those whose label contains it. */
export function filterSlashCommands(query: string, commands: readonly SlashCommand[] = SLASH_COMMANDS): SlashCommand[] {
    const q = normalizeSearch(query);
    if (!q) return [...commands];
    const byName = commands.filter((c) => c.id.startsWith(q));
    const byLabel = commands.filter((c) => !byName.includes(c) && normalizeSearch(c.label).includes(q));
    return [...byName, ...byLabel];
}

// ============================================
// @ mentions
// ============================================

export interface MentionRange {
    /** Index of the « @ ». */
    start: number;
    /** What follows it up to the caret. */
    query: string;
}

const MENTION_MAX = 40;

/** The « @mot » the caret is in, when the @ starts a word. */
export function mentionAt(text: string, caret: number): MentionRange | null {
    const before = text.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at < 0) return null;
    if (at > 0 && !/\s/.test(before[at - 1])) return null;
    const query = before.slice(at + 1);
    if (/[\s[\]]/.test(query) || query.length > MENTION_MAX) return null;
    return { start: at, query };
}

export function mentionToken(name: string): string {
    return `[fichier: ${name}]`;
}

/** Replaces « @requête » by the file token, caret placed after it. */
export function insertMention(text: string, range: MentionRange, caret: number, name: string): { text: string; caret: number } {
    const token = `${mentionToken(name)} `;
    const after = text.slice(caret).replace(/^ /, "");
    return { text: `${text.slice(0, range.start)}${token}${after}`, caret: range.start + token.length };
}

/** The mentioned files whose token is still in the message, once each. */
export function keptMentions<T extends { fileId: string; name: string }>(text: string, mentions: readonly T[]): T[] {
    const seen = new Set<string>();
    return mentions.filter((m) => {
        if (seen.has(m.fileId) || !text.includes(mentionToken(m.name))) return false;
        seen.add(m.fileId);
        return true;
    });
}

/** Files matching the query (accent-insensitive), names starting with it first. */
export function filterMentionFiles<T extends { name: string }>(files: readonly T[], query: string, limit = 8): T[] {
    const q = normalizeSearch(query);
    if (!q) return files.slice(0, limit);
    const starts: T[] = [];
    const contains: T[] = [];
    for (const f of files) {
        const name = normalizeSearch(f.name);
        if (name.startsWith(q)) starts.push(f);
        else if (name.includes(q)) contains.push(f);
    }
    return [...starts, ...contains].slice(0, limit);
}
