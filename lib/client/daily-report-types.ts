/**
 * "Rapport de la veille" (client portal) — shared shapes, safe to import from
 * client components (no Prisma here). Built by lib/client/daily-report.ts.
 */

export type OutcomeKey = "meeting" | "interested" | "callback" | "noReach" | "refusal" | "dataIssue" | "other";

export interface DailyReportMeeting {
    id: string;
    bookedAt: string;
    /** Scheduled RDV date (null = to be confirmed). */
    date: string | null;
    meetingType: string | null;
    company: string;
    contact: string | null;
    title: string | null;
    mission: string | null;
    commercial: { id: string; name: string } | null;
}

export interface DailyTotals {
    calls: number;
    /** Calls that reached someone (not "no answer", gatekeeper or bad data). */
    conversations: number;
    /** Distinct prospects with an interested / callback / RDV outcome. */
    qualified: number;
    /** RDV booked that day and confirmed (SAS RDV). */
    meetings: number;
    /** Distinct prospects worked. */
    prospects: number;
}

export interface DailyTrendPoint extends DailyTotals {
    /** Local day, YYYY-MM-DD. */
    day: string;
}

export type HighlightTone = "positive" | "neutral" | "attention";

export interface DailyHighlight {
    tone: HighlightTone;
    text: string;
}

export interface DailyReport {
    day: string;
    previousDay: string | null;
    totals: DailyTotals;
    previous: DailyTotals | null;
    /** Share of calls that reached someone, 0-100 (null when no calls). */
    reachRate: number | null;
    sdrCount: number;
    activeMissions: number;
    /** Last 7 working days, oldest first, ending on `day`. */
    trend: DailyTrendPoint[];
    outcomes: Array<{ key: OutcomeKey; label: string; count: number }>;
    month: { meetings: number; objective: number | null; label: string };
    meetingsBooked: DailyReportMeeting[];
    todayMeetings: DailyReportMeeting[];
    byCommercial: Array<{ id: string; name: string; booked: number; today: number }>;
    byMission: Array<{ id: string; name: string; calls: number; meetings: number }>;
    highlights: DailyHighlight[];
}

export interface DailyInsight {
    source: "ai" | "rules";
    headline: string;
    summary: string;
    recommendation: string;
}
