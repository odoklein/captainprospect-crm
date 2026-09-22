import { NextRequest } from "next/server";
import { Prisma, type TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
    AuthError,
    requireAuth,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import { canAccessTickets, canCreateTicket, type TicketActor } from "@/lib/tickets/permissions";
import { createTicketSchema } from "@/lib/tickets/schemas";
import { TICKET_LIST_INCLUDE, syncReleaseChecks } from "@/lib/tickets/service";
import { notifyTicketAssigned, notifyTicketUrgent } from "@/lib/tickets/notifications";

// GET /api/tickets — internal board (MANAGER, DEVELOPER)
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    if (!canAccessTickets(actor)) {
        throw new AuthError("Accès non autorisé", 403);
    }

    const { searchParams } = new URL(request.url);
    const where: Prisma.TicketWhereInput = {};

    // A pending sales request is not work yet, so it stays off the default
    // board and lives in its own "À valider" queue (?validation=PENDING).
    // Without this it would sit among triaged tickets as a plain NEW.
    const validation = searchParams.get("validation");
    where.validation = validation ? { in: validation.split(",") as any } : { not: "PENDING" };

    const status = searchParams.get("status");
    if (status) where.status = { in: status.split(",") as TicketStatus[] };

    const priority = searchParams.get("priority");
    if (priority) where.priority = { in: priority.split(",") as any };

    const category = searchParams.get("category");
    if (category) where.category = { in: category.split(",") as any };

    const scope = searchParams.get("scope");
    if (scope) where.scope = { in: scope.split(",") as any };

    const affectedRole = searchParams.get("affectedRole");
    if (affectedRole) where.affectedRoles = { has: affectedRole as any };

    // "Which SDRs have tickets" is a question the board could not answer before
    // the sales team could file: filter by the requester's team, not just theirs.
    const requesterRole = searchParams.get("requesterRole");
    if (requesterRole) where.requester = { role: { in: requesterRole.split(",") as any } };

    const assigneeId = searchParams.get("assigneeId");
    if (assigneeId) where.assigneeId = assigneeId === "unassigned" ? null : assigneeId;

    const clientId = searchParams.get("clientId");
    if (clientId) where.clientId = clientId;

    if (searchParams.get("overdue") === "true") {
        where.dueDate = { lt: new Date() };
        where.status = { not: "COMPLETED" };
    }

    const search = searchParams.get("search")?.trim();
    if (search) {
        const asNumber = Number(search.replace(/^#?(TC-)?/i, ""));
        where.OR = [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            ...(Number.isFinite(asNumber) && asNumber > 0 ? [{ number: asNumber }] : []),
        ];
    }

    const tickets = await prisma.ticket.findMany({
        where,
        include: TICKET_LIST_INCLUDE,
        orderBy: [{ updatedAt: "desc" }],
        take: 200,
    });

    return successResponse(tickets);
});

// POST /api/tickets — MANAGER only
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    if (!canCreateTicket(actor)) {
        throw new AuthError("Seul un manager peut créer un ticket", 403);
    }

    const input = await validateRequest(request, createTicketSchema);

    const ticket = await prisma.$transaction(async (tx) => {
        const created = await tx.ticket.create({
            data: {
                title: input.title,
                description: input.description ?? null,
                category: input.category,
                scope: input.scope,
                affectedRoles: input.affectedRoles,
                priority: input.priority,
                clientId: input.scope === "INTERNAL" ? null : input.clientId ?? null,
                missionId: input.scope === "MISSION_RELATED" ? input.missionId ?? null : null,
                assigneeId: input.assigneeId ?? null,
                dueDate: input.dueDate ? new Date(input.dueDate) : null,
                sourceSupportMessageId: input.sourceSupportMessageId ?? null,
                requesterId: session.user.id,
            },
            include: TICKET_LIST_INCLUDE,
        });

        await syncReleaseChecks(tx, created.id, input.affectedRoles);
        await tx.ticketHistory.create({
            data: { ticketId: created.id, userId: session.user.id, field: "created", toValue: created.status },
        });

        return created;
    });

    const actorName = session.user.name || "Un manager";
    if (ticket.assigneeId) {
        await notifyTicketAssigned(ticket, ticket.assigneeId, actorName);
    }
    await notifyTicketUrgent(ticket, ticket.priority, session.user.id);

    return successResponse(ticket, 201);
});
