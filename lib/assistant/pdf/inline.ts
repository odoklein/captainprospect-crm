/**
 * The low-level drawing layer of the assistant PDF: a page cursor (Writer) and
 * a small line breaker for styled runs.
 *
 * pdfkit's own `continued` text cannot mix sizes on one baseline nor tell how
 * tall a paragraph will be before drawing it, which is what page-break-safe
 * tables and superscript citations need. So runs are measured word by word,
 * broken into lines here, and every fragment is drawn at an explicit x and
 * baseline with `lineBreak: false` (pdfkit then never opens a page by itself).
 */

import { pdfSafe } from "./text";
import { CONTENT_BOTTOM, CONTENT_TOP, FONTS, LEFT, type Theme } from "./theme";
import type { Run } from "./markdown";

export type Doc = PDFKit.PDFDocument;

// ============================================
// Writer — the vertical cursor and page breaks
// ============================================

export class Writer {
    y = CONTENT_TOP;
    /** Callbacks run after a page break (blockquote bars, table headers…). */
    private breakListeners: Array<() => void> = [];

    constructor(
        readonly doc: Doc,
        readonly theme: Theme,
        /** Draws the continuation header; returns where content starts. */
        private readonly onNewPage: () => number,
        /** Base URL for relative links ("/api/files/…"). */
        readonly linkBase: string | null = null,
    ) {}

    get bottom(): number {
        return CONTENT_BOTTOM;
    }

    /** Room left on this page. */
    get room(): number {
        return CONTENT_BOTTOM - this.y;
    }

    /** Full content height of a fresh page. */
    get pageHeight(): number {
        return CONTENT_BOTTOM - CONTENT_TOP - 40;
    }

    get page(): number {
        const range = this.doc.bufferedPageRange();
        return range.start + range.count - 1;
    }

    newPage(): void {
        this.doc.addPage();
        this.y = this.onNewPage();
        for (const listener of [...this.breakListeners]) listener();
    }

    /** Opens a page when `height` does not fit. True when it did. */
    ensure(height: number): boolean {
        if (this.y + height <= CONTENT_BOTTOM) return false;
        // A block taller than a page cannot be helped by a break at the top of a fresh one.
        if (this.y <= CONTENT_TOP + 60 && height > this.pageHeight) return false;
        this.newPage();
        return true;
    }

    onBreak(listener: () => void): () => void {
        this.breakListeners.push(listener);
        return () => {
            this.breakListeners = this.breakListeners.filter((l) => l !== listener);
        };
    }
}

// ============================================
// Plain text helpers (always WinAnsi-safe)
// ============================================

export interface TextOpts {
    font?: string;
    size?: number;
    color?: string;
    align?: "left" | "right" | "center";
    width?: number;
    opacity?: number;
}

/** One line of text, top-left at (x, y); `width` + `align` position it inside a box. Never wraps. */
export function drawText(doc: Doc, value: string, x: number, y: number, o: TextOpts = {}): number {
    const text = pdfSafe(value);
    const font = o.font ?? FONTS.regular;
    const size = o.size ?? 10;
    doc.font(font).fontSize(size);
    const w = doc.widthOfString(text);
    let left = x;
    if (o.width !== undefined && o.align === "right") left = x + o.width - w;
    else if (o.width !== undefined && o.align === "center") left = x + (o.width - w) / 2;
    doc.fillColor(o.color ?? "#000000").fillOpacity(o.opacity ?? 1);
    doc.text(text, left, y + ascent(doc, size), { lineBreak: false, baseline: "alphabetic" });
    doc.fillOpacity(1);
    return w;
}

export function textWidth(doc: Doc, value: string, font: string = FONTS.regular, size = 10): number {
    return doc.font(font).fontSize(size).widthOfString(pdfSafe(value));
}

/** Cuts with "…" so the text fits `width`. */
export function truncate(doc: Doc, value: string, width: number, font: string = FONTS.regular, size = 10): string {
    const text = pdfSafe(value);
    doc.font(font).fontSize(size);
    if (doc.widthOfString(text) <= width) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (doc.widthOfString(`${text.slice(0, mid).trimEnd()}…`) <= width) lo = mid;
        else hi = mid - 1;
    }
    return lo === 0 ? "…" : `${text.slice(0, lo).trimEnd()}…`;
}

/** Distance from the top of a line box to the baseline, for Helvetica-like fonts. */
export function ascent(_doc: Doc, size: number): number {
    return size * 0.8;
}

