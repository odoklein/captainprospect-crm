import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    AuthError,
    NotFoundError,
    requireAuth,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import { canComment, type TicketActor } from "@/lib/tickets/permissions";
import { createCommentSchema } from "@/lib/tickets/schemas";

type Params = { params: Promise<{ id: string }> };

// POST /api/tickets/[id]/comments — MANAGER, DEVELOPER
export const POST = withErrorHandler(async (request: NextRequest, { params }: Params) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    if (!canComment(actor)) {
        throw new AuthError("Accès non autorisé", 403);
    }

    const { id } = await params;
    const { content } = await validateRequest(request, createCommentSchema);

    const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
    if (!ticket) throw new NotFoundError("Ticket introuvable");

    const comment = await prisma.ticketComment.create({
        data: { ticketId: id, userId: session.user.id, content },
        include: { user: { select: { id: true, name: true, role: true } } },
    });

    return successResponse(comment, 201);
});
