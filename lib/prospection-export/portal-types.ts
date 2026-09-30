/**
 * Payload of the client portal "Base de données" page. Types only — imported
 * by both the API routes and the client component.
 *
 * Deliberately simplified vs. the manager export: no internal notes, AI call
 * summaries or SDR names reach the client.
 */

export interface PortalTreatment {
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
     * Company-level rollup: counts are distinct actions on the company,
     * lastActionAt is the latest across contacts, and the status is the booked
     * meeting when there is one (the client's real win), else the latest line.
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

export interface PortalDatabaseResponse {
    companies: PortalCompany[];
    exclusions: PortalExclusion[];
}

export type PortalTimelineKind = "meeting" | "callback" | null;

export interface PortalTimelineEntry {
    id: string;
    at: string;
    channel: "CALL" | "EMAIL" | "LINKEDIN";
    label: string;
    contactName: string | null;
    kind: PortalTimelineKind;
    /** Scheduled callback / meeting date, when one was set. */
    scheduledAt: string | null;
}

export interface PortalCompanyTimelineResponse {
    timeline: PortalTimelineEntry[];
    /** True when older entries were cut off. */
    truncated: boolean;
}
