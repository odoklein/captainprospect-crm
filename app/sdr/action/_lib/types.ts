import type { Channel } from "@/lib/types";

// ============================================
// Shapes returned by the APIs the action cockpit reads.
// /api/sdr/action-queue is the source of truth for QueueItem.
// ============================================

export interface QueueContact {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedin?: string | null;
    status: string;
}

export interface QueueCompany {
    id: string;
    name: string;
    industry?: string | null;
    website?: string | null;
    country?: string | null;
    phone?: string | null;
}

export interface QueueLastAction {
    result: string;
    note?: string | null;
    createdAt?: string;
    callbackDate?: string | null;
    scope?: "CONTACT" | "COMPANY" | null;
}

export interface QueueActor {
    id: string;
    name: string | null;
}

export interface QueueItem {
    contactId: string | null;
    companyId: string;
    contact: QueueContact | null;
    company: QueueCompany;
    campaignId: string;
    channel: Channel | string;
    missionName: string;
    /** Commercial owning the row's list (or the mission default) — drives the booking calendar. */
    preferredInterlocuteurId?: string | null;
    preferredInterlocuteurIds?: string[] | null;
    lastAction: QueueLastAction | null;
    lastActionBy?: QueueActor | null;
    companyLastAction?: {
        result: string;
        note?: string | null;
        createdAt?: string;
        sdrId?: string | null;
        sdrName?: string | null;
    } | null;
    /** ABSENT_RDV | CALLBACK | FOLLOW_UP | NEW | RETRY — server-computed ordering bucket. */
    priority: string;
    hasContactInfo?: boolean;
}

export interface Mission {
    id: string;
    name: string;
    channel: string;
    client: { name: string };
    defaultMailboxId?: string | null;
}

export interface ListItem {
    id: string;
    name: string;
    mission: { id: string; name: string };
    contactsCount: number;
}

export interface TodayBlocks {
    todayBlocks: Array<{ id: string; startTime: string; endTime: string; mission: { id: string; name: string; channel: string } }>;
    todayMissionIds: string[];
    hasBlocksToday: boolean;
}

/** Subset of EffectiveStatusDefinition (lib/services/StatusConfigService) the UI needs. */
export interface StatusDefinition {
    code: string;
    label: string;
    color?: string | null;
    requiresNote: boolean;
    triggersCallback?: boolean;
    triggersExclusion?: boolean;
    priorityLabel?: string;
    sortOrder?: number;
}

export interface StatusConfig {
    statuses: StatusDefinition[];
}

/** Outcome logged from this page during the current session, keyed by row key. */
export interface DoneEntry {
    result: string | null;
    at: number;
}
