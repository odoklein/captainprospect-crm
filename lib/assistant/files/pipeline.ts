/**
 * Extraction pipeline of assistant folder files (Captain AI v4):
 * claim → download → extract (→ OCR for a scanned PDF) → chunk → replace
 * chunks → READY.
 *
 * The claim is one atomic updateMany (PENDING, FAILED, or PROCESSING left
 * behind for 15 minutes by a crashed run → PROCESSING, attempts + 1), so two
 * schedulers can race on the same row and only one works. Attempts are capped
 * at 3; a reindex resets them. Chunks are replaced outside a transaction (a
 * 1500-chunk file would outlive an interactive transaction on the pooler):
 * search only reads READY texts, and READY is written last, so a half-written
 * set of chunks is never visible.
 *
 * Two ways in:
 *   - scheduleExtraction(ids): after the response (uploads, index-project,
 *     the files list healing stuck rows);
 *   - ensureFileTextReady(fileId) / ensureFileTextsReady(items): on demand,
 *     inside a tool call or before a chat turn, within a time budget (25 s by
 *     default). It creates the text row when the file was never indexed,
 *     reuses the claim, and when another process holds the claim it polls the
 *     row every 500 ms until it settles or the budget runs out. A run that
 *     outlives the budget keeps going in the background.
 *
 * Errors end FAILED / NEEDS_OCR / UNSUPPORTED with a French message naming
 * the cause (./errors.ts) and one structured log line
 * `[assistant.files] extract failed`. Document faults are permanent (attempts
 * jump to the cap); storage, engine and OCR-service trouble is retried.
 *
 * Every database access goes through a PipelineStore so the whole flow runs in
 * tests against an in-memory store with a fake storage and fake OCR.
 */

