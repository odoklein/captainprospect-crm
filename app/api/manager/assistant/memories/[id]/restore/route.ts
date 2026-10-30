// ============================================
// POST /api/manager/assistant/memories/[id]/restore — undo a soft delete (MemoryItem)
// ============================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse } from "@/lib/api-utils";
import { assistantRoute, readIds } from "@/lib/assistant/conversations/http";
import { restoreMemory } from "@/lib/assistant/memory/service";
import { requireVisibleMemory, toMemoryItem } from "../../_shared";

export const dynamic = "force-dynamic";

export const POST = assistantRoute<{ id: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await readIds(params, "id");
    const memory = await requireVisibleMemory(id, session.user.id);
    await restoreMemory(memory.id, { id: session.user.id });
    const row = await prisma.assistantMemory.findUnique({ where: { id: memory.id } });
    return successResponse(toMemoryItem(row ?? memory));
});
