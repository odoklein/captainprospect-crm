/**
 * Which files a conversation may read, for the model-facing file tools
 * (Captain AI v4).
 *
 * Scope: the conversation's folder; without one, the CLIENT folder of the
 * conversation's client (« Vue agence » thread opened on a client), created
 * lazily like everywhere else (folders/service.ts ensureClientFolder). A file
 * is readable when its text row lives in the scope folder, or when it is a
 * project file of the scope's client (filed on the client or one of its
 * missions) — the same rule read_project_document applies. Anything else
 * reads as « introuvable », never as someone else's document.
 *
 * Names: `findFilesByName` matches case- and accent-insensitively on the
 * displayed name, exact match first, then « contient ».
 */

import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/api-utils";
import { optional } from "@/lib/assistant/store/missing";
import { ensureClientFolder } from "@/lib/assistant/folders/service";
import type { FolderFile } from "@/lib/assistant/api-contract";
import type { AssistantContext } from "@/lib/ai/tools/types";
import { FILE_MAX_BYTES } from "@/lib/assistant/api-contract";
import { listFolderFiles } from "./search";
import { indexableProjectFilesWhere } from "./storage";
import { resolveDocumentKind } from "./extract";

export const NO_SCOPE_MESSAGE =
    "Cette conversation n'est rattachée à aucun dossier ni client. Ouvre-la depuis un dossier, ou choisis un client, pour lire ses fichiers.";

export interface FileScope {
    /** Folder whose files are searched and listed; null when the v4 tables are missing. */
    folderId: string | null;
    folderName: string | null;
    /** Client whose project files are readable too (folder's client, else the conversation's). */
    clientId: string | null;
    /** "folder": the conversation lives in a folder; "client": resolved from the conversation's client. */
    via: "folder" | "client";
    /** Where a never-indexed project file of `clientId` gets its text row (the CLIENT folder). */
    clientFolderId: () => Promise<string | null>;
}

async function clientFolderIdOf(clientId: string, userId: string): Promise<string | null> {
    return optional<string | null>("files.client_folder", async () => (await ensureClientFolder(clientId, userId)).id, null);
}

/** The scope of the file tools, or a French refusal when the thread has neither folder nor client. */
export async function resolveFileScope(ctx: AssistantContext): Promise<FileScope> {
    const clientId = ctx.folder?.clientId ?? ctx.project?.clientId ?? null;
    if (ctx.folder) {
        const folder = ctx.folder;
        let cached: Promise<string | null> | null = null;
        return {
            folderId: folder.id,
            folderName: folder.name,
            clientId,
            via: "folder",
            clientFolderId: () => {
                if (folder.kind === "CLIENT" && folder.clientId) return Promise.resolve(folder.id);
                if (!clientId) return Promise.resolve(null);
                cached ??= clientFolderIdOf(clientId, ctx.userId);
                return cached;
            },
        };
    }
    if (clientId && ctx.project) {
        const folderId = await clientFolderIdOf(clientId, ctx.userId);
        return {
            folderId,
            folderName: ctx.project.clientName,
            clientId,
            via: "client",
            clientFolderId: () => Promise.resolve(folderId),
        };
    }
    throw new ValidationError(NO_SCOPE_MESSAGE);
}

/** The folder's files (non-deleted), [] without a folder, null when the tables are missing. */
export async function scopeFiles(scope: FileScope): Promise<FolderFile[] | null> {
    if (!scope.folderId) return null;
    const folderId = scope.folderId;
    return optional<FolderFile[] | null>("files.tool.list", () => listFolderFiles(folderId), null);
}

export interface AccessibleFile {
    fileId: string;
    name: string;
    mimeType: string;
    size: number;
    /** Text row status when one exists (any folder), else null: never indexed. */
    status: FolderFile["status"] | null;
    error: string | null;
    /** Folder the text row lives in (or will be created in). */
    folderId: string | null;
    /** Readable through the client's project files rather than the scope folder. */
    viaClient: boolean;
    /** Null when the pipeline can read the type; else why not. */
    refusal: string | null;
}

function refusalFor(mimeType: string, name: string, size: number): string | null {
    if (!resolveDocumentKind(mimeType, name)) {
        return `Format ${mimeType || "inconnu"} non lisible : seuls PDF, DOCX, XLSX, CSV, Markdown et texte sont lus.`;
    }
    if (size > FILE_MAX_BYTES) return "Fichier trop volumineux pour être lu (25 Mo maximum).";
    return null;
}

