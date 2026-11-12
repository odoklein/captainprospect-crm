/**
 * read_project_document with on-demand extraction, without a database:
 *     npx tsx --test lib/ai/tools/definitions/documents.test.ts
 *
 * A client's PDF that was never indexed is extracted inside the call (the
 * extraction itself is faked here: lib/assistant/files/pipeline.test.ts runs
 * it for real), its text row filed in the client's CLIENT folder; a scanned
 * PDF without OCR, a run still going, and another client's file each get
 * their own answer.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import type { EnsureResult } from "@/lib/assistant/files/pipeline";
import { EXTRACTION_MESSAGES } from "@/lib/assistant/files/errors";
import type { AssistantContext } from "../types";
import { documentDeps, listProjectDocuments, readProjectDocument } from "./documents";

function ctx(): AssistantContext {
    return {
        userId: "u1",
        userName: "Odo",
        role: "MANAGER",
        isActive: true,
        permissions: [],
        project: { clientId: "c1", clientName: "Acme", missionId: null, missionName: null },
        resolvedAt: new Date("2026-10-29T10:00:00Z"),
        autoWriteBudget: 3,
        conversationId: "conv1",
        folder: null,
    };
}

const files: Record<string, Record<string, unknown>> = {
    pdf1: { id: "pdf1", name: "contrat", originalName: "contrat.pdf", mimeType: "application/pdf", size: 5000, url: null, clientId: "c1", missionId: null, deletedAt: null },
    scan: { id: "scan", name: "scan", originalName: "scan.pdf", mimeType: "application/pdf", size: 5000, url: null, clientId: "c1", missionId: null, deletedAt: null },
    slow: { id: "slow", name: "gros", originalName: "gros.pdf", mimeType: "application/pdf", size: 5000, url: null, clientId: "c1", missionId: null, deletedAt: null },
    other: { id: "other", name: "autre", originalName: "autre.pdf", mimeType: "application/pdf", size: 5000, url: null, clientId: "c2", missionId: null, deletedAt: null },
    img: { id: "img", name: "logo", originalName: "logo.png", mimeType: "image/png", size: 5000, url: null, clientId: "c1", missionId: null, deletedAt: null },
};
/** Extracted texts, written by the fake ensure. */
const texts = new Map<string, { status: string; text: string | null; error: string | null }>();

const client = prisma as unknown as Record<string, unknown>;
const originals = new Map<string, PropertyDescriptor | undefined>();
function stub(name: string, value: unknown): boolean {
    originals.set(name, Object.getOwnPropertyDescriptor(client, name));
    try {
        Object.defineProperty(client, name, { configurable: true, value });
        return true;
    } catch {
        return false;
    }
}
const stubbed =
    stub("file", {
        findUnique: async ({ where }: { where: { id: string } }) => files[where.id] ?? null,
        findMany: async () => Object.values(files).filter((f) => f.clientId === "c1").map((f) => ({ ...f, description: null, tags: [], createdAt: new Date(), folder: null, uploadedBy: { name: "Marie" }, mission: null })),
    }) &&
    stub("assistantFolder", {
        findUnique: async ({ where }: { where: { clientId?: string } }) => (where.clientId === "c1" ? { id: "cf1", kind: "CLIENT", clientId: "c1", name: "Acme" } : null),
    }) &&
    stub("assistantFileText", {
        findUnique: async ({ where }: { where: { fileId: string } }) => texts.get(where.fileId) ?? null,
        findMany: async ({ where }: { where: { fileId: { in: string[] } } }) =>
            where.fileId.in.filter((id) => texts.has(id)).map((id) => ({ fileId: id, status: texts.get(id)!.status, error: texts.get(id)!.error })),
    });

const realEnsure = documentDeps.ensure;
const ensured: Array<[string, string | null | undefined]> = [];
documentDeps.ensure = async (fileId, options = {}) => {
    ensured.push([fileId, options.folderId]);
    const base: EnsureResult = { fileId, fileTextId: `ft_${fileId}`, folderId: options.folderId ?? null, status: "READY", error: null, pages: 2, chunkCount: 9, extractor: "unpdf", timedOut: false, extracted: true };
    if (fileId === "scan") {
        texts.set(fileId, { status: "NEEDS_OCR", text: null, error: EXTRACTION_MESSAGES.ocr_disabled });
        return { ...base, status: "NEEDS_OCR", error: EXTRACTION_MESSAGES.ocr_disabled, chunkCount: 0 };
    }
    if (fileId === "slow") return { ...base, status: "PROCESSING", timedOut: true, chunkCount: 0 };
    texts.set(fileId, { status: "READY", text: `Contrat Acme. ${"Clause. ".repeat(2000)}`, error: null });
    return base;
};

after(() => {
    documentDeps.ensure = realEnsure;
    for (const [name, d] of originals) {
        if (d) Object.defineProperty(client, name, d);
        else delete client[name];
    }
});

test("a never-indexed client PDF is extracted on demand into the CLIENT folder, then returned", async (t) => {
    if (!stubbed) return t.skip("Prisma delegates could not be stubbed");
    const out = (await readProjectDocument.execute({ documentId: "pdf1" }, ctx())) as Record<string, unknown>;
    assert.deepEqual(ensured.at(-1), ["pdf1", "cf1"]);
    assert.equal(out.fileId, "pdf1");
    assert.equal(out.pages, 2);
    assert.match(String(out.contenu), /^Contrat Acme\./);
    assert.match(String(out.tronque), /read_file_section avec file_id « pdf1 ».*9 blocs/);
});

test("a scanned PDF without OCR says so; a run still going says « en cours »", async (t) => {
    if (!stubbed) return t.skip("Prisma delegates could not be stubbed");
    const scan = (await readProjectDocument.execute({ documentId: "scan" }, ctx())) as Record<string, unknown>;
    assert.equal(scan.error, EXTRACTION_MESSAGES.ocr_disabled);
    const slow = (await readProjectDocument.execute({ documentId: "slow" }, ctx())) as Record<string, unknown>;
    assert.match(String(slow.error), /en cours/);
});

test("another client's document is refused before any extraction; an image is not readable", async (t) => {
    if (!stubbed) return t.skip("Prisma delegates could not be stubbed");
    const before = ensured.length;
    const other = (await readProjectDocument.execute({ documentId: "other" }, ctx())) as Record<string, unknown>;
    assert.equal(other.error, "Ce document n'appartient pas au projet actif.");
    const img = (await readProjectDocument.execute({ documentId: "img" }, ctx())) as Record<string, unknown>;
    assert.match(String(img.error), /image\/png n'est pas lisible/);
    assert.equal(ensured.length, before, "no extraction attempted");
});

test("list_project_documents marks PDFs readable even before indexing, not images or dead ends", async (t) => {
    if (!stubbed) return t.skip("Prisma delegates could not be stubbed");
    const out = (await listProjectDocuments.execute({}, ctx())) as { documents: Array<{ documentId: string; lisibleParLAssistant: boolean; remarque?: string }> };
    const by = new Map(out.documents.map((d) => [d.documentId, d]));
    assert.equal(by.get("slow")?.lisibleParLAssistant, true, "never indexed PDF");
    assert.equal(by.get("img")?.lisibleParLAssistant, false);
    assert.equal(by.get("scan")?.lisibleParLAssistant, false, "NEEDS_OCR without OCR");
    assert.equal(by.get("scan")?.remarque, EXTRACTION_MESSAGES.ocr_disabled);
});
