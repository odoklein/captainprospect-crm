// ============================================
// PATCH  /api/manager/assistant/folders/[id]/pins/[pinId] — rename / reorder (PatchPinBody → PinItem)
// DELETE /api/manager/assistant/folders/[id]/pins/[pinId] — unpin
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest } from "@/lib/api-utils";
import { assistantRoute, readIds } from "@/lib/assistant/conversations/http";
import { deletePin, patchPin, requirePinFolder } from "@/lib/assistant/pins/service";

export const dynamic = "force-dynamic";

type Params = { id: string; pinId: string };

const PatchBody = z
    .object({
        title: z.string().max(200).optional(),
        position: z.number().int().min(0).max(10_000).optional(),
    })
    .strict();

export const PATCH = assistantRoute<Params>(async (request: NextRequest, { params }) => {
    await requireRole(["MANAGER"], request);
    const { id, pinId } = await readIds(params, "id", "pinId");
    const body = await validateRequest(request, PatchBody);
    const folder = await requirePinFolder(id);
    return successResponse(await patchPin(folder.id, pinId, body));
});

export const DELETE = assistantRoute<Params>(async (request: NextRequest, { params }) => {
    await requireRole(["MANAGER"], request);
    const { id, pinId } = await readIds(params, "id", "pinId");
    const folder = await requirePinFolder(id);
    await deletePin(folder.id, pinId);
    return successResponse({ deleted: true });
});
