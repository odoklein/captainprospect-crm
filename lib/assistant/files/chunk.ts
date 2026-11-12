/**
 * Splits extracted document text into retrieval chunks (Captain AI v4 files).
 * Pure: no I/O, so the boundaries are unit-tested.
 *
 * A chunk aims at `targetTokens` and never exceeds it except for its overlap
 * prefix. Text is cut on the coarsest boundary that fits: blank line
 * (paragraph), then line, then sentence, then word, never inside a word (a
 * single "word" longer than a whole chunk, like a pasted base64 blob, is the
 * only thing ever hard-split). Each chunk remembers the page and the heading
 * its new content starts under; a heading change starts a new chunk, a page
 * change does not (PDF pages are often a few lines long).
 *
 * Tokens are estimated as ceil(chars / 3.3), like lib/assistant/context/tokens.ts.
 */

export interface ChunkSection {
    heading?: string | null;
    page?: number | null;
    text: string;
}

export interface Chunk {
    index: number;
    content: string;
    tokens: number;
    page: number | null;
    heading: string | null;
}

export interface ChunkOptions {
    targetTokens?: number;
    overlapTokens?: number;
    maxChunks?: number;
}

export interface ChunkResult {
    chunks: Chunk[];
    /** True when maxChunks cut the document short. */
    truncated: boolean;
}

export const CHUNK_DEFAULTS = { targetTokens: 800, overlapTokens: 120, maxChunks: 1500 } as const;

const CHARS_PER_TOKEN = 3.3;

export function chunkTokens(text: string): number {
    return text ? Math.ceil(text.length / CHARS_PER_TOKEN) : 0;
}

/** A piece of text that is never split further, with the separator that precedes it. */
interface Unit {
    text: string;
    /** How this unit joins the previous one inside a chunk. */
    sep: "\n\n" | "\n" | " ";
    page: number | null;
    heading: string | null;
}

/** Sentence end: punctuation, optional closing quote/bracket, then whitespace ("3.5" is not an end). */
const SENTENCE_END_RE = /[.!?…]+["»”')\]]*\s+/g;

/** Lossless: every character of the line lands in exactly one sentence. */
function splitSentences(line: string): string[] {
    const out: string[] = [];
    let start = 0;
    SENTENCE_END_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SENTENCE_END_RE.exec(line)) !== null) {
        const end = m.index + m[0].length;
        const s = line.slice(start, end).trim();
        if (s) out.push(s);
        start = end;
    }
    const rest = line.slice(start).trim();
    if (rest) out.push(rest);
    return out;
}

/** Words grouped into pieces of at most maxChars; an over-long single word is hard-split. */
function splitWords(text: string, maxChars: number): string[] {
    const out: string[] = [];
    let cur = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
        if (word.length > maxChars) {
            if (cur) {
                out.push(cur);
                cur = "";
            }
            for (let i = 0; i < word.length; i += maxChars) out.push(word.slice(i, i + maxChars));
            continue;
        }
        const next = cur ? `${cur} ${word}` : word;
        if (next.length > maxChars) {
            out.push(cur);
            cur = word;
        } else {
            cur = next;
        }
    }
    if (cur) out.push(cur);
    return out;
}

/** Breaks one section into units no longer than maxChars, coarsest boundary first. */
function sectionUnits(section: ChunkSection, maxChars: number): Unit[] {
    const page = typeof section.page === "number" ? section.page : null;
    const heading = section.heading?.trim() ? section.heading.trim() : null;
    const units: Unit[] = [];
    const push = (text: string, sep: Unit["sep"]) => {
        const t = text.trim();
        if (t) units.push({ text: t, sep, page, heading });
    };

    const paragraphs = section.text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/);
    for (const para of paragraphs) {
        if (!para.trim()) continue;
        if (para.trim().length <= maxChars) {
            push(para.replace(/[ \t]+\n/g, "\n"), "\n\n");
            continue;
        }
        let firstOfPara = true;
        for (const line of para.split("\n")) {
            if (!line.trim()) continue;
            const lineSep: Unit["sep"] = firstOfPara ? "\n\n" : "\n";
            firstOfPara = false;
            if (line.trim().length <= maxChars) {
                push(line, lineSep);
                continue;
            }
            let firstOfLine = true;
            for (const sentence of splitSentences(line)) {
                const sentenceSep: Unit["sep"] = firstOfLine ? lineSep : " ";
                firstOfLine = false;
                if (sentence.length <= maxChars) {
                    push(sentence, sentenceSep);
                    continue;
                }
                splitWords(sentence, maxChars).forEach((piece, i) => push(piece, i === 0 ? sentenceSep : " "));
            }
        }
    }
    return units;
}

