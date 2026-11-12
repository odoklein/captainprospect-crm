/**
 * Lexical retrieval over assistant folder files (Captain AI v4). Plain
 * functions, shared by the file tools, the context pack and the background
 * agent; none of them checks who is asking — callers scope by folder.
 *
 * Search is Postgres full-text on the generated `tsv` column
 * (to_tsvector('french', content), GIN-indexed): websearch_to_tsquery parses
 * the question like a search box (quotes, OR, -exclusion), ts_rank_cd ranks,
 * ts_headline cuts the excerpt. Only READY texts of non-deleted Files count.
 * When the column or the French configuration is missing (a lagging
 * instance), an ILIKE scan on the query's three longest words stands in and
 * the result says `degraded: true`. Every excerpt is document text, so it
 * goes through sanitizeUntrusted before reaching a prompt.
 *
 * Raw SQL goes through an injectable `$queryRaw` so search.pglite.test.ts runs
 * the exact statements on an in-process Postgres.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sanitizeUntrusted } from "@/lib/ai/tools/redact";
import type { FolderFile, FileTextStatus } from "@/lib/assistant/api-contract";
import type { FileHit } from "@/lib/assistant/context/pack";
import { isMissingSchemaError } from "@/lib/assistant/store/missing";

export interface RawDb {
    $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

const defaultDb = (): RawDb => prisma as unknown as RawDb;

export const SEARCH_DEFAULT_LIMIT = 6;
export const SEARCH_MAX_LIMIT = 20;
export const ATTACHED_CHUNKS_PER_FILE = 2;
export const MAX_ATTACHED_FILES = 5;
/** Excerpt ceilings (characters) after sanitising. */
export const EXCERPT_MAX_CHARS = 800;
export const ATTACHED_EXCERPT_MAX_CHARS = 1500;
export const READ_MAX_BLOCKS = 4;
export const BLOCK_MAX_CHARS = 4000;

const HEADLINE_OPTIONS = "MaxFragments=2, MaxWords=60, MinWords=20";
const CHARS_PER_TOKEN = 3.3;

export interface FileSearchOptions {
    limit?: number;
    /** Max hits per file (default 2), so one long document cannot fill the answer. */
    perFile?: number;
    /** Files attached to the message: their first two chunks come first, whatever the query. */
    attachedFileIds?: string[];
    /** Restrict to one file of the folder. */
    fileId?: string;
    db?: RawDb;
}

export interface FileSearchResult {
    hits: FileHit[];
    /** The tsv column or the French text-search config is missing: ILIKE fallback (or nothing). */
    degraded: boolean;
    /** How the query hits were found: full text, or the ILIKE word scan. */
    mode: "fts" | "ilike";
}

interface HitRow {
    id: string;
    fileId: string;
    index: number;
    page: number | null;
    heading: string | null;
    tokens: number;
    score: number | string | null;
    excerpt: string | null;
    fileName: string | null;
}

/** Postgres undefined_object (42704): e.g. text search configuration "french" does not exist. */
function isMissingSearchConfig(err: unknown, depth = 0): boolean {
    if (!err || typeof err !== "object" || depth > 4) return false;
    const e = err as { code?: unknown; meta?: { code?: unknown }; message?: unknown; cause?: unknown };
    if (e.code === "42704" || e.meta?.code === "42704") return true;
    if (typeof e.message === "string" && /\b42704\b|text search configuration .* does not exist/i.test(e.message)) return true;
    return e.cause && e.cause !== err ? isMissingSearchConfig(e.cause, depth + 1) : false;
}

function estimate(text: string): number {
    return text ? Math.ceil(text.length / CHARS_PER_TOKEN) : 0;
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(value)));
}

/** ts_headline marks matches with <b>…</b>; the model gets plain text. */
function cleanHeadline(text: string): string {
    return text.replace(/<\/?b>/g, "").replace(/\s+/g, " ").trim();
}

function toHit(row: HitRow, attached: boolean, maxChars: number): FileHit {
    const excerpt = sanitizeUntrusted(cleanHeadline(row.excerpt ?? ""), maxChars) ?? "";
    return {
        fileId: row.fileId,
        fileName: sanitizeUntrusted(row.fileName ?? "fichier", 200) ?? "fichier",
        chunkId: row.id,
        index: Number(row.index),
        page: row.page === null || row.page === undefined ? null : Number(row.page),
        heading: row.heading ? sanitizeUntrusted(row.heading, 240) : null,
        excerpt,
        score: Number(row.score ?? 0) || 0,
        tokens: estimate(excerpt),
        attached,
    };
}

