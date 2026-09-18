// ============================================
// GET & POST /api/support/conversations
// GET: Returns list of support conversations accessible to current client/commercial user.
// POST: Creates a new support request with automated acknowledgment.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import {
    successResponse,
    requireAuth,
    withErrorHandler,
    validateRequest,
    AuthError,
} from "@/lib/api-utils";
import {
    listConversationsForClientUser,
    createClientConversation,
} from "@/lib/support/service";
import { SUPPORT_ATTACHMENT_MAX_COUNT } from "@/lib/support/types";

const CreateConversationSchema = z.object({
    subject: z.string().max(120).optional(),
    content: z.string().max(4000).default(""),
    intent: z.enum(["RDV", "RAPPORT", "PROBLEME", "AUTRE"]).optional(),
    attachmentIds: z.array(z.string()).max(SUPPORT_ATTACHMENT_MAX_COUNT).optional(),
    context: z
        .object({
            pageLabel: z.string().max(120).optional(),
            pathname: z.string().max(200).optional(),
            rdvRefs: z.array(z.string().max(160)).max(10).optional(),
            intent: z.enum(["RDV", "RAPPORT", "PROBLEME", "AUTRE"]).optional(),
        })
        .optional(),
}).refine((b) => b.content.trim().length > 0 || (b.attachmentIds?.length ?? 0) > 0, {
    message: "Le message est vide",
    path: ["content"],
});

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    if (session.user.role !== "CLIENT" && session.user.role !== "COMMERCIAL") {
        throw new AuthError("Réservé aux clients/commerciaux", 403);
    }
    const conversations = await listConversationsForClientUser(session.user.id);
    return successResponse(conversations);
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    if (session.user.role !== "CLIENT" && session.user.role !== "COMMERCIAL") {
        throw new AuthError("Réservé aux clients/commerciaux", 403);
    }
    const body = await validateRequest(request, CreateConversationSchema);
    const conversation = await createClientConversation(session.user.id, {
        subject: body.subject,
        content: body.content,
        intent: body.intent,
        attachmentIds: body.attachmentIds,
        context: body.context,
    });
    return successResponse(conversation, 201);
});