export function hairline(doc: Doc, x: number, y: number, w: number, color: string, width = 0.6): void {
    doc.save().moveTo(x, y).lineTo(x + w, y).lineWidth(width).strokeColor(color).stroke().restore();
}

// ============================================
// Rich text: runs → lines
// ============================================

export interface InlineStyle {
    size: number;
    color: string;
    /** Base weight of the block (headings). */
    bold?: boolean;
    italic?: boolean;
    /** Line height as a multiple of the size. */
    leading?: number;
}

export interface Frag {
    text: string;
    font: string;
    size: number;
    color: string;
    /** Offset from the line start. */
    x: number;
    width: number;
    /** Raised above the baseline (citations). */
    rise: number;
    code?: boolean;
    strike?: boolean;
    href?: string;
}

export interface Line {
    frags: Frag[];
    width: number;
}

export interface Paragraph {
    lines: Line[];
    lineHeight: number;
    size: number;
    height: number;
}

function fontFor(run: Run, style: InlineStyle): string {
    if (run.code) return FONTS.mono;
    if (run.cite) return FONTS.bold;
    const bold = run.bold || style.bold;
    const italic = run.italic || style.italic;
    if (bold && italic) return FONTS.boldItalic;
    if (bold) return FONTS.bold;
    if (italic) return FONTS.italic;
    return FONTS.regular;
}

interface Piece {
    text: string;
    font: string;
    size: number;
    color: string;
    rise: number;
    width: number;
    code?: boolean;
    strike?: boolean;
    href?: string;
}

type Token = { kind: "word"; pieces: Piece[]; width: number } | { kind: "space"; width: number } | { kind: "newline" };

function pieceOf(doc: Doc, text: string, run: Run, style: InlineStyle, theme: Theme): Piece {
    const font = fontFor(run, style);
    const size = run.cite ? style.size * 0.62 : run.code ? style.size * 0.92 : style.size;
    doc.font(font).fontSize(size);
    return {
        text,
        font,
        size,
        color: run.cite || run.href ? theme.primary : run.code ? theme.ink2 : style.color,
        rise: run.cite ? style.size * 0.36 : 0,
        width: doc.widthOfString(text) + (run.cite ? 1.2 : 0),
        ...(run.code ? { code: true } : {}),
        ...(run.strike ? { strike: true } : {}),
        ...(run.href ? { href: run.href } : {}),
    };
}

function tokenize(doc: Doc, runs: Run[], style: InlineStyle, theme: Theme): Token[] {
    const tokens: Token[] = [];
    let word: Piece[] = [];
    const flush = () => {
        if (word.length === 0) return;
        tokens.push({ kind: "word", pieces: word, width: word.reduce((n, p) => n + p.width, 0) });
        word = [];
    };
    for (const run of runs) {
        if (run.text === "\n") {
            flush();
            tokens.push({ kind: "newline" });
            continue;
        }
        const text = pdfSafe(run.cite ? run.text.replace(/\s+/g, "") : run.text);
        // Code keeps its spaces as non-breaking (a code span is one unit, short by nature).
        const parts = run.code ? [text.replace(/ /g, " ")] : text.split(/( +)/);
        for (const part of parts) {
            if (!part) continue;
            if (/^ +$/.test(part)) {
                flush();
                doc.font(fontFor(run, style)).fontSize(style.size);
                tokens.push({ kind: "space", width: doc.widthOfString(" ") });
                continue;
            }
            word.push(pieceOf(doc, part, run, style, theme));
        }
    }
    flush();
    return tokens;
}

/** Splits a word wider than the line into chunks that fit. */
function splitWord(doc: Doc, pieces: Piece[], width: number): Piece[][] {
    const chunks: Piece[][] = [];
    let current: Piece[] = [];
    let used = 0;
    for (const piece of pieces) {
        doc.font(piece.font).fontSize(piece.size);
        let rest = piece.text;
        while (rest) {
            let n = rest.length;
            while (n > 1 && used + doc.widthOfString(rest.slice(0, n)) > width) n--;
            if (used > 0 && used + doc.widthOfString(rest.slice(0, n)) > width) {
                chunks.push(current);
                current = [];
                used = 0;
                continue;
            }
            const text = rest.slice(0, n);
            const w = doc.widthOfString(text);
            current.push({ ...piece, text, width: w });
            used += w;
            rest = rest.slice(n);
            if (rest) {
                chunks.push(current);
                current = [];
                used = 0;
            }
        }
    }
    if (current.length) chunks.push(current);
    return chunks;
}

