import type { UserRole } from "@prisma/client";

/**
 * Ticket permission rules, as pure functions so they can be unit-tested and
 * reused identically by every route. Route handlers must call these instead of
 * inlining role checks.
 *
 * Summary:
 *  - MANAGER   : full control, sole owner of priority, assignment and publication
 *  - DEVELOPER : reads every ticket, moves the status of the ones assigned to them
 *  - SDR / BD / BOOKER (sales team) : may file a request and read their own,
 *    nothing more. The request waits in the "À valider" queue until a manager
 *    accepts it — see canSubmitTicketRequest / canValidateTicket.
 *  - CLIENT, COMMERCIAL : no access to the internal surface at all. Clients only
 *    ever reach the roadmap/changelog endpoints, which read from a separate,
 *    field-allowlisted query.
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

/**
 * The internal sales team. They may file a request and follow their own, but
 * never see the board — so a ticket about another team's client stays out of
 * reach. A request of theirs lands as PENDING validation, never as work.
 */
export const TICKET_REQUESTER_ROLES: UserRole[] = ["SDR", "BUSINESS_DEVELOPER", "BOOKER"];

export function canAccessTickets(actor: TicketActor): boolean {
    return TICKET_INTERNAL_ROLES.includes(actor.role);
}

/** Filing a request is not creating a ticket: no priority, no assignee, no scope. */
export function canSubmitTicketRequest(actor: TicketActor): boolean {
    return TICKET_REQUESTER_ROLES.includes(actor.role);
}

/** Accepting or rejecting a pending request — the manager's triage decision. */
export function canValidateTicket(actor: TicketActor): boolean {
    return actor.role === "MANAGER";
}

/**
 * A requester reads their own submissions and nothing else; the internal roles
 * read everything. Used by the detail endpoint, where "my request" is a
 * legitimate read even though the board is not.
 */
export function canReadOwnRequest(actor: TicketActor, ticket: { requesterId: string }): boolean {
    if (canAccessTickets(actor)) return true;
    return canSubmitTicketRequest(actor) && ticket.requesterId === actor.id;
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
