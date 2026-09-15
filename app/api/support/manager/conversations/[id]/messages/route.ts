// ============================================
// POST /api/support/manager/conversations/[id]/messages
// Manager replies to a support conversation.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import {
    successResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
} from "@/lib/api-utils";
import { postMessage, notifyClientByEmailIfEnabled } from "@/lib/support/service";
import { SUPPORT_ATTACHMENT_MAX_COUNT } from "@/lib/support/types";

const PostBody = z
    .object({
        // May be empty when the reply carries images only.
        content: z.string().max(4000).default(""),
        attachmentIds: z.array(z.string()).max(SUPPORT_ATTACHMENT_MAX_COUNT).optional(),
    })
    .refine((b) => b.content.trim().length > 0 || (b.attachmentIds?.length ?? 0) > 0, {
        message: "Le message est vide",
        path: ["content"],
    });

export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, PostBody);
    const message = await postMessage(
        id,
        session.user.id,
        { content: body.content, attachmentIds: body.attachmentIds },
        "MANAGER",
    );

    notifyClientByEmailIfEnabled(
        id,
        session.user.name ?? "L'équipe support",
        body.content.trim() || "📷 Image",
    ).catch(() => undefined);

    return successResponse(message, 201);
});
