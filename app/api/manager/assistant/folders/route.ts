// ============================================
// GET  /api/manager/assistant/folders — the folder rail (FolderListResponse)
// POST /api/manager/assistant/folders — create a GENERAL folder (FolderDetail)
//
// `?archived=1` also lists archived general folders.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest } from "@/lib/api-utils";
import { assistantRoute, flag } from "@/lib/assistant/conversations/http";
import { listPinnedCards, loadViewer } from "@/lib/assistant/conversations/service";
import { createGeneralFolder, listFolderCards } from "@/lib/assistant/folders/service";
import type { FolderDetail, FolderListResponse } from "@/lib/assistant/api-contract";

export const dynamic = "force-dynamic";

export const GET = assistantRoute(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const { searchParams } = new URL(request.url);

    const [folders, pinnedConversations] = await Promise.all([
        listFolderCards(viewer, { includeArchived: flag(searchParams.get("archived")) }),
        listPinnedCards(viewer),
    ]);
    const data: FolderListResponse = {
        general: folders.general,
        clients: folders.clients,
        pinnedConversations,
        ...(folders.degraded ? { degraded: true } : {}),
    };
    return successResponse(data);
});

const CreateBody = z.object({
    name: z.string().trim().min(1, "Nom requis").max(80),
    color: z.string().trim().max(40).nullable().optional(),
    icon: z.string().trim().max(40).nullable().optional(),
    instructions: z.string().max(20_000).nullable().optional(),
});

export const POST = assistantRoute(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const body = await validateRequest(request, CreateBody);
    const folder: FolderDetail = await createGeneralFolder(body, viewer);
    return successResponse(folder, 201);
});
