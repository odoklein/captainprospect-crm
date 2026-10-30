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
import { FILE_TOOLS, fileToolDeps, listFolderFilesTool, readFileSection, searchFiles } from "./files";
import { matchFilesByName, normalizeFileName, NO_SCOPE_MESSAGE } from "@/lib/assistant/files/access";
import type { EnsureResult } from "@/lib/assistant/files/pipeline";

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

// ── In-memory stand-ins for the Prisma delegates the tools touch ────────────

const client = prisma as unknown as Record<string, unknown>;
const originals = new Map<string, PropertyDescriptor | undefined>();
function stub(name: string, value: unknown): boolean {
    if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(client, name));
    try {
        Object.defineProperty(client, name, { configurable: true, value });
        return true;
    } catch {
        return false;
    }
}

function fileRow(fileId: string, folderId: string, originalName: string, status: string, extra: Record<string, unknown> = {}) {
    return {
        fileId,
        folderId,
        status,
        pages: 2,
        chunkCount: status === "READY" ? 3 : 0,
        tokens: 0,
        error: null,
        extractedAt: null,
        file: {
            id: fileId,
            name: originalName.replace(/\.[^.]+$/, ""),
            originalName,
            mimeType: "application/pdf",
            size: 4096,
            createdAt: new Date("2026-10-28T09:00:00Z"),
            uploadedBy: { name: "Marie" },
        },
        ...extra,
    };
}

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
    // Folder f3: names for the file_name lookup.
    fileRow("file-c", "f3", "Présentation Client.pdf", "READY"),
    fileRow("file-d", "f3", "Présentation interne.pdf", "READY"),
    // Folder f4: an attachment still waiting for its extraction.
    fileRow("file-p", "f4", "brief.pdf", "PENDING"),
] as Array<Record<string, unknown> & { fileId: string; folderId: string; status: string }>;

/** Project files of client c1 (prisma.file), never indexed. */
const projectFiles = [{ id: "pf1", name: "cahier", originalName: "cahier des charges.pdf", mimeType: "application/pdf", size: 9000, clientId: "c1" }];

/** Blocks served by the $queryRaw stand-in, per file. */
const blocks: Record<string, Array<{ index: number; page: number; heading: string | null; content: string }>> = {
    "file-c": [{ index: 0, page: 1, heading: null, content: "Présentation de l'offre au client." }],
    "file-p": [{ index: 0, page: 1, heading: null, content: "Brief : cibler les DAF." }],
    pf1: [{ index: 0, page: 1, heading: "Objet", content: "Le cahier des charges décrit la mission." }],
};

const stubbed =
    stub("assistantFileText", {
        findMany: async ({ where }: { where: { folderId: string; status?: string } }) =>
            rows.filter((r) => r.folderId === where.folderId && (!where.status || r.status === where.status)),
        findUnique: async ({ where }: { where: { fileId: string } }) => {
            const r = rows.find((x) => x.fileId === where.fileId);
            return r ? { status: r.status, error: r.error, folderId: r.folderId } : null;
        },
    }) &&
    stub("assistantFolder", {
        findUnique: async ({ where }: { where: { clientId?: string } }) =>
            where.clientId === "c1" ? { id: "cf1", kind: "CLIENT", clientId: "c1", name: "Acme" } : null,
    }) &&
    stub("file", {
        findFirst: async ({ where }: { where: { id: string; OR: Array<{ clientId?: string; mission?: { clientId: string } }> } }) => {
            const clientId = where.OR.find((o) => o.clientId)?.clientId;
            return projectFiles.find((f) => f.id === where.id && f.clientId === clientId) ?? null;
        },
        findMany: async ({ where }: { where: { OR?: Array<{ clientId?: string }>; assistantText?: unknown } }) => {
            if (where.assistantText) return []; // indexable-but-unindexed listing
            const clientId = where.OR?.find((o) => o.clientId)?.clientId;
            return projectFiles.filter((f) => f.clientId === clientId);
        },
    }) &&
    stub("$queryRaw", async (sql: { text?: string; sql?: string; values: unknown[] }) => {
        const text = sql.text ?? sql.sql ?? "";
        const fileId = String(sql.values[0]).replace(/^ft_/, "");
        const list = blocks[fileId] ?? [];
        if (text.includes(`"chunkCount"`)) {
            const folderId = typeof sql.values[1] === "string" ? sql.values[1] : "any";
            return list.length ? [{ id: `ft_${fileId}`, folderId, chunkCount: list.length, fileName: `${fileId}.pdf` }] : [];
        }
        return list;
    });

after(() => {
    for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(client, name, descriptor);
        else delete client[name];
    }
    fileToolDeps.ensure = realEnsure;
});

const realEnsure = fileToolDeps.ensure;

function readyResult(fileId: string, folderId: string, extra: Partial<EnsureResult> = {}): EnsureResult {
    return { fileId, fileTextId: `ft_${fileId}`, folderId, status: "READY", error: null, pages: 3, chunkCount: 1, extractor: "unpdf", timedOut: false, extracted: true, ...extra };
}

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

// ── Reading by name ─────────────────────────────────────────────────────────

