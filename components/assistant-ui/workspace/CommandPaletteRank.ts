/**
 * Pure logic of the Captain AI command palette: accent-insensitive fuzzy
 * match with highlight ranges, action ranking, search state, Échap
 * behaviour, shortcut labels and the recent-items list.
 *     npx tsx --test components/assistant-ui/workspace/CommandPaletteRank.test.ts
 */

export type Range = [start: number, end: number];

export interface FuzzyHit {
    score: number;
    /** Ranges in the ORIGINAL text, end exclusive, merged. */
    ranges: Range[];
}

/** Lowercase, no diacritics, with a map from each normalised index to its original index. */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
    let norm = "";
    const map: number[] = [];
    for (let i = 0; i < text.length; i++) {
        const piece = text[i].normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
        for (const ch of piece) {
            norm += ch;
            map.push(i);
        }
    }
    return { norm, map };
}

export function normalizeText(text: string): string {
    return normalizeWithMap(text).norm;
}

function mergeRanges(ranges: Range[]): Range[] {
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    const out: Range[] = [];
    for (const r of sorted) {
        const last = out[out.length - 1];
        if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
        else out.push([r[0], r[1]]);
    }
    return out;
}

const isBoundary = (norm: string, i: number) => i === 0 || /[\s\-_/.'’«»()]/.test(norm[i - 1]);

/**
 * Scores `text` against `query` (null = no match). Order of preference:
 * whole text equal > prefix > word start > substring > every word found >
 * subsequence. Shorter texts win ties.
 */
export function fuzzyMatch(query: string, text: string): FuzzyHit | null {
    const q = normalizeText(query).trim().replace(/\s+/g, " ");
    if (!q) return { score: 0, ranges: [] };
    const { norm, map } = normalizeWithMap(text);
    const toOriginal = (start: number, len: number): Range => [map[start], map[start + len - 1] + 1];
    const lengthPenalty = Math.min(norm.length, 200) / 1000;

    if (norm === q) return { score: 1000, ranges: [toOriginal(0, q.length)] };

    // Contiguous substring: best occurrence (prefix, then a word start).
    let idx = norm.indexOf(q);
    let best = -1;
    while (idx !== -1) {
        if (best === -1 || (isBoundary(norm, idx) && !isBoundary(norm, best))) best = idx;
        if (idx === 0) break;
        idx = norm.indexOf(q, idx + 1);
    }
    if (best !== -1) {
        const score = (best === 0 ? 900 : isBoundary(norm, best) ? 800 : 600) - lengthPenalty;
        return { score, ranges: [toOriginal(best, q.length)] };
    }

    // Every word of the query found somewhere (any order).
    const words = q.split(" ").filter(Boolean);
    if (words.length > 1) {
        const ranges: Range[] = [];
        let allAtStarts = true;
        for (const w of words) {
            let at = -1;
            let i = norm.indexOf(w);
            while (i !== -1) {
                if (isBoundary(norm, i)) {
                    at = i;
                    break;
                }
                if (at === -1) at = i;
                i = norm.indexOf(w, i + 1);
            }
            if (at === -1) {
                ranges.length = 0;
                break;
            }
            if (!isBoundary(norm, at)) allAtStarts = false;
            ranges.push(toOriginal(at, w.length));
        }
        if (ranges.length === words.length) {
            return { score: (allAtStarts ? 500 : 400) - lengthPenalty, ranges: mergeRanges(ranges) };
        }
    }

    // Subsequence (spaces in the query ignored): fewer gaps and word starts score higher.
    const chars = q.replace(/ /g, "");
    const ranges: Range[] = [];
    let ti = 0;
    let gaps = 0;
    let starts = 0;
    let prev = -2;
    for (const ch of chars) {
        const found = norm.indexOf(ch, ti);
        if (found === -1) return null;
        if (prev !== -2 && found !== prev + 1) gaps += 1;
        if (isBoundary(norm, found)) starts += 1;
        ranges.push(toOriginal(found, 1));
        prev = found;
        ti = found + 1;
    }
    // A subsequence spread too thin is noise, not a match.
    if (gaps > Math.max(2, Math.ceil(chars.length / 2))) return null;
    return { score: 200 + starts * 15 - gaps * 20 - lengthPenalty, ranges: mergeRanges(ranges) };
}

/** Items that match, best first (stable for equal scores). */
export function rankItems<T>(query: string, items: readonly T[], text: (item: T) => string, limit = 8): Array<{ item: T; hit: FuzzyHit }> {
    const scored: Array<{ item: T; hit: FuzzyHit; i: number }> = [];
    items.forEach((item, i) => {
        const hit = fuzzyMatch(query, text(item));
        if (hit) scored.push({ item, hit, i });
    });
    scored.sort((a, b) => b.hit.score - a.hit.score || a.i - b.i);
    return scored.slice(0, limit).map(({ item, hit }) => ({ item, hit }));
}

/** Splits text into plain/marked parts for rendering. */
export function splitHighlight(text: string, ranges: readonly Range[]): Array<{ text: string; match: boolean }> {
    const out: Array<{ text: string; match: boolean }> = [];
    let at = 0;
    for (const [s, e] of mergeRanges(ranges.map((r) => [Math.max(0, r[0]), Math.min(text.length, r[1])] as Range))) {
        if (e <= s) continue;
        if (s > at) out.push({ text: text.slice(at, s), match: false });
        out.push({ text: text.slice(s, e), match: true });
        at = e;
    }
    if (at < text.length) out.push({ text: text.slice(at), match: false });
    return out;
}

/**
 * Actions matching the query: label hits first (ranked, highlighted), then
 * strong keyword-only hits (« veille » finds « Agent »), unhighlighted.
 */
export function rankActions<T extends { label: string; keywords: string }>(query: string, actions: readonly T[], limit = 3): Array<{ item: T; ranges: Range[] }> {
    const byLabel = rankItems(query, actions, (a) => a.label, limit).map(({ item, hit }) => ({ item, ranges: hit.ranges }));
    const byKeyword = actions
        .filter((a) => !fuzzyMatch(query, a.label) && (fuzzyMatch(query, a.keywords)?.score ?? 0) >= 600)
        .map((item) => ({ item, ranges: [] as Range[] }));
    return [...byLabel, ...byKeyword];
}

// ============================================
// Palette state
// ============================================

export const PALETTE_SEARCH_MIN = 2;
export const PALETTE_DEBOUNCE_MS = 200;

export interface PaletteSearchState {
    /** Trimmed query. */
    q: string;
    /** Long enough for the server search. */
    searching: boolean;
    /** One character: local results only, with a hint. */
    tooShort: boolean;
    /** Waiting on the debounce or the first server answer for this query. */
    pending: boolean;
}

export function paletteSearchState(query: string, debounced: string, server: { isValidating: boolean; hasData: boolean }, min = PALETTE_SEARCH_MIN): PaletteSearchState {
    const q = query.trim();
    const searching = q.length >= min;
    const pending = searching && (debounced.trim() !== q || (server.isValidating && !server.hasData));
    return { q, searching, tooShort: q.length > 0 && q.length < min, pending };
}

/** Échap: a typed query is cleared first, an empty palette closes. */
export function escapeAction(query: string): "clear" | "close" {
    return query.length > 0 ? "clear" : "close";
}

/** Keyboard hint of a shortcut, per platform: ["mod", "shift", "O"] → « ⌘⇧O » or « Ctrl Maj O ». */
export function shortcutLabel(keys: readonly string[], isMac: boolean): string {
    const map = (k: string) =>
        k === "mod" ? (isMac ? "⌘" : "Ctrl") : k === "shift" ? (isMac ? "⇧" : "Maj") : k === "alt" ? (isMac ? "⌥" : "Alt") : k.toUpperCase();
    return keys.map(map).join(isMac ? "" : " ");
}

// ============================================
// Recent items
// ============================================

export type RecentKind = "conversation" | "folder" | "file";

export interface RecentItem {
    kind: RecentKind;
    /** Conversation id, folder id ("" = Vue agence) or file id. */
    id: string;
    label: string;
    folderId: string | null;
    clientId?: string | null;
}

export const RECENT_MAX = 6;

/** Puts `item` first, removing its previous occurrence, capped. */
export function pushRecent(list: readonly RecentItem[], item: RecentItem, max = RECENT_MAX): RecentItem[] {
    return [item, ...list.filter((r) => !(r.kind === item.kind && r.id === item.id))].slice(0, max);
}

/** Parses the stored list, dropping anything malformed. */
export function parseRecent(raw: string | null): RecentItem[] {
    if (!raw) return [];
    try {
        const data = JSON.parse(raw) as unknown;
        if (!Array.isArray(data)) return [];
        return data
            .filter(
                (r): r is RecentItem =>
                    !!r &&
                    typeof r === "object" &&
                    (r.kind === "conversation" || r.kind === "folder" || r.kind === "file") &&
                    typeof r.id === "string" &&
                    typeof r.label === "string",
            )
            .map((r) => ({ ...r, folderId: typeof r.folderId === "string" ? r.folderId : null }))
            .slice(0, RECENT_MAX);
    } catch {
        return [];
    }
}