import { after } from "next/server";
import type { AssistantFileTextStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage-service";
import { isMissingSchemaError } from "@/lib/assistant/store/missing";
import { FILE_MAX_BYTES } from "@/lib/assistant/api-contract";
import { isConfigured, isProviderError } from "@/lib/ai/providers";
import type { AiUsageEntry } from "@/lib/ai/ledger";
import { extractDocument, resolveDocumentKind, type ExtractedSection } from "./extract";
import { chunkSections } from "./chunk";
import {
    EXTRACTION_MESSAGES,
    LEGACY_HEALABLE_ERRORS,
    OCR_HEALABLE_ERRORS,
    classifyExtractError,
    classifyStorageError,
    isPermanent,
    messageFor,
    type ExtractionCause,
} from "./errors";
import { ocrEnabled, ocrPdf, type OcrOptions, type OcrResult } from "./ocr";

export const MAX_EXTRACTION_ATTEMPTS = 3;
export const STALE_PROCESSING_MS = 15 * 60 * 1000;
/** On-demand extraction budget (tool call, chat turn). */
export const ON_DEMAND_BUDGET_MS = 25_000;
export const ON_DEMAND_POLL_MS = 500;
/** Files extracted at once by an on-demand batch. */
export const ON_DEMAND_CONCURRENCY = 3;
/** Below this many non-blank characters, an OCR transcription counts as empty. */
const OCR_MIN_CHARS = 20;
const INSERT_BATCH = 50;
/** Files processed at once by one scheduled run. */
const CONCURRENCY = 2;

export type ExtractionOutcome = AssistantFileTextStatus | "SKIPPED";

// ============================================
// Store
// ============================================

export interface FileTextState {
    id: string;
    fileId: string;
    folderId: string;
    status: AssistantFileTextStatus;
    attempts: number;
    error: string | null;
    pages: number | null;
    chunkCount: number;
    extractor: string | null;
    updatedAt: Date;
}

export interface ExtractionSource {
    id: string;
    folderId: string;
    fileId: string;
    file: { path: string; mimeType: string; originalName: string | null; name: string; size: number; deletedAt: Date | null };
}

export interface ChunkRow {
    index: number;
    content: string;
    tokens: number;
    page: number | null;
    heading: string | null;
}

export interface PipelineStore {
    /** PENDING / FAILED / stale PROCESSING with attempts left → PROCESSING, attempts + 1. */
    claim(fileTextId: string, now: Date): Promise<boolean>;
    load(fileTextId: string): Promise<ExtractionSource | null>;
    replaceChunks(source: { id: string; folderId: string; fileId: string }, chunks: ChunkRow[]): Promise<void>;
    settle(
        fileTextId: string,
        status: "FAILED" | "NEEDS_OCR" | "UNSUPPORTED",
        error: string,
        extra: { pages?: number | null; extractor?: string | null; permanent?: boolean },
    ): Promise<void>;
    markReady(
        fileTextId: string,
        data: { text: string; pages: number | null; tokens: number; chunkCount: number; extractor: string; note: string | null },
    ): Promise<void>;
    byId(fileTextId: string): Promise<FileTextState | null>;
    byFileId(fileId: string): Promise<FileTextState | null>;
    /** A PENDING row for a file never indexed; a concurrent creation is not an error. */
    createPending(fileId: string, folderId: string): Promise<void>;
    /** Back to PENDING with a fresh attempt budget, only if the row still has this status and error. */
    reset(fileTextId: string, expected: { status: AssistantFileTextStatus; error: string | null }): Promise<boolean>;
}

const STATE_SELECT = {
    id: true,
    fileId: true,
    folderId: true,
    status: true,
    attempts: true,
    error: true,
    pages: true,
    chunkCount: true,
    extractor: true,
    updatedAt: true,
} as const;

export const prismaPipelineStore: PipelineStore = {
    async claim(fileTextId, now) {
        const claimed = await prisma.assistantFileText.updateMany({
            where: {
                id: fileTextId,
                attempts: { lt: MAX_EXTRACTION_ATTEMPTS },
                OR: [
                    { status: { in: ["PENDING", "FAILED"] } },
                    { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) } },
                ],
            },
            data: { status: "PROCESSING", attempts: { increment: 1 }, error: null },
        });
        return claimed.count === 1;
    },
    load(fileTextId) {
        return prisma.assistantFileText.findUnique({
            where: { id: fileTextId },
            select: {
                id: true,
                folderId: true,
                fileId: true,
                file: { select: { path: true, mimeType: true, originalName: true, name: true, size: true, deletedAt: true } },
            },
        });
    },
    async replaceChunks(source, chunks) {
        await prisma.assistantFileChunk.deleteMany({ where: { fileTextId: source.id } });
        for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
            // `tsv` is a generated column: never written here.
            await prisma.assistantFileChunk.createMany({
                data: chunks.slice(i, i + INSERT_BATCH).map((c) => ({
                    fileTextId: source.id,
                    folderId: source.folderId,
                    fileId: source.fileId,
                    index: c.index,
                    page: c.page,
                    heading: c.heading ? c.heading.slice(0, 500) : null,
                    content: c.content,
                    tokens: c.tokens,
                })),
            });
        }
    },
    async settle(fileTextId, status, error, extra) {
        await prisma.assistantFileChunk.deleteMany({ where: { fileTextId } }).catch(() => undefined);
        await prisma.assistantFileText.update({
            where: { id: fileTextId },
            data: {
                status,
                error: error.slice(0, 500),
                text: null,
                chars: 0,
                tokens: 0,
                chunkCount: 0,
                ...(extra.pages !== undefined ? { pages: extra.pages } : {}),
                ...(extra.extractor !== undefined ? { extractor: extra.extractor } : {}),
                ...(status !== "FAILED" ? { extractedAt: new Date() } : {}),
                ...(extra.permanent ? { attempts: MAX_EXTRACTION_ATTEMPTS } : {}),
            },
        });
    },
    async markReady(fileTextId, data) {
        await prisma.assistantFileText.update({
            where: { id: fileTextId },
            data: {
                status: "READY",
                text: data.text,
                pages: data.pages,
                chars: data.text.length,
                tokens: data.tokens,
                chunkCount: data.chunkCount,
                extractor: data.extractor,
                error: data.note,
                extractedAt: new Date(),
            },
        });
    },
    byId(fileTextId) {
        return prisma.assistantFileText.findUnique({ where: { id: fileTextId }, select: STATE_SELECT });
    },
    byFileId(fileId) {
        return prisma.assistantFileText.findUnique({ where: { fileId }, select: STATE_SELECT });
    },
    async createPending(fileId, folderId) {
        // fileId is unique: a concurrent creation is skipped, not duplicated.
        await prisma.assistantFileText.createMany({ data: [{ fileId, folderId, status: "PENDING" }], skipDuplicates: true });
    },
    async reset(fileTextId, expected) {
        const done = await prisma.assistantFileText.updateMany({
            where: { id: fileTextId, status: expected.status, error: expected.error },
            data: { status: "PENDING", attempts: 0, error: null },
        });
        return done.count === 1;
    },
};

