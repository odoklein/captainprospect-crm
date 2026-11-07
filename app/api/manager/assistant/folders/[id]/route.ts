// ============================================
// GET   /api/manager/assistant/folders/[id] — folder home and settings (FolderDetail)
// PATCH /api/manager/assistant/folders/[id] — rename, colour, icon, instructions,
//                                              starter questions, archive
//
// Instructions are refused (400) above 600 estimated tokens (chars / 3.3).
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest } from "@/lib/api-utils";
import { assistantRoute, readIds } from "@/lib/assistant/conversations/http";
import { loadViewer } from "@/lib/assistant/conversations/service";
import { getFolderDetail, patchFolder } from "@/lib/assistant/folders/service";
import { STARTER_QUESTIONS_MAX, STARTER_QUESTION_MAX_CHARS } from "@/lib/assistant/folders/limits";

export const dynamic = "force-dynamic";

export const GET = assistantRoute<{ id: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const { id } = await readIds(params, "id");
    return successResponse(await getFolderDetail(id, viewer));
});

const PatchBody = z
    .object({
        name: z.string().trim().min(1).max(80).optional(),
        color: z.string().trim().max(40).nullable().optional(),
        icon: z.string().trim().max(40).nullable().optional(),
        instructions: z.string().max(20_000).nullable().optional(),
        starterQuestions: z.array(z.string().max(STARTER_QUESTION_MAX_CHARS)).max(STARTER_QUESTIONS_MAX).optional(),
        archived: z.boolean().optional(),
    })
    .strict();

export const PATCH = assistantRoute<{ id: string }>(async (request: NextRequest, { params }) => {
    const session = await requireRole(["MANAGER"], request);
    const viewer = await loadViewer(session.user.id);
    const { id } = await readIds(params, "id");
    const body = await validateRequest(request, PatchBody);
    return successResponse(await patchFolder(id, body, viewer));
});