/** Breaks runs into lines of at most `width`. */
export function layoutRuns(doc: Doc, runs: Run[], width: number, style: InlineStyle, theme: Theme): Paragraph {
    const tokens = tokenize(doc, runs, style, theme);
    const lines: Line[] = [];
    let frags: Frag[] = [];
    let x = 0;
    let pendingSpace = 0;
    const endLine = () => {
        lines.push({ frags, width: x });
        frags = [];
        x = 0;
        pendingSpace = 0;
    };
    const place = (pieces: Piece[]) => {
        for (const p of pieces) {
            frags.push({ text: p.text, font: p.font, size: p.size, color: p.color, x, width: p.width, rise: p.rise, code: p.code, strike: p.strike, href: p.href });
            x += p.width;
        }
    };

    for (const token of tokens) {
        if (token.kind === "newline") {
            endLine();
            continue;
        }
        if (token.kind === "space") {
            if (frags.length > 0) pendingSpace += token.width;
            continue;
        }
        if (frags.length > 0 && x + pendingSpace + token.width > width) endLine();
        if (frags.length === 0 && token.width > width) {
            const chunks = splitWord(doc, token.pieces, width);
            chunks.forEach((chunk, i) => {
                place(chunk);
                if (i < chunks.length - 1) endLine();
            });
            continue;
        }
        x += frags.length > 0 ? pendingSpace : 0;
        pendingSpace = 0;
        place(token.pieces);
    }
    if (frags.length > 0 || lines.length === 0) endLine();
    // Trailing empty line from a final hard break.
    while (lines.length > 1 && lines[lines.length - 1].frags.length === 0) lines.pop();

    const lineHeight = style.size * (style.leading ?? 1.45);
    return { lines, lineHeight, size: style.size, height: lines.length * lineHeight };
}

/** Draws one laid-out line with its top at `y`. */
export function drawLine(
    w: Writer,
    line: Line,
    x: number,
    y: number,
    para: Pick<Paragraph, "lineHeight" | "size">,
    align: "left" | "right" | "center" = "left",
    boxWidth = 0,
): void {
    const { doc, theme } = w;
    const offset = align === "right" ? boxWidth - line.width : align === "center" ? (boxWidth - line.width) / 2 : 0;
    // Baseline: centred in the line box for the block's size.
    const baseline = y + (para.lineHeight - para.size) / 2 + para.size * 0.78;
    for (const f of line.frags) {
        const fx = x + offset + f.x;
        if (f.code) {
            doc.save().roundedRect(fx - 1.5, baseline - f.size * 0.82, f.width + 3, f.size * 1.18, 2).fill(theme.codeBg).restore();
        }
        doc.font(f.font).fontSize(f.size).fillColor(f.color).fillOpacity(1);
        doc.text(f.text, fx + (f.rise ? 0.8 : 0), baseline - f.rise, { lineBreak: false, baseline: "alphabetic" });
        if (f.strike) hairline(doc, fx, baseline - f.size * 0.3, f.width, f.color, 0.6);
        if (f.href) {
            hairline(doc, fx, baseline + 1.4, f.width, f.color, 0.5);
            const url = absoluteUrl(f.href, w.linkBase);
            if (url) doc.link(fx, baseline - f.size * 0.85, f.width, f.size * 1.1, url);
        }
    }
}

function absoluteUrl(href: string, base: string | null): string | null {
    if (/^(https?:|mailto:)/i.test(href)) return href;
    if (href.startsWith("/") && base) return `${base.replace(/\/+$/, "")}${href}`;
    return null;
}

/**
 * Draws a paragraph at the cursor, breaking pages between lines. `keep` lines
 * must fit together before the first one is drawn (headings keep with what follows).
 */
export function flowParagraph(w: Writer, para: Paragraph, x: number, width: number, opts: { keep?: number; align?: "left" | "right" | "center" } = {}): void {
    const keep = opts.keep ?? 0;
    if (keep > 0) w.ensure(Math.min(para.height, para.lineHeight * 2) + keep);
    for (const line of para.lines) {
        w.ensure(para.lineHeight);
        drawLine(w, line, x, w.y, para, opts.align ?? "left", width);
        w.y += para.lineHeight;
    }
}

export { LEFT };
