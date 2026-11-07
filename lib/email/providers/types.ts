// ============================================
// EMAIL PROVIDER TYPES & INTERFACES
// ============================================

import { EmailProvider as PrismaEmailProvider } from '@prisma/client';
import { relayRedirectUri } from '@/lib/oauth-relay/redirect';

// ============================================
// OAUTH TYPES
// ============================================

export interface OAuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    scope?: string;
    tokenType?: string;
}

export interface OAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
}

// ============================================
// SYNC TYPES
// ============================================

export interface SyncOptions {
    fullSync?: boolean;
    maxResults?: number;
    pageToken?: string;
    historyId?: string;
    since?: Date;
}

export interface SyncResult {
    success: boolean;
    threadsAdded: number;
    threadsUpdated: number;
    messagesAdded: number;
    messagesUpdated: number;
    nextPageToken?: string;
    historyId?: string;
    errors?: string[];
}

// ============================================
// EMAIL TYPES
// ============================================

export interface EmailAddress {
    email: string;
    name?: string;
}

export interface EmailAttachmentData {
    filename: string;
    mimeType: string;
    size: number;
    content?: Buffer;
    contentId?: string;
    url?: string;
}

export interface EmailMessageData {
    id?: string;
    threadId?: string;
    from: EmailAddress;
    to: EmailAddress[];
    cc?: EmailAddress[];
    bcc?: EmailAddress[];
    replyTo?: EmailAddress;
    subject: string;
    bodyText?: string;
    bodyHtml?: string;
    attachments?: EmailAttachmentData[];
    headers?: Record<string, string>;
    inReplyTo?: string;
    references?: string[];
    date?: Date;
    isRead?: boolean;
    isStarred?: boolean;
}

export interface EmailThreadData {
    id: string;
    subject: string;
    snippet?: string;
    participants: EmailAddress[];
    messages: EmailMessageData[];
    labels?: string[];
    isRead?: boolean;
    isStarred?: boolean;
    lastMessageAt: Date;
}

// ============================================
// SEND TYPES
// ============================================

export interface SendEmailParams {
    from?: EmailAddress;
    to: EmailAddress[];
    cc?: EmailAddress[];
    bcc?: EmailAddress[];
    replyTo?: EmailAddress;
    subject: string;
    bodyText?: string;
    bodyHtml?: string;
    attachments?: EmailAttachmentData[];
    inReplyTo?: string;
    threadId?: string;
    trackingPixelId?: string;
}

export interface SendResult {
    success: boolean;
    messageId?: string;
    threadId?: string;
    error?: string;
}

export interface DraftParams {
    to?: EmailAddress[];
    cc?: EmailAddress[];
    bcc?: EmailAddress[];
    subject?: string;
    bodyText?: string;
    bodyHtml?: string;
    attachments?: EmailAttachmentData[];
    threadId?: string;
}

export interface Draft {
    id: string;
    messageId: string;
    threadId?: string;
}

// ============================================
// WEBHOOK TYPES
// ============================================

export interface WebhookConfig {
    id: string;
    resourceUri?: string;
    expiration?: Date;
    token?: string;
}

export interface WebhookPayload {
    mailboxEmail: string;
    historyId?: string;
    messageIds?: string[];
    action?: 'new' | 'update' | 'delete';
}

// ============================================
// PROVIDER INTERFACE
// ============================================

export interface IEmailProvider {
    provider: PrismaEmailProvider;
    
    // ============================================
    // AUTHENTICATION
    // ============================================
    
    /**
     * Get OAuth authorization URL
     */
    getAuthUrl(state?: string): string;
    
    /**
     * Handle OAuth callback and exchange code for tokens
     */
    handleCallback(code: string): Promise<OAuthTokens>;
    
    /**
     * Refresh expired tokens
     */
    refreshTokens(refreshToken: string): Promise<OAuthTokens>;
    
    /**
     * Validate if tokens are still valid
     */
    validateTokens(tokens: OAuthTokens): Promise<boolean>;
    
