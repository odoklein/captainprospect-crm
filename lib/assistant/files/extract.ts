/**
 * Server-side text extraction of assistant folder files (Captain AI v4).
 *
 * One entry point, `extractDocument(buffer, mimeType, name)`, returning the
 * full text plus sections (a PDF page, a DOCX heading, a spreadsheet sheet)
 * that lib/assistant/files/chunk.ts turns into retrieval chunks. Parsers are
 * imported lazily so a route that never extracts does not load pdf.js.
 *
 *   PDF   unpdf (pdf.js serverless build), one section per page. A PDF averaging
 *         under 40 characters per page is a scan: NEEDS_OCR, no text kept.
 *   DOCX  mammoth → HTML → sections split on headings (h1–h6), lists and
 *         tables flattened to lines.
 *   XLSX  exceljs, one section per sheet ("Feuille X"), rows as `a | b | c`,
 *         2000 rows per sheet.
 *   CSV   papaparse, same row format and cap.
 *   MD    split on `#` headings. TXT raw. Both UTF-8 (BOM stripped), with a
 *         Windows-1252 fallback for files saved by older French Excel/Notepad.
 *
 * Anything else is UNSUPPORTED. Total text is capped at 1.5M characters.
 */

import { FILE_ACCEPT } from "@/lib/assistant/api-contract";
import { ensurePdfRuntime } from "./runtime";

export type DocumentKind = "pdf" | "docx" | "xlsx" | "csv" | "md" | "txt";

export interface ExtractedSection {
    heading?: string;
    page?: number;
    text: string;
}

export type ExtractStatus = "READY" | "NEEDS_OCR" | "UNSUPPORTED";

export interface ExtractResult {
    status: ExtractStatus;
    text: string;
    pages?: number;
    sections: ExtractedSection[];
    extractor: string;
    /** The 1.5M-character cap or a row cap dropped content. */
    truncated: boolean;
}

export const MAX_TEXT_CHARS = 1_500_000;
export const MAX_ROWS_PER_SHEET = 2000;
/** Below this average of non-blank characters per page, a PDF is treated as scanned. */
export const MIN_PDF_CHARS_PER_PAGE = 40;

const KIND_BY_MIME: Record<string, DocumentKind> = {
    "application/pdf": "pdf",
    "application/x-pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/csv": "csv",
    "application/csv": "csv",
    "text/x-csv": "csv",
    "text/markdown": "md",
    "text/x-markdown": "md",
    "text/plain": "txt",
};

const KIND_BY_EXT: Record<string, DocumentKind> = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".xlsx": "xlsx",
    ".csv": "csv",
    ".md": "md",
    ".markdown": "md",
    ".txt": "txt",
};

/** Canonical mime per kind: the FILE_ACCEPT key whose extension list names it. */
export const CANONICAL_MIME: Record<DocumentKind, keyof typeof FILE_ACCEPT> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    md: "text/markdown",
    txt: "text/plain",
};

/** Every mime string that resolves to a supported kind (index-project filter). */
export const SUPPORTED_MIMES: readonly string[] = Object.keys(KIND_BY_MIME);

function extensionOf(name: string): string {
    const m = /\.[a-z0-9]+$/i.exec(name.trim());
    return m ? m[0].toLowerCase() : "";
}

/**
 * The document kind from the mime type, then from the extension: browsers send
 * "" or application/octet-stream for .md, and Windows labels .csv as
 * application/vnd.ms-excel. Null = not something we can read.
 */
export function resolveDocumentKind(mimeType: string | null | undefined, name: string): DocumentKind | null {
    const mime = (mimeType ?? "").split(";")[0].trim().toLowerCase();
    const byMime = KIND_BY_MIME[mime];
    if (byMime) return byMime;
    const byExt = KIND_BY_EXT[extensionOf(name)];
    if (!byExt) return null;
    // An extension only rescues a generic or mislabelled mime, never e.g. an image.
    if (!mime || mime === "application/octet-stream" || mime === "application/vnd.ms-excel" || mime.startsWith("text/")) return byExt;
    return null;
}

// ============================================
// Helpers
// ============================================

/** UTF-8 (BOM stripped), falling back to Windows-1252 when the bytes are not valid UTF-8. */
export function decodeText(buffer: Uint8Array): string {
    let text: string;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
        text = new TextDecoder("windows-1252").decode(buffer);
    }
    return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "");
}

