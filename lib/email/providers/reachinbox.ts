// ============================================
// REACHINBOX PROVIDER
// API-key based provider for ReachInbox Onebox.
// ============================================

import { EmailProvider } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
    Draft,
    EmailMessageData,
    EmailThreadData,
    IEmailProvider,
    OAuthTokens,
    SendEmailParams,
    SendResult,
    SyncOptions,
    SyncResult,
    WebhookConfig,
    WebhookPayload,
} from './types';

const DEFAULT_REACHINBOX_API_BASE = 'https://api.reachinbox.ai/api/v1';

type ReachInboxRecord = Record<string, unknown>;

/** Normalized campaign summary returned by listCampaigns(). */
export interface ReachInboxCampaignSummary {
    id: string;
    name: string;
    status: string;
    createdAt: string | null;
    stats: {
        sent: number;
        opened: number;
        replied: number;
        clicked: number;
        bounced: number;
        leads: number;
        // Rates as ReachInbox reports them (percentages, e.g. 50.7).
        // ReachInbox divides unique events by contacted leads, not by
        // emails sent — never recompute these client-side.
        openRate: number;
        replyRate: number;
        clickRate: number;
        bounceRate: number;
    };
}

export interface ReachInboxAnalyticsSummary {
    sent: number;
    opened: number;
    replied: number;
    clicked: number;
    bounced: number;
    leads: number;
    opportunities: number;
    positiveReplies: number;
    negativeReplies: number;
    automaticLeadReplies: number;
    openRateTracked: number;
    clickedRateTracked: number;
    opportunitiesRate: number;
    userOpportunityRate: number;
    openRate: number;
    replyRate: number;
    clickRate: number;
    bounceRate: number;
    daily: Array<{
        date: string;
        sent: number;
        opened: number;
        replied: number;
        clicked: number;
        bounced: number;
    }>;
}

export interface ReachInboxCampaignAnalytics extends ReachInboxAnalyticsSummary {
    campaignId: string;
    campaignStatus: string;
    campaignOpportunityRate: number;
    sequenceStartedCount: number;
    uniqueEmailOpenedCount: number;
    uniqueLinkClickedCount: number;
    uniqueRepliesCount: number;
    activity: unknown[];
    campaignStepAnalyticsResult: unknown[];
    subsequencesStepAnalyticsResults: unknown[];
}

export interface ReachInboxWarmupSummary {
    warmupSent: number;
    inboxPlacement: number;
    spamPlacement: number;
    healthScore: number;
}

const SENT_KEYS = [
    'sent',
    'sentCount',
    'emailSentCount',
    'sentEmailCount',
    'emailsSent',
    'emailsSentCount',
    'totalSent',
    'totalEmailSent',
    'totalEmailsSent',
    'totalSentEmails',
    'sent_count',
    'total_email_sent',
];
// Leads actually contacted (sequences started). This is the denominator
// ReachInbox uses for open/reply/click/bounce rates. Kept separate from
// SENT_KEYS so "emails sent" never bleeds into "leads contacted".
const CONTACTED_LEADS_KEYS = [
    'sequenceStartedCount',
    'sequence_started_count',
    'totalUsersContacted',
    'total_users_contacted',
    'contactedLeads',
    'contacted_leads',
    'leadsContacted',
    'uniqueLeadsReachedOut',
    'unique_leads_reached_out',
];
const OPENED_KEYS = [
    'opened',
    'open',
    'opens',
    'openCount',
    'openedCount',
    'emailOpenedCount',
    'uniqueEmailOpenedCount',
    'totalEmailOpenedCount',
    'totalEmailOpened',
    'totalOpens',
    'totalUniqueEmailOpened',
    'totalUniqueOpen',
    'uniqueEmailOpened',
    'uniqueOpens',
    'opened_count',
    'unique_email_opened_count',
];
const REPLIED_KEYS = [
    'replied',
    'reply',
    'replies',
    'replyCount',
    'repliesCount',
    'uniqueRepliesCount',
    'totalReplies',
    'totalEmailReplied',
    'uniqueReplies',
    'reply_count',
    'unique_replies_count',
];
const CLICKED_KEYS = [
    'clicked',
    'click',
    'clicks',
    'clickCount',
    'clickedCount',
    'linkClickedCount',
    'uniqueLinkClickedCount',
    'totalLinkClickedCount',
    'totalLinkClicked',
    'linksClicked',
    'totalClicks',
    'uniqueClicks',
    'click_count',
    'unique_link_clicked_count',
];
const BOUNCED_KEYS = [
    'bounced',
    'bounce',
    'bounces',
    'bounceCount',
    'bouncedCount',
    'emailBouncedCount',
    'totalEmailBounced',
    'emailBounced',
    'totalBounces',
    'bounce_count',
];
const LEAD_KEYS = [
    'leads',
    'leadCount',
    'leadsCount',
    'leadAddedCount',
    'leadsContacted',
    'totalLeads',
    'contactsCount',
    'prospects',
    'uniqueLeadsReachedOut',
    'sequenceStartedCount',
];
const OPPORTUNITY_KEYS = ['opportunities', 'opportunityCount', 'totalOpportunities', 'opportunitiesCount'];
const POSITIVE_REPLY_KEYS = ['positiveReplies', 'positive_replies', 'positiveReplyCount', 'positiveRepliesCount'];
const NEGATIVE_REPLY_KEYS = ['negativeReplies', 'negative_replies', 'negativeReplyCount', 'negativeRepliesCount'];
const AUTOMATIC_REPLY_KEYS = ['automaticLeadReplies', 'automatic_lead_replies', 'automaticReplies', 'automaticReplyCount'];
const OPEN_RATE_KEYS = ['openRate', 'open_rate', 'openedRate', 'openPercentage'];
const REPLY_RATE_KEYS = ['replyRate', 'reply_rate', 'repliedRate', 'replyPercentage'];
const CLICK_RATE_KEYS = ['clickRate', 'click_rate', 'clickedRate', 'clickPercentage'];
const BOUNCE_RATE_KEYS = ['bounceRate', 'bounce_rate', 'bouncedRate', 'bouncePercentage'];
const OPEN_RATE_TRACKED_KEYS = ['openRateTracked', 'open_rate_tracked', 'trackedOpenRate', 'tracked_open_rate'];
const CLICK_RATE_TRACKED_KEYS = ['clickedRateTracked', 'clicked_rate_tracked', 'clickRateTracked', 'trackedClickRate', 'tracked_click_rate'];
const OPPORTUNITY_RATE_KEYS = ['opportunitiesRate', 'opportunityRate', 'opportunity_rate', 'opportunities_rate'];
const USER_OPPORTUNITY_RATE_KEYS = ['userOpportunityRate', 'user_opportunity_rate'];
const CAMPAIGN_OPPORTUNITY_RATE_KEYS = ['campaignOpportunityRate', 'campaign_opportunity_rate', ...OPPORTUNITY_RATE_KEYS];

