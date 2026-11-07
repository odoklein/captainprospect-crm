/**
 * Assistant memory store (Captain AI v4): facts, preferences, decisions,
 * contacts and goals the model writes and managers edit, in three layers
 * (AGENCY, FOLDER, USER). One row per (scope, normalised content): writing the
 * same fact twice updates the row. Soft delete is the undo. Every call goes
 * through optional() so an instance without the table degrades to "no memory".
 */

import { Prisma, type AssistantMemory, type AssistantMemoryKind, type AssistantMemoryScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { optional } from "../store/missing";
import { forbiddenMemoryReason, memoryContentKey, memoryScopeKey } from "./normalize";

export const MEMORY_MAX_CHARS = 600;

/** A refusal the API can return as-is: French message + HTTP status. */
export class AssistantMemoryError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 404 | 409 = 400,
    ) {
        super(message);
        this.name = "AssistantMemoryError";
    }
}

/** Where a memory came from: a turn, or a manager's edit. */
export type MemorySource = {
    conversationId?: string | null;
    messageId?: string | null;
    by: "model" | "user";
};

export interface UpsertMemoryInput {
    scope: AssistantMemoryScope;
    folderId?: string | null;
    userId?: string | null;
    /** Ranking bonus only. */
    missionId?: string | null;
    kind?: AssistantMemoryKind;
    content: string;
    source?: MemorySource | null;
    /** The acting user's id (the model acts on behalf of the user of the turn). */
    by: string;
    confidence?: number;
    expiresAt?: Date | null;
}

export interface MemoryFilter {
    scope?: AssistantMemoryScope;
    folderId?: string | null;
    userId?: string | null;
    kind?: AssistantMemoryKind;
    pinnedOnly?: boolean;
    includeDeleted?: boolean;
    includeExpired?: boolean;
    limit?: number;
}

export interface MemoryPatch {
    content?: string;
    kind?: AssistantMemoryKind;
    pinned?: boolean;
    confidence?: number;
    expiresAt?: Date | null;
    missionId?: string | null;
}

/** Trims, bounds and screens a content; throws a French AssistantMemoryError. */
export function checkMemoryContent(raw: string): string {
    const content = raw.replace(/\s+/g, " ").trim();
    if (!content) throw new AssistantMemoryError("Le souvenir est vide.");
    if (content.length > MEMORY_MAX_CHARS) {
        throw new AssistantMemoryError(`Souvenir trop long (${MEMORY_MAX_CHARS} caractères max).`);
    }
    const reason = forbiddenMemoryReason(content);
    if (reason) throw new AssistantMemoryError(`Ce souvenir n'est pas mémorisé : ${reason}.`);
    return content;
}

const isKnown = (error: unknown, code: string): boolean =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

/**
 * Writes a memory, or updates the row holding the same fact in the same
 * scope. A soft-deleted row stays deleted when the model re-learns the fact;
 * only a manager (`source.by === "user"`) revives it. Null when the table is
 * missing.
 */
export async function upsertMemory(input: UpsertMemoryInput): Promise<AssistantMemory | null> {
    const content = checkMemoryContent(input.content);
    const scopeKey = memoryScopeKey(input.scope, input.folderId, input.userId);
    const contentKey = memoryContentKey(content);
    const folderId = input.scope === "FOLDER" ? (input.folderId as string) : null;
    const userId = input.scope === "USER" ? (input.userId as string) : null;
    const source = input.source ?? undefined;
    const revive = input.source?.by === "user";
    return optional<AssistantMemory | null>(
        "memory.upsert",
        () =>
            prisma.assistantMemory.upsert({
                where: { scopeKey_contentKey: { scopeKey, contentKey } },
                create: {
                    scope: input.scope,
                    folderId,
                    userId,
                    missionId: input.missionId ?? null,
                    kind: input.kind ?? "FACT",
                    content,
                    scopeKey,
                    contentKey,
                    source,
                    confidence: input.confidence ?? 0.8,
                    expiresAt: input.expiresAt ?? null,
                    createdById: input.by,
                    updatedById: input.by,
                },
                update: {
                    content,
                    kind: input.kind,
                    missionId: input.missionId === undefined ? undefined : input.missionId,
                    source,
                    confidence: input.confidence,
                    expiresAt: input.expiresAt === undefined ? undefined : input.expiresAt,
                    updatedById: input.by,
                    ...(revive ? { deletedAt: null } : {}),
                },
            }),
        null,
    );
}

