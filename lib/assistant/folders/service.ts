/**
 * Assistant folders (Captain AI v4): the per-client folders created lazily,
 * the general folders, their hidden storage Folder, and the moves between
 * them. Every read that touches the new tables goes through optional() so an
 * instance whose migration is not applied still gets its clients as virtual
 * folders. Rules live in ./rules.ts; this file only applies them.
 */

import { Prisma, type AssistantConversation, type AssistantFolder, type ClientStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { optional } from "../store/missing";
import {
    canMoveConversation,
    canWriteConversation,
    conversationScopeForFolder,
    type FolderKind,
    type Viewer,
} from "./rules";

/** A refusal the API can return as-is: French message + HTTP status. */
export class AssistantAccessError extends Error {
    constructor(
        message: string,
        readonly status: 403 | 404 | 503 = 403,
    ) {
        super(message);
        this.name = "AssistantAccessError";
    }
}

export const STORAGE_FOLDER_PREFIX = "Assistant · ";
export const FOLDERS_UNAVAILABLE = "Les dossiers de l'assistant ne sont pas encore activés sur cette instance.";

const isUniqueViolation = (error: unknown): boolean =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** SHARED threads are visible to active managers only (rules.ts). */
const canSeeShared = (viewer: Viewer): boolean => viewer.role === "MANAGER" && viewer.isActive;

/** Create-or-get the CLIENT folder of a client. Safe under concurrent calls. */
export async function ensureClientFolder(clientId: string, createdById: string): Promise<AssistantFolder> {
    const existing = await prisma.assistantFolder.findUnique({ where: { clientId } });
    if (existing) return existing;
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    if (!client) throw new AssistantAccessError("Client introuvable.", 404);
    try {
        return await prisma.assistantFolder.create({
            data: { kind: "CLIENT", clientId, name: client.name, createdById },
        });
    } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const again = await prisma.assistantFolder.findUnique({ where: { clientId } });
        if (again) return again;
        throw error;
    }
}

/**
 * The hidden storage `Folder` of an assistant folder ("Assistant · <name>",
 * isPublic false, clientId null so the client portal never lists it), created
 * on first use. Files uploaded to the assistant go there with clientId null.
 */
export async function ensureStorageFolder(folderId: string, attempt = 0): Promise<{ id: string; name: string }> {
    const folder = await prisma.assistantFolder.findUnique({
        where: { id: folderId },
        select: { id: true, name: true, storageFolderId: true },
    });
    if (!folder) throw new AssistantAccessError("Dossier introuvable.", 404);
    if (folder.storageFolderId) {
        const existing = await prisma.folder.findUnique({
            where: { id: folder.storageFolderId },
            select: { id: true, name: true },
        });
        if (existing) return existing;
    }
    const created = await prisma.folder.create({
        data: {
            name: `${STORAGE_FOLDER_PREFIX}${folder.name}`,
            description: "Fichiers du dossier Captain AI, gérés par l'assistant.",
            isPublic: false,
            clientId: null,
            missionId: null,
        },
        select: { id: true, name: true },
    });
    // Claim it only if nobody claimed another one meanwhile (storageFolderId is unique).
    const claimed = await prisma.assistantFolder.updateMany({
        where: { id: folderId, storageFolderId: folder.storageFolderId },
        data: { storageFolderId: created.id },
    });
    if (claimed.count === 1) return created;
    await prisma.folder.delete({ where: { id: created.id } }).catch(() => undefined);
    if (attempt >= 2) throw new Error("ensureStorageFolder: impossible de réserver le dossier de stockage.");
    return ensureStorageFolder(folderId, attempt + 1);
}

export interface FolderListItem {
    /** Null for a virtual client folder (no row yet, or tables missing). */
    id: string | null;
    kind: FolderKind;
    name: string;
    color: string | null;
    icon: string | null;
    clientId: string | null;
    clientStatus: ClientStatus | null;
    /** True when the client has no AssistantFolder row yet: created on first use. */
    virtual: boolean;
    /** Conversations the viewer may read (own, plus SHARED for active managers). */
    conversationCount: number;
    lastActivityAt: Date | null;
    archivedAt: Date | null;
}

export interface FolderList {
    general: FolderListItem[];
    clients: FolderListItem[];
    /** True when the folder tables are missing and clients were listed as virtual folders. */
    degraded: boolean;
}

type CountRow = { key: string | null; count: number };

/**
 * General folders plus every client with its folder (or a virtual one).
 * Client folders count the conversations bound to the client (filed or
 * legacy); general folders count the conversations filed in them.
 */
