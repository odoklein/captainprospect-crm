// Response of GET /api/analytics/overview — everything the Statistiques page
// needs for one period AND the equal-length period right before it, so every
// figure can be shown with a real "vs période précédente" instead of a fake one.
//
// All counts are *call actions* (Action.channel = CALL). Phone-line metrics from
// Allo come separately (GET /api/analytics/telephony): they are slow and external.

/** What the page sends: Paris days, inclusive, plus the scope filters. */
export interface StatsFilters {
    start: string;
    end: string;
    sdrIds: string[];
    missionIds: string[];
    clientIds: string[];
    listIds: string[];
}

/** Counts of one slice (a period, an SDR, a mission, a day…). */
export interface Tally {
    /** Call actions logged. */
    calls: number;
    /** Calls where somebody was actually reached (not "no answer", not a bad number). */
    joined: number;
    /** Interested + callback families: prospects still to work. */
    hot: number;
    /** MEETING_BOOKED. */
    meetings: number;
    /** Sum of Action.duration, seconds. */
    seconds: number;
}

export interface PeriodSummary extends Tally {
    /** Raw result code → count, for the detailed breakdown. */
    byResult: Record<string, number>;
    /** Distinct contacts/companies called. */
    prospects: number;
}

export interface SeriesPoint {
    /** "yyyy-MM-dd" of the day, or of the Monday for weekly buckets. */
    key: string;
    label: string;
    calls: number;
    joined: number;
    meetings: number;
}

export interface SdrRow {
    id: string;
    name: string;
    role: string;
    current: Tally;
    previous: Tally;
}

export interface MissionRow {
    id: string;
    name: string;
    clientName: string;
    isActive: boolean;
    current: Tally;
    previous: Tally;
    sdrCount: number;
}

/** ISO weekday (1 = Monday … 7 = Sunday) × Paris hour. */
export interface HeatCell {
    dow: number;
    hour: number;
    calls: number;
    joined: number;
    meetings: number;
}

/** Fate of the RDV booked in the period, from the SAS confirmation. */
export interface RdvState {
    total: number;
    confirmed: number;
    pending: number;
    /** Rejected at the SAS (the action stays MEETING_BOOKED, see rdv-states-and-bilan). */
    rejected: number;
}

export interface StatsOverview {
    range: {
        start: string;
        end: string;
        days: number;
        prevStart: string;
        prevEnd: string;
        granularity: "day" | "week";
    };
    current: PeriodSummary;
    previous: PeriodSummary;
    series: SeriesPoint[];
    prevSeries: SeriesPoint[];
    sdrs: SdrRow[];
    missions: MissionRow[];
    heatmap: HeatCell[];
    rdv: RdvState;
}

/** GET /api/analytics/telephony — Allo line metrics, per SDR. */
export interface AlloSdrMetrics {
    alloCalls: number;
    connectedCalls: number;
    talkTimeSeconds: number;
}

export interface TelephonyResponse {
    /** false when ALLO_API_KEY is missing or no SDR has a line. */
    available: boolean;
    bySdr: Record<string, AlloSdrMetrics>;
    totals: AlloSdrMetrics;
}

export type InsightTone = "success" | "warning" | "danger" | "info";

export interface Insight {
    id: string;
    tone: InsightTone;
    title: string;
    detail: string;
    /** Page tab that backs the statement, so the card can link to the proof. */
    tab?: "equipe" | "cibles" | "journal";
}