function normalizeWhitespace(text: string): string {
    return text
        .replace(/\r\n?/g, "\n")
        .replace(/\u0000/g, "")
        .replace(/[ \t\f\v ]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function joinSections(sections: ExtractedSection[]): string {
    return sections
        .map((s) => (s.heading && !s.text.startsWith(s.heading) ? `${s.heading}\n${s.text}` : s.text))
        .filter((t) => t.trim())
        .join("\n\n");
}

/** Applies the global character cap on the sections, cutting the last kept one on a word boundary. */
function capSections(sections: ExtractedSection[], maxChars: number): { sections: ExtractedSection[]; truncated: boolean } {
    let used = 0;
    const out: ExtractedSection[] = [];
    for (const s of sections) {
        const cost = s.text.length + (s.heading?.length ?? 0) + 2;
        if (used + cost <= maxChars) {
            out.push(s);
            used += cost;
            continue;
        }
        const room = maxChars - used - (s.heading?.length ?? 0) - 2;
        if (room > 200) {
            const cut = s.text.slice(0, room);
            const space = cut.lastIndexOf(" ");
            out.push({ ...s, text: `${space > room * 0.8 ? cut.slice(0, space) : cut}…` });
        }
        return { sections: out, truncated: true };
    }
    return { sections: out, truncated: false };
}

function result(
    sections: ExtractedSection[],
    extractor: string,
    extra: { pages?: number; truncated?: boolean; status?: ExtractStatus } = {},
): ExtractResult {
    const capped = capSections(
        sections.filter((s) => s.text.trim()),
        MAX_TEXT_CHARS,
    );
    return {
        status: extra.status ?? "READY",
        text: joinSections(capped.sections),
        ...(extra.pages !== undefined ? { pages: extra.pages } : {}),
        sections: capped.sections,
        extractor,
        truncated: capped.truncated || extra.truncated === true,
    };
}

/** Row cells as `a | b | c`, trailing empty cells dropped; null for an empty row. */
export function formatRow(cells: unknown[]): string | null {
    const values = cells.map((c) => cellText(c).replace(/\s+/g, " ").trim());
    while (values.length > 0 && values[values.length - 1] === "") values.pop();
    if (values.every((v) => v === "")) return null;
    return values.join(" | ");
}

/** Spreadsheet cell to text (exceljs value shapes included). */
function cellText(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    if (typeof value === "boolean") return value ? "VRAI" : "FAUX";
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return "";
        const iso = value.toISOString();
        return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
    }
    if (typeof value === "object") {
        const v = value as Record<string, unknown>;
        if (Array.isArray(v.richText)) return (v.richText as Array<{ text?: unknown }>).map((r) => String(r.text ?? "")).join("");
        if ("result" in v) return cellText(v.result);
        if (typeof v.text === "string") return v.text;
        if (typeof v.error === "string") return v.error;
        if ("sharedFormula" in v || "formula" in v) return "";
    }
    return String(value);
}

/** Heading for a table section: its name plus the header row, so a chunk of rows keeps its columns. */
function tableHeading(name: string, header: string | null): string {
    const base = name;
    if (!header) return base;
    const h = `${base} — colonnes : ${header}`;
    return h.length > 240 ? `${h.slice(0, 239)}…` : h;
}

// ============================================
// Per-format extractors
// ============================================

async function extractPdf(buffer: Uint8Array): Promise<ExtractResult> {
    // pdf.js 6 needs Node 22+ built-ins; production runs Node 20 (see ./runtime.ts).
    ensurePdfRuntime();
    const { getDocumentProxy, extractText } = await import("unpdf");
    // pdf.js may transfer (detach) the buffer it is given: hand it a copy.
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    try {
        const { totalPages, text } = await extractText(pdf, { mergePages: false });
        const pages = text.map((t) => normalizeWhitespace(t));
        const visible = pages.reduce((n, t) => n + t.replace(/\s/g, "").length, 0);
        if (totalPages === 0 || visible / Math.max(1, totalPages) < MIN_PDF_CHARS_PER_PAGE) {
            return { status: "NEEDS_OCR", text: "", pages: totalPages, sections: [], extractor: "unpdf", truncated: false };
        }
        return result(
            pages.map((t, i) => ({ page: i + 1, text: t })),
            "unpdf",
            { pages: totalPages },
        );
    } finally {
        // Frees pdf.js workers/fonts; absent on some unpdf proxies, never fatal.
        const destroy = (pdf as { destroy?: () => unknown }).destroy;
        if (typeof destroy === "function") await Promise.resolve(destroy.call(pdf)).catch(() => undefined);
    }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
        if (code[0] === "#") {
            const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
        }
        return ENTITIES[code.toLowerCase()] ?? m;
    });
}

