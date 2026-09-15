// ============================================
// POST /api/support/attachments
// Upload an image for a support conversation. The attachment is created
// unlinked (messageId = null) and is tied to a message when the composer sends.
// ============================================

import { NextRequest } from "next/server";
import {
    successResponse,
    errorResponse,
    requireAuth,
    withErrorHandler,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage-service";
import { resolveAccessibleConversationId } from "@/lib/support/service";
import {
    SUPPORT_ATTACHMENT_MAX_SIZE,
    SUPPORT_ATTACHMENT_MIME_TYPES,
    supportAttachmentUrl,
} from "@/lib/support/types";
import type { SupportAttachmentDTO } from "@/lib/support/types";

const ALLOWED_MIME: readonly string[] = SUPPORT_ATTACHMENT_MIME_TYPES;

/** Client-reported pixel dimensions are only used for layout, so clamp and never trust. */
function parseDimension(raw: FormDataEntryValue | null): number | null {
    if (typeof raw !== "string") return null;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0 || n > 20000) return null;
    return n;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const { role } = session.user;
    if (role !== "CLIENT" && role !== "COMMERCIAL" && role !== "MANAGER") {
        return errorResponse("Accès non autorisé", 403);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
        return errorResponse("Aucun fichier fourni", 400);
    }

    const conversationId = await resolveAccessibleConversationId(
        session.user,
        typeof formData.get("conversationId") === "string"
            ? (formData.get("conversationId") as string)
            : null,
    );
    if (!conversationId) {
        return errorResponse("Conversation de support introuvable", 404);
    }

    if (!ALLOWED_MIME.includes(file.type)) {
        return errorResponse("Seules les images (JPEG, PNG, WebP, GIF) sont acceptées", 400);
    }
    if (file.size <= 0) {
        return errorResponse("Le fichier est vide", 400);
    }
    if (file.size > SUPPORT_ATTACHMENT_MAX_SIZE) {
        return errorResponse(
            `Image trop volumineuse (max ${Math.floor(SUPPORT_ATTACHMENT_MAX_SIZE / (1024 * 1024))} Mo)`,
            400,
        );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { key } = await storageService.upload(
        buffer,
        {
            filename: file.name || "image",
            mimeType: file.type,
            size: file.size,
            folder: "support",
        },
        session.user.id,
    );

    const attachment = await prisma.supportAttachment.create({
        data: {
            conversationId,
            storageKey: key,
            fileName: (file.name || "image").slice(0, 255),
            mimeType: file.type,
            size: file.size,
            width: parseDimension(formData.get("width")),
            height: parseDimension(formData.get("height")),
            uploadedById: session.user.id,
        },
        select: {
            id: true,
            fileName: true,
            mimeType: true,
            size: true,
            width: true,
            height: true,
        },
    });

    const dto: SupportAttachmentDTO = {
        ...attachment,
        url: supportAttachmentUrl(attachment.id),
    };

    return successResponse(dto, 201);
});
