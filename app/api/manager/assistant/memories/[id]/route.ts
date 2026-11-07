// ============================================
// PATCH  /api/manager/assistant/memories/[id] — edit content / kind / pin (PatchMemoryBody → MemoryItem)
// DELETE /api/manager/assistant/memories/[id] — soft delete (undo = POST [id]/restore) → MemoryItem
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, validateRequest } from "@/lib/api-utils";
import { assistantRoute, readIds } from "@/lib/assistant/conversations/http";
import { AssistantAccessError } from "@/lib/assistant/folders/service";
import { MEMORY_MAX_CHARS, softDeleteMemory, updateMemory } from "@/lib/assistant/memory/service";
import { MEMORY_UNAVAILABLE, requireVisibleMemory, toMemoryItem } from "../_shared";

export const dynamic = "force-dynamic";

const PatchBody = z
    .object({
        content: z.string().min(1).max(MEMORY_MAX_CHARS * 2).optional(),
        kind: z.enum(["FACT", "PREFERENCE", "DECISION", "CONTACT", "GOAL"]).optional(),
        pinned: z.boolean().optional(),
    })
    .strict();

export const PATCH = assistantRoute<{ id: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await readIds(params, "id");
    const body = await validateRequest(request, PatchBody);
    const memory = await requireVisibleMemory(id, session.user.id);
    const updated = await updateMemory(memory.id, body, { id: session.user.id });
    if (!updated) throw new AssistantAccessError(MEMORY_UNAVAILABLE, 503);
    return successResponse(toMemoryItem(updated));
});

export const DELETE = assistantRoute<{ id: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await readIds(params, "id");
    const memory = await requireVisibleMemory(id, session.user.id);
    await softDeleteMemory(memory.id, { id: session.user.id });
    const row = await prisma.assistantMemory.findUnique({ where: { id: memory.id } });
    return successResponse(toMemoryItem(row ?? memory));
});
