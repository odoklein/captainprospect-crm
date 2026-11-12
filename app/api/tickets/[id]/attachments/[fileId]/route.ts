import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage-service";
import { AuthError, NotFoundError, requireAuth, withErrorHandler } from "@/lib/api-utils";
import { canReadOwnRequest, type TicketActor } from "@/lib/tickets/permissions";

type Params = { params: Promise<{ id: string; fileId: string }> };

/**
 * GET /api/tickets/[id]/attachments/[fileId] — the image itself, inline.
 * Goes through the ticket's own read rule instead of the generic file
 * endpoint, which would only let the uploader (or a manager) open it.
 */
export const GET = withErrorHandler(async (request: NextRequest, { params }: Params) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    const { id, fileId } = await params;
    const file = await prisma.file.findFirst({
        where: { id: fileId, ticketId: id, deletedAt: null },
        select: { path: true, mimeType: true, ticket: { select: { requesterId: true } } },
    });
    if (!file?.ticket) throw new NotFoundError("Image introuvable");
    if (!canReadOwnRequest(actor, file.ticket)) throw new AuthError("Accès non autorisé", 403);

    const buffer = await storageService.download(file.path);
    return new NextResponse(new Uint8Array(buffer), {
        headers: {
            "Content-Type": file.mimeType,
            "Content-Length": buffer.length.toString(),
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        },
    });
});
