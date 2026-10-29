/**
 * renderAssistantPdf — a branded A4 document from assistant answers.
 *
 *   cover header   brand mark + name, title, subtitle, « 29 octobre 2026 », author
 *   sections       optional eyebrow + heading, then the markdown body with its
 *                  visuals placed at their `[[visuel N]]` markers
 *   every page     a running header after the first, footer with « N / M »
 *
 * Pure apart from pdfkit: the brand, the logo bytes and the date come in, a
 * Buffer goes out. The callers (create_pdf, the export routes) read the brand
 * and the data. Fonts: see ./text.ts (standard fonts, WinAnsi-normalised).
 */

import PDFDocument from "pdfkit";
import type { Brand } from "@/lib/brand/types";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { answerToBlocks, type Block, type ListItem } from "./markdown";
import { drawText, flowParagraph, hairline, layoutRuns, truncate, Writer, type Doc } from "./inline";
import { renderTable } from "./table";
import { renderVisual } from "./visuals";
import { frLongDate, pdfSafe } from "./text";
import { CONTENT_TOP, CW, FONTS, LEFT, PAGE, themeFor, type Theme } from "./theme";

export interface AssistantPdfSection {
    /** Small brand-coloured label above the heading (« Question 2 »). */
    eyebrow?: string;
    heading?: string;
    /** Markdown body; `[[visuel N]]` markers place `visuals[N-1]`, a `:::suivi` block is dropped. */
    markdown: string;
    visuals: StoredVisual[];
}

export interface AssistantPdfDoc {
    title: string;
    subtitle?: string;
    author?: string;
    generatedAt: Date;
    brand: Brand;
    sections: AssistantPdfSection[];
    /** The brand mark (PNG/JPEG bytes or a local path); a brand-coloured square otherwise. */
    logo?: Buffer | string | null;
}

export interface AssistantPdfResult {
    buffer: Buffer;
    pages: number;
    /** Page breaks taken inside tables (each one repeats the header row). */
    tableBreaks: number;
}

const BODY = { size: 9.5, leading: 1.5 };
const HEADING_SIZE: Record<number, number> = { 1: 16, 2: 13.5, 3: 11.5, 4: 10.5, 5: 10, 6: 10 };

interface RenderState {
    w: Writer;
    theme: Theme;
    visuals: StoredVisual[];
    tableBreaks: number;
}

// ============================================
// Header, footer
// ============================================

function drawMark(doc: Doc, theme: Theme, logo: AssistantPdfDoc["logo"], x: number, y: number, size: number): void {
    if (logo) {
        try {
            doc.image(logo, x, y, { width: size, height: size });
            return;
        } catch {
            // Unsupported image: fall back to the square.
        }
    }
    doc.save().roundedRect(x, y, size, size, size * 0.25).fill(theme.primary).restore();
    doc.save().roundedRect(x + size * 0.32, y + size * 0.32, size * 0.36, size * 0.36, size * 0.08).fill(theme.white).restore();
}

function drawCover(state: RenderState, input: AssistantPdfDoc): void {
    const { w, theme } = state;
    const doc = w.doc;
    let y = CONTENT_TOP;
    drawMark(doc, theme, input.logo, LEFT, y, 18);
    drawText(doc, truncate(doc, input.brand.name, CW * 0.6, FONTS.bold, 11.5), LEFT + 26, y + 3, { font: FONTS.bold, size: 11.5, color: theme.ink });
    drawText(doc, frLongDate(input.generatedAt), LEFT, y + 4.5, { size: 8.5, color: theme.ink3, width: CW, align: "right" });
    y += 30;
    hairline(doc, LEFT, y, CW, theme.line, 0.75);
    y += 30;

    doc.save().roundedRect(LEFT, y, 28, 3, 1.5).fill(theme.primary).restore();
    y += 13;
    w.y = y;
    const title = layoutRuns(doc, [{ text: input.title }], CW, { size: 22, color: theme.ink, bold: true, leading: 1.22 }, theme);
    flowParagraph(w, title, LEFT, CW);
    if (input.subtitle?.trim()) {
        w.y += 4;
        flowParagraph(w, layoutRuns(doc, [{ text: input.subtitle.trim() }], CW, { size: 11, color: theme.ink2, leading: 1.35 }, theme), LEFT, CW);
    }
    w.y += 8;
    const meta = [frLongDate(input.generatedAt), input.author?.trim() ? `Préparé par ${input.author.trim()}` : null].filter(Boolean).join("   ·   ");
    drawText(doc, meta, LEFT, w.y, { size: 8.5, color: theme.ink3 });
    w.y += 26;
}