test("file names match case- and accent-insensitively, exact name first", () => {
    assert.equal(normalizeFileName("  Présentation   CLIENT.PDF "), "presentation client.pdf");
    const files = [
        { fileId: "c", name: "Présentation Client.pdf" },
        { fileId: "d", name: "Présentation interne.pdf" },
        { fileId: "e", name: "Bilan_2026.xlsx" },
    ];
    assert.deepEqual(matchFilesByName(files, "presentation").map((f) => f.fileId), ["c", "d"]);
    assert.deepEqual(matchFilesByName(files, "PRESENTATION CLIENT").map((f) => f.fileId), ["c"], "exact without extension");
    assert.deepEqual(matchFilesByName(files, "bilan 2026").map((f) => f.fileId), ["e"], "underscores read as spaces");
    assert.deepEqual(matchFilesByName(files, "contrat"), []);
});

const f3 = () => ctx({ folder: { id: "f3", kind: "GENERAL", name: "Offres", clientId: null } });

test("read_file_section reads a file by file_name", async (t) => {
    if (!stubbed) return t.skip("Prisma delegates could not be stubbed");
    const out = (await readFileSection.execute({ file_name: "presentation client" }, f3())) as Record<string, unknown>;
    assert.equal(out.fileId, "file-c");
    assert.deepEqual((out.blocs as Array<{ contenu: string }>).map((b) => b.contenu), ["Présentation de l'offre au client."]);
});

test("an ambiguous or unknown file_name is refused with the candidates", async (t) => {
    if (!stubbed) return t.skip("Prisma delegates could not be stubbed");
    await assert.rejects(
        readFileSection.execute({ file_name: "présentation" }, f3()),
        (e: unknown) => e instanceof ToolValidationError && /Présentation Client\.pdf \(file_id file-c\)/.test(e.message) && /file-d/.test(e.message),
    );
    await assert.rejects(readFileSection.execute({ file_name: "contrat" }, f3()), (e: unknown) => e instanceof ToolValidationError && /Aucun fichier/.test(e.message));
    assert.equal(readFileSection.schema.safeParse({ from_block: 0 }).success, false, "file_id or file_name required");
});

// ── On-demand extraction ────────────────────────────────────────────────────

test("a folder file still PENDING is extracted on demand, then read", async (t) => {
    if (!stubbed) return t.skip("Prisma delegates could not be stubbed");
    const calls: Array<[string, string | null | undefined]> = [];
    fileToolDeps.ensure = async (fileId, options = {}) => {
        calls.push([fileId, options.folderId]);
        return readyResult(fileId, "f4");
    };
    try {
        const c = ctx({ folder: { id: "f4", kind: "GENERAL", name: "Pièces", clientId: null } });
        const out = (await readFileSection.execute({ file_id: "file-p", from_block: 0 }, c)) as Record<string, unknown>;
        assert.deepEqual(calls, [["file-p", "f4"]]);
        assert.equal(out.pages, 3);
        assert.equal((out.blocs as unknown[]).length, 1);
    } finally {
        fileToolDeps.ensure = realEnsure;
    }
});

test("an extraction still running answers « réessaie », not « illisible »", async (t) => {
    if (!stubbed) return t.skip("Prisma delegates could not be stubbed");
    fileToolDeps.ensure = async (fileId) => readyResult(fileId, "f4", { status: "PROCESSING", timedOut: true, chunkCount: 0 });
    try {
        const c = ctx({ folder: { id: "f4", kind: "GENERAL", name: "Pièces", clientId: null } });
        const out = (await readFileSection.execute({ file_id: "file-p" }, c)) as Record<string, unknown>;
        assert.deepEqual(out.blocs, []);
        assert.match(String(out.note), /en cours.*réessaie/);
    } finally {
        fileToolDeps.ensure = realEnsure;
    }
});

// ── « Vue agence »: no folder, a client ─────────────────────────────────────

const agencyView = () =>
    ctx({ folder: null, project: { clientId: "c1", clientName: "Acme", missionId: null, missionName: null } });

test("without a folder, a client's never-indexed project file is read through its CLIENT folder", async (t) => {
    if (!stubbed) return t.skip("Prisma delegates could not be stubbed");
    const calls: Array<[string, string | null | undefined]> = [];
    fileToolDeps.ensure = async (fileId, options = {}) => {
        calls.push([fileId, options.folderId]);
        return readyResult(fileId, "cf1");
    };
    try {
        const out = (await readFileSection.execute({ file_id: "pf1", from_block: 0 }, agencyView())) as Record<string, unknown>;
        assert.deepEqual(calls, [["pf1", "cf1"]], "text row created in the client's folder");
        assert.equal(out.fileId, "pf1");
        assert.match(JSON.stringify(out.blocs), /cahier des charges/);
        // …and by name, through the client's project files.
        const byName = (await readFileSection.execute({ file_name: "Cahier des Charges" }, agencyView())) as Record<string, unknown>;
        assert.equal(byName.fileId, "pf1");
    } finally {
        fileToolDeps.ensure = realEnsure;
    }
});

test("without a folder, another client's file is « introuvable pour ce client »", async (t) => {
    if (!stubbed) return t.skip("Prisma delegates could not be stubbed");
    await assert.rejects(
        readFileSection.execute({ file_id: "file-a" }, agencyView()),
        (e: unknown) => e instanceof ToolValidationError && /introuvable pour ce client/.test(e.message),
    );
    await assert.rejects(
        searchFiles.execute({ query: "contrat", file_id: "nope" }, agencyView()),
        (e: unknown) => e instanceof ToolValidationError,
    );
});

test("neither folder nor client: a clear French refusal", async () => {
    await assert.rejects(
        readFileSection.execute({ file_id: "pf1" }, ctx({ folder: null, project: null })),
        (e: unknown) => e instanceof ValidationError && e.message === NO_SCOPE_MESSAGE,
    );
});
