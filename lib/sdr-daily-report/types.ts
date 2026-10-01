/** Structured part of an SDR end-of-day report, as the API returns it. */
export interface StructuredReportFields {
    reachability: string[];
    prospectReturns: string[];
    pitchFeeling: string[];
    mainBlocker: string | null;
    fieldComment: string | null;
}

/** Response of GET /api/sdr/daily-feedback. */
export interface DailyReportStatus {
    /** Europe/Paris day the status is about, "YYYY-MM-DD". */
    reportDate: string;
    /** "HH:mm" after which the report is owed. */
    promptTime: string;
    /** Owed at all today: preference on, and the SDR is planned or has acted. */
    required: boolean;
    report: (StructuredReportFields & {
        id: string;
        submittedAt: string;
        missionIds: string[];
    }) | null;
    /** Missions the SDR is planned on today, to tag the report with. */
    missions: Array<{ id: string; name: string; client: { name: string } | null }>;
}
