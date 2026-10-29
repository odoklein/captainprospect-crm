/**
 * Folder file tools, without a database:
 *     npx tsx --test lib/ai/tools/definitions/files.test.ts
 *
 * Registration shape, schemas, the folder requirement, and the scope rule (a
 * file of another folder is refused before any search) with the Prisma
 * delegate stubbed in memory.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/api-utils";
import { mayCachePayload } from "@/lib/ai/agent/evidence/policy";
import { getTool, getToolsForContext } from "../registry";
import { toolGroupOf, toolProfileFor } from "../profiles";
import { ToolValidationError, type AssistantContext } from "../types";
import { FILE_TOOLS, listFolderFilesTool, readFileSection, searchFiles } from "./files";

const MAX_SCHEMA_DESCRIPTION = 220;

function ctx(overrides: Partial<AssistantContext> = {}): AssistantContext {
    return {
        userId: "u1",
        userName: "Odo",
        role: "MANAGER",
        isActive: true,
        permissions: [],
        project: null,
        resolvedAt: new Date("2026-10-29T10:00:00Z"),
        autoWriteBudget: 3,
        conversationId: "conv1",
        folder: { id: "f1", kind: "GENERAL", name: "Veille", clientId: null },
        ...overrides,
    };
}

// ── In-memory stand-in for prisma.assistantFileText.findMany ────────────────

type Delegate = { findMany: (args: { where: { folderId: string; status?: string } }) => Promise<unknown[]> };
const client = prisma as unknown as { assistantFileText: Delegate };
const original = Object.getOwnPropertyDescriptor(client, "assistantFileText");
const rows = [
    {
        fileId: "file-a",
        folderId: "f1",
        status: "READY",
        pages: 3,
        chunkCount: 4,
        tokens: 900,
        error: null,
        extractedAt: new Date("2026-10-29T09:00:00Z"),
        file: {
            id: "file-a",
            name: "offre",
            originalName: "offre.pdf",
            mimeType: "application/pdf",
            size: 20480,
            createdAt: new Date("2026-10-28T09:00:00Z"),
            uploadedBy: { name: "Marie" },
        },
    },
    {
        fileId: "file-b",
        folderId: "f1",
        status: "NEEDS_OCR",
        pages: 2,
        chunkCount: 0,
        tokens: 0,
        error: "Ce PDF semble scanné.",
        extractedAt: null,
        file: {
            id: "file-b",
            name: "scan",
            originalName: "scan.pdf",
            mimeType: "application/pdf",
            size: 1024,
            createdAt: new Date("2026-10-28T08:00:00Z"),
            uploadedBy: { name: "Marie" },
        },
    },
];
let stubbed = false;
try {
    Object.defineProperty(client, "assistantFileText", {
        configurable: true,
        value: {
            findMany: async ({ where }: { where: { folderId: string; status?: string } }) =>
                rows.filter((r) => r.folderId === where.folderId && (!where.status || r.status === where.status)),
        },
    });
    stubbed = true;
} catch {
    stubbed = false;
}
after(() => {
    if (original) Object.defineProperty(client, "assistantFileText", original);
    else delete (client as Partial<typeof client>).assistantFileText;
});

// ── Registration ────────────────────────────────────────────────────────────

test("three read tools, folder-scoped, outside any project, registered and grouped under folder", () => {
    assert.deepEqual(
        FILE_TOOLS.map((t) => t.name),
        ["list_folder_files", "search_files", "read_file_section"],
    );
    for (const t of FILE_TOOLS) {
        assert.equal(t.risk, "read");
        assert.equal(t.requiresProject, false);
        assert.deepEqual(t.allowedRoles, ["MANAGER"]);
        assert.notEqual(t.noEvidence, true, `${t.name}: a file excerpt is a source`);
        assert.ok(t.description.length <= MAX_SCHEMA_DESCRIPTION);
        assert.equal(getTool(t.name), t, `${t.name} registered`);
        assert.equal(toolGroupOf(t.name), "folder");
    }
});

test("a question about a contract, a PDF or a brief loads the folder group", () => {
    const accessible = getToolsForContext(ctx()).map((t) => t.name);
    for (const question of ["Que dit le contrat sur la durée ?", "Résume le PDF", "Le brief mentionne quoi ?", "Dans l'annexe 2 ?", "la présentation client"]) {
        const d = toolProfileFor({ ctx: ctx(), depth: "standard", question, accessible });
        assert.equal(d.profile, "core", question);
        assert.ok(d.groups.includes("folder"), question);
        assert.ok(d.names?.has("search_files") && d.names.has("read_file_section"), question);
    }
    const figures = toolProfileFor({ ctx: ctx(), depth: "standard", question: "Combien de RDV ce mois ?", accessible });
    assert.ok(!figures.names?.has("search_files"));
});

test("file excerpts are never cached in the evidence ledger", () => {
    assert.equal(mayCachePayload("search_files"), false);
    assert.equal(mayCachePayload("read_file_section"), false);
    assert.equal(mayCachePayload("list_folder_files"), true);
});

// ── Schemas ─────────────────────────────────────────────────────────────────

test("search_files: query 2..200, limit accepted up to the advertised range", () => {
    assert.equal(searchFiles.schema.safeParse({ query: "a" }).success, false);
    assert.equal(searchFiles.schema.safeParse({ query: "x".repeat(201) }).success, false);
    assert.equal(searchFiles.schema.safeParse({ query: "durée du contrat" }).success, true);
    assert.equal(searchFiles.schema.safeParse({ query: "ok", limit: 0 }).success, false);
    assert.equal(searchFiles.schema.safeParse({ query: "ok", limit: 20 }).success, true);
});

test("read_file_section: to_block may not precede from_block", () => {
    assert.equal(readFileSection.schema.safeParse({ file_id: "a", from_block: 3, to_block: 2 }).success, false);
    assert.equal(readFileSection.schema.safeParse({ file_id: "a", from_block: 0 }).success, true);
    assert.equal(readFileSection.schema.safeParse({ file_id: "a", from_block: -1 }).success, false);
});

// ── Folder requirement and scope ────────────────────────────────────────────

test("every tool refuses a conversation without a folder", async () => {
    for (const [tool, args] of [
        [listFolderFilesTool, {}],
        [searchFiles, { query: "contrat" }],
        [readFileSection, { file_id: "file-a", from_block: 0 }],
    ] as const) {
        await assert.rejects(
            (tool.execute as (a: unknown, c: AssistantContext) => Promise<unknown>)(args, ctx({ folder: null })),
            (err: unknown) => err instanceof ValidationError,
            tool.name,
        );
    }
});

test("list_folder_files lists the folder's files with a French status", async (t) => {
    if (!stubbed) return t.skip("Prisma delegate could not be stubbed");
    const out = (await listFolderFilesTool.execute({}, ctx())) as { dossier: string; fichiers: Array<Record<string, unknown>> };
    assert.equal(out.dossier, "Veille");
    assert.deepEqual(
        out.fichiers.map((f) => [f.fileId, f.nom, f.statut, f.blocs]),
        [
            ["file-a", "offre.pdf", "indexé", 4],
            ["file-b", "scan.pdf", "PDF scanné, texte non lisible", 0],
        ],
    );
    const ready = (await listFolderFilesTool.execute({ status: "READY" }, ctx())) as { fichiers: unknown[] };
    assert.equal(ready.fichiers.length, 1);
});

test("a file of another folder is refused before any search or read", async (t) => {
    if (!stubbed) return t.skip("Prisma delegate could not be stubbed");
    const elsewhere = ctx({ folder: { id: "f2", kind: "GENERAL", name: "Autre", clientId: null } });
    await assert.rejects(searchFiles.execute({ query: "contrat", file_id: "file-a" }, elsewhere), ToolValidationError);
    await assert.rejects(readFileSection.execute({ file_id: "file-a", from_block: 0 }, elsewhere), ToolValidationError);
    await assert.rejects(readFileSection.execute({ file_id: "nope", from_block: 0 }, ctx()), ToolValidationError);
});

test("read_file_section on a file without text explains instead of reading", async (t) => {
    if (!stubbed) return t.skip("Prisma delegate could not be stubbed");
    const out = (await readFileSection.execute({ file_id: "file-b", from_block: 0 }, ctx())) as Record<string, unknown>;
    assert.equal(out.statut, "PDF scanné, texte non lisible");
    assert.deepEqual(out.blocs, []);
    assert.equal(out.note, "Ce PDF semble scanné.");
});

// ── Context pack: attachments reach the files reader ────────────────────────

test("buildContextPack forwards attachmentFileIds to the files reader and shows attached hits", async () => {
    const { buildContextPack } = await import("@/lib/assistant/context/pack");
    const seen: Array<string[] | undefined> = [];
    const pack = await buildContextPack({
        ctx: ctx(),
        conversation: { id: "conv1", summary: null, summaryUpToMessageId: null, missionId: null },
        question: "Résume ce document",
        attachmentFileIds: ["file-a", ""],
        deps: {
            memories: async () => [],
            files: async (q) => {
                seen.push(q.attachedFileIds);
                return [
                    {
                        fileId: "file-a",
                        fileName: "offre.pdf",
                        chunkId: "k1",
                        index: 0,
                        page: 1,
                        heading: null,
                        excerpt: "Proposition commerciale.",
                        score: 1,
                        tokens: 8,
                        attached: true,
                    },
                ];
            },
        },
    });
    assert.deepEqual(seen, [["file-a"]]);
    assert.equal(pack.fileHits.length, 1);
    assert.match(pack.contextMessage ?? "", /offre\.pdf \(p\.1 — joint au message\)/);
});
