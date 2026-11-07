/**
 * The extraction pipeline end to end without a database or a network:
 *     npx tsx --test lib/assistant/files/pipeline.test.ts
 *
 * An in-memory PipelineStore with the same claim rule as the Prisma one, a
 * fake storage (bytes by path, or a thrown error), real parsers (PDFs built
 * with pdf-lib, a garbage DOCX), and a fake OCR. Covers the on-demand path
 * (never-indexed file, concurrent callers, a claim held elsewhere, the 25 s
 * budget), one French message per failure cause with its structured log
 * line, OCR of a scanned PDF, and the one-time healing of rows an earlier
 * version settled for reasons that are gone.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { ProviderError } from "@/lib/ai/providers/errors";
import {
    MAX_EXTRACTION_ATTEMPTS,
    STALE_PROCESSING_MS,
    ensureFileTextReady,
    ensureFileTextsReady,
    extractFileText,
    isHealable,
    type ChunkRow,
    type FileTextState,
    type PipelineDeps,
    type PipelineStore,
} from "./pipeline";
import { EXTRACTION_MESSAGES, LEGACY_HEALABLE_ERRORS, classifyExtractError, classifyStorageError, messageFor } from "./errors";
import { extractDocument } from "./extract";
import type { OcrResult } from "./ocr";

// ── Fixtures ────────────────────────────────────────────────────────────────

async function textPdf(pages: string[]): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const line of pages) doc.addPage().drawText(line, { x: 40, y: 700, size: 11, font });
    return doc.save();
}

/** Pages with no text layer: what a scanner produces, as far as unpdf can tell. */
async function blankPdf(pages: number): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage();
    return doc.save();
}

interface FileFixture {
    path: string;
    mimeType: string;
    originalName: string;
    size?: number;
    deletedAt?: Date | null;
}

interface Row extends FileTextState {
    text: string | null;
    chunks: ChunkRow[];
}

class MemoryStore implements PipelineStore {
    rows = new Map<string, Row>();
    files = new Map<string, FileFixture>();
    clock: () => Date;
    seq = 0;
    constructor(clock: () => Date) {
        this.clock = clock;
    }
    addFile(fileId: string, f: FileFixture) {
        this.files.set(fileId, f);
    }
    addRow(fileId: string, folderId: string, over: Partial<Row> = {}): Row {
        const row: Row = {
            id: `ft_${fileId}`,
            fileId,
            folderId,
            status: "PENDING",
            attempts: 0,
            error: null,
            pages: null,
            chunkCount: 0,
            extractor: null,
            updatedAt: this.clock(),
            text: null,
            chunks: [],
            ...over,
        };
        this.rows.set(row.id, row);
        return row;
    }
    private touch(row: Row) {
        row.updatedAt = this.clock();
    }
    async claim(id: string, now: Date) {
        const r = this.rows.get(id);
        if (!r || r.attempts >= MAX_EXTRACTION_ATTEMPTS) return false;
        const stale = r.status === "PROCESSING" && r.updatedAt.getTime() < now.getTime() - STALE_PROCESSING_MS;
        if (!(r.status === "PENDING" || r.status === "FAILED" || stale)) return false;
        r.status = "PROCESSING";
        r.attempts += 1;
        r.error = null;
        this.touch(r);
        return true;
    }
    async load(id: string) {
        const r = this.rows.get(id);
        if (!r) return null;
        const f = this.files.get(r.fileId);
        if (!f) return null;
        return {
            id: r.id,
            folderId: r.folderId,
            fileId: r.fileId,
            file: { path: f.path, mimeType: f.mimeType, originalName: f.originalName, name: f.originalName, size: f.size ?? 1000, deletedAt: f.deletedAt ?? null },
        };
    }
    async replaceChunks(source: { id: string }, chunks: ChunkRow[]) {
        this.rows.get(source.id)!.chunks = chunks;
    }
    async settle(id: string, status: "FAILED" | "NEEDS_OCR" | "UNSUPPORTED", error: string, extra: { pages?: number | null; extractor?: string | null; permanent?: boolean }) {
        const r = this.rows.get(id)!;
        Object.assign(r, { status, error, text: null, chunkCount: 0, chunks: [] });
        if (extra.pages !== undefined) r.pages = extra.pages;
        if (extra.extractor !== undefined) r.extractor = extra.extractor;
        if (extra.permanent) r.attempts = MAX_EXTRACTION_ATTEMPTS;
        this.touch(r);
    }
    async markReady(id: string, data: { text: string; pages: number | null; chunkCount: number; extractor: string; note: string | null }) {
        const r = this.rows.get(id)!;
        Object.assign(r, { status: "READY", text: data.text, pages: data.pages, chunkCount: data.chunkCount, extractor: data.extractor, error: data.note });
        this.touch(r);
    }
    async byId(id: string) {
        const r = this.rows.get(id);
        return r ? { ...r } : null;
    }
    async byFileId(fileId: string) {
        const r = [...this.rows.values()].find((x) => x.fileId === fileId);
        return r ? { ...r } : null;
    }
    async createPending(fileId: string, folderId: string) {
        if (![...this.rows.values()].some((x) => x.fileId === fileId)) this.addRow(fileId, folderId);
    }
    async reset(id: string, expected: { status: string; error: string | null }) {
        const r = this.rows.get(id);
        if (!r || r.status !== expected.status || r.error !== expected.error) return false;
        Object.assign(r, { status: "PENDING", attempts: 0, error: null });
        this.touch(r);
        return true;
    }
}