/** Active (not deleted, not expired) memories by default; pinned first, then most recently updated. */
export async function listMemories(filter: MemoryFilter = {}): Promise<AssistantMemory[]> {
    const where: Prisma.AssistantMemoryWhereInput = {};
    if (filter.scope) where.scope = filter.scope;
    if (filter.folderId !== undefined) where.folderId = filter.folderId;
    if (filter.userId !== undefined) where.userId = filter.userId;
    if (filter.kind) where.kind = filter.kind;
    if (filter.pinnedOnly) where.pinned = true;
    if (!filter.includeDeleted) where.deletedAt = null;
    if (!filter.includeExpired) where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
    return optional<AssistantMemory[]>(
        "memory.list",
        () =>
            prisma.assistantMemory.findMany({
                where,
                orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
                take: Math.min(Math.max(filter.limit ?? 200, 1), 1000),
            }),
        [],
    );
}

/**
 * The three layers a turn sees at once: AGENCY, the folder's FOLDER memories
 * and the user's USER memories (active only). Empty when the table is missing.
 */
export async function listMemoryLayers(q: { folderId?: string | null; userId: string; limit?: number }): Promise<AssistantMemory[]> {
    const layers: Prisma.AssistantMemoryWhereInput[] = [{ scope: "AGENCY" }, { scope: "USER", userId: q.userId }];
    if (q.folderId) layers.push({ scope: "FOLDER", folderId: q.folderId });
    return optional<AssistantMemory[]>(
        "memory.layers",
        () =>
            prisma.assistantMemory.findMany({
                where: {
                    OR: layers,
                    deletedAt: null,
                    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
                },
                orderBy: [{ pinned: "desc" }, { useCount: "desc" }, { updatedAt: "desc" }],
                take: Math.min(Math.max(q.limit ?? 300, 1), 1000),
            }),
        [],
    );
}

/** A manager edits a memory. Content changes are re-screened and re-keyed. */
export async function updateMemory(id: string, patch: MemoryPatch, viewer: { id: string }): Promise<AssistantMemory | null> {
    const data: Prisma.AssistantMemoryUpdateInput = { updatedById: viewer.id };
    if (patch.content !== undefined) {
        const content = checkMemoryContent(patch.content);
        data.content = content;
        data.contentKey = memoryContentKey(content);
    }
    if (patch.kind !== undefined) data.kind = patch.kind;
    if (patch.pinned !== undefined) data.pinned = patch.pinned;
    if (patch.confidence !== undefined) data.confidence = patch.confidence;
    if (patch.expiresAt !== undefined) data.expiresAt = patch.expiresAt;
    if (patch.missionId !== undefined) data.missionId = patch.missionId;
    return optional<AssistantMemory | null>(
        "memory.update",
        async () => {
            try {
                return await prisma.assistantMemory.update({ where: { id }, data });
            } catch (error) {
                if (isKnown(error, "P2025")) throw new AssistantMemoryError("Souvenir introuvable.", 404);
                if (isKnown(error, "P2002")) {
                    throw new AssistantMemoryError("Un souvenir identique existe déjà dans ce périmètre.", 409);
                }
                throw error;
            }
        },
        null,
    );
}

/** Soft delete (undo = restoreMemory). False when nothing changed. */
export async function softDeleteMemory(id: string, viewer: { id: string }, at: Date = new Date()): Promise<boolean> {
    return optional<boolean>(
        "memory.delete",
        () =>
            prisma.assistantMemory
                .updateMany({ where: { id, deletedAt: null }, data: { deletedAt: at, updatedById: viewer.id } })
                .then((r) => r.count > 0),
        false,
    );
}

export async function restoreMemory(id: string, viewer: { id: string }): Promise<boolean> {
    return optional<boolean>(
        "memory.restore",
        () =>
            prisma.assistantMemory
                .updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null, updatedById: viewer.id } })
                .then((r) => r.count > 0),
        false,
    );
}

/** Counts a use of the memories a turn relied on (ranking signal). */
export async function bumpMemoryUse(ids: string[], at: Date = new Date()): Promise<void> {
    if (ids.length === 0) return;
    await optional(
        "memory.bump",
        () =>
            prisma.assistantMemory
                .updateMany({ where: { id: { in: ids } }, data: { useCount: { increment: 1 }, lastUsedAt: at } })
                .then(() => undefined),
        undefined,
    );
}
