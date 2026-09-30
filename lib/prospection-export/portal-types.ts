/**
 * Payload of the client portal "Base de données" page. Types only — imported
 * by both the API routes and the client component.
 *
 * Deliberately simplified vs. the manager export: no internal notes, AI call
 * summaries or SDR names reach the client.
 */

/**
 * Where a line stands, in words a client understands. Derived from the
 * mission's status config (see portal.ts), ranked from worst to best.
 */
export type PortalStage = "untreated" | "closed" | "in_progress" | "callback" | "opportunity" | "meeting";

export const PORTAL_STAGE_ORDER: PortalStage[] = ["meeting", "opportunity", "callback", "in_progress", "closed", "untreated"];

export const STAGE_RANK: Record<PortalStage, number> = {
    untreated: 0,
    closed: 1,
    in_progress: 2,
    callback: 3,
    opportunity: 4,
    meeting: 5,
};

export const PORTAL_STAGE_LABELS: Record<PortalStage, string> = {
    meeting: "RDV obtenu",
    opportunity: "Intérêt",
    callback: "À rappeler",
    in_progress: "En cours",
    closed: "Sans suite",
    untreated: "À traiter",
};

export interface PortalTreatment {
    stage: PortalStage;
    treated: boolean;
    lastResult: string | null;
    lastResultLabel: string;
    actionCount: number;
    callCount: number;
    /** A still-valid meeting was booked (not cancelled afterwards). */
    meetingBooked: boolean;
    /** ISO dates */
    lastActionAt: string | null;
    nextCallbackAt: string | null;
    meetingAt: string | null;
}

export interface PortalContact {
    id: string;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    excludedAt: string | null;
    exclusionId: string | null;
    treatment: PortalTreatment;
}

export interface PortalCompany {
    id: string;
    name: string;
    industry: string | null;
    country: string | null;
    size: string | null;
    phone: string | null;
    website: string | null;
    excludedAt: string | null;
    exclusionId: string | null;
    missionName: string;
    listName: string;
    contacts: PortalContact[];
    /**
     * Company-level rollup: the best stage reached by any of its lines (a
     * meeting with one contact beats a refusal from another), counts of
     * distinct actions on the company, and the latest contact date overall.
     */
    treatment: PortalTreatment;
}

export interface PortalExclusion {
    id: string;
    reason: string;
    target: string;
    createdAt: string;
    expiresAt: string | null;
}

export interface PortalActivityWeek {
    /** Monday of the week, YYYY-MM-DD (Paris). */
    week: string;
    actions: number;
    meetings: number;
}

export interface PortalDatabaseResponse {
    companies: PortalCompany[];
    exclusions: PortalExclusion[];
    /** Oldest first, fixed length, zero-filled. */
    activity: PortalActivityWeek[];
    generatedAt: string;
}

export interface PortalTimelineEntry {
    id: string;
    at: string;
    channel: "CALL" | "EMAIL" | "LINKEDIN";
    label: string;
    stage: PortalStage;
    contactName: string | null;
    /** Scheduled callback / meeting date, when one was set. */
    scheduledAt: string | null;
}

export interface PortalCompanyTimelineResponse {
    timeline: PortalTimelineEntry[];
    /** True when older entries were cut off. */
    truncated: boolean;
}