// ============================================
// Dependencies
// ============================================

type Env = Record<string, string | undefined>;

export interface PipelineDeps {
    store: PipelineStore;
    download: (path: string) => Promise<Uint8Array>;
    extract: typeof extractDocument;
    ocr: (bytes: Uint8Array, filename: string, options: OcrOptions) => Promise<OcrResult>;
    /** OCR switched on (ASSISTANT_OCR) and an OpenAI key present. */
    ocrAvailable: () => boolean;
    env: Env;
    now: () => Date;
    sleep: (ms: number) => Promise<void>;
}

export function defaultPipelineDeps(): PipelineDeps {
    return {
        store: prismaPipelineStore,
        download: async (path) => new Uint8Array(await storageService.download(path)),
        extract: extractDocument,
        ocr: ocrPdf,
        ocrAvailable: () => ocrEnabled(process.env) && isConfigured("openai"),
        env: process.env,
        now: () => new Date(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    };
}

function withDeps(partial?: Partial<PipelineDeps>): PipelineDeps {
    return partial ? { ...defaultPipelineDeps(), ...partial } : defaultPipelineDeps();
}

export interface ExtractOptions {
    deps?: Partial<PipelineDeps>;
    /** Who an OCR call is billed to in the AI ledger. */
    ledgerContext?: OcrOptions["ledgerContext"];
}

// ============================================
// One extraction
// ============================================

/** A terminal non-READY state, its message and the log line. */
class Settled extends Error {
    constructor(
        readonly status: "FAILED" | "NEEDS_OCR" | "UNSUPPORTED",
        readonly cause: ExtractionCause,
        readonly detail: string | null = null,
        readonly extra: { pages?: number | null; extractor?: string | null } = {},
    ) {
        super(cause);
    }
}

function errorText(error: unknown): string {
    if (isProviderError(error)) return error.userMessage || error.message;
    return error instanceof Error ? error.message : String(error);
}

function logFailure(source: { id: string; fileId: string }, cause: ExtractionCause, detail: string | null): void {
    console.warn("[assistant.files] extract failed", { fileId: source.fileId, fileTextId: source.id, cause, ...(detail ? { detail: detail.slice(0, 300) } : {}) });
}

async function runOcr(deps: PipelineDeps, bytes: Uint8Array, name: string, pages: number | null, options: ExtractOptions): Promise<OcrResult> {
    if (!ocrEnabled(deps.env)) throw new Settled("NEEDS_OCR", "ocr_disabled", null, { pages, extractor: "unpdf" });
    if (!deps.ocrAvailable()) throw new Settled("NEEDS_OCR", "ocr_unconfigured", null, { pages, extractor: "unpdf" });
    let result: OcrResult;
    try {
        result = await deps.ocr(bytes, name, { env: deps.env, ...(options.ledgerContext ? { ledgerContext: options.ledgerContext } : {}) });
    } catch (error) {
        const detail = errorText(error);
        if (isProviderError(error) && error.kind === "not_configured") {
            throw new Settled("NEEDS_OCR", "ocr_unconfigured", detail, { pages, extractor: "unpdf" });
        }
        if (isProviderError(error) && error.retryable) throw new Settled("FAILED", "ocr_unavailable", detail, { pages, extractor: "unpdf" });
        throw new Settled("NEEDS_OCR", "ocr_failed", detail, { pages, extractor: "unpdf" });
    }
    if (result.text.replace(/\s/g, "").length < OCR_MIN_CHARS) {
        throw new Settled("NEEDS_OCR", "ocr_empty", null, { pages: result.totalPages || pages, extractor: "openai-ocr" });
    }
    return result;
}

/**
 * Extracts one AssistantFileText. Returns the final status, or "SKIPPED" when
 * the row could not be claimed (already done, held by another run, out of
 * attempts, or the tables are missing). Never throws.
 */
export async function extractFileText(fileTextId: string, options: ExtractOptions = {}): Promise<ExtractionOutcome> {
    const deps = withDeps(options.deps);
    const { store } = deps;
    try {
        if (!(await store.claim(fileTextId, deps.now()))) return "SKIPPED";
    } catch (error) {
        if (!isMissingSchemaError(error)) console.error("[assistant.files] claim failed", fileTextId, error);
        return "SKIPPED";
    }

    let source: ExtractionSource | null = null;
    try {
        source = await store.load(fileTextId);
        if (!source) return "SKIPPED";
        if (source.file.deletedAt) throw new Settled("FAILED", "deleted");
        if (source.file.size > FILE_MAX_BYTES) throw new Settled("FAILED", "too_large");

        let bytes: Uint8Array;
        try {
            bytes = await deps.download(source.file.path);
        } catch (error) {
            throw new Settled("FAILED", classifyStorageError(error), errorText(error));
        }

        const name = source.file.originalName || source.file.name;
        const kind = resolveDocumentKind(source.file.mimeType, name);
        let extracted: Awaited<ReturnType<typeof extractDocument>>;
        try {
            // pdf.js may detach the buffer it reads: keep our own bytes for the OCR.
            extracted = await deps.extract(new Uint8Array(bytes), source.file.mimeType, name);
        } catch (error) {
            throw new Settled("FAILED", classifyExtractError(error, kind), errorText(error));
        }

        if (extracted.status === "UNSUPPORTED") throw new Settled("UNSUPPORTED", "unsupported", null, { extractor: extracted.extractor });

        let sections: ExtractedSection[] = extracted.sections;
        let text = extracted.text;
        let pages = extracted.pages ?? null;
        let extractor = extracted.extractor;
        let truncated = extracted.truncated;
        if (extracted.status === "NEEDS_OCR") {
            const ocr = await runOcr(deps, bytes, name, pages, options);
            sections = ocr.sections;
            text = ocr.text;
            pages = ocr.totalPages || pages;
            extractor = "openai-ocr";
            truncated = ocr.truncated;
        }

        const chunked = chunkSections(sections);
        await store.replaceChunks(source, chunked.chunks);
        await store.markReady(source.id, {
            text,
            pages,
            tokens: chunked.chunks.reduce((n, c) => n + c.tokens, 0),
            chunkCount: chunked.chunks.length,
            extractor,
            note: truncated || chunked.truncated ? "Document très long : seule la première partie est indexée." : null,
        });
        return "READY";
    } catch (error) {
        const settled =
            error instanceof Settled ? error : new Settled("FAILED", "unexpected", errorText(error));
        if (!(error instanceof Settled)) console.error("[assistant.files] extraction run failed", fileTextId, error);
        logFailure(source ?? { id: fileTextId, fileId: "?" }, settled.cause, settled.detail);
        try {
            await store.settle(fileTextId, settled.status, messageFor(settled.cause, settled.detail), {
                ...settled.extra,
                permanent: isPermanent(settled.cause),
            });
        } catch (inner) {
            console.error("[assistant.files] could not record the failure", fileTextId, inner);
        }
        return settled.status;
    }
}

// ============================================
// Healing rows failed for reasons that are gone
// ============================================

const RETRYABLE_PREFIXES = [
    EXTRACTION_MESSAGES.storage_error,
    EXTRACTION_MESSAGES.pdf_engine,
    EXTRACTION_MESSAGES.ocr_unavailable,
    EXTRACTION_MESSAGES.unexpected,
];

/**
 * Whether a settled row deserves a fresh attempt budget.
 *   - always: FAILED with a message of an earlier version (Node 20 pdf.js
 *     failure recorded as « corrompu »), NEEDS_OCR without OCR when OCR is now
 *     available;
 *   - on demand only (someone is asking to read it): FAILED out of attempts
 *     for a server-side cause (storage, PDF engine, OCR service, unexpected).
 */
export function isHealable(row: Pick<FileTextState, "status" | "error" | "attempts">, ocrAvailable: boolean, onDemand: boolean): boolean {
    const error = row.error ?? "";
    if (row.status === "FAILED" && LEGACY_HEALABLE_ERRORS.includes(error)) return true;
    if (row.status === "NEEDS_OCR" && ocrAvailable && OCR_HEALABLE_ERRORS.includes(error)) return true;
    if (onDemand && row.status === "FAILED" && row.attempts >= MAX_EXTRACTION_ATTEMPTS) {
        return RETRYABLE_PREFIXES.some((p) => error.startsWith(p));
    }
    return false;
}

// ============================================
// On demand
// ============================================

export type EnsureStatus = AssistantFileTextStatus | "MISSING";

export interface EnsureResult {
    fileId: string;
    fileTextId: string | null;
    folderId: string | null;
    status: EnsureStatus;
    error: string | null;
    pages: number | null;
    chunkCount: number;
    extractor: string | null;
    /** The budget ran out while the extraction was still going (it continues in the background). */
    timedOut: boolean;
    /** This call ran or waited for an extraction (false: the text was already there or settled). */
    extracted: boolean;
}

export interface EnsureOptions extends ExtractOptions {
    /** Folder the text row is created in when the file was never indexed. Without it, a missing row stays MISSING. */
    folderId?: string | null;
    budgetMs?: number;
    pollMs?: number;
    /** Absolute deadline (ms since epoch), shared by a batch; wins over budgetMs. */
    deadline?: number;
}

function toResult(fileId: string, row: FileTextState | null, extra: { timedOut?: boolean; extracted?: boolean } = {}): EnsureResult {
    return {
        fileId,
        fileTextId: row?.id ?? null,
        folderId: row?.folderId ?? null,
        status: row?.status ?? "MISSING",
        error: row?.error ?? null,
        pages: row?.pages ?? null,
        chunkCount: row?.chunkCount ?? 0,
        extractor: row?.extractor ?? null,
        timedOut: extra.timedOut ?? false,
        extracted: extra.extracted ?? false,
    };
}

/**
 * Makes the text of one File readable now: READY rows return at once; a file
 * never indexed gets a PENDING row in `folderId`; a claimable row is
 * extracted here; a row held by another run is polled every 500 ms. Stops at
 * the budget (25 s) — the extraction then finishes in the background and the
 * result says `timedOut`. Throws only on database errors (callers wrap).
 */
export async function ensureFileTextReady(fileId: string, options: EnsureOptions = {}): Promise<EnsureResult> {
    const deps = withDeps(options.deps);
    const { store } = deps;
    const deadline = options.deadline ?? deps.now().getTime() + (options.budgetMs ?? ON_DEMAND_BUDGET_MS);
    const pollMs = options.pollMs ?? ON_DEMAND_POLL_MS;
    const remaining = () => deadline - deps.now().getTime();

    let row = await store.byFileId(fileId);
    if (!row) {
        if (!options.folderId) return toResult(fileId, null);
        await store.createPending(fileId, options.folderId);
        row = await store.byFileId(fileId);
        if (!row) return toResult(fileId, null);
    }
    if (row.status === "READY") return toResult(fileId, row);

    if (isHealable(row, deps.ocrAvailable(), true)) {
        await store.reset(row.id, { status: row.status, error: row.error });
        row = (await store.byId(row.id)) ?? row;
    }
    if (isSettled(row)) return toResult(fileId, row); // NEEDS_OCR, UNSUPPORTED, FAILED out of attempts

    const fileTextId = row.id;
    const childOptions: ExtractOptions = { deps, ...(options.ledgerContext ? { ledgerContext: options.ledgerContext } : {}) };
    for (;;) {
        // Claim and extract here; SKIPPED means another run holds the claim.
        const attempt = extractFileText(fileTextId, childOptions);
        const outcome = await raceDeadline(attempt, remaining());
        if (outcome === TIMEOUT) {
            // Our own run outlives the budget: it finishes in the background.
            void attempt.catch(() => undefined);
            return toResult(fileId, await store.byId(fileTextId), { timedOut: true, extracted: true });
        }
        const current = await store.byId(fileTextId);
        if (!current) return toResult(fileId, null);
        if (outcome !== "SKIPPED" || isSettled(current)) return toResult(fileId, current, { extracted: true });
        if (remaining() <= 0) return toResult(fileId, current, { timedOut: true, extracted: true });
        await deps.sleep(Math.min(pollMs, remaining()));
        if (remaining() <= 0) {
            const last = await store.byId(fileTextId);
            return toResult(fileId, last, { timedOut: !!last && !isSettled(last), extracted: true });
        }
    }
}

/** READY, or a terminal state the pipeline will not retry by itself. */
function isSettled(row: Pick<FileTextState, "status" | "attempts">): boolean {
    if (row.status === "READY" || row.status === "NEEDS_OCR" || row.status === "UNSUPPORTED") return true;
    return row.status === "FAILED" && row.attempts >= MAX_EXTRACTION_ATTEMPTS;
}

const TIMEOUT = Symbol("timeout");

async function raceDeadline<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
    if (ms <= 0) return TIMEOUT;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([promise, new Promise<typeof TIMEOUT>((resolve) => (timer = setTimeout(() => resolve(TIMEOUT), ms)))]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * Several files under one shared budget, at most 3 at a time (attachments of a
 * chat turn, a search over unindexed files). Never throws: a file whose
 * extraction errors comes back FAILED with the reason.
 */
export async function ensureFileTextsReady(
    items: Array<{ fileId: string; folderId?: string | null }>,
    options: Omit<EnsureOptions, "folderId" | "deadline"> & { concurrency?: number } = {},
): Promise<Map<string, EnsureResult>> {
    const deps = withDeps(options.deps);
    const deadline = deps.now().getTime() + (options.budgetMs ?? ON_DEMAND_BUDGET_MS);
    const results = new Map<string, EnsureResult>();
    const unique = [...new Map(items.filter((i) => i.fileId).map((i) => [i.fileId, i])).values()];
    const queue = [...unique];
    const worker = async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
            try {
                results.set(
                    item.fileId,
                    await ensureFileTextReady(item.fileId, { ...options, deps, deadline, folderId: item.folderId ?? null }),
                );
            } catch (error) {
                if (!isMissingSchemaError(error)) console.error("[assistant.files] on-demand extraction failed", item.fileId, error);
                results.set(item.fileId, {
                    ...toResult(item.fileId, null),
                    status: "FAILED",
                    error: EXTRACTION_MESSAGES.unexpected,
                });
            }
        }
    };
    const width = Math.max(1, Math.min(options.concurrency ?? ON_DEMAND_CONCURRENCY, queue.length));
    await Promise.all(Array.from({ length: width }, worker));
    return results;
}

