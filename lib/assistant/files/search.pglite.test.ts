/**
 * searchFolderChunks / readFileChunks executed for real on an in-process
 * Postgres (PGlite) with the v4 migration applied: French stemming, the
 * per-file cap, attached files first, folder isolation, deleted and non-READY
 * files excluded, and the ILIKE fallback when the tsv column is missing.
 *     npx tsx --test lib/assistant/files/search.pglite.test.ts
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Prisma } from "@prisma/client";

import { fallbackWords, readFileChunks, searchFolderChunks, type RawDb } from "./search";

const MIGRATION = resolve(process.cwd(), "prisma/migrations/20261030100000_add_assistant_folders_memory_files/migration.sql");

let pg: PGlite;
let french = true;

/** $queryRaw stand-in: Prisma.Sql carries Postgres-style text ($1…) and values. */
function dbOf(instance: PGlite): RawDb {
    return {
        $queryRaw: async <T,>(sql: Prisma.Sql): Promise<T> => (await instance.query(sql.text, sql.values as unknown[])).rows as T,
    };
}

async function stubs(instance: PGlite) {
    await instance.exec(`
        CREATE TABLE "Client" (id text PRIMARY KEY, name text);
        CREATE TABLE "User" (id text PRIMARY KEY, name text);
        CREATE TABLE "File" (id text PRIMARY KEY, name text, "originalName" text, "clientId" text, "deletedAt" timestamp);
        CREATE TABLE "AssistantProjetConversation" (id text PRIMARY KEY, "clientId" text, "createdById" text, title text, "lastMessageAt" timestamp);
        CREATE TABLE "AssistantProjetMessage" (id text PRIMARY KEY, "conversationId" text, content text);
        INSERT INTO "User" VALUES ('u1', 'Marie');
    `);
}

