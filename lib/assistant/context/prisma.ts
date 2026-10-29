/**
 * Prisma-backed readers of the context pack: the only file of this directory
 * that touches the database, so pack.ts stays pure and testable. The memory
 * store already degrades to [] when the table is missing.
 */

import type { AssistantMemory } from "@prisma/client";
import { listMemoryLayers } from "../memory/service";
import type { ContextDeps } from "./pack";
import type { MemoryCandidate } from "./rank";

export function toMemoryCandidate(row: AssistantMemory): MemoryCandidate {
    return {
        id: row.id,
        scope: row.scope,
        kind: row.kind,
        content: row.content,
        pinned: row.pinned,
        useCount: row.useCount,
        updatedAt: row.updatedAt,
        missionId: row.missionId,
    };
}

export const prismaContextDeps: ContextDeps = {
    memories: async ({ folderId, userId }) => (await listMemoryLayers({ folderId, userId })).map(toMemoryCandidate),
};
