// ============================================
// GET  /api/manager/assistant/folders/[id]/pins — the folder's board (PinItem[])
// POST /api/manager/assistant/folders/[id]/pins — pin a visual (CreatePinBody → PinItem)
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest } from "@/lib/api-utils";
import { assistantRoute, readIds } from "@/lib/assistant/conversations/http";
import { loadViewer } from "@/lib/assistant/conversations/service";
import { createPin, listPins, requirePinFolder } from "@/lib/assistant/pins/service";
import { AssistantAccessError } from "@/lib/assistant/folders/service";

export const dynamic = "force-dynamic";

export const GET = assistantRoute<{ id: string }>(async (request: NextRequest, { params }) => {
    await requireRole(["MANAGER"], request);
    const { id } = await readIds(params, "id");
    // Tables missing: an empty board, not an error.
    const folder = await requirePinFolder(id).catch((error: unknown) => {
        if (error instanceof AssistantAccessError && error.status === 503) return null;
        throw error;
    });
    return successResponse(folder ? await listPins(folder.id) : []);
});

const CreateBody = z.object({
    visual: z.unknown(),
    title: z.string().max(200).optional(),
    conversationId: z.string().max(64).nullable().optional(),
    messageId: z.string().max(64).nullable().optional(),
});

export const POST = assistantRoute<{ id: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const { id } = await readIds(params, "id");
    const body = await validateRequest(request, CreateBody);
    const folder = await requirePinFolder(id);
    return successResponse(await createPin(folder, viewer, body), 201);
});