    // ============================================
    // SYNC OPERATIONS
    // ============================================
    
    /**
     * Sync mailbox (full or incremental)
     */
    syncMailbox(tokens: OAuthTokens, options?: SyncOptions): Promise<{
        threads: EmailThreadData[];
        syncResult: SyncResult;
    }>;
    
    /**
     * Get a single thread with all messages
     */
    getThread(tokens: OAuthTokens, threadId: string): Promise<EmailThreadData | null>;
    
    /**
     * Get a single message
     */
    getMessage(tokens: OAuthTokens, messageId: string): Promise<EmailMessageData | null>;
    
    // ============================================
    // SEND OPERATIONS
    // ============================================
    
    /**
     * Send an email
     */
    sendEmail(tokens: OAuthTokens, params: SendEmailParams): Promise<SendResult>;
    
    /**
     * Save draft
     */
    saveDraft(tokens: OAuthTokens, params: DraftParams): Promise<Draft>;
    
    /**
     * Update draft
     */
    updateDraft(tokens: OAuthTokens, draftId: string, params: DraftParams): Promise<Draft>;
    
    /**
     * Delete draft
     */
    deleteDraft(tokens: OAuthTokens, draftId: string): Promise<boolean>;
    
    // ============================================
    // THREAD ACTIONS
    // ============================================
    
    /**
     * Mark messages as read
     */
    markAsRead(tokens: OAuthTokens, messageIds: string[]): Promise<void>;
    
    /**
     * Mark messages as unread
     */
    markAsUnread(tokens: OAuthTokens, messageIds: string[]): Promise<void>;
    
    /**
     * Archive messages
     */
    archive(tokens: OAuthTokens, messageIds: string[]): Promise<void>;
    
    /**
     * Move to trash
     */
    trash(tokens: OAuthTokens, messageIds: string[]): Promise<void>;
    
    /**
     * Star/unstar messages
     */
    star(tokens: OAuthTokens, messageIds: string[], starred: boolean): Promise<void>;
    
    // ============================================
    // WEBHOOKS / PUSH NOTIFICATIONS
    // ============================================
    
    /**
     * Set up webhook for push notifications
     */
    setupWebhook(tokens: OAuthTokens, callbackUrl: string): Promise<WebhookConfig>;
    
    /**
     * Stop/remove webhook
     */
    stopWebhook(tokens: OAuthTokens, webhookId: string): Promise<void>;
    
    /**
     * Parse incoming webhook payload
     */
    parseWebhookPayload(payload: unknown): WebhookPayload | null;
    
    // ============================================
    // UTILITIES
    // ============================================
    
    /**
     * Get user profile/email info
     */
    getUserProfile(tokens: OAuthTokens): Promise<{
        email: string;
        name?: string;
        picture?: string;
    }>;
    
    /**
     * Search emails
     */
    search(tokens: OAuthTokens, query: string, options?: {
        maxResults?: number;
        pageToken?: string;
    }): Promise<{
        threads: EmailThreadData[];
        nextPageToken?: string;
    }>;
}

// ============================================
// PROVIDER CONFIGURATION
// ============================================

export interface ProviderConfig {
    gmail: {
        clientId: string;
        clientSecret: string;
        redirectUri: string;
    };
    outlook: {
        clientId: string;
        clientSecret: string;
        redirectUri: string;
        tenantId?: string;
    };
}

export function getProviderConfig(): ProviderConfig {
    return {
        gmail: {
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
            redirectUri: process.env.GOOGLE_REDIRECT_URI || relayRedirectUri('gmail') || `${process.env.NEXTAUTH_URL}/api/email/oauth/gmail/callback`,
        },
        outlook: {
            clientId: process.env.MICROSOFT_CLIENT_ID || '',
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
            redirectUri: process.env.MICROSOFT_REDIRECT_URI || relayRedirectUri('outlook') || `${process.env.NEXTAUTH_URL}/api/email/oauth/outlook/callback`,
            tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
        },
    };
}
