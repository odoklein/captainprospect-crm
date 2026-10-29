/**
 * Server side of the assistant PDF: the brand mark as pdfkit can draw it, and
 * where a PDF made by `create_pdf` is stored.
 *
 * Storage: in the conversation's folder when it has one (the folder's hidden
 * storage Folder, lib/assistant/files/storage.ts storeFolderUpload), else as a
 * plain File owned by the user with no folder. Never with a clientId, so the
 * client portal cannot list nor download it (lib/files/permissions.ts). The
 * PDF is not registered for indexing (no AssistantFileText row): the
 * assistant's own output must not come back later as a "source" to cite.
 * Download: GET /api/files/<id>/download (managers pass canReadFile).
 */

import path from "path";
import { existsSync } from "fs";
import type { Brand } from "@/lib/brand/types";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage-service";
import { readBrandAsset } from "@/lib/brand/upload";
import { ASSISTANT_FILE_TAG, ASSISTANT_STORAGE_PREFIX, storeFolderUpload } from "@/lib/assistant/files/storage";
import { fileDownloadUrl } from "@/lib/assistant/files/search";

export const PDF_MIME = "application/pdf";

/** PNG/JPEG bytes or a local path of the brand mark; null → the renderer draws a brand-coloured square. */
export async function loadPdfLogo(brand: Brand): Promise<Buffer | string | null> {
    const mark = brand.logos?.mark ?? "";
    if (mark.startsWith("/api/")) {
        const asset = await readBrandAsset("mark").catch(() => null);
        return asset && (asset.contentType === "image/png" || asset.contentType === "image/jpeg") ? asset.bytes : null;
    }
    if (!/\.(png|jpe?g)$/i.test(mark)) return null;
    const local = path.join(process.cwd(), "public", mark.replace(/^\/+/, ""));
    return existsSync(local) ? local : null;
}

export interface StoredPdf {
    fileId: string;
    downloadUrl: string;
    stored: "folder" | "user";
}

/** Stores the bytes and records the File row (see the header for where). */
export async function storeGeneratedPdf(input: { buffer: Buffer; fileName: string; userId: string; folderId: string | null }): Promise<StoredPdf> {
    if (input.folderId) {
        try {
            const file = await storeFolderUpload({ folderId: input.folderId, userId: input.userId, buffer: input.buffer, name: input.fileName, mimeType: PDF_MIME });
            return { fileId: file.id, downloadUrl: fileDownloadUrl(file.id), stored: "folder" };
        } catch (error) {
            // A folder whose storage cannot be prepared still gets its PDF, owned by the user.
            console.warn("[assistant.pdf] folder storage failed, storing for the user", error);
        }
    }
    const { key, url } = await storageService.upload(
        input.buffer,
        { filename: input.fileName, mimeType: PDF_MIME, size: input.buffer.length, folder: ASSISTANT_STORAGE_PREFIX },
        input.userId,
    );
    try {
        const file = await prisma.file.create({
            data: {
                name: input.fileName.replace(/\.pdf$/i, ""),
                originalName: input.fileName,
                mimeType: PDF_MIME,
                size: input.buffer.length,
                path: key,
                url,
                uploadedById: input.userId,
                folderId: null,
                clientId: null,
                missionId: null,
                tags: [ASSISTANT_FILE_TAG],
            },
        });
        return { fileId: file.id, downloadUrl: fileDownloadUrl(file.id), stored: "user" };
    } catch (error) {
        await storageService.delete(key).catch(() => undefined);
        throw error;
    }
}
