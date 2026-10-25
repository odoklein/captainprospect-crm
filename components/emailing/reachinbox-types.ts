export interface CampaignStats {
    sent: number;
    opened: number;
    replied: number;
    clicked: number;
    bounced: number;
    leads: number;
    // Rates come from ReachInbox (unique events / contacted leads).
    openRate: number;
    replyRate: number;
    clickRate: number;
    bounceRate: number;
}

export interface Campaign {
    id: string;
    name: string;
    status: string;
    createdAt: string | null;
    stats: CampaignStats;
    mailboxId?: string;
    mailboxEmail?: string;
    client?: { id: string; name: string } | null;
}

export interface DailyPoint {
    date: string;
    sent: number;
    opened: number;
    replied: number;
    clicked: number;
    bounced: number;
}

export interface Summary {
    sent: number;
    opened: number;
    replied: number;
    clicked: number;
    bounced: number;
    leads: number;
    opportunities: number;
    positiveReplies: number;
    negativeReplies?: number;
    automaticLeadReplies?: number;
    openRateTracked?: number;
    clickedRateTracked?: number;
    opportunitiesRate?: number;
    openRate: number;
    replyRate: number;
    clickRate: number;
    bounceRate: number;
}

export interface DashboardData {
    connected: boolean;
    connection: {
        id: string;
        email: string;
        displayName: string | null;
        lastSyncAt: string | null;
        lastError: string | null;
        createdAt: string;
    } | null;
    summary: Summary;
    daily: DailyPoint[];
    campaigns: Campaign[];
    warmup: { warmupSent: number; inboxPlacement: number; spamPlacement: number; healthScore: number } | null;
    errors: { mailboxEmail: string; message: string }[];
}

export interface CampaignAnalytics extends Summary {
    campaignId: string;
    campaignStatus: string;
    campaignOpportunityRate: number;
    sequenceStartedCount: number;
    uniqueEmailOpenedCount: number;
    uniqueLinkClickedCount: number;
    uniqueRepliesCount: number;
    daily: DailyPoint[];
    activity: unknown[];
    campaignStepAnalyticsResult: unknown[];
    subsequencesStepAnalyticsResults: unknown[];
}
