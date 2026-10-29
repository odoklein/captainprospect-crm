/**
 * The Captain AI v4 migration, executed for real on an in-process Postgres
 * (PGlite): it must apply twice without error (idempotent), create the five
 * tables and the new conversation/message columns, keep the (scopeKey,
 * contentKey) memory unique, cascade from folder to file text to chunks, and
 * the generated French tsvector must match an inflected word.
 *     npm run test:assistant-folders
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = resolve(
    process.cwd(),
    "prisma/migrations/20261030100000_add_assistant_folders_memory_files/migration.sql",
);

const TABLES = [
    "AssistantProjetFolder",
    "AssistantProjetMemory",
    "AssistantProjetFileText",
    "AssistantProjetFileChunk",
    "AssistantProjetPin",
];

let pg: PGlite;
/** 'french' on a full Postgres; 'simple' only if this PGlite build lacks the config. */
let tsConfig = "french";
let sql: string;

async function tableNames(): Promise<string[]> {
    const r = await pg.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`,
    );
    return r.rows.map((x) => x.table_name);
}

before(async () => {
    pg = new PGlite();
    // The tables the migration references but does not create (shape-only stubs).
    await pg.exec(`
        CREATE TABLE "Client" (id text PRIMARY KEY, name text);
        CREATE TABLE "User" (id text PRIMARY KEY, name text);
        CREATE TABLE "File" (id text PRIMARY KEY, name text, "clientId" text);
        CREATE TABLE "AssistantProjetConversation" (id text PRIMARY KEY, "clientId" text, "createdById" text, title text, "lastMessageAt" timestamp);
        CREATE TABLE "AssistantProjetMessage" (id text PRIMARY KEY, "conversationId" text, content text);
        INSERT INTO "Client" VALUES ('cA', 'Client A');
        INSERT INTO "User" VALUES ('u1', 'Marie');
        INSERT INTO "File" VALUES ('f1', 'offre.pdf', NULL);
    `);
    sql = readFileSync(MIGRATION, "utf8");
    const cfg = await pg.query<{ cfgname: string }>(`SELECT cfgname FROM pg_ts_config WHERE cfgname = 'french'`);
    if (cfg.rows.length === 0) {
        tsConfig = "simple";
        console.warn("[migration.pglite.test] this PGlite has no 'french' text-search config: testing with 'simple'");
        sql = sql.replace(/to_tsvector\('french'/g, "to_tsvector('simple'");
    }
});

after(async () => {
    await pg.close();
});

test("applies on an empty database and again without error (idempotent)", async () => {
    await pg.exec(sql);
    const first = await tableNames();
    for (const t of TABLES) assert.ok(first.includes(t), `${t} created`);
    await pg.exec(sql);
    assert.deepEqual(await tableNames(), first);
});

test("adds the folder, kind, visibility and summary columns to conversations, attachments to messages", async () => {
    const conv = await pg.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'AssistantProjetConversation'`,
    );
    const cols = conv.rows.map((r) => r.column_name);
    for (const c of ["folderId", "kind", "visibility", "pinnedAt", "summaryUpToMessageId", "summaryTokens", "titleEditedAt"]) {
        assert.ok(cols.includes(c), `conversation.${c}`);
    }
    const msg = await pg.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'AssistantProjetMessage'`,
    );
    const mcols = msg.rows.map((r) => r.column_name);
    for (const c of ["attachments", "feedback", "supersededAt"]) assert.ok(mcols.includes(c), `message.${c}`);

    // Defaults: an existing conversation reads as a private chat.
    await pg.exec(`INSERT INTO "AssistantProjetConversation" (id, "createdById", title) VALUES ('c1', 'u1', 'Hello')`);
    const row = await pg.query<{ kind: string; visibility: string }>(`SELECT kind, visibility FROM "AssistantProjetConversation" WHERE id = 'c1'`);
    assert.deepEqual(row.rows[0], { kind: "CHAT", visibility: "PRIVATE" });
});

test("one folder per client, one memory per (scope, content)", async () => {
    await pg.exec(`INSERT INTO "AssistantProjetFolder" (id, kind, "clientId", name, "createdById", "updatedAt") VALUES ('fa', 'CLIENT', 'cA', 'Client A', 'u1', now())`);
    await assert.rejects(
        pg.exec(`INSERT INTO "AssistantProjetFolder" (id, kind, "clientId", name, "createdById", "updatedAt") VALUES ('fa2', 'CLIENT', 'cA', 'Client A bis', 'u1', now())`),
        (err: { code?: string }) => err.code === "23505",
    );
    await pg.exec(`INSERT INTO "AssistantProjetMemory" (id, scope, "folderId", content, "scopeKey", "contentKey", "updatedAt") VALUES ('m1', 'FOLDER', 'fa', 'Préfère les CR courts', 'FOLDER:fa||', 'k1', now())`);
    await assert.rejects(
        pg.exec(`INSERT INTO "AssistantProjetMemory" (id, scope, "folderId", content, "scopeKey", "contentKey", "updatedAt") VALUES ('m2', 'FOLDER', 'fa', 'prefere les cr courts', 'FOLDER:fa||', 'k1', now())`),
        (err: { code?: string }) => err.code === "23505",
    );
});

test("chunk tsvector is generated and the GIN index exists", async () => {
    await pg.exec(`
        INSERT INTO "AssistantProjetFileText" (id, "fileId", "folderId", status, "updatedAt") VALUES ('ft1', 'f1', 'fa', 'READY', now());
        INSERT INTO "AssistantProjetFileChunk" (id, "fileTextId", "folderId", "fileId", index, content)
        VALUES ('ch1', 'ft1', 'fa', 'f1', 0, 'Nos prospections avancent bien ce trimestre.'),
               ('ch2', 'ft1', 'fa', 'f1', 1, 'La facturation part le 5 de chaque mois.');
    `);
    const hit = await pg.query<{ id: string }>(
        `SELECT id FROM "AssistantProjetFileChunk" WHERE websearch_to_tsquery($1, 'prospection') @@ tsv`,
        [tsConfig],
    );
    if (tsConfig === "french") {
        assert.deepEqual(hit.rows.map((r) => r.id), ["ch1"], "french stemming matches 'prospections'");
    } else {
        // 'simple' does not stem: only the exact token matches.
        const exact = await pg.query<{ id: string }>(
            `SELECT id FROM "AssistantProjetFileChunk" WHERE websearch_to_tsquery('simple', 'prospections') @@ tsv`,
        );
        assert.deepEqual(exact.rows.map((r) => r.id), ["ch1"]);
    }
    const miss = await pg.query<{ id: string }>(
        `SELECT id FROM "AssistantProjetFileChunk" WHERE websearch_to_tsquery($1, 'recrutement') @@ tsv`,
        [tsConfig],
    );
    assert.deepEqual(miss.rows, []);

    const idx = await pg.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE indexname = 'AssistantProjetFileChunk_tsv_idx'`,
    );
    assert.equal(idx.rows.length, 1);
    assert.match(idx.rows[0].indexdef, /USING gin \("?tsv"?\)/i);
});

