/**
 * Chat attachments made readable before the turn:
 *     npx tsx --test lib/assistant/files/attachments.test.ts
 *
 * prepareAttachments over the real ensureFileTextsReady with an in-memory
 * store: a PENDING attachment is READY when the pack is built, a stuck one is
 * abandoned at the budget (the turn goes on), a broken reader never fails the
 * turn, and the « Pièces jointes » block tells the model how to read each file.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildContextPack, renderAttachmentsBlock, type AttachmentView } from "@/lib/assistant/context/pack";
import type { AssistantContext } from "@/lib/ai/tools/types";
import { prepareAttachments } from "./attachments";
import { ensureFileTextsReady, MAX_EXTRACTION_ATTEMPTS, type FileTextState, type PipelineDeps, type PipelineStore } from "./pipeline";
import { extractDocument } from "./extract";

function memoryDeps(files: Record<string, { text: string; hang?: boolean }>): { deps: Partial<PipelineDeps>; rows: Map<string, FileTextState> } {
    const rows = new Map<string, FileTextState>();
    for (const fileId of Object.keys(files)) {
        rows.set(`ft_${fileId}`, {
            id: `ft_${fileId}`,
            fileId,
            folderId: "fa",
            status: "PENDING",
            attempts: 0,
            error: null,
            pages: null,
            chunkCount: 0,
            extractor: null,
            updatedAt: new Date(),
        });
    }
    const store: PipelineStore = {
        claim: async (id) => {
            const r = rows.get(id);
            if (!r || r.attempts >= MAX_EXTRACTION_ATTEMPTS || !["PENDING", "FAILED"].includes(r.status)) return false;
            Object.assign(r, { status: "PROCESSING", attempts: r.attempts + 1 });
            return true;
        },
        load: async (id) => {
            const r = rows.get(id)!;
            return { id, folderId: "fa", fileId: r.fileId, file: { path: r.fileId, mimeType: "text/plain", originalName: `${r.fileId}.txt`, name: r.fileId, size: 10, deletedAt: null } };
        },
        replaceChunks: async () => undefined,
        settle: async (id, status, error) => void Object.assign(rows.get(id)!, { status, error }),
        markReady: async (id, data) => void Object.assign(rows.get(id)!, { status: "READY", chunkCount: data.chunkCount, pages: data.pages, error: data.note }),
        byId: async (id) => ({ ...rows.get(id)! }),
        byFileId: async (fileId) => ({ ...rows.get(`ft_${fileId}`)! }),
        createPending: async () => undefined,
        reset: async () => false,
    };
    return {
        rows,
        deps: {
            store,
            download: async (path) => {
                if (files[path].hang) await new Promise(() => undefined);
                return new TextEncoder().encode(files[path].text);
            },
            extract: extractDocument,
            ocrAvailable: () => false,
            env: {},
        },
    };
}

test("a PENDING attachment is extracted before the turn and comes back READY", async () => {
    const { deps } = memoryDeps({ brief: { text: "Brief client : cibler les DAF de PME industrielles." } });
    const views = await prepareAttachments([{ fileId: "brief", name: "brief.txt", status: "PENDING" }], {
        folderId: "fa",
        ensureMany: (items, o) => ensureFileTextsReady(items, { ...o, deps }),
    });
    assert.equal(views.length, 1);
    assert.equal(views[0].status, "READY");
    assert.equal(views[0].chunkCount, 1);
});

test("READY attachments are not touched; a stuck one is abandoned at the budget and the turn goes on", async () => {
    const { deps } = memoryDeps({ stuck: { text: "x", hang: true } });
    let called: string[] = [];
    const started = Date.now();
    const views = await prepareAttachments(
        [
            { fileId: "done", name: "done.pdf", status: "READY", pages: 4, chunkCount: 6 },
            { fileId: "stuck", name: "stuck.txt", status: "PENDING" },
        ],
        {
            folderId: "fa",
            budgetMs: 150,
            ensureMany: (items, o) => {
                called = items.map((i) => i.fileId);
                return ensureFileTextsReady(items, { ...o, deps });
            },
        },
    );
    const elapsed = Date.now() - started;
    assert.deepEqual(called, ["stuck"], "only non-READY files are prepared");
    assert.ok(elapsed < 1500, `returned after ${elapsed} ms`);
    assert.deepEqual(views.map((v) => [v.fileId, v.status]), [
        ["done", "READY"],
        ["stuck", "PROCESSING"],
    ]);
    assert.equal(views[1].timedOut, true);
    assert.equal(views[0].pages, 4);
});

test("a failing reader never fails the turn: the last known state is kept", async () => {
    const warn = console.warn;
    console.warn = () => undefined;
    try {
        const views = await prepareAttachments([{ fileId: "a", name: "a.pdf", status: "PENDING" }], {
            folderId: "fa",
            ensureMany: async () => {
                throw new Error("database unreachable");
            },
        });
        assert.deepEqual(views.map((v) => [v.fileId, v.status]), [["a", "PENDING"]]);
    } finally {
        console.warn = warn;
    }
});

test("« Pièces jointes » block: how to read each file, its state, why one is unreadable", () => {
    const views: AttachmentView[] = [
        { fileId: "f1", name: "offre.pdf", status: "READY", pages: 12, chunkCount: 30, error: null },
        { fileId: "f2", name: "scan.pdf", status: "PROCESSING", pages: null, chunkCount: 0, error: null, timedOut: true },
        { fileId: "f3", name: "photo.pdf", status: "NEEDS_OCR", pages: 1, chunkCount: 0, error: "PDF scanné : OCR désactivé sur cette instance (ASSISTANT_OCR=off).", },
    ];
    const block = renderAttachmentsBlock(views);
    assert.match(block, /^## Pièces jointes au message/);
    assert.match(block, /offre\.pdf \(file_id f1\) — lisible, 12 pages, 30 blocs\. Lis-le avec read_file_section\(file_id "f1", from_block 0/);
    assert.match(block, /scan\.pdf \(file_id f2\) — lecture en cours/);
    assert.match(block, /photo\.pdf \(file_id f3\) — illisible : PDF scanné : OCR désactivé/);
    assert.equal(renderAttachmentsBlock([]), "");
});

test("buildContextPack puts the attachments block in the turn context, before the excerpts", async () => {
    const ctx: AssistantContext = {
        userId: "u1",
        userName: "Odo",
        role: "MANAGER",
        isActive: true,
        permissions: [],
        project: null,
        resolvedAt: new Date("2026-10-29T10:00:00Z"),
        autoWriteBudget: 3,
        conversationId: "c1",
        folder: { id: "fa", kind: "GENERAL", name: "Veille", clientId: null },
    };
    const pack = await buildContextPack({
        ctx,
        conversation: { id: "c1", summary: null, summaryUpToMessageId: null, missionId: null },
        question: "Résume la pièce jointe",
        attachmentFileIds: ["f1"],
        attachments: [{ fileId: "f1", name: "offre.pdf", status: "READY", pages: 2, chunkCount: 3, error: null }],
        deps: {
            memories: async () => [],
            files: async () => [
                { fileId: "f1", fileName: "offre.pdf", chunkId: "k1", index: 0, page: 1, heading: null, excerpt: "Proposition commerciale.", score: 1, tokens: 8, attached: true },
            ],
        },
    });
    const ids = pack.volatileSections.map((s) => s.id);
    assert.deepEqual(ids, ["attachments", "files"]);
    assert.ok((pack.contextMessage ?? "").indexOf("## Pièces jointes") < (pack.contextMessage ?? "").indexOf("## Extraits de fichiers"));
    assert.ok(pack.debug.tokens.attachments > 0);
});
