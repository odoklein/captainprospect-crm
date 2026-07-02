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
    daily: Array<{
        date: string;
        sent: number;
        opened: number;
        replied: number;
        clicked: number;
        bounced: number;
    }>;
}

export interface ReachInboxWarmupSummary {
    warmupSent: number;
    inboxPlacement: number;
    spamPlacement: number;
    healthScore: number;
}

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
        const endpoints = [
            '/campaigns/all?limit=200&offset=0',
            '/campaigns?limit=200&offset=0',
            '/campaign/all?limit=200&offset=0',
        ];

        let response: ReachInboxRecord | null = null;
        let lastError: Error | null = null;
        for (const endpoint of endpoints) {
            try {
                response = await this.request<ReachInboxRecord>(tokens, endpoint, { method: 'GET' });
                break;
            } catch (err) {
                lastError = err as Error;
            }
        }
        if (!response) {
            throw lastError ?? new Error('Impossible de charger les campagnes ReachInbox');
        }

        return this.extractArray(response).map((item) => this.mapCampaign(item));
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

    async getWarmupAnalytics(tokens: OAuthTokens): Promise<ReachInboxWarmupSummary | null> {
        try {
            const response = await this.request<ReachInboxRecord>(tokens, '/analytics/warmup-analytics', {
                method: 'GET',
            });
            const source = this.asRecord(response.data) || response;
            return {
                warmupSent: this.getNumber(source.warmupSent ?? source.warmup_sent ?? source.sent ?? source.totalSent),
                inboxPlacement: this.getNumber(source.inboxPlacement ?? source.inbox_placement ?? source.inbox ?? source.inboxPercentage),
                spamPlacement: this.getNumber(source.spamPlacement ?? source.spam_placement ?? source.spam ?? source.spamPercentage),
                healthScore: this.getNumber(source.healthScore ?? source.health_score ?? source.score),
            };
        } catch {
            return null;
        }
    }

    private mapCampaign(item: ReachInboxRecord): ReachInboxCampaignSummary {
        const statsSource = this.asRecord(item.stats) || this.asRecord(item.analytics) || this.asRecord(item.metrics) || item;
        const createdAt = this.getString(item.createdAt || item.created_at || item.startDate);

        return {
            id: this.getString(item.id || item._id || item.campaignId) || randomUUID(),
            name: this.getString(item.name || item.campaignName || item.title) || 'Campagne sans nom',
            status: (this.getString(item.status || item.state) || 'UNKNOWN').toUpperCase(),
            createdAt: createdAt ?? null,
            stats: {
                sent: this.getNumber(statsSource.sent ?? statsSource.sentCount ?? statsSource.emailsSent ?? statsSource.totalSent ?? statsSource.sent_count),
                opened: this.getNumber(statsSource.opened ?? statsSource.opens ?? statsSource.openCount ?? statsSource.totalOpens ?? statsSource.uniqueOpens),
                replied: this.getNumber(statsSource.replied ?? statsSource.replies ?? statsSource.replyCount ?? statsSource.totalReplies),
                clicked: this.getNumber(statsSource.clicked ?? statsSource.clicks ?? statsSource.clickCount ?? statsSource.totalClicks),
                bounced: this.getNumber(statsSource.bounced ?? statsSource.bounces ?? statsSource.bounceCount ?? statsSource.totalBounces),
                leads: this.getNumber(statsSource.leads ?? statsSource.totalLeads ?? statsSource.leadsCount ?? statsSource.contactsCount ?? statsSource.prospects),
            },
        };
    }

    private mapAnalyticsSummary(response: ReachInboxRecord): ReachInboxAnalyticsSummary {
        const data = this.asRecord(response.data) || this.asRecord(response.result) || response;
        const totals = this.asRecord(data.summary)
            || this.asRecord(data.total)
            || this.asRecord(data.totals)
            || data;

        const dailySource = Array.isArray(data.result)
            ? data.result
            : Array.isArray(data.daily)
                ? data.daily
                : Array.isArray(data.analytics)
                    ? data.analytics
                    : [];

        return {
            sent: this.getNumber(totals.sent ?? totals.sentCount ?? totals.emailsSent ?? totals.totalSent),
            opened: this.getNumber(totals.opened ?? totals.opens ?? totals.openCount ?? totals.totalOpens ?? totals.uniqueOpens),
            replied: this.getNumber(totals.replied ?? totals.replies ?? totals.replyCount ?? totals.totalReplies),
            clicked: this.getNumber(totals.clicked ?? totals.clicks ?? totals.clickCount ?? totals.totalClicks),
            bounced: this.getNumber(totals.bounced ?? totals.bounces ?? totals.bounceCount ?? totals.totalBounces),
            leads: this.getNumber(totals.leads ?? totals.totalLeads ?? totals.leadsCount ?? totals.contactsCount ?? totals.prospects),
            opportunities: this.getNumber(totals.opportunities ?? totals.opportunityCount ?? totals.totalOpportunities),
            positiveReplies: this.getNumber(totals.positiveReplies ?? totals.positive_replies ?? totals.positiveReplyCount),
            daily: dailySource
                .map((entry) => this.asRecord(entry))
                .filter((entry): entry is ReachInboxRecord => Boolean(entry))
                .map((entry) => ({
                    date: this.getString(entry.date || entry.day || entry.createdAt) || '',
                    sent: this.getNumber(entry.sent ?? entry.sentCount ?? entry.emailsSent),
                    opened: this.getNumber(entry.opened ?? entry.opens ?? entry.openCount),
                    replied: this.getNumber(entry.replied ?? entry.replies ?? entry.replyCount),
                    clicked: this.getNumber(entry.clicked ?? entry.clicks ?? entry.clickCount),
                    bounced: this.getNumber(entry.bounced ?? entry.bounces ?? entry.bounceCount),
                }))
                .filter((entry) => entry.date),
        };
    }

    private getNumber(value: unknown): number {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return 0;
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
        return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    }

    private asRecord(value: unknown): ReachInboxRecord | null {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as ReachInboxRecord
            : null;
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