/** The end of `text` that fits in maxChars, starting on a word boundary. */
function tailOnWord(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    const slice = text.slice(text.length - maxChars);
    const space = slice.search(/\s/);
    if (space < 0) return "";
    return slice.slice(space).trim();
}

function join(units: Unit[]): string {
    return units.map((u, i) => (i === 0 ? u.text : `${u.sep}${u.text}`)).join("");
}

export function chunkSections(sections: ChunkSection[], options: ChunkOptions = {}): ChunkResult {
    const targetTokens = Math.max(50, options.targetTokens ?? CHUNK_DEFAULTS.targetTokens);
    const overlapTokens = Math.max(0, Math.min(options.overlapTokens ?? CHUNK_DEFAULTS.overlapTokens, Math.floor(targetTokens / 2)));
    const maxChunks = Math.max(1, options.maxChunks ?? CHUNK_DEFAULTS.maxChunks);
    const targetChars = Math.floor(targetTokens * CHARS_PER_TOKEN);
    const overlapChars = Math.floor(overlapTokens * CHARS_PER_TOKEN);

    const chunks: Chunk[] = [];
    let truncated = false;

    /** Overlap carried from the previous chunk (not counted against its own target). */
    let carry: Unit[] = [];
    /** New content of the chunk being built. */
    let current: Unit[] = [];
    let currentChars = 0;

    const flush = (keepOverlap: boolean): boolean => {
        if (current.length === 0) return true;
        if (chunks.length >= maxChunks) {
            truncated = true;
            return false;
        }
        const content = join([...carry, ...current]);
        chunks.push({
            index: chunks.length,
            content,
            tokens: chunkTokens(content),
            page: current[0].page,
            heading: current[0].heading,
        });
        carry = keepOverlap && overlapChars > 0 ? overlapOf(current, overlapChars) : [];
        current = [];
        currentChars = 0;
        return true;
    };

    for (const section of sections) {
        if (!section || typeof section.text !== "string") continue;
        for (const unit of sectionUnits(section, targetChars)) {
            if (truncated) break;
            // A new heading starts a new chunk, without dragging the previous section along.
            if (current.length > 0 && unit.heading !== current[current.length - 1].heading) {
                if (!flush(false)) break;
                carry = [];
            }
            const added = (current.length > 0 ? unit.sep.length : 0) + unit.text.length;
            if (current.length > 0 && currentChars + added > targetChars) {
                if (!flush(true)) break;
            }
            current.push(unit);
            currentChars += (current.length > 1 ? unit.sep.length : 0) + unit.text.length;
        }
        if (truncated) break;
    }
    if (!truncated) flush(false);

    return { chunks, truncated };
}

/** Trailing units of a chunk whose joined length fits the overlap; else the word-aligned tail of the last one. */
function overlapOf(units: Unit[], overlapChars: number): Unit[] {
    const picked: Unit[] = [];
    let used = 0;
    for (let i = units.length - 1; i >= 0; i--) {
        const u = units[i];
        const cost = u.text.length + (picked.length > 0 ? picked[0].sep.length : 0);
        if (used + cost > overlapChars) break;
        picked.unshift(u);
        used += cost;
    }
    if (picked.length > 0) return picked;
    const last = units[units.length - 1];
    const tail = tailOnWord(last.text, overlapChars);
    return tail ? [{ ...last, text: tail }] : [];
}
