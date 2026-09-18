import type { TaskPriority, TicketCategory, TicketScope, TicketStatus, UserRole } from "@prisma/client";

export type { TaskPriority, TicketCategory, TicketScope, TicketStatus, UserRole };

interface UserRef {
    id: string;
    name: string;
    role?: UserRole;
    email?: string;
}

export interface TicketListItem {
    id: string;
    number: number;
    title: string;
    category: TicketCategory;
    scope: TicketScope;
    status: TicketStatus;
    priority: TaskPriority;
    affectedRoles: UserRole[];
    dueDate: string | null;
    completedAt: string | null;
    updatedAt: string;
    createdAt: string;
    publishToRoadmap: boolean;
    assigneeId: string | null;
    requester: UserRef;
    assignee: UserRef | null;
    client: { id: string; name: string } | null;
    _count: { comments: number; attachments: number };
}

export interface TicketComment {
    id: string;
    content: string;
    createdAt: string;
    user: UserRef;
}

export interface TicketHistoryEntry {
    id: string;
    field: string;
    fromValue: string | null;
    toValue: string | null;
    createdAt: string;
    user: UserRef;
}

export interface TicketReleaseCheck {
    id: string;
    role: UserRole;
    checked: boolean;
    checkedAt: string | null;
    notes: string | null;
    checkedBy: { id: string; name: string } | null;
}

export interface TicketAttachment {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    url: string | null;
    createdAt: string;
}

export interface TicketDetail extends Omit<TicketListItem, "_count"> {
    description: string | null;
    publicTitle: string | null;
    publicDescription: string | null;
    missionId: string | null;
    mission: { id: string; name: string } | null;
    comments: TicketComment[];
    history: TicketHistoryEntry[];
    releaseChecks: TicketReleaseCheck[];
    attachments: TicketAttachment[];
}

export interface TicketDashboardCounts {
    urgent: number;
    blocked: number;
    active: number;
    overdue: number;
}
