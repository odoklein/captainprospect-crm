import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    AuthError,
    requireAuth,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import { canSubmitTicketRequest, type TicketActor } from "@/lib/tickets/permissions";
import { submitTicketRequestSchema } from "@/lib/tickets/schemas";
import { TICKET_LIST_INCLUDE } from "@/lib/tickets/service";
import { notifyTicketRequestSubmitted } from "@/lib/tickets/notifications";

/**
 * GET /api/tickets/requests — the requester's own submissions.
 * Scoped to `requesterId` so the sales team never reads the board through here.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    if (!canSubmitTicketRequest(actor)) {
        throw new AuthError("Accès non autorisé", 403);
    }

    const tickets = await prisma.ticket.findMany({
        where: { requesterId: actor.id, validation: { not: "NOT_REQUIRED" } },
        include: TICKET_LIST_INCLUDE,
        orderBy: [{ createdAt: "desc" }],
        take: 100,
    });

    return successResponse(tickets);
});

/**
 * POST /api/tickets/requests — the sales team files a technical request.
 *
 * It is created as a real Ticket so it is searchable and commentable like any
 * other, but `validation: PENDING` keeps it out of the work board until a
 * manager rules on it. Everything the requester cannot decide — priority,
 * scope, affected roles, assignee, due date — is left at its default and is
 * set by the manager on acceptance.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    if (!canSubmitTicketRequest(actor)) {
        throw new AuthError("Seule l'équipe sales peut déposer une demande", 403);
    }

    const input = await validateRequest(request, submitTicketRequestSchema);

    const ticket = await prisma.$transaction(async (tx) => {
        const created = await tx.ticket.create({
            data: {
                title: input.title,
                description: input.description,
                category: input.category,
                scope: "INTERNAL",
                // No release checklist yet: the affected roles are part of the
                // manager's triage, so syncReleaseChecks runs on acceptance.
                affectedRoles: [],
                requesterId: actor.id,
                validation: "PENDING",
            },
            include: TICKET_LIST_INCLUDE,
        });

        await tx.ticketHistory.create({
            data: {
                ticketId: created.id,
                userId: actor.id,
                field: "created",
                toValue: "PENDING_VALIDATION",
            },
        });

        return created;
    });

    await notifyTicketRequestSubmitted(ticket, session.user.name || "L'équipe sales");

    return successResponse(ticket, 201);
});
