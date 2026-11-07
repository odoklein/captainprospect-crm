/**
 * Context pack assembly with fake readers.
 *     npx tsx --test lib/assistant/context/pack.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { AssistantContext } from "@/lib/ai/tools/types";
import { CONTEXT_MESSAGE_HEADER, PRIOR_EVIDENCE_TITLE, renderMemoryBlock } from "./format";
import { DEFAULT_BUDGETS, buildContextPack, type ContextDeps, type ContextPackInput, type FileHit } from "./pack";
import type { MemoryCandidate } from "./rank";
import { estimateTokens, truncateToTokens } from "./tokens";

const NOW = new Date("2026-10-29T10:00:00Z");
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 86_400_000);

function ctx(over: Partial<AssistantContext> = {}): AssistantContext {
    return {
        userId: "u1",
        userName: "Camille Dupont",
        role: "MANAGER" as AssistantContext["role"],
        isActive: true,
        permissions: [],
        project: null,
        resolvedAt: NOW,
        autoWriteBudget: 3,
        conversationId: "c1",
        folder: { id: "f1", kind: "CLIENT", name: "Acme Énergie", clientId: "cl1" },
        ...over,
    };
}

function mem(over: Partial<MemoryCandidate> & { id: string }): MemoryCandidate {
    return {
        scope: "AGENCY",
        kind: "FACT",
        content: `Souvenir ${over.id} sans rapport particulier`,
        pinned: false,
        useCount: 0,
        updatedAt: NOW,
        missionId: null,
        ...over,
    };
}

const conversation = { id: "c1", summary: null, summaryUpToMessageId: null, missionId: null };

function input(over: Partial<ContextPackInput> = {}): ContextPackInput {
    return { ctx: ctx(), conversation, question: "Combien de RDV chez Acme ?", now: NOW, ...over };
}

const depsWith = (memories: MemoryCandidate[], files?: ContextDeps["files"]): ContextDeps => ({
    memories: async () => memories,
    files,
});

test("empty inputs: no sections, no context message, window 20, nothing degraded", async () => {
    const pack = await buildContextPack(input({ deps: depsWith([]) }));
    assert.deepEqual(pack.systemSections, []);
    assert.equal(pack.contextMessage, null);
    assert.equal(pack.memoryBlock.text, "");
    assert.deepEqual(pack.memoryBlock.used, []);
    assert.equal(pack.folderInstructions, null);
    assert.equal(pack.summary, null);
    assert.deepEqual(pack.fileHits, []);
    assert.equal(pack.historyWindow, 20);
    assert.deepEqual(pack.debug.degraded, []);
});

test("without deps the pack still builds (no reader = no memory)", async () => {
    const pack = await buildContextPack(input());
    assert.equal(pack.memoryBlock.text, "");
    assert.deepEqual(pack.debug.degraded, []);
});

test("memory budget is never exceeded, whatever the candidates", async () => {
    const many = Array.from({ length: 60 }, (_, i) =>
        mem({
            id: `m${i}`,
            scope: (["AGENCY", "FOLDER", "USER"] as const)[i % 3],
            content: `Souvenir numéro ${i} qui parle de choses variées et prend de la place dans le bloc mémoire du dossier`,
        }),
    );
    for (const budget of [40, 120, 300, 800]) {
        const pack = await buildContextPack(input({ deps: depsWith(many), budgets: { memories: budget } }));
        assert.ok(pack.memoryBlock.tokens <= budget, `budget ${budget}: ${pack.memoryBlock.tokens}`);
        assert.equal(pack.memoryBlock.used.length + pack.debug.dropped.memories, 60);
    }
    const full = await buildContextPack(input({ deps: depsWith(many), budgets: { memories: 100_000 } }));
    assert.equal(full.memoryBlock.used.length, 60);
});

test("the top item of each non-empty scope is kept before greedy ranking fills the rest", async () => {
    const candidates = [
        ...Array.from({ length: 8 }, (_, i) => mem({ id: `ag${i}`, pinned: true, content: `Agence pinned ${i} contenu assez long pour coûter` })),
        mem({ id: "folder1", scope: "FOLDER", updatedAt: daysAgo(400), content: "Vieux souvenir de dossier" }),
        mem({ id: "user1", scope: "USER", kind: "PREFERENCE", updatedAt: daysAgo(400), content: "Préfère les réponses courtes" }),
    ];
    const pack = await buildContextPack(input({ deps: depsWith(candidates), budgets: { memories: 90 } }));
    const scopes = new Set(pack.memoryBlock.used.map((u) => u.scope));
    assert.deepEqual([...scopes].sort(), ["AGENCY", "FOLDER", "USER"]);
    assert.ok(pack.memoryBlock.used.some((u) => u.id === "folder1"));
    assert.ok(pack.memoryBlock.used.some((u) => u.id === "user1"));
    assert.ok(pack.memoryBlock.used.length < candidates.length);
});

test("ranking prefers pinned memories and question overlap", async () => {
    const candidates = [
        mem({ id: "plain", content: "Le bureau ferme le vendredi à 17h" }),
        mem({ id: "pinned", pinned: true, content: "Toujours répondre en vouvoyant" }),
        mem({ id: "overlap", content: "Acme Énergie compte les RDV confirmés uniquement" }),
    ];
    const pack = await buildContextPack(input({ deps: depsWith(candidates), question: "Combien de RDV confirmés pour Acme Énergie ?" }));
    const order = pack.memoryBlock.used.map((u) => u.id);
    assert.deepEqual(order, ["pinned", "overlap", "plain"]);
});

test("selection is deterministic regardless of candidate order", async () => {
    const base = [
        mem({ id: "b", updatedAt: daysAgo(3) }),
        mem({ id: "a", updatedAt: daysAgo(3) }),
        mem({ id: "c", scope: "USER", updatedAt: daysAgo(1) }),
        mem({ id: "d", scope: "FOLDER", pinned: true }),
        mem({ id: "e", content: "Acme Énergie veut un point hebdo", scope: "FOLDER" }),
    ];
    const shuffled = [base[4], base[2], base[0], base[3], base[1]];
    const p1 = await buildContextPack(input({ deps: depsWith(base) }));
    const p2 = await buildContextPack(input({ deps: depsWith(shuffled) }));
    assert.deepEqual(p1.memoryBlock.used, p2.memoryBlock.used);
    assert.equal(p1.memoryBlock.text, p2.memoryBlock.text);
    assert.deepEqual(p1.memoryBlock.used.map((u) => u.id), ["d", "e", "c", "a", "b"]);
});

test("memory block renders (m:<id>) markers under the right French headings", async () => {
    const candidates = [
        mem({ id: "ag1", content: "L'agence facture au RDV tenu" }),
        mem({ id: "fo1", scope: "FOLDER", content: "Acme veut un point hebdo le lundi" }),
        mem({ id: "us1", scope: "USER", kind: "PREFERENCE", content: "Préfère les tableaux aux listes" }),
    ];
    const pack = await buildContextPack(input({ deps: depsWith(candidates) }));
    const text = pack.memoryBlock.text;
    assert.ok(text.startsWith("## Mémoire"));
    assert.ok(text.includes("### Agence\n- (m:ag1) L'agence facture au RDV tenu"));
    assert.ok(text.includes("### Dossier « Acme Énergie »\n- (m:fo1) Acme veut un point hebdo le lundi"));
    assert.ok(text.includes("### Préférences de Camille\n- (m:us1) Préfère les tableaux aux listes"));
    assert.equal(pack.systemSections.length, 1);
    assert.equal(pack.systemSections[0].id, "memory");
    assert.equal(pack.systemSections[0].stable, true);
    assert.equal(pack.debug.tokens.memory, pack.memoryBlock.tokens);
});

test("renderMemoryBlock omits empty scopes and falls back without names", () => {
    const text = renderMemoryBlock([mem({ id: "x", scope: "USER" })], { folderName: null, userFirstName: null });
    assert.equal(text, "## Mémoire\n\n### Préférences\n- (m:x) Souvenir x sans rapport particulier");
    assert.equal(renderMemoryBlock([], { folderName: "A", userFirstName: "B" }), "");
});

test("a throwing memory reader degrades to no memory instead of failing the turn", async () => {
    const deps: ContextDeps = {
        memories: async () => {
            throw new Error("table manquante");
        },
    };
    const pack = await buildContextPack(input({ deps }));
    assert.equal(pack.memoryBlock.text, "");
    assert.deepEqual(pack.debug.degraded, ["memories"]);
    assert.equal(pack.debug.dropped.memories, 0);
});

test("a throwing files reader degrades too, and files are skipped without a folder", async () => {
    const boom: ContextDeps["files"] = async () => {
        throw new Error("tsv absent");
    };
    const pack = await buildContextPack(input({ deps: depsWith([], boom) }));
    assert.deepEqual(pack.fileHits, []);
    assert.deepEqual(pack.debug.degraded, ["files"]);

    let called = 0;
    const counting: ContextDeps["files"] = async () => {
        called += 1;
        return [];
    };
    const noFolder = await buildContextPack(input({ ctx: ctx({ folder: null }), deps: depsWith([], counting) }));
    assert.equal(called, 0);
    assert.deepEqual(noFolder.fileHits, []);
});

test("file hits: attached first, trimmed to budget, rendered in the context message", async () => {
    const hit = (over: Partial<FileHit> & { chunkId: string }): FileHit => ({
        fileId: "file1",
        fileName: "Brief Acme.pdf",
        index: 0,
        page: 2,
        heading: null,
        excerpt: "Extrait ".repeat(30),
        score: 0.5,
        tokens: 0,
        attached: false,
        ...over,
    });
    const hits = [
        hit({ chunkId: "k1", score: 0.9 }),
        hit({ chunkId: "k2", score: 0.1, attached: true, fileName: "Pièce jointe.docx", page: null }),
        hit({ chunkId: "k3", score: 0.8 }),
    ];
    let seen: { folderId: string; question: string; limit: number } | null = null;
    const files: ContextDeps["files"] = async (q) => {
        seen = q;
        return hits;
    };
    const pack = await buildContextPack(input({ deps: depsWith([], files), budgets: { fileHits: 160 } }));
    assert.deepEqual(seen, { folderId: "f1", question: "Combien de RDV chez Acme ?", limit: 6 });
    assert.deepEqual(pack.fileHits.map((h) => h.chunkId), ["k2", "k1"]);
    assert.equal(pack.debug.dropped.files, 1);
    assert.ok(pack.contextMessage?.includes("### Pièce jointe.docx (joint au message)"));
    assert.ok(pack.contextMessage?.includes("### Brief Acme.pdf (p.2)"));
    assert.ok(pack.contextMessage?.includes("Fichiers du dossier cités ci-dessous : Pièce jointe.docx, Brief Acme.pdf."));
});

test("summary sets window 12, is truncated to budget and lands in the context message", async () => {
    const long = Array.from({ length: 80 }, (_, i) => `Décision ${i} prise sur le périmètre.`).join(" ");
    const pack = await buildContextPack(
        input({
            deps: depsWith([]),
            conversation: { ...conversation, summary: long, summaryUpToMessageId: "msg42" },
            budgets: { summary: 100 },
        }),
    );
    assert.equal(pack.historyWindow, 12);
    assert.ok(pack.summary);
    assert.ok(pack.summary.tokens <= 100);
    assert.equal(pack.summary.upToMessageId, "msg42");
    assert.ok(pack.summary.text.endsWith(" […]"));
    assert.equal(pack.debug.dropped.summary, 1);
    assert.ok(pack.contextMessage?.startsWith(`${CONTEXT_MESSAGE_HEADER}\n\n## Résumé des échanges précédents\n`));
    assert.deepEqual(pack.systemSections, []);
});

test("prior evidence index is volatile, truncated, and keeps the reuse hint", async () => {
    const index = Array.from({ length: 60 }, (_, i) => `E${i} list_actions period=30d — ${i} lignes`).join("\n");
    const pack = await buildContextPack(input({ deps: depsWith([]), priorEvidenceIndex: index, budgets: { priorEvidence: 60 } }));
    assert.ok(pack.contextMessage);
    assert.ok(pack.contextMessage.includes(PRIOR_EVIDENCE_TITLE));
    assert.ok(pack.contextMessage.includes("rappelle le même outil avec les mêmes arguments"));
    assert.ok(pack.contextMessage.includes(" […]"));
    assert.ok(pack.debug.tokens.prior_evidence <= 60 + estimateTokens(PRIOR_EVIDENCE_TITLE) + 60);
    assert.equal(pack.debug.dropped.prior_evidence, 1);
    assert.deepEqual(pack.volatileSections.map((s) => s.id), ["prior_evidence"]);
});

test("volatile sections keep the order summary, prior evidence, files", async () => {
    const files: ContextDeps["files"] = async () => [
        { fileId: "f", fileName: "a.pdf", chunkId: "k", index: 0, page: 1, heading: "Intro", excerpt: "texte", score: 1, tokens: 2, attached: false },
    ];
    const pack = await buildContextPack(
        input({ deps: depsWith([], files), conversation: { ...conversation, summary: "Résumé court." }, priorEvidenceIndex: "E1 outil" }),
    );
    assert.deepEqual(pack.volatileSections.map((s) => s.id), ["summary", "prior_evidence", "files"]);
    const msg = pack.contextMessage ?? "";
    assert.ok(msg.indexOf("## Résumé") < msg.indexOf(PRIOR_EVIDENCE_TITLE));
    assert.ok(msg.indexOf(PRIOR_EVIDENCE_TITLE) < msg.indexOf("## Extraits de fichiers"));
    assert.ok(msg.includes("### a.pdf (p.1 — Intro)"));
});

test("folder instructions are a stable section truncated to budget", async () => {
    const instructions = Array.from({ length: 50 }, (_, i) => `Consigne ${i}: toujours citer la période.`).join(" ");
    const pack = await buildContextPack(
        input({ deps: depsWith([]), folder: { name: "Acme Énergie", instructions }, budgets: { instructions: 80 } }),
    );
    assert.ok(pack.folderInstructions);
    assert.ok(pack.folderInstructions.tokens <= 80);
    assert.equal(pack.debug.dropped.instructions, 1);
    assert.equal(pack.systemSections[0].id, "folder_instructions");
    assert.ok(pack.systemSections[0].text.startsWith("## Consignes du dossier « Acme Énergie »\nConsigne 0"));
    assert.equal(pack.systemSections[0].stable, true);
    assert.equal(pack.contextMessage, null);

    const blank = await buildContextPack(input({ deps: depsWith([]), folder: { name: "X", instructions: "   " } }));
    assert.equal(blank.folderInstructions, null);
});

test("default budgets match the plan", () => {
    assert.deepEqual(DEFAULT_BUDGETS, { instructions: 600, memories: 800, summary: 500, fileHits: 1500, fileIndex: 150, priorEvidence: 400 });
});

test("estimateTokens is ceil(chars / 3.3)", () => {
    assert.equal(estimateTokens(""), 0);
    assert.equal(estimateTokens("abc"), 1);
    assert.equal(estimateTokens("a".repeat(33)), 10);
    assert.equal(estimateTokens("a".repeat(34)), 11);
});

test("truncateToTokens cuts at a sentence or line boundary and marks the cut", () => {
    const text = "Première phrase assez longue pour compter. Deuxième phrase qui suit. Troisième phrase encore.\nQuatrième ligne.";
    assert.equal(truncateToTokens(text, 1000), text);
    const cut = truncateToTokens(text, 20);
    assert.ok(cut.endsWith(" […]"));
    assert.ok(estimateTokens(cut) <= 20, `${estimateTokens(cut)} tokens`);
    assert.equal(cut, "Première phrase assez longue pour compter. […]");

    const lines = "ligne une\nligne deux\nligne trois\nligne quatre\nligne cinq\nligne six";
    const cutLines = truncateToTokens(lines, 10);
    assert.equal(cutLines, "ligne une\nligne deux […]");
    assert.ok(estimateTokens(cutLines) <= 10);

    const noBoundary = "x".repeat(500);
    const hard = truncateToTokens(noBoundary, 10);
    assert.ok(estimateTokens(hard) <= 10);
    assert.ok(hard.endsWith(" […]"));
    assert.equal(truncateToTokens("abc", 0), "");
});
