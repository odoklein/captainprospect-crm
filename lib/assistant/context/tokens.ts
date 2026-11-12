/**
 * Token arithmetic of the context pack (Captain AI v4). No tokenizer here:
 * budgets are soft and provider-neutral, so a conservative chars/3.3 ratio
 * (French text with accents tokenises worse than English) is enough and
 * keeps the pack pure and fast.
 */

const CHARS_PER_TOKEN = 3.3;
const CUT_MARK = " […]";
/** A boundary too close to the start would throw away most of the allowance. */
const MIN_BOUNDARY_RATIO = 0.5;

export function estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Characters that fit in a token budget, never negative. */
export function charsForTokens(maxTokens: number): number {
    return Math.max(0, Math.floor(maxTokens * CHARS_PER_TOKEN));
}

const SENTENCE_END = /[.!?…]["»)]?(?=\s)|\n/g;

/**
 * Cuts a text so it fits in `maxTokens`, preferring the last sentence end or
 * line break before the limit, then the last space; marks the cut with " […]".
 * Returns the text untouched when it already fits.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
    if (maxTokens <= 0) return "";
    if (estimateTokens(text) <= maxTokens) return text;
    const room = charsForTokens(maxTokens) - CUT_MARK.length;
    if (room <= 0) return CUT_MARK.trimStart();
    const head = text.slice(0, room);

    let cut = -1;
    for (const match of head.matchAll(SENTENCE_END)) {
        const end = (match.index ?? 0) + match[0].length;
        if (end > cut) cut = end;
    }
    if (cut < room * MIN_BOUNDARY_RATIO) {
        const space = head.lastIndexOf(" ");
        cut = space >= room * MIN_BOUNDARY_RATIO ? space : room;
    }
    return head.slice(0, cut).trimEnd() + CUT_MARK;
}
