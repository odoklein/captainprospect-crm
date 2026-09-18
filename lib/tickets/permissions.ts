import type { UserRole } from "@prisma/client";

/**
 * Ticket permission rules, as pure functions so they can be unit-tested and
 * reused identically by every route. Route handlers must call these instead of
 * inlining role checks.
 *
 * Summary:
 *  - MANAGER   : full control, sole owner of priority, assignment and publication
 *  - DEVELOPER : reads every ticket, moves the status of the ones assigned to them
 *  - everyone else (CLIENT, SDR, BD, COMMERCIAL, BOOKER) : no access to the
 *    internal surface at all. Clients only ever reach the roadmap/changelog
 *    endpoints, which read from a separate, field-allowlisted query.
 */

export interface TicketActor {
    id: string;
    role: UserRole;
}

export interface TicketOwnership {
    assigneeId: string | null;
}

/** Roles allowed anywhere near the internal ticket surface. */
export const TICKET_INTERNAL_ROLES: UserRole[] = ["MANAGER", "DEVELOPER"];

export function canAccessTickets(actor: TicketActor): boolean {
    return TICKET_INTERNAL_ROLES.includes(actor.role);
}

export function canViewTicket(actor: TicketActor): boolean {
    // Developers see the whole board — they need context on what the team is
    // shipping, and every ticket here is internal by construction.
    return canAccessTickets(actor);
}

export function canCreateTicket(actor: TicketActor): boolean {
    return actor.role === "MANAGER";
}

/** Title, description, category, scope, affected roles, priority, assignee, due date. */
export function canEditTicketFields(actor: TicketActor): boolean {
    return actor.role === "MANAGER";
}

export function canChangeStatus(actor: TicketActor, ticket: TicketOwnership): boolean {
    if (actor.role === "MANAGER") return true;
    return actor.role === "DEVELOPER" && ticket.assigneeId === actor.id;
}

export function canComment(actor: TicketActor): boolean {
    return canAccessTickets(actor);
}

export function canUploadAttachment(actor: TicketActor): boolean {
    return canAccessTickets(actor);
}

export function canPublishToRoadmap(actor: TicketActor): boolean {
    return actor.role === "MANAGER";
}

export function canDeleteTicket(actor: TicketActor): boolean {
    return actor.role === "MANAGER";
}

/**
 * A manager can tick any role's line. A developer can only sign off the
 * DEVELOPER line, and only on a ticket assigned to them — so "tested for every
 * affected role" cannot be rubber-stamped by one person who never saw the
 * client or SDR side.
 */
export function canToggleReleaseCheck(
    actor: TicketActor,
    ticket: TicketOwnership,
    checkRole: UserRole,
): boolean {
    if (actor.role === "MANAGER") return true;
    return actor.role === "DEVELOPER" && checkRole === "DEVELOPER" && ticket.assigneeId === actor.id;
}