interface Harness {
    store: MemoryStore;
    blobs: Map<string, Uint8Array | Error>;
    deps: Partial<PipelineDeps>;
    calls: { extract: number; ocr: number; download: number };
    advance: (ms: number) => void;
}

function harness(over: Partial<PipelineDeps> & { ocrResult?: (bytes: Uint8Array) => Promise<OcrResult> } = {}): Harness {
    let now = new Date("2026-10-29T10:00:00Z").getTime();
    const clock = () => new Date(now);
    const store = new MemoryStore(clock);
    const blobs = new Map<string, Uint8Array | Error>();
    const calls = { extract: 0, ocr: 0, download: 0 };
    const deps: Partial<PipelineDeps> = {
        store,
        download: async (path) => {
            calls.download++;
            const b = blobs.get(path);
            if (!b) throw Object.assign(new Error(`ENOENT: no such file, open '${path}'`), { code: "ENOENT" });
            if (b instanceof Error) throw b;
            return b;
        },
        extract: async (...args) => {
            calls.extract++;
            return extractDocument(...args);
        },
        ocr: async (bytes) => {
            calls.ocr++;
            if (over.ocrResult) return over.ocrResult(bytes);
            throw new Error("OCR not expected");
        },
        ocrAvailable: () => true,
        env: { ASSISTANT_OCR: "on" },
        now: clock,
        sleep: async (ms) => {
            now += ms;
        },
        ...over,
    };
    return { store, blobs, deps, calls, advance: (ms) => (now += ms) };
}

function captureWarnings(): { lines: unknown[][]; restore: () => void } {
    const lines: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
        lines.push(args);
    };
    return { lines, restore: () => (console.warn = original) };
}

// ── On demand ───────────────────────────────────────────────────────────────

test("a never-indexed file gets a text row in the given folder and is READY in the same call", async () => {
    const h = harness();
    h.store.addFile("f1", { path: "k/f1.pdf", mimeType: "application/pdf", originalName: "contrat.pdf" });
    h.blobs.set(
        "k/f1.pdf",
        await textPdf([
            "Contrat de prestation de prospection commerciale : duree douze mois renouvelable.",
            "Tarif mensuel 4500 euros HT, facturation au debut de chaque mois calendaire.",
        ]),
    );

    const r = await ensureFileTextReady("f1", { folderId: "client-folder", deps: h.deps });
    assert.equal(r.status, "READY");
    assert.equal(r.folderId, "client-folder");
    assert.equal(r.pages, 2);
    assert.ok(r.chunkCount >= 1);
    assert.equal(r.extracted, true);
    const row = await h.store.byFileId("f1");
    assert.match((row as Row).text ?? "", /douze mois/);

    // Second call: already READY, nothing extracted again.
    const again = await ensureFileTextReady("f1", { folderId: "client-folder", deps: h.deps });
    assert.equal(again.status, "READY");
    assert.equal(again.extracted, false);
    assert.equal(h.calls.extract, 1);
});