export async function listFolders(viewer: Viewer): Promise<FolderList> {
    const clients = await prisma.client.findMany({
        select: { id: true, name: true, status: true },
        orderBy: { name: "asc" },
    });
    const virtualClient = (c: (typeof clients)[number], count: number): FolderListItem => ({
        id: null,
        kind: "CLIENT",
        name: c.name,
        color: null,
        icon: null,
        clientId: c.id,
        clientStatus: c.status,
        virtual: true,
        conversationCount: count,
        lastActivityAt: null,
        archivedAt: null,
    });

    return optional<FolderList>(
        "folders.list",
        async () => {
            const readable: Prisma.AssistantConversationWhereInput = canSeeShared(viewer)
                ? { OR: [{ createdById: viewer.id }, { visibility: "SHARED" }] }
                : { createdById: viewer.id };
            const [folders, byFolder, byClient] = await Promise.all([
                prisma.assistantFolder.findMany({ orderBy: [{ archivedAt: "asc" }, { name: "asc" }] }),
                prisma.assistantConversation
                    .groupBy({ by: ["folderId"], where: { ...readable, folderId: { not: null } }, _count: { _all: true } })
                    .then((rows): CountRow[] => rows.map((r) => ({ key: r.folderId, count: r._count._all }))),
                prisma.assistantConversation
                    .groupBy({ by: ["clientId"], where: { ...readable, clientId: { not: null } }, _count: { _all: true } })
                    .then((rows): CountRow[] => rows.map((r) => ({ key: r.clientId, count: r._count._all }))),
            ]);
            const folderCounts = new Map(byFolder.map((r) => [r.key, r.count]));
            const clientCounts = new Map(byClient.map((r) => [r.key, r.count]));
            const byClientId = new Map(folders.filter((f) => f.clientId).map((f) => [f.clientId as string, f]));

            const general = folders
                .filter((f) => f.kind === "GENERAL")
                .map(
                    (f): FolderListItem => ({
                        id: f.id,
                        kind: "GENERAL",
                        name: f.name,
                        color: f.color,
                        icon: f.icon,
                        clientId: null,
                        clientStatus: null,
                        virtual: false,
                        conversationCount: folderCounts.get(f.id) ?? 0,
                        lastActivityAt: f.lastActivityAt,
                        archivedAt: f.archivedAt,
                    }),
                );
            const clientItems = clients.map((c): FolderListItem => {
                const f = byClientId.get(c.id);
                const count = clientCounts.get(c.id) ?? 0;
                if (!f) return virtualClient(c, count);
                return {
                    id: f.id,
                    kind: "CLIENT",
                    name: f.name,
                    color: f.color,
                    icon: f.icon,
                    clientId: c.id,
                    clientStatus: c.status,
                    virtual: false,
                    conversationCount: count,
                    lastActivityAt: f.lastActivityAt,
                    archivedAt: f.archivedAt,
                };
            });
            return { general, clients: clientItems, degraded: false };
        },
        async () => {
            // Tables missing: clients as virtual folders, counting the viewer's own
            // conversations only (visibility does not exist yet either).
            const own = await optional<CountRow[]>(
                "folders.list.fallback",
                () =>
                    prisma.assistantConversation
                        .groupBy({ by: ["clientId"], where: { createdById: viewer.id, clientId: { not: null } }, _count: { _all: true } })
                        .then((rows) => rows.map((r) => ({ key: r.clientId, count: r._count._all }))),
                [],
            );
            const counts = new Map(own.map((r) => [r.key, r.count]));
            return { general: [], clients: clients.map((c) => virtualClient(c, counts.get(c.id) ?? 0)), degraded: true };
        },
    );
}

/**
 * Files a conversation in `toFolderId` (null = agency view), applying the
 * rules: only the owner, only among general folders and the agency view, a
 * client folder only for its own client's conversation. The conversation's
 * clientId follows the folder.
 */
export async function moveConversation(
    conversationId: string,
    toFolderId: string | null,
    viewer: Viewer,
): Promise<AssistantConversation> {
    const result = await optional<AssistantConversation | null>(
        "folders.move",
        async () => {
            const conv = await prisma.assistantConversation.findUnique({
                where: { id: conversationId },
                include: { folder: { select: { id: true, kind: true, clientId: true } } },
            });
            if (!conv) throw new AssistantAccessError("Conversation introuvable.", 404);
            const write = canWriteConversation(viewer, conv);
            if (!write.ok) throw new AssistantAccessError(write.reason, 403);

            const to = toFolderId
                ? await prisma.assistantFolder.findUnique({
                      where: { id: toFolderId },
                      select: { id: true, kind: true, clientId: true, archivedAt: true },
                  })
                : null;
            if (toFolderId && !to) throw new AssistantAccessError("Dossier introuvable.", 404);
            if (to?.archivedAt) throw new AssistantAccessError("Ce dossier est archivé.", 403);

            const move = canMoveConversation(conv, conv.folder, to);
            if (!move.ok) throw new AssistantAccessError(move.reason, 403);

            const scope = conversationScopeForFolder(to);
            const updated = await prisma.assistantConversation.update({
                where: { id: conv.id },
                data: {
                    folderId: scope.folderId,
                    clientId: scope.clientId,
                    // A thread leaving its client keeps no mission either.
                    ...(scope.clientId ? {} : { missionId: null }),
                },
            });
            if (to) await touchFolder(to.id);
            return updated;
        },
        null,
    );
    if (!result) throw new AssistantAccessError(FOLDERS_UNAVAILABLE, 503);
    return result;
}

/** Marks activity on a folder (ordering in the rail). Silent when the folder or the table is missing. */
export async function touchFolder(folderId: string, at: Date = new Date()): Promise<void> {
    await optional(
        "folders.touch",
        () => prisma.assistantFolder.updateMany({ where: { id: folderId }, data: { lastActivityAt: at } }).then(() => undefined),
        undefined,
    );
}