test("deleting a folder cascades to its file texts, chunks, memories and pins; conversations are detached", async () => {
    await pg.exec(`
        INSERT INTO "AssistantProjetPin" (id, "folderId", title, visual, "createdById") VALUES ('p1', 'fa', 'RDV / semaine', '{"kind":"bar"}', 'u1');
        UPDATE "AssistantProjetConversation" SET "folderId" = 'fa', "clientId" = 'cA' WHERE id = 'c1';
        DELETE FROM "AssistantProjetFolder" WHERE id = 'fa';
    `);
    const counts = await pg.query<{ texts: number; chunks: number; memories: number; pins: number }>(`
        SELECT (SELECT count(*)::int FROM "AssistantProjetFileText") AS texts,
               (SELECT count(*)::int FROM "AssistantProjetFileChunk") AS chunks,
               (SELECT count(*)::int FROM "AssistantProjetMemory") AS memories,
               (SELECT count(*)::int FROM "AssistantProjetPin") AS pins
    `);
    assert.deepEqual(counts.rows[0], { texts: 0, chunks: 0, memories: 0, pins: 0 });
    const conv = await pg.query<{ folderId: string | null }>(`SELECT "folderId" FROM "AssistantProjetConversation" WHERE id = 'c1'`);
    assert.equal(conv.rows[0].folderId, null);
});