test("without a folder, a never-indexed file stays MISSING (no row created)", async () => {
    const h = harness();
    const r = await ensureFileTextReady("ghost", { deps: h.deps });
    assert.equal(r.status, "MISSING");
    assert.equal(h.store.rows.size, 0);
});

test("concurrent callers extract once: the claim is reused, the loser waits for the winner", async () => {
    const h = harness({ sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 5))) });
    h.store.addFile("f2", { path: "k/f2.txt", mimeType: "text/plain", originalName: "notes.txt" });
    h.blobs.set("k/f2.txt", new TextEncoder().encode("Notes de cadrage : cible DAF de PME."));

    const [a, b] = await Promise.all([
        ensureFileTextReady("f2", { folderId: "fa", deps: h.deps }),
        ensureFileTextReady("f2", { folderId: "fa", deps: h.deps }),
    ]);
    assert.equal(a.status, "READY");
    assert.equal(b.status, "READY");
    assert.equal(h.calls.extract, 1, "one extraction for two callers");
    assert.equal(h.store.rows.size, 1, "one text row");
});

test("a claim held by another process is polled every 500 ms until it settles", async () => {
    const h = harness();
    h.store.addFile("f3", { path: "k/f3.txt", mimeType: "text/plain", originalName: "a.txt" });
    const row = h.store.addRow("f3", "fa", { status: "PROCESSING", attempts: 1 });
    const sleeps: number[] = [];
    h.deps.sleep = async (ms) => {
        sleeps.push(ms);
        h.advance(ms);
        if (sleeps.length === 3) {
            // The other process finishes.
            Object.assign(h.store.rows.get(row.id)!, { status: "READY", chunkCount: 2, pages: null });
        }
    };
    const r = await ensureFileTextReady("f3", { folderId: "fa", deps: h.deps });
    assert.equal(r.status, "READY");
    assert.deepEqual(sleeps, [500, 500, 500]);
    assert.equal(h.calls.extract, 0, "never extracted twice");
});

test("the budget is honoured: a claim never released ends timedOut, not hung", async () => {
    const h = harness();
    h.store.addFile("f4", { path: "k/f4.txt", mimeType: "text/plain", originalName: "a.txt" });
    h.store.addRow("f4", "fa", { status: "PROCESSING", attempts: 1 });
    let slept = 0;
    h.deps.sleep = async (ms) => {
        slept += ms;
        h.advance(ms);
    };
    const r = await ensureFileTextReady("f4", { folderId: "fa", budgetMs: 25_000, deps: h.deps });
    assert.equal(r.status, "PROCESSING");
    assert.equal(r.timedOut, true);
    assert.ok(slept >= 25_000 && slept <= 25_500, `waited ${slept} ms`);
});

test("an extraction slower than the budget keeps running in the background", async () => {
    const h = harness();
    h.store.addFile("f5", { path: "k/f5.txt", mimeType: "text/plain", originalName: "a.txt" });
    h.blobs.set("k/f5.txt", new TextEncoder().encode("Texte long à extraire."));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    h.deps.extract = async (...args) => {
        await gate;
        return extractDocument(...args);
    };
    const r = await ensureFileTextReady("f5", { folderId: "fa", budgetMs: 30, deps: h.deps });
    assert.equal(r.timedOut, true);
    assert.equal(r.status, "PROCESSING");
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal((await h.store.byFileId("f5"))?.status, "READY", "finished after the call returned");
});

