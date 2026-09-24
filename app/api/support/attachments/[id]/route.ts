// ============================================
// GET    /api/support/attachments/[id] — stream a support image
// DELETE /api/support/attachments/[id] — drop a not-yet-sent attachment
//
// Images are streamed through the app rather than exposed via a public or signed
// storage URL: the support thread is private, and this keeps the permission check
// on every single read whatever storage provider is configured.
// ============================================

import { NextRequest, NextResponse } from "next/server";
import {
    errorResponse,
    requireAuth,
    successResponse,
    withErrorHandler,
    NotFoundError,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage-service";
import { resolveAccessibleConversationId } from "@/lib/support/service";

async function loadAuthorised(request: NextRequest, id: string) {
    const session = await requireAuth(request);
    const attachment = await prisma.supportAttachment.findUnique({
        where: { id },
        select: {
            id: true,
            conversationId: true,
            messageId: true,
            storageKey: true,
            fileName: true,
            mimeType: true,
            uploadedById: true,
        },
    });
    if (!attachment) throw new NotFoundError("Image introuvable");

    // Pending upload (new request not sent yet): only its uploader can see or remove it.
    if (!attachment.conversationId) {
        return { session, attachment, allowed: attachment.uploadedById === session.user.id };
    }

    const accessibleId = await resolveAccessibleConversationId(
        session.user,
        attachment.conversationId,
    );
    if (accessibleId !== attachment.conversationId) {
        return { session, attachment, allowed: false as const };
    }
    return { session, attachment, allowed: true as const };
}

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const { id } = await params;
    const { attachment, allowed } = await loadAuthorised(request, id);
    if (!allowed) {
        return errorResponse("Vous n'avez pas accès à cette image", 403);
    }

    const buffer = await storageService.download(attachment.storageKey);

    return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
            "Content-Type": attachment.mimeType,
            "Content-Length": String(buffer.length),
            "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
            // Immutable content behind an auth check — safe to keep in the private cache.
            "Cache-Control": "private, max-age=86400, immutable",
        },
    });
});

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const { id } = await params;
    const { session, attachment, allowed } = await loadAuthorised(request, id);
    if (!allowed || attachment.uploadedById !== session.user.id) {
        return errorResponse("Vous n'avez pas accès à cette image", 403);
    }
    // Once sent, an image is part of the thread history and is no longer removable here.
    if (attachment.messageId) {
        return errorResponse("Cette image a déjà été envoyée", 409);
    }

    await prisma.supportAttachment.delete({ where: { id: attachment.id } });
    await storageService.delete(attachment.storageKey).catch(() => undefined);

    return successResponse({ id: attachment.id });
});
