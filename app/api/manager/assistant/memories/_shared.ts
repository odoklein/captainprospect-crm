/**
 * Shared by the memories routes: row → MemoryItem, and the visibility rule.
 * AGENCY and FOLDER memories are agency-wide (any active manager); a USER
 * memory belongs to its manager alone, and anyone else gets a 404.
 */

import type { AssistantMemory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/api-utils";
import { optional } from "@/lib/assistant/store/missing";
import { AssistantAccessError } from "@/lib/assistant/folders/service";
import type { MemoryItem } from "@/lib/assistant/api-contract";

export const MEMORY_UNAVAILABLE = "La mémoire de l'assistant n'est pas encore activée sur cette instance.";

function sourceOf(raw: unknown): MemoryItem["source"] {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    return {
        conversationId: typeof s.conversationId === "string" ? s.conversationId : null,
        messageId: typeof s.messageId === "string" ? s.messageId : null,
        by: s.by === "user" ? "user" : "model",
    };
}

export function toMemoryItem(row: AssistantMemory): MemoryItem {
    return {
        id: row.id,
        scope: row.scope,
        kind: row.kind,
        content: row.content,
        pinned: row.pinned,
        folderId: row.folderId,
        missionId: row.missionId,
        source: sourceOf(row.source),
        useCount: row.useCount,
        lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    };
}

/** The memory when `viewerId` may see it; 404 otherwise, 503 when the table is missing. */
export async function requireVisibleMemory(id: string, viewerId: string): Promise<AssistantMemory> {
    const row = await optional<AssistantMemory | null | "missing">(
        "memories.get",
        () => prisma.assistantMemory.findUnique({ where: { id } }),
        "missing",
    );
    if (row === "missing") throw new AssistantAccessError(MEMORY_UNAVAILABLE, 503);
    if (!row || (row.scope === "USER" && row.userId !== viewerId)) throw new NotFoundError("Souvenir introuvable");
    return row;
}