function runningHeader(doc: Doc, theme: Theme, input: AssistantPdfDoc): number {
    const y = CONTENT_TOP;
    drawMark(doc, theme, input.logo, LEFT, y, 11);
    const label = `${input.brand.name}  ·  ${input.title}`;
    drawText(doc, truncate(doc, label, CW * 0.72, FONTS.bold, 8), LEFT + 17, y + 1.5, { font: FONTS.bold, size: 8, color: theme.ink2 });
    drawText(doc, frLongDate(input.generatedAt), LEFT, y + 1.5, { size: 8, color: theme.ink3, width: CW, align: "right" });
    hairline(doc, LEFT, y + 20, CW, theme.line, 0.6);
    return y + 38;
}

function drawFooters(doc: Doc, theme: Theme, input: AssistantPdfDoc): number {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const bottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        const y = PAGE.height - PAGE.margin + 14;
        hairline(doc, LEFT, y - 8, CW, theme.line, 0.6);
        const label = `${input.brand.name}  ·  ${input.title}`;
        drawText(doc, truncate(doc, label, CW - 60, FONTS.regular, 7.5), LEFT, y, { size: 7.5, color: theme.ink4 });
        drawText(doc, `${i - range.start + 1} / ${range.count}`, LEFT, y, { size: 7.5, color: theme.ink3, width: CW, align: "right" });
        doc.page.margins.bottom = bottom;
    }
    return range.count;
}

// ============================================
// Blocks
// ============================================

function renderBlocks(state: RenderState, blocks: Block[], x: number, width: number, tight = false): void {
    blocks.forEach((block, i) => {
        renderBlock(state, block, x, width, tight && i === blocks.length - 1);
    });
}

function renderBlock(state: RenderState, block: Block, x: number, width: number, last = false): void {
    const { w, theme } = state;
    const doc = w.doc;
    switch (block.type) {
        case "heading": {
            const size = HEADING_SIZE[block.level] ?? 10;
            w.y += block.level <= 2 ? 8 : 4;
            const para = layoutRuns(doc, block.runs, width, { size, color: theme.ink, bold: true, leading: 1.3 }, theme);
            flowParagraph(w, para, x, width, { keep: 60 });
            w.y += block.level <= 2 ? 5 : 3;
            break;
        }
        case "paragraph": {
            const para = layoutRuns(doc, block.runs, width, { size: BODY.size, color: theme.ink2, leading: BODY.leading }, theme);
            flowParagraph(w, para, x, width);
            if (!last) w.y += 6;
            break;
        }
        case "list":
            renderList(state, block.items, block.ordered, block.start, x, width);
            if (!last) w.y += 4;
            break;
        case "table":
            w.y += 2;
            state.tableBreaks += renderTable(w, { header: block.header, rows: block.rows, align: block.align }, x, width);
            break;
        case "quote":
            renderQuote(state, block.blocks, x, width);
            break;
        case "code":
            renderCode(state, block.text, x, width);
            break;
        case "rule":
            w.ensure(14);
            hairline(doc, x, w.y + 6, width, theme.line, 0.75);
            w.y += 14;
            break;
        case "visual": {
            const visual = state.visuals[block.index - 1];
            if (!visual) break;
            w.y += 4;
            renderVisual(w, visual, x, width);
            break;
        }
    }
}

function renderList(state: RenderState, items: ListItem[], ordered: boolean, start: number, x: number, width: number): void {
    const { w, theme } = state;
    const doc = w.doc;
    const indent = ordered ? 18 : 13;
    const lineH = BODY.size * BODY.leading;
    items.forEach((item, i) => {
        w.ensure(lineH);
        const y = w.y;
        const markerY = y + (lineH - BODY.size) / 2;
        if (item.checked !== null) {
            doc.save().roundedRect(x + 1, markerY + 1, 7.5, 7.5, 1.5).lineWidth(0.8).strokeColor(theme.ink3).stroke().restore();
            if (item.checked) {
                doc.save().moveTo(x + 2.8, markerY + 4.8).lineTo(x + 4.4, markerY + 6.6).lineTo(x + 7.2, markerY + 2.6).lineWidth(1.1).strokeColor(theme.primary).stroke().restore();
            }
        } else if (ordered) {
            drawText(doc, `${start + i}.`, x - 2, markerY, { size: BODY.size, color: theme.ink3, width: indent - 5, align: "right" });
        } else {
            doc.save().circle(x + 4, y + lineH / 2, 1.8).fill(theme.primary).restore();
        }
        const content = item.blocks.length > 0 ? item.blocks : [{ type: "paragraph" as const, runs: [{ text: " " }] }];
        renderBlocks(state, content, x + (item.checked !== null ? 14 : indent), width - (item.checked !== null ? 14 : indent), true);
        w.y += 2.5;
    });
}

