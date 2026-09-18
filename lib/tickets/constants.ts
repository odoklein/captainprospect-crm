import type { TicketCategory, TicketScope, TicketStatus, TaskPriority, UserRole } from "@prisma/client";

/**
 * Allowed status transitions. Enforced server-side so a crafted PATCH cannot
 * jump a ticket straight from NEW to COMPLETED and skip the release checklist.
 */
export const TICKET_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
    NEW: ["TODO", "IN_PROGRESS"],
    TODO: ["NEW", "IN_PROGRESS"],
    IN_PROGRESS: ["TODO", "BLOCKED", "TESTING"],
    BLOCKED: ["TODO", "IN_PROGRESS"],
    TESTING: ["IN_PROGRESS", "BLOCKED", "COMPLETED"],
    COMPLETED: ["IN_PROGRESS"],
};

/** Statuses that count as "open work" on the dashboard. */
export const TICKET_ACTIVE_STATUSES: TicketStatus[] = ["TODO", "IN_PROGRESS", "TESTING"];
export const TICKET_OPEN_STATUSES: TicketStatus[] = ["NEW", "TODO", "IN_PROGRESS", "BLOCKED", "TESTING"];

/** Roles offered as "affected by this change" — drives the release checklist. */
export const TICKET_AFFECTED_ROLE_OPTIONS: UserRole[] = ["MANAGER", "CLIENT", "SDR", "DEVELOPER"];

export type RoadmapBucket = "UPCOMING" | "IN_PROGRESS" | "DONE";

/** The 6 internal statuses collapse to the 3 columns the client sees. */
export const ROADMAP_BUCKET_BY_STATUS: Record<TicketStatus, RoadmapBucket> = {
    NEW: "UPCOMING",
    TODO: "UPCOMING",
    IN_PROGRESS: "IN_PROGRESS",
    BLOCKED: "IN_PROGRESS",
    TESTING: "IN_PROGRESS",
    COMPLETED: "DONE",
};

export const ROADMAP_BUCKET_LABELS: Record<RoadmapBucket, string> = {
    UPCOMING: "À venir",
    IN_PROGRESS: "En cours",
    DONE: "Terminé",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
    NEW: "Nouveau",
    TODO: "À faire",
    IN_PROGRESS: "En cours",
    BLOCKED: "Bloqué",
    TESTING: "En test",
    COMPLETED: "Terminé",
};

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
    BUG: "Bug",
    IMPROVEMENT: "Amélioration",
    FEATURE_REQUEST: "Nouvelle fonctionnalité",
    TECHNICAL_SUPPORT: "Support technique",
};

export const TICKET_SCOPE_LABELS: Record<TicketScope, string> = {
    INTERNAL: "Interne",
    CLIENT_FACING: "Client",
    MISSION_RELATED: "Mission",
};

export const TICKET_PRIORITY_LABELS: Record<TaskPriority, string> = {
    URGENT: "Urgente",
    HIGH: "Haute",
    MEDIUM: "Moyenne",
    LOW: "Basse",
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
    MANAGER: "Manager",
    DEVELOPER: "Développeur",
    CLIENT: "Client",
    SDR: "SDR",
    BOOKER: "Booker",
    BUSINESS_DEVELOPER: "Business Developer",
    COMMERCIAL: "Commercial",
};

export function formatTicketRef(number: number): string {
    return `#TC-${String(number).padStart(4, "0")}`;
}
