/**
 * Extraction pipeline of assistant folder files (Captain AI v4):
 * claim → download → extract → chunk → replace chunks → READY.
 *
 * The claim is one atomic updateMany (PENDING, FAILED, or PROCESSING left
 * behind for 15 minutes by a crashed run → PROCESSING, attempts + 1), so two
 * schedulers can race on the same row and only one works. Attempts are capped
 * at 3; a reindex resets them. Chunks are replaced outside a transaction (a
 * 1500-chunk file would outlive an interactive transaction on the pooler):
 * search only reads READY texts, and READY is written last, so a half-written
 * set of chunks is never visible.
 *
 * Errors end FAILED with a French message. A broken or protected document is
 * permanent (attempts jump to the cap, no automatic retry); storage or
 * database trouble is retried by the next scheduler pass.
 */

import { after } from "next/server";
import type { AssistantFileTextStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage-service";
import { isMissingSchemaError } from "@/lib/assistant/store/missing";
import { FILE_MAX_BYTES } from "@/lib/assistant/api-contract";
import { extractDocument } from "./extract";
import { chunkSections } from "./chunk";

export const MAX_EXTRACTION_ATTEMPTS = 3;
export const STALE_PROCESSING_MS = 15 * 60 * 1000;
const INSERT_BATCH = 50;
/** Files processed at once by one scheduled run. */
const CONCURRENCY = 2;

const MESSAGES = {
    deleted: "Le fichier a été supprimé.",
    tooLarge: "Fichier trop volumineux pour l'indexation (25 Mo maximum).",
    download: "Téléchargement du fichier impossible depuis le stockage. Nouvel essai automatique.",
    corrupt: "Lecture du document impossible : fichier corrompu, protégé par mot de passe ou dans un format inattendu.",
    unsupported: "Format non pris en charge : seuls PDF, DOCX, XLSX, CSV, Markdown et texte sont indexés.",
    ocr: "Ce PDF semble scanné (presque aucun texte sélectionnable). La reconnaissance de caractères (OCR) n'est pas disponible : exporte-le en PDF texte ou en DOCX.",
    unexpected: "Indexation interrompue par une erreur inattendue. Nouvel essai automatique.",
} as const;

class PermanentExtractionError extends Error {}

export type ExtractionOutcome = AssistantFileTextStatus | "SKIPPED";

/** Claims the row; false when someone else holds it, it is done, or it ran out of attempts. */
async function claim(fileTextId: string, now: Date): Promise<boolean> {
    const claimed = await prisma.assistantFileText.updateMany({
        where: {
            id: fileTextId,
            attempts: { lt: MAX_EXTRACTION_ATTEMPTS },
            OR: [
                { status: { in: ["PENDING", "FAILED"] } },
                { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) } },
            ],
        },
        data: { status: "PROCESSING", attempts: { increment: 1 }, error: null },
    });
    return claimed.count === 1;
}

async function replaceChunks(
    fileText: { id: string; folderId: string; fileId: string },
    chunks: Array<{ index: number; content: string; tokens: number; page: number | null; heading: string | null }>,
): Promise<void> {
    await prisma.assistantFileChunk.deleteMany({ where: { fileTextId: fileText.id } });
    for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
        // `tsv` is a generated column: never written here.
        await prisma.assistantFileChunk.createMany({
            data: chunks.slice(i, i + INSERT_BATCH).map((c) => ({
                fileTextId: fileText.id,
                folderId: fileText.folderId,
                fileId: fileText.fileId,
                index: c.index,
                page: c.page,
                heading: c.heading ? c.heading.slice(0, 500) : null,
                content: c.content,
                tokens: c.tokens,
            })),
        });
    }
}

/** Terminal non-READY state: no text, no chunks, a French reason. */
async function settle(
    fileTextId: string,
    status: "FAILED" | "NEEDS_OCR" | "UNSUPPORTED",
    error: string,
    extra: { pages?: number | null; extractor?: string | null; permanent?: boolean } = {},
): Promise<void> {
    await prisma.assistantFileChunk.deleteMany({ where: { fileTextId } }).catch(() => undefined);
    await prisma.assistantFileText.update({
        where: { id: fileTextId },
        data: {
            status,
            error: error.slice(0, 500),
            text: null,
            chars: 0,
            tokens: 0,
            chunkCount: 0,
            ...(extra.pages !== undefined ? { pages: extra.pages } : {}),
            ...(extra.extractor !== undefined ? { extractor: extra.extractor } : {}),
            ...(status !== "FAILED" ? { extractedAt: new Date() } : {}),
            ...(extra.permanent ? { attempts: MAX_EXTRACTION_ATTEMPTS } : {}),
        },
    });
}

/**
 * Extracts one AssistantFileText. Returns the final status, or "SKIPPED" when
 * the row could not be claimed (already done, held by another run, out of
 * attempts, or the tables are missing). Never throws.
 */
