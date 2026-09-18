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
import {
    canDeleteTicket,
    canEditTicketFields,
    canViewTicket,
    type TicketActor,
} from "@/lib/tickets/permissions";
import { updateTicketSchema } from "@/lib/tickets/schemas";
import { TICKET_DETAIL_INCLUDE, diffTicketFields, recordHistory, syncReleaseChecks } from "@/lib/tickets/service";
import { notifyTicketAssigned, notifyTicketUrgent } from "@/lib/tickets/notifications";

type Params = { params: Promise<{ id: string }> };

const EDITABLE_FIELDS = [
    "title",
    "description",
    "category",
    "scope",
    "affectedRoles",
    "priority",
    "clientId",
    "missionId",
    "assigneeId",
    "dueDate",
];

// GET /api/tickets/[id]
export const GET = withErrorHandler(async (request: NextRequest, { params }: Params) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    if (!canViewTicket(actor)) {
        throw new AuthError("Accès non autorisé", 403);
    }

    const { id } = await params;
    const ticket = await prisma.ticket.findUnique({ where: { id }, include: TICKET_DETAIL_INCLUDE });

    if (!ticket) throw new NotFoundError("Ticket introuvable");

    return successResponse(ticket);
});

// PATCH /api/tickets/[id] — MANAGER only (status has its own endpoint)
export const PATCH = withErrorHandler(async (request: NextRequest, { params }: Params) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    if (!canEditTicketFields(actor)) {
        throw new AuthError("Seul un manager peut modifier ce ticket", 403);
    }

    const { id } = await params;
    const input = await validateRequest(request, updateTicketSchema);

    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Ticket introuvable");

    const scope = input.scope ?? existing.scope;
    const clientId = input.clientId !== undefined ? input.clientId : existing.clientId;
    const missionId = input.missionId !== undefined ? input.missionId : existing.missionId;

    const data = {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.affectedRoles !== undefined ? { affectedRoles: input.affectedRoles } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId ?? null } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
        // A ticket that stops being client/mission scoped must not keep a stale link.
        clientId: scope === "INTERNAL" ? null : clientId ?? null,
        missionId: scope === "MISSION_RELATED" ? missionId ?? null : null,
    };

    const ticket = await prisma.$transaction(async (tx) => {
        const updated = await tx.ticket.update({
            where: { id },
            data,
            include: TICKET_DETAIL_INCLUDE,
        });

        if (input.affectedRoles) {
            await syncReleaseChecks(tx, id, input.affectedRoles);
        }

        const entries = diffTicketFields(existing, { ...data, ...input }, EDITABLE_FIELDS);
        await recordHistory(tx, id, session.user.id, entries);

        return updated;
    });

    const actorName = session.user.name || "Un manager";
    if (input.assigneeId && input.assigneeId !== existing.assigneeId) {
        await notifyTicketAssigned(ticket, input.assigneeId, actorName);
    }
    if (input.priority && input.priority !== existing.priority) {
        await notifyTicketUrgent(ticket, ticket.priority, session.user.id);
    }

    return successResponse(ticket);
});

// DELETE /api/tickets/[id] — MANAGER only
export const DELETE = withErrorHandler(async (request: NextRequest, { params }: Params) => {
    const session = await requireAuth(request);
    const actor: TicketActor = { id: session.user.id, role: session.user.role as TicketActor["role"] };

    if (!canDeleteTicket(actor)) {
        throw new AuthError("Seul un manager peut supprimer un ticket", 403);
    }

    const { id } = await params;
    const existing = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundError("Ticket introuvable");

    await prisma.ticket.delete({ where: { id } });

    return successResponse({ id });
});