test("ensureFileTextsReady shares one budget, never throws, and reports each file", async () => {
    const h = harness();
    h.store.addFile("ok", { path: "k/ok.md", mimeType: "text/markdown", originalName: "ok.md" });
    h.blobs.set("k/ok.md", new TextEncoder().encode("# Offre\nPrix 5 €."));
    const broken: Partial<PipelineDeps> = {
        ...h.deps,
        store: Object.assign(Object.create(h.store), {
            byFileId: async (fileId: string) => {
                if (fileId === "boom") throw new Error("connection reset");
                return h.store.byFileId(fileId);
            },
        }) as PipelineStore,
    };
    const err = console.error;
    console.error = () => undefined;
    try {
        const results = await ensureFileTextsReady(
            [
                { fileId: "ok", folderId: "fa" },
                { fileId: "boom", folderId: "fa" },
            ],
            { deps: broken },
        );
        assert.equal(results.get("ok")?.status, "READY");
        assert.equal(results.get("boom")?.status, "FAILED");
        assert.equal(results.get("boom")?.error, EXTRACTION_MESSAGES.unexpected);
    } finally {
        console.error = err;
    }
});

// ── Failure causes ──────────────────────────────────────────────────────────

async function runOne(h: Harness, file: FileFixture, bytes: Uint8Array | Error | null) {
    h.store.addFile("x", file);
    if (bytes) h.blobs.set(file.path, bytes);
    h.store.addRow("x", "fa");
    const warn = captureWarnings();
    try {
        const status = await extractFileText("ft_x", { deps: h.deps });
        return { status, row: (await h.store.byId("ft_x"))!, logs: warn.lines };
    } finally {
        warn.restore();
    }
}

function assertLogged(logs: unknown[][], cause: string) {
    const line = logs.find((l) => l[0] === "[assistant.files] extract failed");
    assert.ok(line, "structured log line written");
    assert.deepEqual({ fileId: (line[1] as { fileId: string }).fileId, cause: (line[1] as { cause: string }).cause }, { fileId: "x", cause });
}

test("object missing from storage: « Fichier introuvable dans le stockage », permanent", async () => {
    const { status, row, logs } = await runOne(harness(), { path: "k/gone.pdf", mimeType: "application/pdf", originalName: "gone.pdf" }, null);
    assert.equal(status, "FAILED");
    assert.equal(row.error, EXTRACTION_MESSAGES.storage_missing);
    assert.match(row.error ?? "", /Fichier introuvable dans le stockage/);
    assert.equal(row.attempts, MAX_EXTRACTION_ATTEMPTS);
    assertLogged(logs, "storage_missing");
});

test("storage unreachable: retried later, the detail is kept", async () => {
    const { status, row, logs } = await runOne(
        harness(),
        { path: "k/a.pdf", mimeType: "application/pdf", originalName: "a.pdf" },
        Object.assign(new Error("connect ETIMEDOUT 10.0.0.5:9000"), { code: "ETIMEDOUT" }),
    );
    assert.equal(status, "FAILED");
    assert.ok(row.error?.startsWith(EXTRACTION_MESSAGES.storage_error));
    assert.match(row.error ?? "", /ETIMEDOUT/);
    assert.equal(row.attempts, 1, "not permanent");
    assertLogged(logs, "storage_error");
});

test("password-protected PDF: « PDF protégé par mot de passe »", async () => {
    const h = harness({
        extract: async () => {
            throw Object.assign(new Error("No password given"), { name: "PasswordException" });
        },
    });
    const { row, logs } = await runOne(h, { path: "k/p.pdf", mimeType: "application/pdf", originalName: "p.pdf" }, new Uint8Array([1]));
    assert.equal(row.error, EXTRACTION_MESSAGES.password);
    assert.match(row.error ?? "", /protégé par mot de passe/);
    assertLogged(logs, "password");
});

test("garbage bytes labelled PDF: « PDF invalide ou endommagé » (real unpdf)", async () => {
    const { row, logs } = await runOne(
        harness(),
        { path: "k/bad.pdf", mimeType: "application/pdf", originalName: "bad.pdf" },
        new TextEncoder().encode("this is not a pdf at all"),
    );
    assert.equal(row.status, "FAILED");
    assert.equal(row.error, EXTRACTION_MESSAGES.invalid_pdf);
    assertLogged(logs, "invalid_pdf");
});

