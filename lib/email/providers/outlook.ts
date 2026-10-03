// ============================================
// OUTLOOK/MICROSOFT GRAPH PROVIDER IMPLEMENTATION
// ============================================

import { EmailProvider } from '@prisma/client';
import {
    IEmailProvider,
    OAuthTokens,
    SyncOptions,
    SyncResult,
    EmailThreadData,
    EmailMessageData,
    EmailAddress,
    EmailAttachmentData,
    SendEmailParams,
    SendResult,
    DraftParams,
    Draft,
    WebhookConfig,
    WebhookPayload,
    getProviderConfig,
} from './types';

// ============================================
// CONSTANTS
// ============================================

const OUTLOOK_SCOPES = [
    'openid',
    'profile',
    'email',
    'offline_access',
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/Mail.Send',
    'https://graph.microsoft.com/User.Read',
];

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

// ============================================
// OUTLOOK PROVIDER CLASS
// ============================================

export class OutlookProvider implements IEmailProvider {
    provider: EmailProvider = 'OUTLOOK';
    private config;

    constructor() {
        this.config = getProviderConfig().outlook;
    }

    // ============================================
    // HELPER: Make authenticated API request
    // ============================================

    private async graphRequest<T>(
        tokens: OAuthTokens,
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const response = await fetch(`${GRAPH_API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Graph API error: ${response.status} - ${error}`);
        }

        // Handle 204 No Content
        if (response.status === 204) {
            return {} as T;
        }

