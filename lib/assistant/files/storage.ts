/**
 * Where assistant uploads live (Captain AI v4). A folder's files go in its
 * hidden storage `Folder` ("Assistant · <name>", isPublic false, clientId
 * null, created by ensureStorageFolder) as `File` rows with clientId and
 * missionId null and the "assistant" tag. With clientId null:
 *   - lib/files/permissions.ts canReadFile never matches a CLIENT session, so
 *     the client portal can neither list nor download them;
 *   - app/api/files/upload/route.ts's portal notification (sent only when a
 *     File has a clientId) is never triggered — we do not go through that route
 *     anyway.
 * A CLIENT folder's existing project files (index-project) stay where they
 * are: only an AssistantFileText row links them to the folder.
 */

import type { File as FileRow, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage-service";
import { ensureStorageFolder } from "@/lib/assistant/folders/service";
import { optional } from "@/lib/assistant/store/missing";
import { FILE_MAX_BYTES } from "@/lib/assistant/api-contract";
import { SUPPORTED_MIMES } from "./extract";

export const ASSISTANT_FILE_TAG = "assistant";
/** Storage key prefix ("<prefix>/<userId>/<ts>/<uuid>.<ext>", see StorageService.generateKey). */
export const ASSISTANT_STORAGE_PREFIX = "assistant";

export interface StoreUploadInput {
    folderId: string;
    userId: string;
    buffer: Buffer;
    /** Original file name, with its extension. */
    name: string;
    /** Canonical mime (extract.ts CANONICAL_MIME), not the browser's guess. */
    mimeType: string;
}

/**
 * Uploads the bytes, then records the File row in the folder's storage Folder.
 * If the row cannot be written, the uploaded object is removed (best effort).
 */
export async function storeFolderUpload(input: StoreUploadInput): Promise<FileRow> {
    const storageFolder = await ensureStorageFolder(input.folderId);
    const { key, url } = await storageService.upload(
        input.buffer,
        { filename: input.name, mimeType: input.mimeType, size: input.buffer.length, folder: ASSISTANT_STORAGE_PREFIX },
        input.userId,
    );
    try {
        return await prisma.file.create({
            data: {
                name: input.name.replace(/\.[^/.]+$/, "") || input.name,
                originalName: input.name,
                mimeType: input.mimeType,
                size: input.buffer.length,
                path: key,
                url,
                uploadedById: input.userId,
                folderId: storageFolder.id,
                clientId: null,
                missionId: null,
                tags: [ASSISTANT_FILE_TAG],
            },
        });
    } catch (error) {
        await storageService.delete(key).catch(() => undefined);
        throw error;
    }
}

/** True for a File this module created for the folder (as opposed to a client project file it only indexes). */
export function isAssistantUpload(
    file: { tags: string[]; folderId: string | null; clientId: string | null },
    storageFolderId: string | null,
): boolean {
    return file.tags.includes(ASSISTANT_FILE_TAG) && file.clientId === null && !!storageFolderId && file.folderId === storageFolderId;
}

// ============================================
// Folder lookup shared by the files routes
// ============================================

export interface FilesFolder {
    id: string;
    kind: "CLIENT" | "GENERAL";
    name: string;
    clientId: string | null;
    storageFolderId: string | null;
}

/** Sentinel: the v4 tables are missing on this instance. */
export const FOLDERS_MISSING = "missing" as const;

/** The active (non-archived) folder, null when unknown or archived, FOLDERS_MISSING without the migration. */
export async function findActiveFolder(id: string): Promise<FilesFolder | null | typeof FOLDERS_MISSING> {
    return optional<FilesFolder | null | typeof FOLDERS_MISSING>(
        "files.folder",
        async () => {
            const row = await prisma.assistantFolder.findUnique({
                where: { id },
                select: { id: true, kind: true, name: true, clientId: true, storageFolderId: true, archivedAt: true },
            });
            if (!row || row.archivedAt) return null;
            return { id: row.id, kind: row.kind, name: row.name, clientId: row.clientId, storageFolderId: row.storageFolderId };
        },
        FOLDERS_MISSING,
    );
}

/**
 * A client's existing project files that index-project may pick up: filed on
 * the client or on one of its missions, not deleted, a readable type, at most
 * 25 MB, not indexed yet.
 */
export function indexableProjectFilesWhere(clientId: string): Prisma.FileWhereInput {
    return {
        OR: [{ clientId }, { mission: { clientId } }],
        deletedAt: null,
        size: { gt: 0, lte: FILE_MAX_BYTES },
        mimeType: { in: [...SUPPORTED_MIMES] },
        assistantText: { is: null },
    };
}

/** A display-safe file name: no path, no control characters, at most 200 characters. */
export function safeFileName(raw: string): string {
    const base = raw.split(/[\\/]/).pop() ?? "";
    const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if (!cleaned) return "fichier";
    if (cleaned.length <= 200) return cleaned;
    const ext = /\.[a-z0-9]{1,8}$/i.exec(cleaned)?.[0] ?? "";
    return `${cleaned.slice(0, 200 - ext.length)}${ext}`;
}