test("PDF engine that cannot load (the Node 20 failure): server-side, retried, detail kept", async () => {
    const h = harness({
        extract: async () => {
            throw new Error("PDF.js could not be resolved: ReferenceError: Iterator is not defined");
        },
    });
    const { row, logs } = await runOne(h, { path: "k/e.pdf", mimeType: "application/pdf", originalName: "e.pdf" }, new Uint8Array([1]));
    assert.ok(row.error?.startsWith(EXTRACTION_MESSAGES.pdf_engine));
    assert.match(row.error ?? "", /Iterator is not defined/);
    assert.equal(row.attempts, 1, "retried, unlike a broken document");
    assertLogged(logs, "pdf_engine");
});

test("broken DOCX: « Document Office illisible » (real mammoth)", async () => {
    const { row, logs } = await runOne(
        harness(),
        { path: "k/b.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", originalName: "b.docx" },
        new TextEncoder().encode("PK not really a zip"),
    );
    assert.equal(row.error, EXTRACTION_MESSAGES.corrupt_archive);
    assertLogged(logs, "corrupt_archive");
});

test("scanned PDF with ASSISTANT_OCR=off: « PDF scanné : OCR désactivé », NEEDS_OCR", async () => {
    const h = harness({ env: { ASSISTANT_OCR: "off" } });
    const { status, row, logs } = await runOne(h, { path: "k/s.pdf", mimeType: "application/pdf", originalName: "scan.pdf" }, await blankPdf(2));
    assert.equal(status, "NEEDS_OCR");
    assert.equal(row.error, EXTRACTION_MESSAGES.ocr_disabled);
    assert.match(row.error ?? "", /PDF scanné : OCR désactivé/);
    assert.equal(h.calls.ocr, 0);
    assertLogged(logs, "ocr_disabled");
});

test("scanned PDF without an OpenAI key: NEEDS_OCR « clé OpenAI » (no call made)", async () => {
    const h = harness({ ocrAvailable: () => false });
    const { row } = await runOne(h, { path: "k/s.pdf", mimeType: "application/pdf", originalName: "scan.pdf" }, await blankPdf(1));
    assert.equal(row.error, EXTRACTION_MESSAGES.ocr_unconfigured);
    assert.equal(h.calls.ocr, 0);
});

test("scanned PDF with OCR: READY, extractor openai-ocr, pages from the transcription", async () => {
    const h = harness({
        ocrResult: async () => ({
            sections: [
                { page: 1, text: "Bon de commande n° 4512, signé le 3 octobre." },
                { page: 2, text: "Conditions générales : paiement à 30 jours." },
            ],
            text: "Bon de commande n° 4512, signé le 3 octobre.\n\nConditions générales : paiement à 30 jours.",
            totalPages: 2,
            truncated: false,
            model: "gpt-4.1-mini",
            usage: { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 60, reasoningTokens: 0, totalTokens: 1060 },
        }),
    });
    const { status, row } = await runOne(h, { path: "k/s.pdf", mimeType: "application/pdf", originalName: "scan.pdf" }, await blankPdf(2));
    assert.equal(status, "READY");
    assert.equal(row.extractor, "openai-ocr");
    assert.equal(row.pages, 2);
    assert.equal(h.calls.ocr, 1);
    const stored = h.store.rows.get("ft_x")!;
    assert.deepEqual(stored.chunks.map((c) => c.page), [1, 2].slice(0, stored.chunks.length));
    assert.match(stored.text ?? "", /paiement à 30 jours/);
});

test("OCR service down: FAILED « momentanément indisponible », retried later", async () => {
    const h = harness({
        ocrResult: async () => {
            throw new ProviderError("RATE_LIMITED", "429", 429, "Le quota OpenAI est dépassé.", { kind: "rate_limited", retryable: true });
        },
    });
    const { status, row, logs } = await runOne(h, { path: "k/s.pdf", mimeType: "application/pdf", originalName: "scan.pdf" }, await blankPdf(1));
    assert.equal(status, "FAILED");
    assert.ok(row.error?.startsWith(EXTRACTION_MESSAGES.ocr_unavailable));
    assert.equal(row.attempts, 1);
    assertLogged(logs, "ocr_unavailable");
});

