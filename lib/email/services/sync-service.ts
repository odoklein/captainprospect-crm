// ============================================
// EMAIL SYNC SERVICE
// Handles synchronization of emails from providers
// ============================================

import { prisma } from '@/lib/prisma';
import { decrypt, encrypt } from '@/lib/encryption';
import {
    getEmailProvider,
    createEmailProvider,
    OAuthTokens,
    EmailThreadData,
    EmailMessageData,
    SyncOptions,
    ImapConfig,
} from '../providers';
import { ImapProvider } from '../providers/imap';
import { Mailbox, EmailThread, Email, EmailDirection, EmailStatus } from '@prisma/client';
import { classifyError, ClassifiedError } from '../utils/error-taxonomy';
import { crmLinkingService } from './linking-service';
import { sequenceService } from './sequence-service';

// ============================================
// TYPES
// ============================================

export interface SyncJobResult {
    success: boolean;
    mailboxId: string;
    threadsProcessed: number;
    messagesProcessed: number;
    errors: string[];
    duration: number;
}

export interface MailboxSyncOptions {
    fullSync?: boolean;
    maxThreads?: number;
    since?: Date;
}

// ============================================
// SYNC SERVICE CLASS
// ============================================

export class EmailSyncService {
    // ============================================
    // SYNC SINGLE MAILBOX
    // ============================================

    async syncMailbox(
        mailboxId: string,
        options: MailboxSyncOptions = {}
    ): Promise<SyncJobResult> {
        const startTime = Date.now();
        const errors: string[] = [];
        let threadsProcessed = 0;
        let messagesProcessed = 0;

        // Get mailbox first so it's available in catch block
        const mailbox = await prisma.mailbox.findUnique({
            where: { id: mailboxId },
        });

        if (!mailbox) {
            return {
                success: false,
                mailboxId,
                threadsProcessed: 0,
                messagesProcessed: 0,
                errors: ['Mailbox not found'],
                duration: Date.now() - startTime,
            };
        }

        if (!mailbox.isActive) {
            return {
                success: false,
                mailboxId,
                threadsProcessed: 0,
                messagesProcessed: 0,
                errors: ['Mailbox is inactive'],
                duration: Date.now() - startTime,
            };
        }

        try {
            // Update sync status
            await prisma.mailbox.update({
                where: { id: mailboxId },
                data: { syncStatus: 'SYNCING' },
            });

            // Build sync options
            const syncOptions: SyncOptions = {
                fullSync: options.fullSync,
                maxResults: options.maxThreads || 50,
                since: options.since || (options.fullSync ? undefined : mailbox.lastSyncAt || undefined),
            };

            let threads: EmailThreadData[] = [];

            // Handle different provider types
            if (mailbox.provider === 'CUSTOM') {
                // IMAP/SMTP - use password-based auth
                if (!mailbox.password || !mailbox.imapHost || !mailbox.smtpHost) {
                    throw new Error('IMAP/SMTP configuration incomplete');
                }

                const imapConfig: ImapConfig = {
                    email: mailbox.email,
                    password: decrypt(mailbox.password),
                    imapHost: mailbox.imapHost,
                    imapPort: mailbox.imapPort || 993,
                    smtpHost: mailbox.smtpHost,
                    smtpPort: mailbox.smtpPort || 587,
                };

                const imapProvider = new ImapProvider(imapConfig);
                const { threads: syncedThreads, syncResult } = await imapProvider.syncMailbox({} as OAuthTokens, syncOptions);

                if (!syncResult.success) {
                    throw new Error(syncResult.errors?.join(', ') || 'IMAP sync failed');
                }

                threads = syncedThreads;

            } else {
                // OAuth providers (Gmail, Outlook)
                const provider = getEmailProvider(mailbox.provider);
                let tokens = this.getTokensFromMailbox(mailbox);

                // Check if tokens need refresh
                if (mailbox.tokenExpiry && new Date() >= mailbox.tokenExpiry) {
                    if (!mailbox.refreshToken) {
                        throw new Error('Token expired and no refresh token available');
                    }

                    const refreshedTokens = await provider.refreshTokens(
                        decrypt(mailbox.refreshToken)
                    );

                    // Update mailbox with new tokens
                    await prisma.mailbox.update({
                        where: { id: mailboxId },
                        data: {
                            accessToken: encrypt(refreshedTokens.accessToken),
                            refreshToken: refreshedTokens.refreshToken
                                ? encrypt(refreshedTokens.refreshToken)
                                : mailbox.refreshToken,
                            tokenExpiry: refreshedTokens.expiresAt,
                        },
                    });

                    tokens = refreshedTokens;
                }

                // Perform sync
                const { threads: syncedThreads, syncResult } = await provider.syncMailbox(tokens, syncOptions);

                if (!syncResult.success) {
                    throw new Error(syncResult.errors?.join(', ') || 'Sync failed');
                }

                threads = syncedThreads;
            }

            // Process synced threads
            for (const threadData of threads) {
                try {
                    await this.upsertThread(mailbox.id, threadData);
                    threadsProcessed++;
                    messagesProcessed += threadData.messages.length;
                } catch (error) {
                    errors.push(`Thread ${threadData.id}: ${error}`);
                }
            }

            // Update mailbox sync status - reset failure counters on success
            await prisma.mailbox.update({
                where: { id: mailboxId },
                data: {
                    syncStatus: 'SYNCED',
                    lastSyncAt: new Date(),
                    lastError: null,
                    consecutiveFailures: 0,  // Reset on success
                    healthScore: Math.min(100, mailbox.healthScore + 5),
                },
            });

            return {
                success: true,
                mailboxId,
                threadsProcessed,
                messagesProcessed,
                errors,
                duration: Date.now() - startTime,
            };
        } catch (error) {
            const classified = classifyError(error as Error, mailbox.provider);

            // Update mailbox with structured error tracking
            await prisma.mailbox.update({
                where: { id: mailboxId },
                data: {
                    syncStatus: 'ERROR',
                    lastError: classified.message,
                    lastFailureAt: new Date(),
                    consecutiveFailures: { increment: 1 },
                    failureCount: { increment: 1 },
                    // Auto-disable mailbox on auth errors
                    ...(classified.shouldDisableMailbox && {
                        isActive: false,
                        disabledAt: new Date(),
                        disabledReason: classified.category,
                    }),
                    healthScore: Math.max(0, mailbox.healthScore - (classified.isRetryable ? 5 : 20)),
                },
            });

            return {
                success: false,
                mailboxId,
                threadsProcessed,
                messagesProcessed,
                errors: [...errors, classified.message],
                duration: Date.now() - startTime,
            };
        }
    }