export class ReachInboxProvider implements IEmailProvider {
    provider = 'REACHINBOX' as EmailProvider;
    private readonly baseUrl: string;

    constructor(baseUrl = process.env.REACHINBOX_API_BASE || DEFAULT_REACHINBOX_API_BASE) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    getAuthUrl(): string {
        throw new Error('ReachInbox uses API key authentication');
    }

    async handleCallback(): Promise<OAuthTokens> {
        throw new Error('ReachInbox uses API key authentication');
    }

    async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
        return { accessToken: refreshToken };
    }

    async validateTokens(tokens: OAuthTokens): Promise<boolean> {
        try {
            await this.request<unknown>(tokens, '/account', { method: 'GET' });
            return true;
        } catch {
            return false;
        }
    }

    async syncMailbox(tokens: OAuthTokens, options?: SyncOptions): Promise<{
        threads: EmailThreadData[];
        syncResult: SyncResult;
    }> {
        const offset = options?.pageToken ? Number(options.pageToken) || 0 : 0;
        const limit = options?.maxResults || 50;

        const response = await this.request<ReachInboxRecord>(tokens, '/onebox/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                limit,
                offset,
                status: 'All',
                inbox: 'Inbox',
                campaigns: [],
                emailIds: [],
                excludeCampaigns: [],
                excludeEmails: [],
                q: '',
            }),
        });

        const items = this.extractArray(response);
        const threads = items.map((item) => this.mapOneboxItemToThread(item));

        return {
            threads,
            syncResult: {
                success: true,
                threadsAdded: threads.length,
                threadsUpdated: 0,
                messagesAdded: threads.reduce((sum, thread) => sum + thread.messages.length, 0),
                messagesUpdated: 0,
                nextPageToken: String(offset + limit),
            },
        };
    }

    async getThread(tokens: OAuthTokens, threadId: string): Promise<EmailThreadData | null> {
        const { accountId, messageId } = this.parseThreadId(threadId);
        const response = await this.request<ReachInboxRecord>(tokens, '/onebox/thread', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...(accountId && { account: accountId }),
                id: messageId,
            }),
        });
        const items = this.extractArray(response);

        if (items.length === 0 && response) {
            return this.mapOneboxItemToThread(response);
        }

        if (items.length === 0) return null;

        const messages = items.map((item) => this.mapOneboxItemToMessage(item));
        const first = items[0];

        return {
            id: this.buildThreadId(first),
            subject: this.getString(first.subject || first.emailSubject || first.title) || '(Sans objet)',
            snippet: this.getString(first.snippet || first.preview || first.bodyText || first.body),
            participants: this.extractParticipants(items),
            messages,
            lastMessageAt: this.getDate(first.date || first.createdAt || first.sentAt),
            isRead: Boolean(first.isRead ?? first.read),
            labels: Array.isArray(first.labels) ? first.labels : [],
        };
    }

    async getMessage(tokens: OAuthTokens, messageId: string): Promise<EmailMessageData | null> {
        const thread = await this.getThread(tokens, messageId);
        return thread?.messages.find((message) => message.id === messageId) || thread?.messages[0] || null;
    }

    async sendEmail(tokens: OAuthTokens, params: SendEmailParams): Promise<SendResult> {
        const payload: ReachInboxRecord = {
            to: params.to.map((recipient) => recipient.email),
            from: params.from?.email,
            cc: params.cc?.map((recipient) => recipient.email),
            bcc: params.bcc?.map((recipient) => recipient.email),
            subject: params.subject,
            body: params.bodyHtml || params.bodyText || '',
            references: params.threadId ? [params.threadId] : undefined,
            inReplyTo: params.inReplyTo,
            originalMessageId: params.threadId,
        };

        Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

        const formData = new FormData();
        formData.append('emaildata', JSON.stringify(payload));

        for (const attachment of params.attachments || []) {
            if (!attachment.content) continue;
            formData.append(
                'file',
                new Blob([new Uint8Array(attachment.content)], { type: attachment.mimeType }),
                attachment.filename,
            );
        }

        const response = await this.request<ReachInboxRecord>(tokens, '/onebox/send', {
            method: 'POST',
            body: formData,
        });

        const responseData = this.asRecord(response?.data);
        const messageId = this.getString(response?.id || response?.messageId || responseData?.id);
        const providerThreadId = this.getString(response?.threadId || responseData?.threadId || messageId);

        return {
            success: true,
            messageId,
            threadId: providerThreadId,
        };
    }

    async saveDraft(): Promise<Draft> {
        throw new Error('ReachInbox drafts are not supported yet');
    }

    async updateDraft(): Promise<Draft> {
        throw new Error('ReachInbox drafts are not supported yet');
    }

    async deleteDraft(): Promise<boolean> {
        return false;
    }

    async markAsRead(): Promise<void> {
        return;
    }

    async markAsUnread(): Promise<void> {
        return;
    }

    async archive(): Promise<void> {
        return;
    }

    async trash(): Promise<void> {
        return;
    }

    async star(): Promise<void> {
        return;
    }

    async setupWebhook(): Promise<WebhookConfig> {
        throw new Error('Configure ReachInbox webhooks from the ReachInbox dashboard');
    }

    async stopWebhook(): Promise<void> {
        return;
    }

    parseWebhookPayload(payload: unknown): WebhookPayload | null {
        if (!payload || typeof payload !== 'object') return null;
        const data = payload as ReachInboxRecord;
        const account = this.asRecord(data.account);
        const nestedData = this.asRecord(data.data);
        const source = nestedData || data;
        const sourceAccount = this.asRecord(source.account);
        const mailboxEmail = this.getString(
            source.email_account
            || source.emailAccount
            || source.mailboxEmail
            || source.accountEmail
            || source.email
            || sourceAccount?.email
            || account?.email,
        );
        if (!mailboxEmail) return null;

        const messageId = this.getString(
            source.message_id
            || source.messageId
            || source.email_id
            || source.emailId
            || source.id,
        );

        return {
            mailboxEmail,
            messageIds: messageId ? [messageId] : undefined,
            action: this.mapWebhookAction(source.event || source.type || data.event || data.type),
        };
    }

    async getUserProfile(tokens: OAuthTokens): Promise<{ email: string; name?: string; picture?: string }> {
        const response = await this.request<ReachInboxRecord>(tokens, '/account', { method: 'GET' });
        const firstAccount = Array.isArray(response?.data) ? this.asRecord(response.data[0]) : response;
        const email = this.getString(firstAccount?.email || response?.email);

        return {
            email: email || 'reachinbox-account',
            name: this.getString(firstAccount?.name || response?.name),
            picture: this.getString(firstAccount?.picture || response?.picture),
        };
    }

    async search(tokens: OAuthTokens, query: string, options?: {
        maxResults?: number;
        pageToken?: string;
    }): Promise<{ threads: EmailThreadData[]; nextPageToken?: string }> {
        const offset = options?.pageToken ? Number(options.pageToken) || 0 : 0;
        const limit = options?.maxResults || 50;

        const response = await this.request<ReachInboxRecord>(tokens, '/onebox/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                limit,
                offset,
                status: 'All',
                inbox: 'Inbox',
                campaigns: [],
                emailIds: [],
                excludeCampaigns: [],
                excludeEmails: [],
                q: query,
            }),
        });

        return {
            threads: this.extractArray(response).map((item) => this.mapOneboxItemToThread(item)),
            nextPageToken: String(offset + limit),
        };
    }

    /**
     * List campaigns with their aggregate stats.
     * ReachInbox exposes campaigns on slightly different paths depending on
     * plan/version, so several endpoints are tried and fields are parsed
     * defensively (same philosophy as the onebox mapping above).
     */
    async listCampaigns(tokens: OAuthTokens): Promise<ReachInboxCampaignSummary[]> {
        const primaryEndpoints = [
            '/campaigns/all?sort=newest&offset=0&limit=200&filter=All',
            '/campaigns/all?sort=newest&offset=0&limit=200&filter=Active',
            '/campaigns/all?sort=newest&offset=0&limit=200',
        ];
        const fallbackEndpoints = [
            '/campaigns?sort=newest&offset=0&limit=200&filter=All',
            '/campaigns/all?sort=newest&offset=0&limit=200&filter=Paused',
            '/campaigns/all?sort=newest&offset=0&limit=200&filter=Completed',
            '/campaigns/all?sort=newest&offset=0&limit=200&filter=Stopped',
            '/campaigns?sort=newest&offset=0&limit=200&filter=Active',
            '/campaigns?sort=newest&offset=0&limit=200',
            '/campaign/all?sort=newest&offset=0&limit=200&filter=Active',
        ];

        const campaigns = new Map<string, ReachInboxCampaignSummary>();
        let lastError: Error | null = null;
        for (const endpoint of primaryEndpoints) {
            try {
                const response = await this.request<ReachInboxRecord>(tokens, endpoint, { method: 'GET' });
                for (const item of this.extractCampaignArray(response)) {
                    const campaign = this.mapCampaign(item);
                    campaigns.set(campaign.id, campaign);
                }
                if (campaigns.size > 0) return Array.from(campaigns.values());
            } catch (err) {
                lastError = err as Error;
            }
        }

        for (const endpoint of fallbackEndpoints) {
            try {
                const response = await this.request<ReachInboxRecord>(tokens, endpoint, { method: 'GET' });
                for (const item of this.extractCampaignArray(response)) {
                    const campaign = this.mapCampaign(item);
                    campaigns.set(campaign.id, campaign);
                }
            } catch (err) {
                lastError = err as Error;
            }
        }
        if (campaigns.size === 0) {
            try {
                const response = await this.request<ReachInboxRecord>(
                    tokens,
                    `/analytics/summary?startDate=${encodeURIComponent(this.daysAgoParam(365))}&endDate=${encodeURIComponent(this.todayParam())}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            campaignIds: [],
                            excludeIds: [],
                        }),
                    },
                );
                for (const item of this.extractCampaignArray(response)) {
                    const campaign = this.mapCampaign(item);
                    campaigns.set(campaign.id, campaign);
                }
            } catch (err) {
                lastError = err as Error;
            }
        }
        if (campaigns.size === 0 && lastError) {
            throw lastError ?? new Error('Impossible de charger les campagnes ReachInbox');
        }

        return Array.from(campaigns.values());
    }

    async getAnalyticsSummary(tokens: OAuthTokens, params: {
        startDate: string;
        endDate: string;
        campaignIds?: string[];
    }): Promise<ReachInboxAnalyticsSummary> {
        const response = await this.request<ReachInboxRecord>(
            tokens,
            `/analytics/summary?startDate=${encodeURIComponent(params.startDate)}&endDate=${encodeURIComponent(params.endDate)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaignIds: params.campaignIds ?? [],
                    excludeIds: [],
                }),
            },
        );

        return this.mapAnalyticsSummary(response);
    }

    async getCampaignAnalytics(tokens: OAuthTokens, params: {
        campaignId: string;
        startDate: string;
        endDate: string;
    }): Promise<ReachInboxCampaignAnalytics> {
        const campaignIdNumber = Number(params.campaignId);
        const campaignId = Number.isFinite(campaignIdNumber) ? campaignIdNumber : params.campaignId;
        const endpoint = `/analytics?startDate=${encodeURIComponent(params.startDate)}&endDate=${encodeURIComponent(params.endDate)}`;
        const bodies: ReachInboxRecord[] = [
            {
                campaignId,
                campaignAnalyticsRequired: true,
                includeSubsequenceIds: [],
                excludeSubsequenceIds: [],
                filter: 'none',
            },
            {
                campaignId,
                campaignAnalyticsRequired: true,
                includeSubsequenceIds: [],
                excludeSubsequenceIds: [],
            },
            {
                campaignId: params.campaignId,
                campaignAnalyticsRequired: true,
                includeSubsequenceIds: [],
                excludeSubsequenceIds: [],
            },
        ];

        let lastError: Error | null = null;
        for (const body of bodies) {
            try {
                const response = await this.request<ReachInboxRecord>(tokens, endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });

                return this.mapCampaignAnalytics(params.campaignId, response);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
            }
        }

        try {
            const summary = await this.getAnalyticsSummary(tokens, {
                startDate: params.startDate,
                endDate: params.endDate,
                campaignIds: [params.campaignId],
            });

            return this.mapCampaignAnalyticsFromSummary(params.campaignId, summary);
        } catch {
            throw lastError ?? new Error('Analytics ReachInbox indisponibles');
        }
    }

    async getWarmupAnalytics(tokens: OAuthTokens): Promise<ReachInboxWarmupSummary | null> {
        try {
            const response = await this.request<ReachInboxRecord>(tokens, '/analytics/warmup-analytics', {
                method: 'GET',
            });
            const first = Array.isArray(response.data) ? this.asRecord(response.data[0]) : null;
            const source = first || this.asRecord(response.data) || response;
            const aggregates = this.asRecord(source.aggregates) || source;
            return {
                warmupSent: this.getNumber(aggregates.warmupSent ?? aggregates.warmup_sent ?? aggregates.sent ?? aggregates.totalSent ?? aggregates.warmupEmailSentCount),
                inboxPlacement: this.getNumber(aggregates.inboxPlacement ?? aggregates.inbox_placement ?? aggregates.inbox ?? aggregates.inboxPercentage ?? aggregates.landedOnInboxCount),
                spamPlacement: this.getNumber(aggregates.spamPlacement ?? aggregates.spam_placement ?? aggregates.spam ?? aggregates.spamPercentage ?? aggregates.landedOnSpamCount),
                healthScore: this.getNumber(aggregates.healthScore ?? aggregates.health_score ?? aggregates.score),
            };
        } catch {
            return null;
        }
    }

    private mapCampaign(item: ReachInboxRecord): ReachInboxCampaignSummary {
        const nestedCampaign = this.asRecord(item.campaign);
        const emailStats = this.asRecord(item.emails);
        const statsSource = this.asRecord(item.stats) || this.asRecord(item.analytics) || this.asRecord(item.metrics) || item;
        const createdAt = this.getString(item.createdAt || item.created_at || item.startDate || item.start_date);

        const sent = this.pickNumber([statsSource, emailStats], SENT_KEYS);
        const opened = this.pickNumber([statsSource, emailStats], OPENED_KEYS);
        const replied = this.pickNumber([statsSource, emailStats], REPLIED_KEYS);
        const clicked = this.pickNumber([statsSource, emailStats], CLICKED_KEYS);
        const bounced = this.pickNumber([statsSource, emailStats], BOUNCED_KEYS);
        const leads = this.pickNumber([statsSource, emailStats], [...CONTACTED_LEADS_KEYS, ...LEAD_KEYS]);
        // ReachInbox rates are relative to contacted leads, not emails sent.
        const rateBase = leads || sent;

        return {
            id: this.getString(
                item.id
                || item._id
                || item.campaignId
                || item.campaign_id
                || item.campaignID
                || item.campaign_id_str
                || item.sequenceId
                || item.sequence_id
                || nestedCampaign?.id
                || nestedCampaign?._id
                || nestedCampaign?.campaignId
                || nestedCampaign?.campaign_id,
            ) || randomUUID(),
            name: this.getString(item.name || item.campaignName || item.campaign_name || item.title || nestedCampaign?.name || nestedCampaign?.campaignName) || 'Campagne sans nom',
            status: (this.getString(item.status || item.state || item.campaignStatus || item.campaign_status || nestedCampaign?.status) || 'UNKNOWN').toUpperCase(),
            createdAt: createdAt ?? null,
            stats: {
                sent,
                opened,
                replied,
                clicked,
                bounced,
                leads,
                openRate: this.pickRateNumber([statsSource, emailStats], OPEN_RATE_KEYS) || this.rate(opened, rateBase),
                replyRate: this.pickRateNumber([statsSource, emailStats], REPLY_RATE_KEYS) || this.rate(replied, rateBase),
                clickRate: this.pickRateNumber([statsSource, emailStats], CLICK_RATE_KEYS) || this.rate(clicked, rateBase),
                bounceRate: this.pickRateNumber([statsSource, emailStats], BOUNCE_RATE_KEYS) || this.rate(bounced, rateBase),
            },
        };
    }

    private mapAnalyticsSummary(response: ReachInboxRecord): ReachInboxAnalyticsSummary {
        const responseData = this.asRecord(response.data);
        const nestedData = this.asRecord(responseData?.data);
        const resultRecord = this.asRecord(response.result) || this.asRecord(responseData?.result) || this.asRecord(nestedData?.result);
        const data = responseData || resultRecord || response;
        const totals = this.pickRecord([
            this.asRecord(data.summary),
            this.asRecord(data.total),
            this.asRecord(data.totals),
            this.asRecord(data.overall),
            this.asRecord(data.analytics),
            this.asRecord(data.metrics),
            this.asRecord(data.stats),
            this.asRecord(data.aggregate),
            resultRecord,
            nestedData,
            data,
            response,
        ]) || data;
        const metricSources = [
            totals,
            this.asRecord(totals.summary),
            this.asRecord(totals.total),
            this.asRecord(totals.totals),
            this.asRecord(totals.overall),
            this.asRecord(totals.analytics),
            this.asRecord(totals.metrics),
            this.asRecord(totals.stats),
            nestedData,
            data,
            response,
        ];

        const dailySource = this.pickArray([
            data.result,
            data.daily,
            data.dailyAnalytics,
            data.analytics,
            data.graphData,
            data.timeSeries,
            data.timeline,
            nestedData?.result,
            nestedData?.daily,
            response.result,
        ]);

        const daily = dailySource
            .map((entry) => this.asRecord(entry))
            .filter((entry): entry is ReachInboxRecord => Boolean(entry))
            .map((entry) => ({
                date: this.getString(entry.date || entry.day || entry.createdAt) || '',
                sent: this.pickNumber([entry], SENT_KEYS),
                opened: this.pickNumber([entry], OPENED_KEYS),
                replied: this.pickNumber([entry], REPLIED_KEYS),
                clicked: this.pickNumber([entry], CLICKED_KEYS),
                bounced: this.pickNumber([entry], BOUNCED_KEYS),
            }))
            .filter((entry) => entry.date);

        const sent = this.pickNumber(metricSources, SENT_KEYS)
            || daily.reduce((sum, entry) => sum + entry.sent, 0);

        const opened = this.pickNumber(metricSources, OPENED_KEYS)
            || daily.reduce((sum, entry) => sum + entry.opened, 0);
        const replied = this.pickNumber(metricSources, REPLIED_KEYS)
            || daily.reduce((sum, entry) => sum + entry.replied, 0);
        const clicked = this.pickNumber(metricSources, CLICKED_KEYS)
            || daily.reduce((sum, entry) => sum + entry.clicked, 0);
        const bounced = this.pickNumber(metricSources, BOUNCED_KEYS)
            || daily.reduce((sum, entry) => sum + entry.bounced, 0);
        const leads = this.pickNumber(metricSources, [...CONTACTED_LEADS_KEYS, ...LEAD_KEYS]);
        // ReachInbox rates divide by contacted leads; emails sent is only a
        // last-resort denominator when the API returns no lead count at all.
        const rateBase = leads || sent;

        return {
            sent,
            opened,
            replied,
            clicked,
            bounced,
            leads,
            opportunities: this.pickNumber(metricSources, OPPORTUNITY_KEYS),
            positiveReplies: this.pickNumber(metricSources, POSITIVE_REPLY_KEYS),
            negativeReplies: this.pickNumber(metricSources, NEGATIVE_REPLY_KEYS),
            automaticLeadReplies: this.pickNumber(metricSources, AUTOMATIC_REPLY_KEYS),
            openRateTracked: this.pickRateNumber(metricSources, OPEN_RATE_TRACKED_KEYS),
            clickedRateTracked: this.pickRateNumber(metricSources, CLICK_RATE_TRACKED_KEYS),
            opportunitiesRate: this.pickRateNumber(metricSources, OPPORTUNITY_RATE_KEYS),
            userOpportunityRate: this.pickRateNumber(metricSources, USER_OPPORTUNITY_RATE_KEYS),
            openRate: this.pickRateNumber(metricSources, OPEN_RATE_KEYS) || this.rate(opened, rateBase),
            replyRate: this.pickRateNumber(metricSources, REPLY_RATE_KEYS) || this.rate(replied, rateBase),
            clickRate: this.pickRateNumber(metricSources, CLICK_RATE_KEYS) || this.rate(clicked, rateBase),
            bounceRate: this.pickRateNumber(metricSources, BOUNCE_RATE_KEYS) || this.rate(bounced, rateBase),
            daily,
        };
    }

    private mapCampaignAnalytics(campaignId: string, response: ReachInboxRecord): ReachInboxCampaignAnalytics {
        const data = this.asRecord(response.data) || this.asRecord(response.result) || response;
        const summary = this.mapAnalyticsSummary(response);

        return {
            ...summary,
            campaignId,
            campaignStatus: (this.getString(data.campaignStatus || data.status || data.state) || 'UNKNOWN').toUpperCase(),
            campaignOpportunityRate: this.pickRateNumber([data], CAMPAIGN_OPPORTUNITY_RATE_KEYS),
            sequenceStartedCount: this.pickNumber([data], CONTACTED_LEADS_KEYS) || summary.leads,
            uniqueEmailOpenedCount: this.pickNumber([data], OPENED_KEYS),
            uniqueLinkClickedCount: this.pickNumber([data], CLICKED_KEYS),
            uniqueRepliesCount: this.pickNumber([data], REPLIED_KEYS),
            activity: Array.isArray(data.activity) ? data.activity : [],
            campaignStepAnalyticsResult: Array.isArray(data.campaignStepAnalyticsResult) ? data.campaignStepAnalyticsResult : [],
            subsequencesStepAnalyticsResults: Array.isArray(data.subsequencesStepAnalyticsResults) ? data.subsequencesStepAnalyticsResults : [],
        };
    }

    private mapCampaignAnalyticsFromSummary(campaignId: string, summary: ReachInboxAnalyticsSummary): ReachInboxCampaignAnalytics {
        return {
            ...summary,
            campaignId,
            campaignStatus: 'UNKNOWN',
            campaignOpportunityRate: summary.opportunitiesRate,
            sequenceStartedCount: summary.leads,
            uniqueEmailOpenedCount: summary.opened,
            uniqueLinkClickedCount: summary.clicked,
            uniqueRepliesCount: summary.replied,
            activity: [],
            campaignStepAnalyticsResult: [],
            subsequencesStepAnalyticsResults: [],
        };
    }

    private getNumber(value: unknown): number {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const normalized = value.trim().replace('%', '').replace(/\s+/g, '').replace(',', '.');
            const parsed = Number(normalized);
            if (Number.isFinite(parsed)) return parsed;
        }
        return 0;
    }

    private getRateNumber(value: unknown): number {
        const rate = this.getNumber(value);
        if (rate > 0 && rate <= 1) return Math.round(rate * 1000) / 10;
        return rate;
    }

    private pickNumber(sources: Array<ReachInboxRecord | null | undefined>, keys: string[]): number {
        for (const source of sources) {
            if (!source) continue;
            for (const key of keys) {
                const value = source[key];
                const number = this.getNumber(value);
                if (number !== 0) return number;
            }
        }
        return 0;
    }

    private pickRateNumber(sources: Array<ReachInboxRecord | null | undefined>, keys: string[]): number {
        for (const source of sources) {
            if (!source) continue;
            for (const key of keys) {
                const value = source[key];
                const number = this.getRateNumber(value);
                if (number !== 0) return number;
            }
        }
        return 0;
    }

    private pickRecord(sources: Array<ReachInboxRecord | null | undefined>): ReachInboxRecord | null {
        return sources.find((source): source is ReachInboxRecord => Boolean(source)) ?? null;
    }

    private pickArray(sources: unknown[]): unknown[] {
        for (const source of sources) {
            if (Array.isArray(source)) return source;
        }
        return [];
    }

    private rate(part: number, total: number): number {
        if (!total) return 0;
        return Math.round((part / total) * 1000) / 10;
    }

    private async request<T>(tokens: OAuthTokens, path: string, init: RequestInit): Promise<T> {
        if (!tokens.accessToken) {
            throw new Error('ReachInbox API key missing');
        }

        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${tokens.accessToken}`);

        const response = await fetch(`${this.baseUrl}${path}`, {
            ...init,
            headers,
            signal: init.signal ?? AbortSignal.timeout(12000),
        });

        const text = await response.text();
        const data = text ? JSON.parse(text) : null;

        if (!response.ok) {
            const message = data?.message || data?.error || `ReachInbox API error ${response.status}`;
            throw new Error(message);
        }

        return data as T;
    }

    private extractArray(response: ReachInboxRecord | null | undefined): ReachInboxRecord[] {
        if (!response) return [];
        if (Array.isArray(response)) return response;
        if (Array.isArray(response.data)) return response.data;
        if (Array.isArray(response.records)) return response.records;
        if (Array.isArray(response.messages)) return response.messages;
        if (Array.isArray(response.onebox)) return response.onebox;
        if (Array.isArray(response.campaigns)) return response.campaigns;
        const nested = this.asRecord(response.data);
        if (nested && Array.isArray(nested.campaigns)) return nested.campaigns;
        return [];
    }

    private extractCampaignArray(response: ReachInboxRecord | null | undefined): ReachInboxRecord[] {
        if (!response) return [];
        if (Array.isArray(response)) return response.filter((item): item is ReachInboxRecord => Boolean(this.asRecord(item)));

        const directKeys = ['campaigns', 'campaignData', 'campaign_data', 'campaignsData', 'campaignStats', 'campaign_analytics', 'items', 'records', 'rows', 'results', 'docs', 'content', 'list', 'data'];
        for (const key of directKeys) {
            const value = response[key];
            if (Array.isArray(value)) return value.map((item) => this.asRecord(item)).filter((item): item is ReachInboxRecord => Boolean(item));
        }

        const data = this.asRecord(response.data);
        if (data) {
            for (const key of directKeys) {
                const value = data[key];
                if (Array.isArray(value)) return value.map((item) => this.asRecord(item)).filter((item): item is ReachInboxRecord => Boolean(item));
            }
            const nestedData = this.asRecord(data.data);
            if (nestedData) {
                for (const key of directKeys) {
                    const value = nestedData[key];
                    if (Array.isArray(value)) return value.map((item) => this.asRecord(item)).filter((item): item is ReachInboxRecord => Boolean(item));
                }
            }
        }

        return this.findCampaignLikeArrays(response);
    }

    private findCampaignLikeArrays(value: unknown, depth = 0): ReachInboxRecord[] {
        if (depth > 4) return [];
        if (Array.isArray(value)) {
            const records = value.map((item) => this.asRecord(item)).filter((item): item is ReachInboxRecord => Boolean(item));
            const campaignLike = records.filter((item) =>
                item.id
                || item._id
                || item.campaignId
                || item.campaign_id
                || item.campaignID
                || item.name
                || item.campaignName
                || item.campaign_name
                || item.title
            );
            return campaignLike.length > 0 ? campaignLike : [];
        }
        const record = this.asRecord(value);
        if (!record) return [];

        for (const nested of Object.values(record)) {
            const found = this.findCampaignLikeArrays(nested, depth + 1);
            if (found.length > 0) return found;
        }
        return [];
    }

    private mapOneboxItemToThread(item: ReachInboxRecord): EmailThreadData {
        const message = this.mapOneboxItemToMessage(item);

        return {
            id: this.buildThreadId(item),
            subject: message.subject,
            snippet: this.getString(item.snippet || item.preview || item.bodyText || item.body),
            participants: [message.from, ...message.to],
            messages: [message],
            labels: Array.isArray(item.labels) ? item.labels : [],
            isRead: Boolean(item.isRead ?? item.read),
            isStarred: Boolean(item.isStarred ?? item.starred),
            lastMessageAt: message.date || new Date(),
        };
    }

    private mapOneboxItemToMessage(item: ReachInboxRecord): EmailMessageData {
        const from = this.asRecord(item.from);
        const fromEmail = this.getString(item.fromEmail || from?.email || item.sender || item.from) || 'unknown@reachinbox';
        const to = this.extractEmails(item.to || item.toEmails || item.recipients);

        return {
            id: this.getString(item.id || item.messageId || item.emailId) || this.buildThreadId(item),
            threadId: this.buildThreadId(item),
            from: {
                email: fromEmail,
                name: this.getString(item.fromName || from?.name),
            },
            to,
            cc: this.extractEmails(item.cc),
            bcc: this.extractEmails(item.bcc),
            subject: this.getString(item.subject || item.emailSubject || item.title) || '(Sans objet)',
            bodyText: this.getString(item.bodyText || item.text || item.snippet),
            bodyHtml: this.getString(item.bodyHtml || item.html || item.body),
            date: this.getDate(item.date || item.createdAt || item.sentAt || item.receivedAt),
            isRead: Boolean(item.isRead ?? item.read),
        };
    }

    private extractEmails(value: unknown): { email: string; name?: string }[] {
        if (!value) return [];
        if (typeof value === 'string') {
            return value.split(',').map((email) => ({ email: email.trim() })).filter((entry) => entry.email);
        }
        if (Array.isArray(value)) {
            return value
                .map((entry) => {
                    if (typeof entry === 'string') return { email: entry };
                    const record = this.asRecord(entry);
                    return {
                        email: this.getString(record?.email || record?.address || entry),
                        name: this.getString(record?.name),
                    };
                })
                .filter((entry) => entry.email);
        }
        if (typeof value === 'object') {
            const entry = this.asRecord(value);
            const email = this.getString(entry?.email || entry?.address);
            return email ? [{ email, name: this.getString(entry?.name) }] : [];
        }
        return [];
    }

    private extractParticipants(items: ReachInboxRecord[]): { email: string; name?: string }[] {
        const participants = new Map<string, { email: string; name?: string }>();

        for (const item of items) {
            const message = this.mapOneboxItemToMessage(item);
            [message.from, ...message.to, ...(message.cc || [])].forEach((participant) => {
                if (participant.email) participants.set(participant.email, participant);
            });
        }

        return Array.from(participants.values());
    }

    private buildThreadId(item: ReachInboxRecord): string {
        const account = this.asRecord(item.account);
        const accountId = this.getString(item.accountId || account?.id || item.account);
        const messageId = this.getString(item.threadId || item.id || item.messageId || item.emailId) || randomUUID();
        return accountId ? `${accountId}::${messageId}` : messageId;
    }

    private parseThreadId(threadId: string): { accountId?: string; messageId: string } {
        const [accountId, messageId] = threadId.split('::');
        return messageId ? { accountId, messageId } : { messageId: threadId };
    }

    private getString(value: unknown): string | undefined {
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
        return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    }

    private asRecord(value: unknown): ReachInboxRecord | null {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as ReachInboxRecord
            : null;
    }

    private todayParam(): string {
        return new Date().toISOString().slice(0, 10);
    }

    private daysAgoParam(days: number): string {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return date.toISOString().slice(0, 10);
    }

    private getDate(value: unknown): Date {
        if (typeof value === 'string' || typeof value === 'number') {
            const date = new Date(value);
            if (!Number.isNaN(date.getTime())) return date;
        }
        return new Date();
    }

    private mapWebhookAction(value: unknown): 'new' | 'update' | 'delete' | undefined {
        const event = this.getString(value)?.toUpperCase();
        if (!event) return undefined;
        if (event.includes('DELETE')) return 'delete';
        if (event.includes('REPLY') || event.includes('SENT') || event.includes('NEW')) return 'new';
        return 'update';
    }
}

export const reachInboxProvider = new ReachInboxProvider();