// ============================================
// Background scheduling
// ============================================

async function runAll(ids: string[]): Promise<void> {
    const queue = [...ids];
    const worker = async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
            await extractFileText(id);
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
}

/**
 * Runs the extraction of these AssistantFileText ids after the response:
 * through next/server `after()` inside a request (the platform keeps the
 * function alive until it settles, within the route's maxDuration), or as a
 * detached promise elsewhere (scripts, the agent worker). A run cut short
 * leaves PROCESSING rows that the next pass reclaims after 15 minutes.
 */
export function scheduleExtraction(ids: string[]): void {
    const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
    if (unique.length === 0) return;
    const run = () =>
        runAll(unique).catch((error) => {
            console.error("[assistant.files] scheduled extraction failed", error);
        });
    try {
        after(run);
        return;
    } catch {
        // Outside a request scope: after() throws; fall through to a detached run.
    }
    void run();
}

/**
 * Rows of a folder worth another pass: PENDING for over a minute (its after()
 * was lost to a restart), PROCESSING abandoned for 15 minutes, FAILED with
 * attempts left and quiet for 5 minutes — plus rows settled by an earlier
 * version for a reason that is gone (isHealable), reset once to PENDING. The
 * files list calls this so a stuck file heals when someone looks at it.
 */
export async function findRetriableTexts(folderId: string, now: Date = new Date()): Promise<string[]> {
    const ocrNow = ocrEnabled(process.env) && isConfigured("openai");
    const stale = await prisma.assistantFileText.findMany({
        where: {
            folderId,
            file: { deletedAt: null },
            OR: [
                { status: "FAILED", error: { in: [...LEGACY_HEALABLE_ERRORS] } },
                ...(ocrNow ? [{ status: "NEEDS_OCR" as const, error: { in: [...OCR_HEALABLE_ERRORS] } }] : []),
            ],
        },
        select: { id: true, status: true, error: true },
        take: 10,
    });
    const healed: string[] = [];
    for (const row of stale) {
        if (await prismaPipelineStore.reset(row.id, { status: row.status, error: row.error })) healed.push(row.id);
    }

    const rows = await prisma.assistantFileText.findMany({
        where: {
            folderId,
            attempts: { lt: MAX_EXTRACTION_ATTEMPTS },
            file: { deletedAt: null },
            OR: [
                { status: "PENDING", updatedAt: { lt: new Date(now.getTime() - 60_000) } },
                { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) } },
                { status: "FAILED", updatedAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
            ],
        },
        select: { id: true },
        take: 10,
    });
    return [...new Set([...healed, ...rows.map((r) => r.id)])];
}