function renderQuote(state: RenderState, blocks: Block[], x: number, width: number): void {
    const { w, theme } = state;
    const doc = w.doc;
    const bar = (page: number, from: number, to: number) => {
        if (to <= from) return;
        const current = w.page;
        if (page !== current) doc.switchToPage(page);
        doc.save().roundedRect(x, from, 2.5, to - from, 1.25).fill(theme.primaryTint).restore();
        if (page !== current) doc.switchToPage(current);
    };
    w.ensure(BODY.size * BODY.leading);
    let segment = { page: w.page, y: w.y };
    let lastY = w.y;
    // On a page break the bar of the old page is closed at the last drawn line.
    const unlisten = w.onBreak(() => {
        bar(segment.page, segment.y, lastY);
        segment = { page: w.page, y: w.y };
    });
    for (const block of blocks) {
        const quoted: Block =
            block.type === "paragraph" ? { ...block, runs: block.runs.map((r) => (r.cite ? r : { ...r, italic: true })) } : block;
        renderBlock(state, quoted, x + 12, width - 12, block === blocks[blocks.length - 1]);
        lastY = w.y;
    }
    unlisten();
    bar(segment.page, segment.y, w.y);
    w.y += 8;
}

function renderCode(state: RenderState, text: string, x: number, width: number): void {
    const { w, theme } = state;
    const doc = w.doc;
    const size = 8;
    const lineH = size * 1.45;
    doc.font(FONTS.mono).fontSize(size);
    const charW = doc.widthOfString("M");
    const perLine = Math.max(8, Math.floor((width - 16) / charW));
    const lines: string[] = [];
    for (const raw of pdfSafe(text).split("\n")) {
        if (raw.length === 0) lines.push("");
        for (let i = 0; i < raw.length; i += perLine) lines.push(raw.slice(i, i + perLine));
    }
    w.y += 2;
    lines.forEach((line, i) => {
        const first = i === 0;
        const lastLine = i === lines.length - 1;
        const h = lineH + (first ? 5 : 0) + (lastLine ? 5 : 0);
        w.ensure(h);
        doc.save().rect(x, w.y, width, h).fill(theme.codeBg).restore();
        drawText(doc, line, x + 8, w.y + (first ? 5 : 0) + (lineH - size) / 2, { font: FONTS.mono, size, color: theme.ink2 });
        w.y += h;
    });
    w.y += 8;
}

// ============================================
// Entry
// ============================================

function collect(doc: Doc): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
    });
}

/** The PDF plus what the callers report (page count). */
export async function renderAssistantPdfDetailed(input: AssistantPdfDoc): Promise<AssistantPdfResult> {
    const theme = themeFor(input.brand);
    const doc = new PDFDocument({
        size: "A4",
        margins: { top: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin },
        bufferPages: true,
        info: {
            Title: pdfSafe(input.title),
            Author: pdfSafe(input.author?.trim() || input.brand.name),
            Creator: pdfSafe(input.brand.productName ?? input.brand.name),
            Subject: pdfSafe(input.subtitle ?? ""),
        },
    });
    const done = collect(doc);
    const w = new Writer(doc, theme, () => runningHeader(doc, theme, input), input.brand.appUrl || null);
    const state: RenderState = { w, theme, visuals: [], tableBreaks: 0 };

    drawCover(state, input);

    input.sections.forEach((section, i) => {
        state.visuals = section.visuals ?? [];
        if (i > 0 || section.heading || section.eyebrow) {
            if (i > 0) {
                w.ensure(70);
                w.y += 6;
                hairline(doc, LEFT, w.y, CW, theme.line, 0.75);
                w.y += 16;
            }
            if (section.eyebrow) {
                w.ensure(60);
                drawText(doc, section.eyebrow.toUpperCase(), LEFT, w.y, { font: FONTS.bold, size: 7.5, color: theme.primary });
                w.y += 13;
            }
            if (section.heading?.trim()) {
                const heading = layoutRuns(doc, [{ text: section.heading.trim() }], CW, { size: 12.5, color: theme.ink, bold: true, leading: 1.3 }, theme);
                // Keep the question with the start of its answer (a table needs its header and rows).
                flowParagraph(w, heading, LEFT, CW, { keep: 90 });
                w.y += 8;
            }
        }
        const blocks = answerToBlocks(section.markdown ?? "", state.visuals.length);
        if (blocks.length === 0) {
            w.ensure(14);
            drawText(doc, "—", LEFT, w.y, { size: BODY.size, color: theme.ink3 });
            w.y += 14;
        }
        renderBlocks(state, blocks, LEFT, CW);
    });

    const pages = drawFooters(doc, theme, input);
    doc.end();
    return { buffer: await done, pages, tableBreaks: state.tableBreaks };
}

export async function renderAssistantPdf(input: AssistantPdfDoc): Promise<Buffer> {
    return (await renderAssistantPdfDetailed(input)).buffer;
}