export async function extractFileText(fileTextId: string): Promise<ExtractionOutcome> {
    try {
        if (!(await claim(fileTextId, new Date()))) return "SKIPPED";
    } catch (error) {
        if (!isMissingSchemaError(error)) console.error("[assistant.files] claim failed", fileTextId, error);
        return "SKIPPED";
    }

    try {
        const row = await prisma.assistantFileText.findUnique({
            where: { id: fileTextId },
            select: {
                id: true,
                folderId: true,
                fileId: true,
                file: { select: { path: true, mimeType: true, originalName: true, name: true, size: true, deletedAt: true } },
            },
        });
        if (!row) return "SKIPPED";
        if (row.file.deletedAt) {
            await settle(row.id, "FAILED", MESSAGES.deleted, { permanent: true });
            return "FAILED";
        }
        if (row.file.size > FILE_MAX_BYTES) {
            await settle(row.id, "FAILED", MESSAGES.tooLarge, { permanent: true });
            return "FAILED";
        }

        let buffer: Buffer;
        try {
            buffer = await storageService.download(row.file.path);
        } catch (error) {
            console.warn("[assistant.files] download failed", row.fileId, error instanceof Error ? error.message : error);
            await settle(row.id, "FAILED", MESSAGES.download);
            return "FAILED";
        }

        const name = row.file.originalName || row.file.name;
        let extracted: Awaited<ReturnType<typeof extractDocument>>;
        try {
            extracted = await extractDocument(new Uint8Array(buffer), row.file.mimeType, name);
        } catch (error) {
            console.warn("[assistant.files] extraction failed", row.fileId, error instanceof Error ? error.message : error);
            throw new PermanentExtractionError(MESSAGES.corrupt);
        }

        if (extracted.status === "UNSUPPORTED") {
            await settle(row.id, "UNSUPPORTED", MESSAGES.unsupported, { extractor: extracted.extractor, permanent: true });
            return "UNSUPPORTED";
        }
        if (extracted.status === "NEEDS_OCR") {
            await settle(row.id, "NEEDS_OCR", MESSAGES.ocr, { pages: extracted.pages ?? null, extractor: extracted.extractor, permanent: true });
            return "NEEDS_OCR";
        }

        const { chunks, truncated } = chunkSections(extracted.sections);
        await replaceChunks(row, chunks);
        const tokens = chunks.reduce((n, c) => n + c.tokens, 0);
        const note =
            extracted.truncated || truncated
                ? "Document très long : seule la première partie est indexée."
                : null;
        await prisma.assistantFileText.update({
            where: { id: row.id },
            data: {
                status: "READY",
                text: extracted.text,
                pages: extracted.pages ?? null,
                chars: extracted.text.length,
                tokens,
                chunkCount: chunks.length,
                extractor: extracted.extractor,
                error: note,
                extractedAt: new Date(),
            },
        });
        return "READY";
    } catch (error) {
        const permanent = error instanceof PermanentExtractionError;
        if (!permanent) console.error("[assistant.files] extraction run failed", fileTextId, error);
        try {
            await settle(fileTextId, "FAILED", permanent ? error.message : MESSAGES.unexpected, { permanent });
        } catch (inner) {
            console.error("[assistant.files] could not record the failure", fileTextId, inner);
        }
        return "FAILED";
    }
}

async function runAll(ids: string[]): Promise<void> {
    const queue = [...ids];
    const worker = async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
            await extractFileText(id);
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
}

/**
 * Runs the extraction of these AssistantFileText ids after the response:
 * through next/server `after()` inside a request (the platform keeps the
 * function alive until it settles, within the route's maxDuration), or as a
 * detached promise elsewhere (scripts, the agent worker). A run cut short
 * leaves PROCESSING rows that the next pass reclaims after 15 minutes.
 */
export function scheduleExtraction(ids: string[]): void {
    const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
    if (unique.length === 0) return;
    const run = () =>
        runAll(unique).catch((error) => {
            console.error("[assistant.files] scheduled extraction failed", error);
        });
    try {
        after(run);
        return;
    } catch {
        // Outside a request scope: after() throws; fall through to a detached run.
    }
    void run();
}

/**
 * Rows of a folder worth another pass: PENDING for over a minute (its after()
 * was lost to a restart), PROCESSING abandoned for 15 minutes, FAILED with
 * attempts left and quiet for 5 minutes. The files list calls this so a stuck
 * file heals when someone looks at it.
 */
export async function findRetriableTexts(folderId: string, now: Date = new Date()): Promise<string[]> {
    const rows = await prisma.assistantFileText.findMany({
        where: {
            folderId,
            attempts: { lt: MAX_EXTRACTION_ATTEMPTS },
            file: { deletedAt: null },
            OR: [
                { status: "PENDING", updatedAt: { lt: new Date(now.getTime() - 60_000) } },
                { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) } },
                { status: "FAILED", updatedAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
            ],
        },
        select: { id: true },
        take: 10,
    });
    return rows.map((r) => r.id);
}
