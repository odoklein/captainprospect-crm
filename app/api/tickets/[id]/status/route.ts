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
import { canChangeStatus, type TicketActor } from "@/lib/tickets/permissions";
import { updateStatusSchema } from "@/lib/tickets/schemas";
import {
    TICKET_DETAIL_INCLUDE,
    assertReleaseChecklistComplete,
    assertStatusTransition,
    recordHistory,
} from "@/lib/tickets/service";
import { notifyTicketStatusChanged } from "@/lib/tickets/notifications";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/tickets/[id]/status — MANAGER, or the assigned DEVELOPER
export const PATCH = withErrorHandler(async (request: NextRequest, { params }: Params) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    const { id } = await params;
    const input = await validateRequest(request, updateStatusSchema);

    const existing = await prisma.ticket.findUnique({
        where: { id },
        select: { id: true, number: true, title: true, status: true, assigneeId: true, requesterId: true },
    });
    if (!existing) throw new NotFoundError("Ticket introuvable");

    if (!canChangeStatus(actor, existing)) {
        throw new AuthError("Vous ne pouvez pas modifier le statut de ce ticket", 403);
    }

    assertStatusTransition(existing.status, input.status);

    const ticket = await prisma.$transaction(async (tx) => {
        if (input.status === "COMPLETED") {
            await assertReleaseChecklistComplete(tx, id);
        }

        const updated = await tx.ticket.update({
            where: { id },
            data: {
                status: input.status,
                completedAt: input.status === "COMPLETED" ? new Date() : null,
            },
            include: TICKET_DETAIL_INCLUDE,
        });

        await recordHistory(tx, id, session.user.id, [
            { field: "status", fromValue: existing.status, toValue: input.status },
        ]);

        if (input.comment?.trim()) {
            await tx.ticketComment.create({
                data: { ticketId: id, userId: session.user.id, content: input.comment.trim() },
            });
        }

        return updated;
    });

    await notifyTicketStatusChanged(
        ticket,
        input.status,
        session.user.id,
        session.user.name || "Un utilisateur",
        { requesterId: existing.requesterId, assigneeId: existing.assigneeId },
    );

    return successResponse(ticket);
});