        return response.json();
    }

    // ============================================
    // AUTHENTICATION
    // ============================================

    getAuthUrl(state?: string): string {
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            response_type: 'code',
            redirect_uri: this.config.redirectUri,
            scope: OUTLOOK_SCOPES.join(' '),
            response_mode: 'query',
            prompt: 'consent',
        });

        if (state) {
            params.set('state', state);
        }

        const tenantId = this.config.tenantId || 'common';
        return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;
    }

    async handleCallback(code: string): Promise<OAuthTokens> {
        const tenantId = this.config.tenantId || 'common';
        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                code,
                redirect_uri: this.config.redirectUri,
                grant_type: 'authorization_code',
                scope: OUTLOOK_SCOPES.join(' '),
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token exchange failed: ${error}`);
        }

        const data = await response.json();

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: new Date(Date.now() + data.expires_in * 1000),
            scope: data.scope,
            tokenType: data.token_type,
        };
    }

    async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
        const tenantId = this.config.tenantId || 'common';
        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
                scope: OUTLOOK_SCOPES.join(' '),
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token refresh failed: ${error}`);
        }

        const data = await response.json();

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            expiresAt: new Date(Date.now() + data.expires_in * 1000),
            scope: data.scope,
            tokenType: data.token_type,
        };
    }

    async validateTokens(tokens: OAuthTokens): Promise<boolean> {
        try {
            await this.graphRequest(tokens, '/me');
            return true;
        } catch {
            return false;
        }
    }

    // ============================================
    // SYNC OPERATIONS
    // ============================================

    async syncMailbox(
        tokens: OAuthTokens,
        options: SyncOptions = {}
    ): Promise<{ threads: EmailThreadData[]; syncResult: SyncResult }> {
        const threads: EmailThreadData[] = [];
        const errors: string[] = [];
        let threadsAdded = 0;
        let messagesAdded = 0;

        try {
            // Build query
            let endpoint = '/me/messages?$orderby=receivedDateTime desc';
            endpoint += `&$top=${options.maxResults || 50}`;
            endpoint += '&$select=id,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,isRead,isDraft,hasAttachments,flag';
            
            if (options.since) {
                endpoint += `&$filter=receivedDateTime ge ${options.since.toISOString()}`;
            }
            
            if (options.pageToken) {
                endpoint = options.pageToken;
            }

            const response = await this.graphRequest<{
                value: OutlookMessage[];
                '@odata.nextLink'?: string;
            }>(tokens, endpoint);

            // Group messages by conversation
            const conversationMap = new Map<string, OutlookMessage[]>();
            
            for (const message of response.value) {
                const convId = message.conversationId || message.id;
                if (!conversationMap.has(convId)) {
                    conversationMap.set(convId, []);
                }
                conversationMap.get(convId)!.push(message);
            }

            // Convert to threads
            for (const [convId, messages] of conversationMap) {
                const thread = this.messagesToThread(convId, messages);
                threads.push(thread);
                threadsAdded++;
                messagesAdded += messages.length;
            }

            return {
                threads,
                syncResult: {
                    success: true,
                    threadsAdded,
                    threadsUpdated: 0,
                    messagesAdded,
                    messagesUpdated: 0,
                    nextPageToken: response['@odata.nextLink'],
                    errors: errors.length > 0 ? errors : undefined,
                },
            };
        } catch (error) {
            return {
                threads: [],
                syncResult: {
                    success: false,
                    threadsAdded: 0,
                    threadsUpdated: 0,
                    messagesAdded: 0,
                    messagesUpdated: 0,
                    errors: [`Sync failed: ${error}`],
                },
            };
        }
    }

    async getThread(tokens: OAuthTokens, threadId: string): Promise<EmailThreadData | null> {
        try {
            // Outlook uses conversationId - get all messages in conversation
            const response = await this.graphRequest<{
                value: OutlookMessage[];
            }>(tokens, `/me/messages?$filter=conversationId eq '${threadId}'&$orderby=receivedDateTime asc`);

            if (response.value.length === 0) return null;

            return this.messagesToThread(threadId, response.value);
        } catch (error) {
            console.error('Failed to get thread:', error);
            return null;
        }
    }

    async getMessage(tokens: OAuthTokens, messageId: string): Promise<EmailMessageData | null> {
        try {
            const message = await this.graphRequest<OutlookMessage>(
                tokens,
                `/me/messages/${messageId}`
            );

            return this.parseOutlookMessage(message);
        } catch (error) {
            console.error('Failed to get message:', error);
            return null;
        }
    }

    // ============================================
    // SEND OPERATIONS
    // ============================================

    async sendEmail(tokens: OAuthTokens, params: SendEmailParams): Promise<SendResult> {
        try {
            const message = this.buildOutlookMessage(params);

            // If replying to a thread, use reply endpoint
            if (params.inReplyTo) {
                await this.graphRequest(tokens, `/me/messages/${params.inReplyTo}/reply`, {
                    method: 'POST',
                    body: JSON.stringify({ message, comment: params.bodyHtml || params.bodyText }),
                });
            } else {
                await this.graphRequest(tokens, '/me/sendMail', {
                    method: 'POST',
                    body: JSON.stringify({ message, saveToSentItems: true }),
                });
            }

            return {
                success: true,
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to send email: ${error}`,
            };
        }
    }

    async saveDraft(tokens: OAuthTokens, params: DraftParams): Promise<Draft> {
        const message = this.buildOutlookMessage({
            to: params.to || [],
            subject: params.subject || '',
            bodyText: params.bodyText,
            bodyHtml: params.bodyHtml,
            attachments: params.attachments,
        });

        const response = await this.graphRequest<OutlookMessage>(
            tokens,
            '/me/messages',
            {
                method: 'POST',
                body: JSON.stringify(message),
            }
        );

        return {
            id: response.id,
            messageId: response.id,
            threadId: response.conversationId,
        };
    }

    async updateDraft(tokens: OAuthTokens, draftId: string, params: DraftParams): Promise<Draft> {
        const message = this.buildOutlookMessage({
            to: params.to || [],
            subject: params.subject || '',
            bodyText: params.bodyText,
            bodyHtml: params.bodyHtml,
            attachments: params.attachments,
        });

        const response = await this.graphRequest<OutlookMessage>(
            tokens,
            `/me/messages/${draftId}`,
            {
                method: 'PATCH',
                body: JSON.stringify(message),
            }
        );

        return {
            id: response.id,
            messageId: response.id,
            threadId: response.conversationId,
        };
    }

    async deleteDraft(tokens: OAuthTokens, draftId: string): Promise<boolean> {
        try {
            await this.graphRequest(tokens, `/me/messages/${draftId}`, {
                method: 'DELETE',
            });
            return true;
        } catch {
            return false;
        }
    }

    // ============================================
    // THREAD ACTIONS
    // ============================================

    async markAsRead(tokens: OAuthTokens, messageIds: string[]): Promise<void> {
        for (const messageId of messageIds) {
            await this.graphRequest(tokens, `/me/messages/${messageId}`, {
                method: 'PATCH',
                body: JSON.stringify({ isRead: true }),
            });
        }
    }

    async markAsUnread(tokens: OAuthTokens, messageIds: string[]): Promise<void> {
        for (const messageId of messageIds) {
            await this.graphRequest(tokens, `/me/messages/${messageId}`, {
                method: 'PATCH',
                body: JSON.stringify({ isRead: false }),
            });
        }
    }

    async archive(tokens: OAuthTokens, messageIds: string[]): Promise<void> {
        // Get Archive folder
        const folders = await this.graphRequest<{ value: { id: string; displayName: string }[] }>(
            tokens,
            '/me/mailFolders'
        );
        const archiveFolder = folders.value.find(f => f.displayName === 'Archive');
        
        if (!archiveFolder) {
            throw new Error('Archive folder not found');
        }

        for (const messageId of messageIds) {
            await this.graphRequest(tokens, `/me/messages/${messageId}/move`, {
                method: 'POST',
                body: JSON.stringify({ destinationId: archiveFolder.id }),
            });
        }
    }

    async trash(tokens: OAuthTokens, messageIds: string[]): Promise<void> {
        for (const messageId of messageIds) {
            await this.graphRequest(tokens, `/me/messages/${messageId}/move`, {
                method: 'POST',
                body: JSON.stringify({ destinationId: 'deleteditems' }),
            });
        }
    }

    async star(tokens: OAuthTokens, messageIds: string[], starred: boolean): Promise<void> {
        for (const messageId of messageIds) {
            await this.graphRequest(tokens, `/me/messages/${messageId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    flag: {
                        flagStatus: starred ? 'flagged' : 'notFlagged',
                    },
                }),
            });
        }
    }

    // ============================================
    // WEBHOOKS
    // ============================================

    async setupWebhook(tokens: OAuthTokens, callbackUrl: string): Promise<WebhookConfig> {
        const expirationDateTime = new Date(Date.now() + 4230 * 60 * 1000); // Max ~3 days

        const response = await this.graphRequest<{
            id: string;
            resource: string;
            expirationDateTime: string;
        }>(tokens, '/subscriptions', {
            method: 'POST',
            body: JSON.stringify({
                changeType: 'created,updated',
                notificationUrl: callbackUrl,
                resource: '/me/mailFolders(\'Inbox\')/messages',
                expirationDateTime: expirationDateTime.toISOString(),
                clientState: process.env.WEBHOOK_SECRET || 'suzalink-email-webhook', // brand-check-ignore: persisted in live Graph subscriptions, do not rename
            }),
        });

        return {
            id: response.id,
            resourceUri: response.resource,
            expiration: new Date(response.expirationDateTime),
        };
    }

    async stopWebhook(tokens: OAuthTokens, webhookId: string): Promise<void> {
        await this.graphRequest(tokens, `/subscriptions/${webhookId}`, {
            method: 'DELETE',
        });
    }

    parseWebhookPayload(payload: unknown): WebhookPayload | null {
        try {
            const data = payload as {
                value?: Array<{
                    resourceData?: {
                        id: string;
                    };
                    changeType?: string;
                }>;
            };

            if (!data.value || data.value.length === 0) return null;

            const messageIds = data.value
                .map(v => v.resourceData?.id)
                .filter((id): id is string => !!id);

            return {
                mailboxEmail: '',
                messageIds,
                action: data.value[0].changeType === 'created' ? 'new' : 'update',
            };
        } catch {
            return null;
        }
    }

    // ============================================
    // UTILITIES
    // ============================================

    async getUserProfile(tokens: OAuthTokens): Promise<{
        email: string;
        name?: string;
        picture?: string;
    }> {
        const response = await this.graphRequest<{
            mail?: string;
            userPrincipalName: string;
            displayName?: string;
        }>(tokens, '/me');

        // Try to get photo
        let picture: string | undefined;
        try {
            const photoResponse = await fetch(`${GRAPH_API_BASE}/me/photo/$value`, {
                headers: { Authorization: `Bearer ${tokens.accessToken}` },
            });
            if (photoResponse.ok) {
                const blob = await photoResponse.blob();
                const buffer = await blob.arrayBuffer();
                picture = `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}`;
            }
        } catch {
            // Photo not available
        }

        return {
            email: response.mail || response.userPrincipalName,
            name: response.displayName,
            picture,
        };
    }

    async search(
        tokens: OAuthTokens,
        query: string,
        options?: { maxResults?: number; pageToken?: string }
    ): Promise<{ threads: EmailThreadData[]; nextPageToken?: string }> {
        let endpoint = `/me/messages?$search="${encodeURIComponent(query)}"`;
        endpoint += `&$top=${options?.maxResults || 20}`;
        
        if (options?.pageToken) {
            endpoint = options.pageToken;
        }

        const response = await this.graphRequest<{
            value: OutlookMessage[];
            '@odata.nextLink'?: string;
        }>(tokens, endpoint);

        // Group by conversation
        const conversationMap = new Map<string, OutlookMessage[]>();
        
        for (const message of response.value) {
            const convId = message.conversationId || message.id;
            if (!conversationMap.has(convId)) {
                conversationMap.set(convId, []);
            }
            conversationMap.get(convId)!.push(message);
        }

        const threads: EmailThreadData[] = [];
        for (const [convId, messages] of conversationMap) {
            threads.push(this.messagesToThread(convId, messages));
        }

        return {
            threads,
            nextPageToken: response['@odata.nextLink'],
        };
    }

    // ============================================
    // PRIVATE HELPERS
    // ============================================

    private messagesToThread(conversationId: string, messages: OutlookMessage[]): EmailThreadData {
        const sortedMessages = messages.sort(
            (a, b) => new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime()
        );

        const parsedMessages = sortedMessages.map(m => this.parseOutlookMessage(m));
        const participants = this.extractParticipants(parsedMessages);
        const lastMessage = sortedMessages[sortedMessages.length - 1];
        const firstMessage = sortedMessages[0];

        return {
            id: conversationId,
            subject: firstMessage.subject || '(No Subject)',
            snippet: lastMessage.bodyPreview,
            participants,
            messages: parsedMessages,
            isRead: messages.every(m => m.isRead),
            isStarred: messages.some(m => m.flag?.flagStatus === 'flagged'),
            lastMessageAt: new Date(lastMessage.receivedDateTime),
        };
    }

    private parseOutlookMessage(msg: OutlookMessage): EmailMessageData {
        return {
            id: msg.id,
            threadId: msg.conversationId,
            from: msg.from?.emailAddress 
                ? { email: msg.from.emailAddress.address, name: msg.from.emailAddress.name }
                : { email: '' },
            to: (msg.toRecipients || []).map(r => ({
                email: r.emailAddress?.address || '',
                name: r.emailAddress?.name,
            })),
            cc: (msg.ccRecipients || []).map(r => ({
                email: r.emailAddress?.address || '',
                name: r.emailAddress?.name,
            })),
            subject: msg.subject || '',
            bodyText: msg.body?.contentType === 'text' ? msg.body.content : undefined,
            bodyHtml: msg.body?.contentType === 'html' ? msg.body.content : undefined,
            date: msg.receivedDateTime ? new Date(msg.receivedDateTime) : undefined,
            attachments: msg.hasAttachments ? [] : undefined, // Need separate API call to get attachments
        };
    }

    private extractParticipants(messages: EmailMessageData[]): EmailAddress[] {
        const seen = new Set<string>();
        const participants: EmailAddress[] = [];

        for (const msg of messages) {
            const addresses = [msg.from, ...msg.to, ...(msg.cc || [])];
            for (const addr of addresses) {
                if (addr.email && !seen.has(addr.email.toLowerCase())) {
                    seen.add(addr.email.toLowerCase());
                    participants.push(addr);
                }
            }
        }

        return participants;
    }

    private buildOutlookMessage(params: SendEmailParams): OutlookMessagePayload {
        const message: OutlookMessagePayload = {
            subject: params.subject,
            body: {
                contentType: params.bodyHtml ? 'HTML' : 'Text',
                content: params.bodyHtml || params.bodyText || '',
            },
            toRecipients: params.to.map(a => ({
                emailAddress: { address: a.email, name: a.name },
            })),
        };

        if (params.cc && params.cc.length > 0) {
            message.ccRecipients = params.cc.map(a => ({
                emailAddress: { address: a.email, name: a.name },
            }));
        }

        if (params.bcc && params.bcc.length > 0) {
            message.bccRecipients = params.bcc.map(a => ({
                emailAddress: { address: a.email, name: a.name },
            }));
        }

        return message;
    }
}

// ============================================
// OUTLOOK TYPES
// ============================================

interface OutlookEmailAddress {
    address: string;
    name?: string;
}

interface OutlookRecipient {
    emailAddress?: OutlookEmailAddress;
}

interface OutlookMessage {
    id: string;
    conversationId?: string;
    subject?: string;
    bodyPreview?: string;
    body?: {
        contentType: 'text' | 'html' | 'HTML' | 'Text';
        content: string;
    };
    from?: {
        emailAddress?: OutlookEmailAddress;
    };
    toRecipients?: OutlookRecipient[];
    ccRecipients?: OutlookRecipient[];
    bccRecipients?: OutlookRecipient[];
    receivedDateTime: string;
    isRead?: boolean;
    isDraft?: boolean;
    hasAttachments?: boolean;
    flag?: {
        flagStatus?: 'notFlagged' | 'flagged' | 'complete';
    };
}

interface OutlookMessagePayload {
    subject: string;
    body: {
        contentType: 'HTML' | 'Text';
        content: string;
    };
    toRecipients: OutlookRecipient[];
    ccRecipients?: OutlookRecipient[];
    bccRecipients?: OutlookRecipient[];
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const outlookProvider = new OutlookProvider();