let seq = 0;
async function addFile(
    instance: PGlite,
    opts: { id: string; folder: string; name: string; chunks: string[]; status?: string; deleted?: boolean },
) {
    await instance.query(`INSERT INTO "File" (id, name, "originalName", "deletedAt") VALUES ($1, $2, $3, $4)`, [
        opts.id,
        opts.name.replace(/\.[^.]+$/, ""),
        opts.name,
        opts.deleted ? new Date().toISOString() : null,
    ]);
    const textId = `ft_${opts.id}`;
    await instance.query(
        `INSERT INTO "AssistantProjetFileText" (id, "fileId", "folderId", status, "chunkCount", "updatedAt") VALUES ($1, $2, $3, $4::"AssistantFileTextStatus", $5, now())`,
        [textId, opts.id, opts.folder, opts.status ?? "READY", opts.chunks.length],
    );
    for (const [index, content] of opts.chunks.entries()) {
        await instance.query(
            `INSERT INTO "AssistantProjetFileChunk" (id, "fileTextId", "folderId", "fileId", index, page, heading, content, tokens)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [`ch${++seq}`, textId, opts.folder, opts.id, index, index + 1, index === 0 ? "Introduction" : null, content, Math.ceil(content.length / 3.3)],
        );
    }
}

before(async () => {
    pg = new PGlite();
    await stubs(pg);
    let sql = readFileSync(MIGRATION, "utf8");
    const cfg = await pg.query<{ cfgname: string }>(`SELECT cfgname FROM pg_ts_config WHERE cfgname = 'french'`);
    if (cfg.rows.length === 0) {
        french = false;
        console.warn("[search.pglite.test] no 'french' text-search config in this PGlite: stemming test skipped");
        sql = sql.replace(/to_tsvector\('french'/g, "to_tsvector('simple'");
    }
    await pg.exec(sql);
    await pg.exec(`
        INSERT INTO "AssistantProjetFolder" (id, kind, name, "createdById", "updatedAt") VALUES
            ('fa', 'GENERAL', 'Dossier A', 'u1', now()),
            ('fb', 'GENERAL', 'Dossier B', 'u1', now());
    `);
    await addFile(pg, {
        id: "offre",
        folder: "fa",
        name: "offre.pdf",
        chunks: [
            "Proposition commerciale. Nos prospections téléphoniques ciblent les directeurs financiers des PME lyonnaises.",
            "Les prospections du second trimestre ont produit quarante rendez-vous qualifiés.",
            "Une troisième campagne de prospections est prévue pour janvier.",
            "La facturation est mensuelle, payable à trente jours.",
        ],
    });
    await addFile(pg, {
        id: "brief",
        folder: "fa",
        name: "brief.docx",
        chunks: ["Brief client : la prospection doit éviter les grands comptes.", "Contact principal : Jeanne Martin, DAF."],
    });
    await addFile(pg, { id: "annexe", folder: "fa", name: "annexe.md", chunks: ["Annexe tarifaire : référence ACME-42, forfait mensuel."] });
    await addFile(pg, { id: "gone", folder: "fa", name: "ancien.pdf", chunks: ["Ancienne prospection supprimée."], deleted: true });
    await addFile(pg, { id: "pending", folder: "fa", name: "encours.pdf", chunks: ["Prospection en cours d'indexation."], status: "PROCESSING" });
    await addFile(pg, { id: "other", folder: "fb", name: "autre.pdf", chunks: ["Prospection d'un autre dossier, confidentielle."] });
});

after(async () => {
    await pg?.close();
});

test("French stemming: « prospection » finds « prospections », ranked, with plain-text excerpts", async (t) => {
    if (!french) {
        t.skip("no french config");
        return;
    }
    const r = await searchFolderChunks("fa", "prospection", { db: dbOf(pg), limit: 10, perFile: 10 });
    assert.equal(r.degraded, false);
    assert.equal(r.mode, "fts");
    const ids = r.hits.map((h) => `${h.fileId}#${h.index}`);
    assert.ok(ids.includes("offre#0") && ids.includes("offre#1") && ids.includes("offre#2"), ids.join(","));
    assert.ok(ids.includes("brief#0"));
    for (const h of r.hits) {
        assert.ok(!/<\/?b>/.test(h.excerpt), "headline markers stripped");
        assert.ok(h.excerpt.length > 0);
        assert.ok(h.tokens > 0);
        assert.equal(h.attached, false);
    }
    const offre0 = r.hits.find((h) => h.fileId === "offre" && h.index === 0)!;
    assert.equal(offre0.fileName, "offre.pdf");
    assert.equal(offre0.page, 1);
    assert.equal(offre0.heading, "Introduction");
    // Scores are descending.
    const scores = r.hits.map((h) => h.score);
    assert.deepEqual([...scores].sort((a, b) => b - a), scores);
});

test("deleted files, non-READY texts and other folders never surface", async () => {
    const r = await searchFolderChunks("fa", "prospection", { db: dbOf(pg), limit: 20, perFile: 20 });
    const files = new Set(r.hits.map((h) => h.fileId));
    assert.ok(!files.has("gone"));
    assert.ok(!files.has("pending"));
    assert.ok(!files.has("other"));
});

test("perFile caps hits per file (default 2), limit caps the total", async () => {
    const r = await searchFolderChunks("fa", "prospections", { db: dbOf(pg), limit: 10 });
    const perFile = new Map<string, number>();
    for (const h of r.hits) perFile.set(h.fileId, (perFile.get(h.fileId) ?? 0) + 1);
    assert.equal(perFile.get("offre"), 2);
    const one = await searchFolderChunks("fa", "prospections", { db: dbOf(pg), limit: 1 });
    assert.equal(one.hits.length, 1);
    const scoped = await searchFolderChunks("fa", "prospections", { db: dbOf(pg), limit: 8, perFile: 8, fileId: "brief" });
    assert.ok(scoped.hits.length >= 1);
    assert.ok(scoped.hits.every((h) => h.fileId === "brief"));
});

test("attached files: their first two chunks come first, whatever the query, without duplicates", async () => {
    const r = await searchFolderChunks("fa", "prospection", { db: dbOf(pg), limit: 4, attachedFileIds: ["offre", "other"] });
    const head = r.hits.slice(0, 2);
    assert.deepEqual(
        head.map((h) => [h.fileId, h.index, h.attached]),
        [
            ["offre", 0, true],
            ["offre", 1, true],
        ],
    );
    // A file of another folder is never pulled in, even attached.
    assert.ok(!r.hits.some((h) => h.fileId === "other"));
    const keys = r.hits.map((h) => h.chunkId);
    assert.equal(new Set(keys).size, keys.length, "no duplicate chunk");
    assert.ok(r.hits.length <= 2 + 4);
    // Attached excerpts are the chunk text itself (no headline needed).
    assert.match(head[1].excerpt, /second trimestre/);
});

test("a reference the stemmer cannot match falls back to the raw words (ILIKE), not degraded", async () => {
    const r = await searchFolderChunks("fa", "ACME-42", { db: dbOf(pg) });
    assert.ok(r.hits.some((h) => h.fileId === "annexe"), JSON.stringify(r.hits));
});

test("fallbackWords keeps the three longest distinct words", () => {
    assert.deepEqual(fallbackWords("Le contrat de prestation, la prestation et le tarif"), ["prestation", "contrat", "tarif"]);
    assert.deepEqual(fallbackWords("a b"), []);
});

test("readFileChunks reads at most 4 consecutive blocks of a READY file of the folder", async () => {
    const r = await readFileChunks("offre", 1, 99, { folderId: "fa", db: dbOf(pg) });
    assert.ok(r);
    assert.equal(r.totalBlocks, 4);
    assert.equal(r.fromIndex, 1);
    assert.equal(r.toIndex, 4);
    assert.deepEqual(r.blocks.map((b) => b.index), [1, 2, 3]);
    assert.equal(r.fileName, "offre.pdf");
    assert.equal(await readFileChunks("offre", 0, 0, { folderId: "fb", db: dbOf(pg) }), null, "other folder");
    assert.equal(await readFileChunks("gone", 0, 0, { db: dbOf(pg) }), null, "deleted");
    assert.equal(await readFileChunks("pending", 0, 0, { db: dbOf(pg) }), null, "not READY");
});

test("tsv column missing: ILIKE on the longest words, marked degraded", async () => {
    const lag = new PGlite();
    try {
        await stubs(lag);
        // A lagging instance: the chunk table exists without the generated column.
        const sql = readFileSync(MIGRATION, "utf8")
            .replace(/,\s*"tsv" tsvector GENERATED ALWAYS AS \(to_tsvector\('french', "content"\)\) STORED/, "")
            .replace(/CREATE INDEX IF NOT EXISTS "AssistantProjetFileChunk_tsv_idx"[^;]*;/, "");
        assert.ok(!/"tsv" tsvector/.test(sql), "tsv removed from the fixture migration");
        await lag.exec(sql);
        await lag.exec(`INSERT INTO "AssistantProjetFolder" (id, kind, name, "createdById", "updatedAt") VALUES ('fa', 'GENERAL', 'A', 'u1', now())`);
        await addFile(lag, {
            id: "x",
            folder: "fa",
            name: "contrat.pdf",
            chunks: ["Le contrat de prestation court sur douze mois.", "Rien à voir ici.", "Le contrat est renouvelable."],
        });
        const r = await searchFolderChunks("fa", "durée du contrat", { db: dbOf(lag) });
        assert.equal(r.degraded, true);
        assert.equal(r.mode, "ilike");
        assert.deepEqual(r.hits.map((h) => h.index), [0, 2]);
        assert.match(r.hits[0].excerpt, /contrat/);
    } finally {
        await lag.close();
    }
});

test("tables missing entirely: empty and degraded, never thrown", async () => {
    const bare = new PGlite();
    try {
        const r = await searchFolderChunks("fa", "contrat", { db: dbOf(bare) });
        assert.deepEqual(r, { hits: [], degraded: true, mode: "ilike" });
    } finally {
        await bare.close();
    }
});
