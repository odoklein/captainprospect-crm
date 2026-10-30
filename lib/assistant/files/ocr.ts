/**
 * OCR of scanned PDFs (Captain AI v4 files pipeline).
 *
 * A PDF averaging under 40 selectable characters per page (extract.ts
 * NEEDS_OCR) is sent to a vision-capable OpenAI model through the Responses
 * API as an `input_file`, with a fixed transcription prompt. Long documents
 * are split with pdf-lib into parts of at most 30 pages (one call each, two at
 * a time); the model numbers pages inside its part and the offsets are put
 * back here. At most 150 pages are transcribed.
 *
 * Data class raw_crm (a client document): the residency guard of the provider
 * layer applies. Every call is written to the AI ledger as "assistant.ocr".
 *
 *   ASSISTANT_OCR=off       disables OCR (scanned PDFs stay NEEDS_OCR)
 *   ASSISTANT_OCR_MODEL     defaults to gpt-4.1-mini
 */

import { providerFileCallFn, type FileInputCallRequest, type FileInputCallResponse } from "@/lib/ai/providers";
import { EMPTY_USAGE, addUsage, type Usage } from "@/lib/ai/providers/types";
import { recordAiUsage, type AiUsageEntry } from "@/lib/ai/ledger";
import type { ExtractedSection } from "./extract";

export const OCR_PROMPT =
    'Transcris fidèlement tout le texte de ce document, page par page, avec "--- Page N ---" entre les pages. N\'ajoute rien.';
export const OCR_MAX_PAGES_PER_CALL = 30;
export const OCR_MAX_PAGES = 150;
export const DEFAULT_OCR_MODEL = "gpt-4.1-mini";
export const OCR_SURFACE = "assistant.ocr";
const OCR_MAX_OUTPUT_TOKENS = 32_000;
const OCR_CALL_TIMEOUT_MS = 180_000;
const OCR_CONCURRENCY = 2;

type Env = Record<string, string | undefined>;

export function ocrEnabled(env: Env = process.env): boolean {
    return env.ASSISTANT_OCR?.trim().toLowerCase() !== "off";
}

export function ocrModel(env: Env = process.env): string {
    return env.ASSISTANT_OCR_MODEL?.trim() || DEFAULT_OCR_MODEL;
}

// ============================================
// Splitting
// ============================================

export interface PdfPart {
    /** 1-based page numbers in the original document, inclusive. */
    firstPage: number;
    lastPage: number;
    bytes: Uint8Array;
}

export interface PdfSplit {
    parts: PdfPart[];
    totalPages: number;
    /** Pages beyond `maxTotalPages` were left out. */
    truncated: boolean;
}

/**
 * The document in parts of at most `perPart` pages (the original bytes when it
 * fits in one), up to `maxTotalPages`. Encrypted-but-openable PDFs are copied
 * page by page like any other.
 */
export async function splitPdfForOcr(
    bytes: Uint8Array,
    perPart: number = OCR_MAX_PAGES_PER_CALL,
    maxTotalPages: number = OCR_MAX_PAGES,
): Promise<PdfSplit> {
    const { PDFDocument } = await import("pdf-lib");
    const source = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const totalPages = source.getPageCount();
    const kept = Math.min(totalPages, Math.max(1, maxTotalPages));
    const size = Math.max(1, Math.floor(perPart));
    if (totalPages <= size) {
        return { parts: [{ firstPage: 1, lastPage: totalPages, bytes }], totalPages, truncated: false };
    }
    const parts: PdfPart[] = [];
    for (let start = 0; start < kept; start += size) {
        const end = Math.min(kept, start + size);
        const out = await PDFDocument.create();
        const pages = await out.copyPages(source, Array.from({ length: end - start }, (_, i) => start + i));
        for (const page of pages) out.addPage(page);
        parts.push({ firstPage: start + 1, lastPage: end, bytes: await out.save() });
    }
    return { parts, totalPages, truncated: kept < totalPages };
}

// ============================================
// Parsing the transcription
// ============================================

/** "--- Page 3 ---", "---- Page 3 ----", "— Page 3 —" (models sometimes typeset the dashes). */
const PAGE_MARK = /^[ \t]*(?:-{2,}|[–—]+)[ \t]*Page[ \t]+(\d+)[ \t]*(?:-{2,}|[–—]+)[ \t]*$/gim;

/**
 * "--- Page N ---" blocks into page sections. N is the page inside the part,
 * shifted by the part's first page; text before the first marker belongs to
 * the first page. Pages without text are dropped.
 */
