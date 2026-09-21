import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    AuthError,
    NotFoundError,
    ValidationError,
    requireAuth,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import { canValidateTicket, type TicketActor } from "@/lib/tickets/permissions";
import { validateTicketSchema } from "@/lib/tickets/schemas";
import { TICKET_DETAIL_INCLUDE, recordHistory, syncReleaseChecks } from "@/lib/tickets/service";
import { notifyTicketAssigned, notifyTicketRequestDecided } from "@/lib/tickets/notifications";

/**
 * POST /api/tickets/[id]/validate — a manager rules on a pending sales request.
 *
 * Accepting is the moment the triage happens: priority, affected roles (and so
 * the release checklist), assignee and due date are applied here, and the
 * ticket joins the board as a normal TODO. Rejecting keeps the row for the
 * record with a reason the requester can read.
 */
export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    if (!canValidateTicket(actor)) {
        throw new AuthError("Seul un manager peut valider une demande", 403);
    }

    const { id } = await params;
    const input = await validateRequest(request, validateTicketSchema);

    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Ticket introuvable");

    // Only a pending request can be ruled on — re-validating an already-decided
    // ticket would silently rewrite its priority and assignee.
    if (existing.validation !== "PENDING") {
        throw new ValidationError("Cette demande a déjà été traitée");
    }

    const accepted = input.decision === "ACCEPTED";

    const ticket = await prisma.$transaction(async (tx) => {
        const updated = await tx.ticket.update({
            where: { id },
            data: {
                validation: input.decision,
                validatedAt: new Date(),
                validatedById: actor.id,
                rejectionReason: accepted ? null : input.rejectionReason ?? null,
                ...(accepted
                    ? {
                          status: "TODO" as const,
                          priority: input.priority ?? existing.priority,
                          affectedRoles: input.affectedRoles ?? existing.affectedRoles,
                          assigneeId: input.assigneeId ?? null,
                          dueDate: input.dueDate ? new Date(input.dueDate) : null,
                      }
                    : {}),
            },
            include: TICKET_DETAIL_INCLUDE,
        });

        if (accepted && input.affectedRoles) {
            await syncReleaseChecks(tx, id, input.affectedRoles);
        }

        await recordHistory(tx, id, actor.id, [
            { field: "validation", fromValue: existing.validation, toValue: input.decision },
            ...(accepted ? [{ field: "status", fromValue: existing.status, toValue: "TODO" }] : []),
        ]);

        return updated;
    });

    await notifyTicketRequestDecided(ticket, ticket.requesterId, input.decision, input.rejectionReason);
    if (accepted && ticket.assigneeId) {
        await notifyTicketAssigned(ticket, ticket.assigneeId, session.user.name || "Un manager");
    }

    return successResponse(ticket);
});