    // ============================================
    // SYNC ALL MAILBOXES FOR USER
    // ============================================

    async syncUserMailboxes(userId: string): Promise<SyncJobResult[]> {
        const mailboxes = await prisma.mailbox.findMany({
            where: {
                ownerId: userId,
                isActive: true,
            },
        });

        const results: SyncJobResult[] = [];

        for (const mailbox of mailboxes) {
            const result = await this.syncMailbox(mailbox.id);
            results.push(result);
        }

        return results;
    }

    // ============================================
    // SYNC SINGLE THREAD (for webhooks)
    // ============================================

    async syncThread(
        mailboxId: string,
        providerThreadId: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const mailbox = await prisma.mailbox.findUnique({
                where: { id: mailboxId },
            });

            if (!mailbox) {
                return { success: false, error: 'Mailbox not found' };
            }

            const provider = getEmailProvider(mailbox.provider);
            const tokens = this.getTokensFromMailbox(mailbox);

            const threadData = await provider.getThread(tokens, providerThreadId);

            if (!threadData) {
                return { success: false, error: 'Thread not found on provider' };
            }

            await this.upsertThread(mailboxId, threadData);

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    // ============================================
    // UPSERT THREAD & MESSAGES
    // ============================================

    private async upsertThread(
        mailboxId: string,
        threadData: EmailThreadData
    ): Promise<EmailThread> {
        // Check if thread exists
        let thread = await prisma.emailThread.findFirst({
            where: {
                mailboxId,
                providerThreadId: threadData.id,
            },
        });

        const participantEmails = threadData.participants.map(p => p.email);
        const lastEmailAt = threadData.lastMessageAt || new Date();

        if (thread) {
            // Update existing thread
            thread = await prisma.emailThread.update({
                where: { id: thread.id },
                data: {
                    subject: threadData.subject,
                    snippet: threadData.snippet,
                    participantEmails,
                    isRead: threadData.isRead ?? thread.isRead,
                    isStarred: threadData.isStarred ?? thread.isStarred,
                    labels: threadData.labels || [],
                    lastEmailAt,
                    updatedAt: new Date(),
                },
            });
        } else {
            // Create new thread
            thread = await prisma.emailThread.create({
                data: {
                    mailboxId,
                    providerThreadId: threadData.id,
                    subject: threadData.subject,
                    snippet: threadData.snippet,
                    participantEmails,
                    isRead: threadData.isRead ?? false,
                    isStarred: threadData.isStarred ?? false,
                    labels: threadData.labels || [],
                    lastEmailAt,
                },
            });
        }

        // Upsert messages
        const newInbound: Email[] = [];
        let createdAny = false;
        for (const messageData of threadData.messages) {
            const { email, created } = await this.upsertMessage(mailboxId, thread.id, messageData);
            if (created) {
                createdAny = true;
                if (email.direction === 'INBOUND') newInbound.push(email);
            }
        }

        // Link the conversation to the CRM (contact / client / mission). Never blocks the sync.
        if (createdAny && !thread.contactId) {
            try {
                await crmLinkingService.autoLinkThread(thread.id);
            } catch (error) {
                console.error('[sync] autoLinkThread failed:', error);
            }
        }

        // Sequences: a reply stops the contact's sequence, a bounce notice marks it bounced.
        for (const email of newInbound) {
            try {
                await sequenceService.handleInboundEmail({
                    mailboxId,
                    threadId: thread.id,
                    fromAddress: email.fromAddress,
                    subject: email.subject,
                    bodyText: email.bodyText,
                    receivedAt: email.receivedAt,
                });
            } catch (error) {
                console.error('[sync] sequence reply handling failed:', error);
            }
        }

        return thread;
    }

    private async upsertMessage(
        mailboxId: string,
        threadId: string,
        messageData: EmailMessageData
    ): Promise<{ email: Email; created: boolean }> {
        // Check if message exists
        const existingMessage = messageData.id
            ? await prisma.email.findFirst({
                where: {
                    mailboxId,
                    providerMessageId: messageData.id,
                },
            })
            : null;

        const toAddresses = messageData.to.map(t => t.email);
        const ccAddresses = messageData.cc?.map(c => c.email) || [];
        const bccAddresses = messageData.bcc?.map(b => b.email) || [];

        // Determine direction based on mailbox email
        const mailbox = await prisma.mailbox.findUnique({
            where: { id: mailboxId },
            select: { email: true },
        });

        const direction: EmailDirection =
            messageData.from.email.toLowerCase() === mailbox?.email.toLowerCase()
                ? 'OUTBOUND'
                : 'INBOUND';

        const status: EmailStatus = direction === 'OUTBOUND' ? 'SENT' : 'DELIVERED';

        if (existingMessage) {
            // Update existing message
            const email = await prisma.email.update({
                where: { id: existingMessage.id },
                data: {
                    subject: messageData.subject,
                    bodyText: messageData.bodyText,
                    bodyHtml: messageData.bodyHtml,
                    snippet: messageData.bodyText?.substring(0, 200),
                    updatedAt: new Date(),
                },
            });
            return { email, created: false };
        }

        // Create new message
        const email = await prisma.email.create({
            data: {
                mailboxId,
                threadId,
                providerMessageId: messageData.id,
                providerThreadId: messageData.threadId,
                fromAddress: messageData.from.email,
                fromName: messageData.from.name,
                toAddresses,
                ccAddresses,
                bccAddresses,
                replyTo: messageData.replyTo?.email,
                subject: messageData.subject,
                bodyText: messageData.bodyText,
                bodyHtml: messageData.bodyHtml,
                snippet: messageData.bodyText?.substring(0, 200),
                direction,
                status,
                receivedAt: messageData.date,
                sentAt: direction === 'OUTBOUND' ? messageData.date : null,
            },
        });
        return { email, created: true };
    }

    // ============================================
    // HELPERS
    // ============================================

    private getTokensFromMailbox(mailbox: Mailbox): OAuthTokens {
        if (!mailbox.accessToken) {
            throw new Error('No access token available');
        }

        return {
            accessToken: decrypt(mailbox.accessToken),
            refreshToken: mailbox.refreshToken ? decrypt(mailbox.refreshToken) : undefined,
            expiresAt: mailbox.tokenExpiry || undefined,
        };
    }
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const emailSyncService = new EmailSyncService();