export function parseOcrPages(text: string, firstPage: number, lastPage?: number): ExtractedSection[] {
    const clean = text.replace(/\r\n?/g, "\n");
    const marks = [...clean.matchAll(PAGE_MARK)];
    const out: ExtractedSection[] = [];
    const push = (page: number, body: string) => {
        const t = body.replace(/\n{3,}/g, "\n\n").trim();
        if (!t) return;
        const prev = out[out.length - 1];
        if (prev && prev.page === page) prev.text = `${prev.text}\n\n${t}`;
        else out.push({ page, text: t });
    };
    if (marks.length === 0) {
        push(firstPage, clean);
        return out;
    }
    push(firstPage, clean.slice(0, marks[0].index));
    marks.forEach((m, i) => {
        const local = Number(m[1]);
        let page = firstPage + Math.max(1, local) - 1;
        if (lastPage !== undefined) page = Math.min(page, lastPage);
        const end = i + 1 < marks.length ? marks[i + 1].index : clean.length;
        push(page, clean.slice((m.index ?? 0) + m[0].length, end));
    });
    return out;
}

// ============================================
// Running
// ============================================

export type FileCall = (request: FileInputCallRequest) => Promise<FileInputCallResponse>;

export interface OcrOptions {
    /** The provider call (tests inject a fake). Defaults to providerFileCallFn({ dataClass: "raw_crm" }). */
    call?: FileCall;
    model?: string;
    signal?: AbortSignal;
    /** Ledger writer; defaults to recordAiUsage. */
    ledger?: (entry: AiUsageEntry) => void;
    /** Who the call is billed to. */
    ledgerContext?: Pick<AiUsageEntry, "userId" | "clientId" | "missionId" | "conversationId">;
    env?: Env;
    timeoutMs?: number;
}

export interface OcrResult {
    sections: ExtractedSection[];
    text: string;
    totalPages: number;
    /** Pages beyond the cap were not transcribed, or a part stopped early. */
    truncated: boolean;
    model: string;
    usage: Usage;
}

/** Transcribes a scanned PDF. Throws the provider's error when a call fails. */
export async function ocrPdf(bytes: Uint8Array, filename: string, options: OcrOptions = {}): Promise<OcrResult> {
    const env = options.env ?? process.env;
    const model = options.model ?? ocrModel(env);
    const call = options.call ?? providerFileCallFn({ dataClass: "raw_crm" });
    const ledger = options.ledger ?? recordAiUsage;
    const split = await splitPdfForOcr(bytes);

    const results: Array<{ part: PdfPart; response: FileInputCallResponse }> = [];
    const queue = [...split.parts];
    const worker = async () => {
        for (let part = queue.shift(); part; part = queue.shift()) {
            const started = Date.now();
            const response = await call({
                model,
                prompt: OCR_PROMPT,
                file: { filename: partName(filename, part, split.parts.length), mimeType: "application/pdf", data: part.bytes },
                maxOutputTokens: OCR_MAX_OUTPUT_TOKENS,
                timeoutMs: options.timeoutMs ?? OCR_CALL_TIMEOUT_MS,
                temperature: 0,
                ...(options.signal ? { signal: options.signal } : {}),
            });
            if (response.usage) {
                ledger({
                    surface: OCR_SURFACE,
                    model: response.model || model,
                    usage: response.usage,
                    latencyMs: Date.now() - started,
                    dataClass: "raw_crm",
                    ...(options.ledgerContext ?? {}),
                });
            }
            results.push({ part, response });
        }
    };
    await Promise.all(Array.from({ length: Math.min(OCR_CONCURRENCY, queue.length) }, worker));

    results.sort((a, b) => a.part.firstPage - b.part.firstPage);
    const sections = results.flatMap((r) => parseOcrPages(r.response.text, r.part.firstPage, r.part.lastPage));
    const usage = results.reduce((u, r) => addUsage(u, r.response.usage), EMPTY_USAGE);
    return {
        sections,
        text: sections.map((s) => s.text).join("\n\n"),
        totalPages: split.totalPages,
        truncated: split.truncated || results.some((r) => r.response.incomplete !== null),
        model: results[0]?.response.model ?? model,
        usage,
    };
}

function partName(filename: string, part: PdfPart, count: number): string {
    const base = filename.replace(/\.pdf$/i, "") || "document";
    return count > 1 ? `${base} (p${part.firstPage}-${part.lastPage}).pdf` : `${base}.pdf`;
}
