import { NextRequest } from "next/server";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
    AuthError,
    NotFoundError,
    requireAuth,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import { canToggleReleaseCheck, type TicketActor } from "@/lib/tickets/permissions";
import { releaseCheckSchema } from "@/lib/tickets/schemas";

type Params = { params: Promise<{ id: string; role: string }> };

// PATCH /api/tickets/[id]/release-checks/[role] — sign off one affected role
export const PATCH = withErrorHandler(async (request: NextRequest, { params }: Params) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    const { id, role } = await params;
    const input = await validateRequest(request, releaseCheckSchema);

    const ticket = await prisma.ticket.findUnique({
        where: { id },
        select: { id: true, assigneeId: true },
    });
    if (!ticket) throw new NotFoundError("Ticket introuvable");

    const checkRole = role.toUpperCase() as UserRole;
    if (!canToggleReleaseCheck(actor, ticket, checkRole)) {
        throw new AuthError("Vous ne pouvez pas valider ce rôle", 403);
    }

    const check = await prisma.ticketReleaseCheck.findUnique({
        where: { ticketId_role: { ticketId: id, role: checkRole } },
        select: { id: true },
    });
    if (!check) throw new NotFoundError("Ce rôle n'est pas impacté par ce ticket");

    const updated = await prisma.ticketReleaseCheck.update({
        where: { id: check.id },
        data: {
            checked: input.checked,
            notes: input.notes?.trim() || null,
            checkedById: input.checked ? session.user.id : null,
            checkedAt: input.checked ? new Date() : null,
        },
        include: { checkedBy: { select: { id: true, name: true } } },
    });

    return successResponse(updated);
});
