/**
 * Pure helpers of the assistant search: LIKE escaping and the ~120-character
 * snippet centred on the match (case- and accent-insensitive).
 */

import { plainText } from "../conversations/cards";

export const SNIPPET_CHARS = 120;
export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 120;

/** Normalises the raw query; null when too short to search. */
export function cleanQuery(raw: string | null | undefined): string | null {
    const q = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX_CHARS);
    return q.length >= SEARCH_MIN_CHARS ? q : null;
}

/** Escapes LIKE wildcards so `contains` matches the text literally. */
export function escapeLike(q: string): string {
    return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Lower-case and strip accents one character at a time, so indexes still line up with the source. */
export function fold(text: string): string {
    let out = "";
    for (const ch of text) {
        const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
        out += (base.length === ch.length ? base : ch).toLowerCase();
    }
    return out;
}

/**
 * ~`width` characters of `content` around the first match of `q`, cut on word
 * boundaries, with an ellipsis where it was cut. No match = the start of the
 * text. Empty text = null.
 */
export function snippetAround(content: string | null | undefined, q: string, width = SNIPPET_CHARS): string | null {
    const text = plainText(content);
    if (!text) return null;
    if (text.length <= width) return text;
    const at = fold(text).indexOf(fold(q));
    if (at < 0) return `${text.slice(0, width).replace(/\s+\S*$/, "")}…`;

    let start = Math.max(0, at - Math.floor((width - q.length) / 2));
    let end = Math.min(text.length, start + width);
    start = Math.max(0, end - width);
    if (start > 0) {
        const space = text.indexOf(" ", start);
        if (space > 0 && space < at) start = space + 1;
    }
    if (end < text.length) {
        const space = text.lastIndexOf(" ", end);
        if (space > at + q.length) end = space;
    }
    return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}