/** The query's three longest distinct words (≥ 3 letters), for the ILIKE fallback. */
export function fallbackWords(query: string): string[] {
    const words = query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 3);
    return [...new Set(words)].sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).slice(0, 3);
}

function likePattern(word: string): string {
    return `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** ~300 characters around the first matching word, word-aligned. */
function windowAround(content: string, words: string[], size = 300): string {
    const lower = content.toLowerCase();
    let at = -1;
    for (const w of words) {
        const i = lower.indexOf(w);
        if (i >= 0 && (at < 0 || i < at)) at = i;
    }
    if (at < 0 || content.length <= size) return content.slice(0, size);
    let start = Math.max(0, at - Math.floor(size / 3));
    let end = Math.min(content.length, start + size);
    if (start > 0) {
        const sp = content.indexOf(" ", start);
        if (sp > 0 && sp < at) start = sp + 1;
    }
    if (end < content.length) {
        const sp = content.lastIndexOf(" ", end);
        if (sp > at) end = sp;
    }
    return `${start > 0 ? "… " : ""}${content.slice(start, end)}${end < content.length ? " …" : ""}`;
}

const READY_AND_LIVE = Prisma.sql`
    JOIN "AssistantProjetFileText" t ON t.id = c."fileTextId" AND t.status = 'READY'
    JOIN "File" f ON f.id = c."fileId" AND f."deletedAt" IS NULL`;

async function attachedHits(db: RawDb, folderId: string, fileIds: string[]): Promise<FileHit[]> {
    const ids = [...new Set(fileIds.filter((id) => typeof id === "string" && id))].slice(0, MAX_ATTACHED_FILES);
    if (ids.length === 0) return [];
    const rows = await db.$queryRaw<Array<Omit<HitRow, "excerpt" | "score"> & { content: string }>>(Prisma.sql`
        SELECT c.id, c."fileId", c.index, c.page, c.heading, c.tokens, c.content,
               COALESCE(f."originalName", f.name) AS "fileName"
        FROM "AssistantProjetFileChunk" c
        ${READY_AND_LIVE}
        WHERE c."folderId" = ${folderId}
          AND c."fileId" IN (${Prisma.join(ids)})
          AND c.index < ${ATTACHED_CHUNKS_PER_FILE}
        ORDER BY c."fileId", c.index`);
    const order = new Map(ids.map((id, i) => [id, i]));
    return rows
        .sort((a, b) => (order.get(a.fileId) ?? 0) - (order.get(b.fileId) ?? 0) || Number(a.index) - Number(b.index))
        .map((r) => toHit({ ...r, excerpt: r.content, score: 1 }, true, ATTACHED_EXCERPT_MAX_CHARS));
}

async function ftsHits(db: RawDb, folderId: string, query: string, limit: number, perFile: number, fileId?: string): Promise<FileHit[]> {
    const fileFilter = fileId ? Prisma.sql`AND c."fileId" = ${fileId}` : Prisma.empty;
    const rows = await db.$queryRaw<HitRow[]>(Prisma.sql`
        WITH q AS (SELECT websearch_to_tsquery('french', ${query}) AS query),
        ranked AS (
            SELECT c.id, c."fileId", c.index, c.page, c.heading, c.tokens, c.content,
                   COALESCE(f."originalName", f.name) AS "fileName",
                   ts_rank_cd(c.tsv, q.query) AS score,
                   row_number() OVER (PARTITION BY c."fileId" ORDER BY ts_rank_cd(c.tsv, q.query) DESC, c.index ASC) AS rn
            FROM "AssistantProjetFileChunk" c
            ${READY_AND_LIVE}
            CROSS JOIN q
            WHERE c."folderId" = ${folderId} ${fileFilter}
              AND c.tsv @@ q.query
        ),
        top AS (
            SELECT * FROM ranked WHERE rn <= ${perFile}
            ORDER BY score DESC, "fileId" ASC, index ASC
            LIMIT ${limit}
        )
        SELECT top.id, top."fileId", top.index, top.page, top.heading, top.tokens, top."fileName",
               top.score::float8 AS score,
               ts_headline('french', top.content, q.query, ${HEADLINE_OPTIONS}) AS excerpt
        FROM top CROSS JOIN q
        ORDER BY top.score DESC, top."fileId" ASC, top.index ASC`);
    return rows.map((r) => toHit(r, false, EXCERPT_MAX_CHARS));
}

async function ilikeHits(db: RawDb, folderId: string, query: string, limit: number, perFile: number, fileId?: string): Promise<FileHit[]> {
    const words = fallbackWords(query);
    if (words.length === 0) return [];
    const fileFilter = fileId ? Prisma.sql`AND c."fileId" = ${fileId}` : Prisma.empty;
    const anyWord = Prisma.join(
        words.map((w) => Prisma.sql`c.content ILIKE ${likePattern(w)}`),
        " OR ",
    );
    const matched = Prisma.join(
        words.map((w) => Prisma.sql`(CASE WHEN c.content ILIKE ${likePattern(w)} THEN 1 ELSE 0 END)`),
        " + ",
    );
    const rows = await db.$queryRaw<Array<Omit<HitRow, "excerpt"> & { content: string }>>(Prisma.sql`
        WITH ranked AS (
            SELECT c.id, c."fileId", c.index, c.page, c.heading, c.tokens, c.content,
                   COALESCE(f."originalName", f.name) AS "fileName",
                   (${matched}) AS score,
                   row_number() OVER (PARTITION BY c."fileId" ORDER BY (${matched}) DESC, c.index ASC) AS rn
            FROM "AssistantProjetFileChunk" c
            ${READY_AND_LIVE}
            WHERE c."folderId" = ${folderId} ${fileFilter}
              AND (${anyWord})
        )
        SELECT id, "fileId", index, page, heading, tokens, content, "fileName", score::float8 AS score
        FROM ranked WHERE rn <= ${perFile}
        ORDER BY score DESC, "fileId" ASC, index ASC
        LIMIT ${limit}`);
    return rows.map((r) => toHit({ ...r, excerpt: windowAround(r.content, words) }, false, EXCERPT_MAX_CHARS));
}

/**
 * The best chunks of a folder for `query`: attached files' first chunks first,
 * then up to `limit` full-text hits (at most `perFile` per file), deduplicated.
 * Never throws on a missing schema: empty + degraded instead.
 */
export async function searchFolderChunks(folderId: string, query: string, options: FileSearchOptions = {}): Promise<FileSearchResult> {
    const db = options.db ?? defaultDb();
    const limit = clampInt(options.limit, 1, SEARCH_MAX_LIMIT, SEARCH_DEFAULT_LIMIT);
    const perFile = clampInt(options.perFile, 1, SEARCH_MAX_LIMIT, 2);
    const q = (query ?? "").trim().slice(0, 500);
    let degraded = false;
    let mode: FileSearchResult["mode"] = "fts";

    let attached: FileHit[] = [];
    if (options.attachedFileIds && options.attachedFileIds.length > 0) {
        try {
            const scoped = options.fileId ? options.attachedFileIds.filter((id) => id === options.fileId) : options.attachedFileIds;
            attached = await attachedHits(db, folderId, scoped);
        } catch (err) {
            if (!isMissingSchemaError(err)) throw err;
            return { hits: [], degraded: true, mode };
        }
    }

    let found: FileHit[] = [];
    if (q) {
        try {
            found = await ftsHits(db, folderId, q, limit + attached.length, perFile, options.fileId);
            // Nothing for the stemmed query (a reference, a name, a partial word): try the raw words.
            if (found.length === 0) {
                found = await ilikeHits(db, folderId, q, limit + attached.length, perFile, options.fileId);
                if (found.length > 0) mode = "ilike";
            }
        } catch (err) {
            if (!isMissingSchemaError(err) && !isMissingSearchConfig(err)) throw err;
            degraded = true;
            mode = "ilike";
            try {
                found = await ilikeHits(db, folderId, q, limit + attached.length, perFile, options.fileId);
            } catch (inner) {
                if (!isMissingSchemaError(inner)) throw inner;
                found = [];
            }
        }
    }

    const taken = new Set(attached.map((h) => h.chunkId));
    const rest = found.filter((h) => !taken.has(h.chunkId)).slice(0, limit);
    return { hits: [...attached, ...rest], degraded, mode };
}

// ============================================
// Reading blocks
// ============================================

export interface FileBlock {
    index: number;
    page: number | null;
    heading: string | null;
    content: string;
}

export interface FileBlocks {
    fileId: string;
    fileName: string;
    folderId: string;
    totalBlocks: number;
    fromIndex: number;
    toIndex: number;
    blocks: FileBlock[];
}

/**
 * Consecutive chunks ("blocks") of one READY, non-deleted file: at most 4
 * (toIndex is clamped to fromIndex + 3). With `folderId`, a file of another
 * folder reads as missing. Null when the file has no readable text.
 */
export async function readFileChunks(
    fileId: string,
    fromIndex: number,
    toIndex?: number,
    options: { folderId?: string; db?: RawDb } = {},
): Promise<FileBlocks | null> {
    const db = options.db ?? defaultDb();
    const from = Math.max(0, Math.floor(fromIndex || 0));
    const to = Math.min(from + READ_MAX_BLOCKS - 1, Math.max(from, Math.floor(toIndex ?? from)));
    const folderFilter = options.folderId ? Prisma.sql`AND t."folderId" = ${options.folderId}` : Prisma.empty;

    const head = await db.$queryRaw<Array<{ id: string; folderId: string; chunkCount: number; fileName: string | null }>>(Prisma.sql`
        SELECT t.id, t."folderId", t."chunkCount", COALESCE(f."originalName", f.name) AS "fileName"
        FROM "AssistantProjetFileText" t
        JOIN "File" f ON f.id = t."fileId" AND f."deletedAt" IS NULL
        WHERE t."fileId" = ${fileId} AND t.status = 'READY' ${folderFilter}
        LIMIT 1`);
    const text = head[0];
    if (!text) return null;

    const rows = await db.$queryRaw<Array<{ index: number; page: number | null; heading: string | null; content: string }>>(Prisma.sql`
        SELECT c.index, c.page, c.heading, c.content
        FROM "AssistantProjetFileChunk" c
        WHERE c."fileTextId" = ${text.id} AND c.index >= ${from} AND c.index <= ${to}
        ORDER BY c.index ASC`);

    return {
        fileId,
        fileName: sanitizeUntrusted(text.fileName ?? "fichier", 200) ?? "fichier",
        folderId: text.folderId,
        totalBlocks: Number(text.chunkCount),
        fromIndex: from,
        toIndex: to,
        blocks: rows.map((r) => ({
            index: Number(r.index),
            page: r.page === null ? null : Number(r.page),
            heading: r.heading ? sanitizeUntrusted(r.heading, 240) : null,
            content: sanitizeUntrusted(r.content, BLOCK_MAX_CHARS) ?? "",
        })),
    };
}

// ============================================
// Listing
// ============================================

/** Authenticated download (managers pass canReadFile). */
export function fileDownloadUrl(fileId: string): string {
    return `/api/files/${fileId}/download`;
}

type FileTextWithFile = Prisma.AssistantFileTextGetPayload<{
    include: { file: { select: { id: true; name: true; originalName: true; mimeType: true; size: true; createdAt: true; uploadedBy: { select: { name: true } } } } };
}>;

export function toFolderFile(row: FileTextWithFile): FolderFile {
    return {
        fileId: row.fileId,
        name: row.file.originalName || row.file.name,
        mimeType: row.file.mimeType,
        size: row.file.size,
        status: row.status as FileTextStatus,
        pages: row.pages,
        chunkCount: row.chunkCount,
        tokens: row.tokens,
        error: row.error,
        uploadedByName: row.file.uploadedBy?.name ?? null,
        createdAt: row.file.createdAt.toISOString(),
        extractedAt: row.extractedAt ? row.extractedAt.toISOString() : null,
        url: fileDownloadUrl(row.fileId),
    };
}

export const FOLDER_FILE_INCLUDE = {
    file: {
        select: {
            id: true,
            name: true,
            originalName: true,
            mimeType: true,
            size: true,
            createdAt: true,
            uploadedBy: { select: { name: true } },
        },
    },
} as const;

/** Files of a folder (newest first), deleted Files excluded. Throws on a missing schema: callers wrap with optional(). */
export async function listFolderFiles(folderId: string, options: { status?: FileTextStatus } = {}): Promise<FolderFile[]> {
    const rows = await prisma.assistantFileText.findMany({
        where: { folderId, file: { deletedAt: null }, ...(options.status ? { status: options.status } : {}) },
        include: FOLDER_FILE_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: 500,
    });
    return rows.map(toFolderFile);
}
