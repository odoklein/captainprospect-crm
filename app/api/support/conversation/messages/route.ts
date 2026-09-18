// ============================================
// POST /api/support/conversation/messages
// Client sends a support message. Auto-creates the conversation.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import {
    successResponse,
    requireAuth,
    withErrorHandler,
    validateRequest,
    AuthError,
    NotFoundError,
} from "@/lib/api-utils";
import {
    getConversationIdForClientUser,
    postMessage,
    resolveAccessibleConversationId,
} from "@/lib/support/service";
import { notifyManagersClientSupportMessage } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { SUPPORT_ATTACHMENT_MAX_COUNT } from "@/lib/support/types";
import type { SupportIntent } from "@prisma/client";

const PostBody = z
    .object({
        conversationId: z.string().optional(),
        // May be empty when the message carries images only.
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
    })
    .refine((b) => b.content.trim().length > 0 || (b.attachmentIds?.length ?? 0) > 0, {
        message: "Le message est vide",
        path: ["content"],
    });

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    if (session.user.role !== "CLIENT" && session.user.role !== "COMMERCIAL") {
        throw new AuthError("Réservé aux clients/commerciaux", 403);
    }
    const body = await validateRequest(request, PostBody);

    const conversationId = await resolveAccessibleConversationId(
        session.user,
        body.conversationId,
    );
    if (!conversationId) {
        throw new NotFoundError("Conversation de support introuvable ou accès refusé");
    }

    const message = await postMessage(
        conversationId,
        session.user.id,
        {
            content: body.content,
            intent: body.intent as SupportIntent | undefined,
            context: body.context,
            attachmentIds: body.attachmentIds,
        },
        "CLIENT",
    );

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, client: { select: { name: true } } },
    });
    notifyManagersClientSupportMessage({
        clientName: user?.client?.name ?? "Client",
        authorName: user?.name ?? null,
        messagePreview: body.content.trim() || "📷 Image",
        intent: body.intent ?? null,
        attachmentCount: message.attachments?.length ?? 0,
        pageLabel: body.context?.pageLabel ?? null,
    }).catch(() => {});

    return successResponse(message, 201);
});
