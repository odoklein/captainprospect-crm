import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage-service";
import {
    AuthError,
    NotFoundError,
    ValidationError,
    requireAuth,
    successResponse,
    withErrorHandler,
} from "@/lib/api-utils";
import { canReadOwnRequest, type TicketActor } from "@/lib/tickets/permissions";
import {
    TICKET_ATTACHMENT_MAX_COUNT,
    TICKET_ATTACHMENT_MAX_SIZE,
    formatAttachmentSize,
    isTicketAttachmentType,
    ticketAttachmentUrl,
} from "@/lib/tickets/attachments";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/tickets/[id]/attachments — one screenshot per call.
 *
 * Allowed to the internal roles and to the requester of the ticket, so a
 * salesperson can illustrate their own request but cannot write on anyone
 * else's. The ticket exists before the upload (the form uploads after creating
 * it), so there are never orphaned files to clean up.
 */
export const POST = withErrorHandler(async (request: NextRequest, { params }: Params) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    const { id } = await params;
    const ticket = await prisma.ticket.findUnique({
        where: { id },
        select: { id: true, requesterId: true, _count: { select: { attachments: { where: { deletedAt: null } } } } },
    });
    if (!ticket) throw new NotFoundError("Ticket introuvable");
    if (!canReadOwnRequest(actor, ticket)) throw new AuthError("Accès non autorisé", 403);

    if (ticket._count.attachments >= TICKET_ATTACHMENT_MAX_COUNT) {
        throw new ValidationError(`Maximum ${TICKET_ATTACHMENT_MAX_COUNT} captures par ticket`);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ValidationError("Aucun fichier fourni");
    if (!isTicketAttachmentType(file.type)) {
        throw new ValidationError("Seules les images (PNG, JPEG, WebP, GIF) sont acceptées");
    }
    if (file.size <= 0) throw new ValidationError("Le fichier est vide");
    if (file.size > TICKET_ATTACHMENT_MAX_SIZE) {
        throw new ValidationError(`Image trop volumineuse (max ${formatAttachmentSize(TICKET_ATTACHMENT_MAX_SIZE)})`);
    }

    const originalName = (file.name || "capture").slice(0, 255);
    const { key, url } = await storageService.upload(
        Buffer.from(await file.arrayBuffer()),
        { filename: originalName, mimeType: file.type, size: file.size, folder: "tickets" },
        session.user.id,
    );

    const record = await prisma.file.create({
        data: {
            name: originalName.replace(/\.[^/.]+$/, ""),
            originalName,
            mimeType: file.type,
            size: file.size,
            path: key,
            url,
            uploadedById: session.user.id,
            ticketId: ticket.id,
        },
        select: { id: true, originalName: true, mimeType: true, size: true },
    });

    return successResponse({ ...record, url: ticketAttachmentUrl(ticket.id, record.id) }, 201);
});