/**
 * The file when this scope may read it, else null. `listed` (the scope
 * folder's files, when already loaded) answers folder files without a query.
 */
export async function resolveAccessibleFile(scope: FileScope, fileId: string, listed?: FolderFile[] | null): Promise<AccessibleFile | null> {
    const id = fileId.trim();
    if (!id) return null;
    const inFolder = (listed ?? (await scopeFiles(scope)) ?? []).find((f) => f.fileId === id);
    if (inFolder) {
        return {
            fileId: inFolder.fileId,
            name: inFolder.name,
            mimeType: inFolder.mimeType,
            size: inFolder.size,
            status: inFolder.status,
            error: inFolder.error,
            folderId: scope.folderId,
            viaClient: false,
            refusal: null,
        };
    }
    if (!scope.clientId) return null;

    const clientId = scope.clientId;
    const file = await prisma.file.findFirst({
        where: { id, deletedAt: null, OR: [{ clientId }, { mission: { clientId } }] },
        select: { id: true, name: true, originalName: true, mimeType: true, size: true },
    });
    if (!file) return null;
    const text = await optional(
        "files.tool.text",
        () => prisma.assistantFileText.findUnique({ where: { fileId: file.id }, select: { status: true, error: true, folderId: true } }),
        null,
    );
    const name = file.originalName || file.name;
    return {
        fileId: file.id,
        name,
        mimeType: file.mimeType,
        size: file.size,
        status: text?.status ?? null,
        error: text?.error ?? null,
        folderId: text?.folderId ?? (await scope.clientFolderId()),
        viaClient: true,
        refusal: text ? null : refusalFor(file.mimeType, name, file.size),
    };
}

/** Never-indexed project files of the scope's client (newest first), for an on-demand pass. */
export async function unindexedProjectFiles(scope: FileScope, take: number): Promise<Array<{ fileId: string; name: string }>> {
    if (!scope.clientId || take <= 0) return [];
    const clientId = scope.clientId;
    const rows = await optional(
        "files.tool.unindexed",
        () =>
            prisma.file.findMany({
                where: indexableProjectFilesWhere(clientId),
                select: { id: true, name: true, originalName: true },
                orderBy: { createdAt: "desc" },
                take,
            }),
        [] as Array<{ id: string; name: string; originalName: string }>,
    );
    return rows.map((r) => ({ fileId: r.id, name: r.originalName || r.name }));
}

// ============================================
// By name
// ============================================

/** Lowercase, accents and extra spaces removed: « Présentation  Client.PDF » → « presentation client.pdf ». */
export function normalizeFileName(value: string): string {
    return value
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function stripExtension(value: string): string {
    return value.replace(/\.[a-z0-9]{1,8}$/i, "");
}

/** Exact matches (with or without extension) when there are any, else « contains » matches. */
export function matchFilesByName<T extends { name: string }>(candidates: T[], query: string): T[] {
    const q = normalizeFileName(query);
    if (!q) return [];
    const qBare = stripExtension(q);
    const exact: T[] = [];
    const partial: T[] = [];
    for (const c of candidates) {
        const n = normalizeFileName(c.name);
        const bare = stripExtension(n);
        if (n === q || bare === qBare) exact.push(c);
        else if (n.includes(q) || (qBare && bare.includes(qBare))) partial.push(c);
    }
    return exact.length > 0 ? exact : partial;
}

export interface NamedFile {
    fileId: string;
    name: string;
}

/** Files of the scope (folder files, then the client's project files) whose name matches. */
export async function findFilesByName(scope: FileScope, query: string, listed?: FolderFile[] | null): Promise<NamedFile[]> {
    const candidates = new Map<string, NamedFile>();
    for (const f of listed ?? (await scopeFiles(scope)) ?? []) candidates.set(f.fileId, { fileId: f.fileId, name: f.name });
    if (scope.clientId) {
        const clientId = scope.clientId;
        const rows = await prisma.file.findMany({
            where: { deletedAt: null, OR: [{ clientId }, { mission: { clientId } }] },
            select: { id: true, name: true, originalName: true },
            orderBy: { createdAt: "desc" },
            take: 300,
        });
        for (const r of rows) if (!candidates.has(r.id)) candidates.set(r.id, { fileId: r.id, name: r.originalName || r.name });
    }
    return matchFilesByName([...candidates.values()], query);
}
