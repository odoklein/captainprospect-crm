/**
 * Shared types for client reporting (preview, export, PDF).
 * Single source of truth for report data shape.
 */

export interface ReportMission {
    id: string;
    name: string;
    isActive: boolean;
    objective: string | null;
    startDate: string;
    endDate: string;
    sdrCount: number;
}

/** GET /api/client/reporting/monthly-summary — feeds the report builder and the monthly history. */
export interface ReportingOverview {
    /** Earliest start of the client's visible missions (Paris day, YYYY-MM-DD). */
    launchDate: string | null;
    missions: Array<{ id: string; name: string; isActive: boolean }>;
    /** Oldest first, one entry per Paris month from launch to now, zero-filled. */
    months: Array<{
        /** YYYY-MM */
        key: string;
        meetings: number;
        calls: number;
        actions: number;
        contactsTouched: number;
    }>;
    generatedAt: string;
}

export interface ReportData {
    clientName: string;
    missionLabel: string;
    periodLabel: string;
    generatedDate: string;
    meetingsBooked: number;
    meetingsDelta?: number;
    contactsReached: number;
    qualifiedLeads: number;
    opportunities: number;
    conversionRate: number;
    deltas?: [number | null, number | null, number | null, number | null];
    meetingsByPeriod: Array<{ label: string; count: number }>;
    missions: ReportMission[];
}