test("OCR that reads nothing: NEEDS_OCR « aucun texte lisible »", async () => {
    const h = harness({
        ocrResult: async () => ({ sections: [], text: " ", totalPages: 1, truncated: false, model: "m", usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 } }),
    });
    const { status, row } = await runOne(h, { path: "k/s.pdf", mimeType: "application/pdf", originalName: "scan.pdf" }, await blankPdf(1));
    assert.equal(status, "NEEDS_OCR");
    assert.equal(row.error, EXTRACTION_MESSAGES.ocr_empty);
});

test("deleted and oversized files fail permanently with their own message", async () => {
    const del = await runOne(harness(), { path: "k/d.pdf", mimeType: "application/pdf", originalName: "d.pdf", deletedAt: new Date() }, new Uint8Array([1]));
    assert.equal(del.row.error, EXTRACTION_MESSAGES.deleted);
    const big = await runOne(harness(), { path: "k/b.pdf", mimeType: "application/pdf", originalName: "b.pdf", size: 26 * 1024 * 1024 }, new Uint8Array([1]));
    assert.equal(big.row.error, EXTRACTION_MESSAGES.too_large);
    assert.equal(big.row.attempts, MAX_EXTRACTION_ATTEMPTS);
});

// ── Healing ─────────────────────────────────────────────────────────────────

test("a PDF an earlier version recorded as « corrompu » is extracted again on demand", async () => {
    const h = harness();
    h.store.addFile("old", { path: "k/old.pdf", mimeType: "application/pdf", originalName: "old.pdf" });
    h.blobs.set("k/old.pdf", await textPdf(["Proposition commerciale Acme, budget annuel 54 000 euros."]));
    h.store.addRow("old", "fa", { status: "FAILED", attempts: MAX_EXTRACTION_ATTEMPTS, error: LEGACY_HEALABLE_ERRORS[0] });
    const r = await ensureFileTextReady("old", { folderId: "fa", deps: h.deps });
    assert.equal(r.status, "READY");
    assert.equal(h.calls.extract, 1);
});

test("healing rules: legacy and server-side causes heal, document faults do not", () => {
    const legacy = { status: "FAILED" as const, error: LEGACY_HEALABLE_ERRORS[0], attempts: 3 };
    assert.equal(isHealable(legacy, false, false), true);
    const scan = { status: "NEEDS_OCR" as const, error: LEGACY_HEALABLE_ERRORS[1], attempts: 3 };
    assert.equal(isHealable(scan, true, false), true);
    assert.equal(isHealable(scan, false, false), false, "no OCR, nothing to heal");
    const engine = { status: "FAILED" as const, error: messageFor("pdf_engine", "Iterator is not defined"), attempts: 3 };
    assert.equal(isHealable(engine, false, true), true, "on demand");
    assert.equal(isHealable(engine, false, false), false, "not from the background list");
    const password = { status: "FAILED" as const, error: EXTRACTION_MESSAGES.password, attempts: 3 };
    assert.equal(isHealable(password, true, true), false);
});

// ── Classifiers ─────────────────────────────────────────────────────────────

test("classifiers map parser and storage errors to causes", () => {
    assert.equal(classifyStorageError({ name: "NoSuchKey", $metadata: { httpStatusCode: 404 } }), "storage_missing");
    assert.equal(classifyStorageError(Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" })), "storage_missing");
    assert.equal(classifyStorageError(new Error("socket hang up")), "storage_error");
    assert.equal(classifyExtractError({ name: "PasswordException", message: "Incorrect Password" }, "pdf"), "password");
    assert.equal(classifyExtractError({ name: "InvalidPDFException", message: "Invalid PDF structure." }, "pdf"), "invalid_pdf");
    assert.equal(classifyExtractError(new Error("PDF.js could not be resolved: ReferenceError: Iterator is not defined"), "pdf"), "pdf_engine");
    assert.equal(classifyExtractError(new Error("Can't find end of central directory : is this a zip file ?"), "docx"), "corrupt_archive");
    assert.equal(classifyExtractError(new Error("weird"), "csv"), "corrupt");
});
