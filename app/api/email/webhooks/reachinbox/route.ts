// ============================================
// REACHINBOX WEBHOOK
// POST /api/email/webhooks/reachinbox
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { scheduleEmailSync } from '@/lib/email/queue';
import { emailSyncService } from '@/lib/email/services/sync-service';

type UnknownRecord = Record<string, unknown>;

type ReachInboxWebhookEvent = {
    event?: string;
    emailAccount?: string;
    messageId?: string;
};

type MailboxForSync = {
    id: string;
    ownerId: string;
};

function asRecord(value: unknown): UnknownRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as UnknownRecord
        : null;
}

function getString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function extractEvents(payload: unknown): ReachInboxWebhookEvent[] {
    const body = asRecord(payload);
    if (!body) return [];

    const candidates = Array.isArray(body.data)
        ? body.data
        : Array.isArray(body.events)
            ? body.events
            : [asRecord(body.data) || body];

    return candidates
        .map((candidate) => {
            const record = asRecord(candidate);
            if (!record) return null;

            const account = asRecord(record.account);
            const event = getString(record.event || record.type || body.event || body.type);
            const emailAccount = getString(
                record.email_account
                || record.emailAccount
                || record.mailboxEmail
                || record.accountEmail
                || record.email
                || account?.email,
            );
            const messageId = getString(
                record.message_id
                || record.messageId
                || record.email_id
                || record.emailId
                || record.id,
            );

            return { event, emailAccount, messageId };
        })
        .filter((event): event is ReachInboxWebhookEvent => Boolean(event?.emailAccount || event?.messageId));
}

function isAuthorized(req: NextRequest): boolean {
    const configuredSecret = process.env.REACHINBOX_WEBHOOK_SECRET;
    if (!configuredSecret) return true;

    const { searchParams } = new URL(req.url);
    const bearerToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const providedSecrets = [
        bearerToken,
        req.headers.get('x-webhook-secret'),
        req.headers.get('x-reachinbox-secret'),
        searchParams.get('secret'),
    ];

    return providedSecrets.some((secret) => secret === configuredSecret);
}

async function syncMailboxFromWebhook(
    mailbox: MailboxForSync,
    event: ReachInboxWebhookEvent,
): Promise<{ mode: 'thread' | 'queued' | 'inline'; success: boolean; error?: string }> {
    if (event.messageId) {
        const providerThreadId = event.emailAccount
            ? `${event.emailAccount}::${event.messageId}`
            : event.messageId;
        const threadResult = await emailSyncService.syncThread(mailbox.id, providerThreadId);

        if (threadResult.success) {
            return { mode: 'thread', success: true };
        }
    }

    try {
        await scheduleEmailSync({
            mailboxId: mailbox.id,
            userId: mailbox.ownerId,
            fullSync: false,
            maxThreads: 25,
        });

        return { mode: 'queued', success: true };
    } catch (queueError) {
        const inlineResult = await emailSyncService.syncMailbox(mailbox.id, {
            fullSync: false,
            maxThreads: 25,
        });

        return {
            mode: 'inline',
            success: inlineResult.success,
            error: inlineResult.errors.join(', ') || (queueError instanceof Error ? queueError.message : String(queueError)),
        };
    }
}

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ success: false, error: 'Invalid webhook secret' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const events = extractEvents(body);

        if (events.length === 0) {
            return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
        }

        const processedMailboxes = new Set<string>();
        let skipped = 0;
        let inlineFallbacks = 0;

        for (const event of events) {
            if (!event.emailAccount) {
                skipped++;
                continue;
            }

            const mailbox = await prisma.mailbox.findFirst({
                where: {
                    email: event.emailAccount,
                    provider: 'REACHINBOX',
                    isActive: true,
                },
                select: {
                    id: true,
                    ownerId: true,
                },
            });

            if (!mailbox) {
                skipped++;
                continue;
            }

            const syncResult = await syncMailboxFromWebhook(mailbox, event);
            if (syncResult.mode === 'inline') inlineFallbacks++;
            if (syncResult.success) processedMailboxes.add(mailbox.id);

            console.log(
                `[ReachInbox Webhook] ${event.event || 'event'} for ${event.emailAccount} processed via ${syncResult.mode}`,
            );
        }

        return NextResponse.json({
            success: true,
            processed: processedMailboxes.size,
            skipped,
            inlineFallbacks,
        });
    } catch (error) {
        console.error('[ReachInbox Webhook] Error:', error);
        return NextResponse.json({ success: false, error: 'Processing error' }, { status: 202 });
    }
}

export async function GET() {
    return NextResponse.json({ status: 'ok', provider: 'reachinbox' });
}
