// Response of GET /api/manager/home/period — the figures the manager home used
// to fake: the RDV trend (sparkline + progression), the "vs période précédente"
// comparison and the recent-RDV feed. Headline numbers, results, leaderboard and
// missions still come from /api/stats and /api/stats/missions-summary.

export interface PeriodTotals {
    actions: number;
    meetings: number;
    /** Interested + callback families (INTERESTED, PROJET_A_SUIVRE, CALLBACK_REQUESTED, RAPPEL, RELANCE). */
    hotLeads: number;
}

export interface PeriodBucket {
    /** "yyyy-MM-dd" of the day, or of the Monday for weekly buckets. */
    key: string;
    label: string;
    actions: number;
    meetings: number;
}

export interface RecentMeeting {
    id: string;
    createdAt: string;
    /** Scheduled meeting date (Action.callbackDate on a MEETING_BOOKED action). */
    meetingAt: string | null;
    sdrName: string;
    contactName: string | null;
    companyName: string | null;
    missionName: string | null;
    confirmationStatus: "PENDING" | "CONFIRMED" | "CANCELLED";
}

export interface ManagerHomePeriod {
    range: {
        start: string;
        end: string;
        days: number;
        prevStart: string;
        prevEnd: string;
        granularity: "day" | "week";
    };
    current: PeriodTotals;
    previous: PeriodTotals;
    series: PeriodBucket[];
    recentMeetings: RecentMeeting[];
}
