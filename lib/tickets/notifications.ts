import type { TaskPriority, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { TICKET_STATUS_LABELS, formatTicketRef } from "./constants";

interface TicketRef {
    id: string;
    number: number;
    title: string;
}

function developerLink(ticketId: string) {
    return `/developer/tickets?ticket=${ticketId}`;
}

function managerLink(ticketId: string) {
    return `/manager/tickets?ticket=${ticketId}`;
}

async function getActiveManagerIds(excludeUserId?: string): Promise<string[]> {
    const managers = await prisma.user.findMany({
        where: { role: "MANAGER", isActive: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
        select: { id: true },
    });
    return managers.map((manager) => manager.id);
}

export async function notifyTicketAssigned(ticket: TicketRef, assigneeId: string, assignedByName: string) {
    return createNotification({
        userId: assigneeId,
        title: "Nouveau ticket assigné",
        message: `${formatTicketRef(ticket.number)} · "${ticket.title}" — assigné par ${assignedByName}`,
        type: "info",
        link: developerLink(ticket.id),
    });
}

/** Status moves are what the requester and the assignee actually care about. */
export async function notifyTicketStatusChanged(
    ticket: TicketRef,
    status: TicketStatus,
    actorId: string,
    actorName: string,
    recipients: { requesterId: string; assigneeId: string | null },
) {
    const targets = new Set(
        [recipients.requesterId, recipients.assigneeId].filter(
            (id): id is string => Boolean(id) && id !== actorId,
        ),
    );

    await Promise.all(
        [...targets].map((userId) =>
            createNotification({
                userId,
                title: `Ticket ${TICKET_STATUS_LABELS[status].toLowerCase()}`,
                message: `${formatTicketRef(ticket.number)} · "${ticket.title}" — mis à jour par ${actorName}`,
                type: status === "COMPLETED" ? "success" : "info",
                link: managerLink(ticket.id),
            }),
        ),
    );

    // A blocker stalls delivery, so it escalates to every manager rather than
    // waiting for someone to notice the board.
    if (status === "BLOCKED") {
        const managerIds = await getActiveManagerIds(actorId);
        await Promise.all(
            managerIds.map((userId) =>
                createNotification({
                    userId,
                    title: "Ticket bloqué",
                    message: `${formatTicketRef(ticket.number)} · "${ticket.title}" est bloqué`,
                    type: "warning",
                    link: managerLink(ticket.id),
                }),
            ),
        );
    }
}

export async function notifyTicketUrgent(ticket: TicketRef, priority: TaskPriority, actorId: string) {
    if (priority !== "URGENT") return;

    const managerIds = await getActiveManagerIds(actorId);
    await Promise.all(
        managerIds.map((userId) =>
            createNotification({
                userId,
                title: "Ticket urgent",
                message: `${formatTicketRef(ticket.number)} · "${ticket.title}" est passé en priorité urgente`,
                type: "warning",
                link: managerLink(ticket.id),
            }),
        ),
    );
}
