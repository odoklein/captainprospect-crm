/**
 * OCR of scanned PDFs without a network:
 *     npx tsx --test lib/assistant/files/ocr.test.ts
 *
 * pdf-lib splitting into ≤ 30-page parts, "--- Page N ---" parsing with the
 * part offsets, the Responses request body (input_file + prompt + model)
 * through the real provider helper and a fake fetch, the residency/provider
 * guards, and the ledger entries ("assistant.ocr", raw_crm).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";

import { providerFileCallFn, ProviderError, type FileInputCallRequest } from "@/lib/ai/providers";
import type { AiUsageEntry } from "@/lib/ai/ledger";
import {
    DEFAULT_OCR_MODEL,
    OCR_PROMPT,
    OCR_SURFACE,
    ocrEnabled,
    ocrModel,
    ocrPdf,
    parseOcrPages,
    splitPdfForOcr,
} from "./ocr";

async function pdfOf(pages: number): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([200 + i, 300]); // width encodes the page number
    return doc.save();
}

async function widths(bytes: Uint8Array): Promise<number[]> {
    const doc = await PDFDocument.load(bytes);
    return doc.getPages().map((p) => Math.round(p.getWidth()));
}

// ── Settings ────────────────────────────────────────────────────────────────

test("OCR is on unless ASSISTANT_OCR=off; the model defaults to gpt-4.1-mini", () => {
    assert.equal(ocrEnabled({}), true);
    assert.equal(ocrEnabled({ ASSISTANT_OCR: "OFF " }), false);
    assert.equal(ocrModel({}), DEFAULT_OCR_MODEL);
    assert.equal(DEFAULT_OCR_MODEL, "gpt-4.1-mini");
    assert.equal(ocrModel({ ASSISTANT_OCR_MODEL: "gpt-4.1" }), "gpt-4.1");
});

// ── Splitting ───────────────────────────────────────────────────────────────

test("a PDF of 30 pages or less is sent as is", async () => {
    const bytes = await pdfOf(12);
    const split = await splitPdfForOcr(bytes);
    assert.equal(split.parts.length, 1);
    assert.equal(split.parts[0].bytes, bytes, "original bytes, no copy");
    assert.deepEqual([split.parts[0].firstPage, split.parts[0].lastPage, split.totalPages, split.truncated], [1, 12, 12, false]);
});

test("65 pages become parts of 30, 30 and 5, in order, each a valid PDF", async () => {
    const split = await splitPdfForOcr(await pdfOf(65));
    assert.deepEqual(
        split.parts.map((p) => [p.firstPage, p.lastPage]),
        [
            [1, 30],
            [31, 60],
            [61, 65],
        ],
    );
    const w = await Promise.all(split.parts.map((p) => widths(p.bytes)));
    assert.deepEqual(w.map((x) => x.length), [30, 30, 5]);
    assert.equal(w[1][0], 230, "part 2 starts at original page 31");
    assert.equal(w[2][4], 264, "part 3 ends at original page 65");
    assert.equal(split.truncated, false);
});

test("pages beyond the cap are left out and flagged", async () => {
    const split = await splitPdfForOcr(await pdfOf(40), 10, 25);
    assert.deepEqual(split.parts.map((p) => [p.firstPage, p.lastPage]), [
        [1, 10],
        [11, 20],
        [21, 25],
    ]);
    assert.equal(split.totalPages, 40);
    assert.equal(split.truncated, true);
});

// ── Parsing ─────────────────────────────────────────────────────────────────

test("page markers become page sections, shifted by the part's first page", () => {
    const text = "En-tête\n--- Page 1 ---\nBon de commande\n\n--- Page 2 ---\nConditions\n--- Page 3 ---\n\n";
    assert.deepEqual(parseOcrPages(text, 31, 60), [
        { page: 31, text: "En-tête\n\nBon de commande" },
        { page: 32, text: "Conditions" },
    ]);
    assert.deepEqual(parseOcrPages("Texte sans marqueur", 5), [{ page: 5, text: "Texte sans marqueur" }]);
    assert.deepEqual(parseOcrPages("— Page 1 —\nA\n---- Page 2 ----\nB", 1), [
        { page: 1, text: "A" },
        { page: 2, text: "B" },
    ]);
});

// ── The request ─────────────────────────────────────────────────────────────

function okResponse(text: string, model = "gpt-4.1-mini-2025-04-14"): Response {
    return new Response(
        JSON.stringify({
            model,
            status: "completed",
            output: [{ type: "message", content: [{ type: "output_text", text }] }],
            usage: { input_tokens: 1200, output_tokens: 80, total_tokens: 1280, input_tokens_details: { cached_tokens: 0 } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
    );
}

test("the Responses body carries the PDF as input_file, the fixed prompt and the model", async () => {
    const seen: Array<{ url: string; body: Record<string, unknown>; auth: string }> = [];
    const call = providerFileCallFn({
        dataClass: "raw_crm",
        apiKey: "sk-test",
        env: {},
        fetchImpl: async (url, init) => {
            seen.push({ url, body: JSON.parse(init.body) as Record<string, unknown>, auth: init.headers.Authorization });
            return okResponse("--- Page 1 ---\nBonjour");
        },
    });
    const bytes = await pdfOf(1);
    const out = await call({
        model: "gpt-4.1-mini",
        prompt: OCR_PROMPT,
        file: { filename: "scan.pdf", mimeType: "application/pdf", data: bytes },
        maxOutputTokens: 32_000,
        timeoutMs: 5000,
        temperature: 0,
    });
    assert.equal(out.text, "--- Page 1 ---\nBonjour");
    assert.equal(out.usage?.inputTokens, 1200);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "https://api.openai.com/v1/responses");
    assert.equal(seen[0].auth, "Bearer sk-test");
    const body = seen[0].body as {
        model: string;
        store: boolean;
        stream: boolean;
        temperature: number;
        max_output_tokens: number;
        input: Array<{ role: string; content: Array<{ type: string; filename?: string; file_data?: string; text?: string }> }>;
    };
    assert.equal(body.model, "gpt-4.1-mini");
    assert.equal(body.store, false);
    assert.equal(body.stream, false);
    assert.equal(body.temperature, 0);
    assert.equal(body.max_output_tokens, 32_000);
    const [file, prompt] = body.input[0].content;
    assert.equal(body.input[0].role, "user");
    assert.equal(file.type, "input_file");
    assert.equal(file.filename, "scan.pdf");
    assert.ok(file.file_data?.startsWith("data:application/pdf;base64,JVBERi0"), "base64 PDF data URL (%PDF-)");
    assert.equal(Buffer.from(file.file_data!.split(",")[1], "base64").length, bytes.length);
    assert.deepEqual(prompt, { type: "input_text", text: OCR_PROMPT });
    assert.equal(
        OCR_PROMPT,
        'Transcris fidèlement tout le texte de ce document, page par page, avec "--- Page N ---" entre les pages. N\'ajoute rien.',
    );
});

test("guards: a non-OpenAI model is refused, an HTTP error maps to a ProviderError", async () => {
    const call = providerFileCallFn({ dataClass: "raw_crm", apiKey: "sk", env: {}, fetchImpl: async () => okResponse("x") });
    const req: FileInputCallRequest = {
        model: "deepseek-chat",
        prompt: "p",
        file: { filename: "a.pdf", mimeType: "application/pdf", data: new Uint8Array([1]) },
        maxOutputTokens: 100,
        timeoutMs: 1000,
    };
    await assert.rejects(call(req), (e: unknown) => e instanceof ProviderError && e.code === "WRONG_PROVIDER");

    const failing = providerFileCallFn({
        dataClass: "raw_crm",
        apiKey: "sk",
        env: {},
        fetchImpl: async () => new Response(JSON.stringify({ error: { message: "slow down", code: "rate_limit" } }), { status: 429 }),
    });
    await assert.rejects(failing({ ...req, model: "gpt-4.1-mini" }), (e: unknown) => e instanceof ProviderError && e.kind === "rate_limited" && e.retryable);
});

// ── ocrPdf ──────────────────────────────────────────────────────────────────

test("ocrPdf: one call per part, pages renumbered, usage summed, one ledger row per call", async () => {
    const calls: FileInputCallRequest[] = [];
    const ledger: AiUsageEntry[] = [];
    const result = await ocrPdf(await pdfOf(45), "Contrat signé.pdf", {
        env: {},
        call: async (req) => {
            calls.push(req);
            const pages = (await PDFDocument.load(req.file.data)).getPageCount();
            const text = Array.from({ length: pages }, (_, i) => `--- Page ${i + 1} ---\nTexte de la page ${i + 1} de la partie.`).join("\n");
            return { text, model: req.model, incomplete: null, usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 10, reasoningTokens: 0, totalTokens: 110 } };
        },
        ledger: (e) => ledger.push(e),
        ledgerContext: { userId: "u1", clientId: "c1", conversationId: "conv1" },
    });
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => c.model === "gpt-4.1-mini" && c.prompt === OCR_PROMPT && c.file.mimeType === "application/pdf"));
    assert.deepEqual(calls.map((c) => c.file.filename).sort(), ["Contrat signé (p1-30).pdf", "Contrat signé (p31-45).pdf"]);
    assert.equal(result.totalPages, 45);
    assert.equal(result.sections.length, 45);
    assert.equal(result.sections[30].page, 31);
    assert.equal(result.sections[44].page, 45);
    assert.equal(result.usage.inputTokens, 200);
    assert.equal(ledger.length, 2);
    assert.ok(ledger.every((e) => e.surface === OCR_SURFACE && e.surface === "assistant.ocr" && e.dataClass === "raw_crm" && e.userId === "u1" && e.clientId === "c1"));
    assert.equal(result.truncated, false);
});

test("ocrPdf: a part cut by max_output_tokens marks the result truncated", async () => {
    const result = await ocrPdf(await pdfOf(2), "a.pdf", {
        env: {},
        call: async (req) => ({ text: "--- Page 1 ---\nDébut", model: req.model, incomplete: "max_output_tokens", usage: null }),
        ledger: () => undefined,
    });
    assert.equal(result.truncated, true);
    assert.deepEqual(result.sections, [{ page: 1, text: "Début" }]);
});
