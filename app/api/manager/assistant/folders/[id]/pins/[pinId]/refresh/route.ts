// ============================================
// POST /api/manager/assistant/folders/[id]/pins/[pinId]/refresh — redraw a pinned
// visual with today's data (PinItem)
//
// One bounded agent turn (source tool + show_visual only, ≤ 60 s). A failed
// refresh still answers 200 with the pin carrying `refreshError`; a pin with
// no source answers 400.
// ============================================

import { NextRequest } from "next/server";
import { requireRole, successResponse } from "@/lib/api-utils";
import { assistantRoute, readIds } from "@/lib/assistant/conversations/http";
import { loadViewer } from "@/lib/assistant/conversations/service";
import { requirePin, requirePinFolder } from "@/lib/assistant/pins/service";
import { refreshPin } from "@/lib/assistant/pins/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export const POST = assistantRoute<{ id: string; pinId: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const { id, pinId } = await readIds(params, "id", "pinId");
    const folder = await requirePinFolder(id);
    const pin = await requirePin(folder.id, pinId);
    return successResponse(await refreshPin(pin, folder, viewer));
});