function stripTags(html: string): string {
    return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * mammoth's HTML (h1–h6, p, ul/ol/li, table/tr/td, strong/em, a, img) into
 * sections split on headings. Table rows become `a | b | c` lines, list items
 * "- item" lines.
 */
export function docxHtmlToSections(html: string): ExtractedSection[] {
    const HEADING_MARK = "\u0001H";
    let s = html
        .replace(/<img[^>]*>/gi, "")
        // Cells first: their inner paragraphs must not become blank-line breaks.
        .replace(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi, (_m, inner: string) => `${stripTags(inner)}\u0002`)
        .replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_m, inner: string) => {
            const cells = inner.split("\u0002").map((c) => c.replace(/<[^>]+>/g, "").trim());
            const row = formatRow(cells);
            return row ? `\n${row}` : "";
        })
        .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, _level: string, inner: string) => `\n\n${HEADING_MARK}${stripTags(inner)}\n\n`)
        .replace(/<li\b[^>]*>/gi, "\n- ")
        .replace(/<\/(p|li|ul|ol|table|div|blockquote)>/gi, "\n\n");
    s = decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""));

    const sections: ExtractedSection[] = [];
    let heading: string | undefined;
    let buf: string[] = [];
    const flush = () => {
        const text = normalizeWhitespace(buf.join("\n"));
        if (text) sections.push({ ...(heading ? { heading } : {}), text });
        buf = [];
    };
    for (const line of s.split("\n")) {
        if (line.startsWith(HEADING_MARK)) {
            flush();
            const h = line.slice(HEADING_MARK.length).trim();
            heading = h || heading;
            continue;
        }
        buf.push(line);
    }
    flush();
    return sections;
}

async function extractDocx(buffer: Uint8Array): Promise<ExtractResult> {
    const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
    const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(buffer) });
    return result(docxHtmlToSections(value), "mammoth");
}

async function extractXlsx(buffer: Uint8Array): Promise<ExtractResult> {
    const ExcelJSModule = await import("exceljs");
    const ExcelJS = (ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default ?? ExcelJSModule;
    const workbook = new ExcelJS.Workbook();
    // exceljs types predate Node's generic Buffer; the runtime only needs bytes.
    await workbook.xlsx.load(Buffer.from(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const sections: ExtractedSection[] = [];
    let truncated = false;
    workbook.eachSheet((sheet) => {
        const rows: string[] = [];
        let header: string | null = null;
        let skipped = 0;
        sheet.eachRow({ includeEmpty: false }, (row) => {
            const values = Array.isArray(row.values) ? row.values.slice(1) : [];
            const line = formatRow(values);
            if (!line) return;
            if (header === null) header = line;
            if (rows.length >= MAX_ROWS_PER_SHEET) {
                skipped += 1;
                return;
            }
            rows.push(line);
        });
        if (rows.length === 0) return;
        if (skipped > 0) {
            truncated = true;
            rows.push(`… ${skipped} ligne(s) au-delà de ${MAX_ROWS_PER_SHEET} non indexée(s).`);
        }
        sections.push({ heading: tableHeading(`Feuille ${sheet.name}`, header), text: rows.join("\n") });
    });
    return result(sections, "exceljs", { truncated });
}

async function extractCsv(buffer: Uint8Array, name: string): Promise<ExtractResult> {
    const Papa = (await import("papaparse")).default;
    const parsed = Papa.parse<string[]>(decodeText(buffer), { skipEmptyLines: "greedy" });
    const rows: string[] = [];
    let header: string | null = null;
    let skipped = 0;
    for (const record of parsed.data) {
        const line = formatRow(Array.isArray(record) ? record : []);
        if (!line) continue;
        if (header === null) header = line;
        if (rows.length >= MAX_ROWS_PER_SHEET) {
            skipped += 1;
            continue;
        }
        rows.push(line);
    }
    if (skipped > 0) rows.push(`… ${skipped} ligne(s) au-delà de ${MAX_ROWS_PER_SHEET} non indexée(s).`);
    const label = name.replace(/\.[^.]+$/, "") || "Tableau";
    return result(rows.length ? [{ heading: tableHeading(label, header), text: rows.join("\n") }] : [], "papaparse", {
        truncated: skipped > 0,
    });
}

/** Markdown split on ATX headings (outside fenced code). */
export function markdownSections(text: string): ExtractedSection[] {
    const sections: ExtractedSection[] = [];
    let heading: string | undefined;
    let buf: string[] = [];
    let fenced = false;
    const flush = () => {
        const t = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
        if (t) sections.push({ ...(heading ? { heading } : {}), text: t });
        buf = [];
    };
    for (const line of text.split("\n")) {
        if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
        const m = fenced ? null : /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
        if (m) {
            flush();
            heading = m[1].trim();
            continue;
        }
        buf.push(line);
    }
    flush();
    return sections;
}

// ============================================
// Entry point
// ============================================

export async function extractDocument(
    buffer: Uint8Array,
    mimeType: string | null | undefined,
    name: string,
): Promise<ExtractResult> {
    const kind = resolveDocumentKind(mimeType, name);
    switch (kind) {
        case "pdf":
            return extractPdf(buffer);
        case "docx":
            return extractDocx(buffer);
        case "xlsx":
            return extractXlsx(buffer);
        case "csv":
            return extractCsv(buffer, name);
        case "md":
            return result(markdownSections(decodeText(buffer)), "markdown");
        case "txt": {
            const text = decodeText(buffer).replace(/[ \t]+\n/g, "\n").trim();
            return result(text ? [{ text }] : [], "text");
        }
        default:
            return { status: "UNSUPPORTED", text: "", sections: [], extractor: "none", truncated: false };
    }
}
