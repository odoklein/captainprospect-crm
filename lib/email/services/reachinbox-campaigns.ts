// ============================================
// REACHINBOX CAMPAIGNS SERVICE
// Fetches campaigns (with live stats) from every connected
// ReachInbox mailbox and merges the persisted client links.
// Links live in "ReachInboxCampaignLink" (see
// add-reachinbox-campaign-links.sql) and are read via raw SQL so the
// service keeps working with a Prisma client generated before the model
// was added; if the table does not exist yet everything degrades to
// "no links" instead of failing.
// ============================================

import { randomUUID } from 'crypto';
import type { EmailProvider } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { decrypt, encrypt } from '@/lib/encryption';
import {
    reachInboxProvider,
    type ReachInboxCampaignAnalytics,
    type ReachInboxCampaignSummary,
} from '../providers/reachinbox';

export interface ReachInboxCampaignWithContext extends ReachInboxCampaignSummary {
    mailboxId: string;
    mailboxEmail: string;
    client: { id: string; name: string } | null;
}

export interface CampaignLinkRow {
    campaignId: string;
    clientId: string;
    clientName: string;
    mailboxId: string | null;
}

export interface ReachInboxDashboardData {
    connected: boolean;
    connection: {
        id: string;
        email: string;
        displayName: string | null;
        lastSyncAt: Date | null;
        lastError: string | null;
        createdAt: Date;
    } | null;
    summary: {
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
    };
    daily: Array<{
        date: string;
        sent: number;
        opened: number;
        replied: number;
        clicked: number;
        bounced: number;
    }>;
    campaigns: ReachInboxCampaignWithContext[];
    warmup: {
        warmupSent: number;
        inboxPlacement: number;
        spamPlacement: number;
        healthScore: number;
    } | null;
    errors: { mailboxEmail: string; message: string }[];
}

type ReachInboxMailboxCredentials = {
    id: string;
    email: string;
    displayName: string | null;
    accessToken: string | null;
    lastSyncAt: Date | null;
    lastError: string | null;
    createdAt: Date;
};

export async function fetchCampaignLinks(): Promise<CampaignLinkRow[]> {
    try {
        return await prisma.$queryRaw<CampaignLinkRow[]>`
            SELECT l."campaignId", l."clientId", l."mailboxId", c."name" AS "clientName"
            FROM "ReachInboxCampaignLink" l
            JOIN "Client" c ON c."id" = l."clientId"
        `;
    } catch {
        // Table not created yet — degrade gracefully (no links).
        return [];
    }
}

export async function upsertCampaignLink(params: {
    campaignId: string;
    campaignName: string;
    mailboxId: string | null;
    clientId: string;
}): Promise<void> {
    const id = randomUUID();
    await prisma.$executeRaw`
        INSERT INTO "ReachInboxCampaignLink"
            ("id", "campaignId", "campaignName", "mailboxId", "clientId", "createdAt", "updatedAt")
        VALUES
            (${id}, ${params.campaignId}, ${params.campaignName}, ${params.mailboxId}, ${params.clientId}, NOW(), NOW())
        ON CONFLICT ("campaignId") DO UPDATE SET
            "clientId" = EXCLUDED."clientId",
            "campaignName" = EXCLUDED."campaignName",
            "mailboxId" = EXCLUDED."mailboxId",
            "updatedAt" = NOW()
    `;
}

export async function deleteCampaignLink(campaignId: string): Promise<void> {
    await prisma.$executeRaw`
        DELETE FROM "ReachInboxCampaignLink" WHERE "campaignId" = ${campaignId}
    `;
}

/** True when the error means the link table has not been created yet. */
export function isMissingLinkTableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('ReachInboxCampaignLink') && (message.includes('does not exist') || message.includes('42P01'));
}

export async function fetchAllReachInboxCampaigns(): Promise<{
    campaigns: ReachInboxCampaignWithContext[];
    errors: { mailboxEmail: string; message: string }[];
}> {
    const mailboxes = await prisma.mailbox.findMany({
        where: {
            provider: 'REACHINBOX' as EmailProvider,
            isActive: true,
            accessToken: { not: null },
        },
        select: { id: true, email: true, accessToken: true },
        orderBy: { createdAt: 'asc' },
    });

    const links = await fetchCampaignLinks();
    const linkByCampaign = new Map(links.map((link) => [link.campaignId, link]));

    const campaigns: ReachInboxCampaignWithContext[] = [];
    const errors: { mailboxEmail: string; message: string }[] = [];
    const seenApiKeys = new Set<string>();
    const seenCampaignIds = new Set<string>();
    const campaignRequests: Array<{
        mailbox: { id: string; email: string };
        apiKey: string;
    }> = [];

    for (const mailbox of mailboxes) {
        if (!mailbox.accessToken) continue;

        let apiKey: string;
        try {
            apiKey = decrypt(mailbox.accessToken);
        } catch {
            errors.push({ mailboxEmail: mailbox.email, message: 'Clé API illisible (déchiffrement)' });
            continue;
        }

        // Several CRM mailboxes can point to the same ReachInbox account.
        if (seenApiKeys.has(apiKey)) continue;
        seenApiKeys.add(apiKey);
        campaignRequests.push({ mailbox: { id: mailbox.id, email: mailbox.email }, apiKey });
    }

    const results = await Promise.allSettled(
        campaignRequests.map(async (entry) => ({
            mailbox: entry.mailbox,
            list: await reachInboxProvider.listCampaigns({ accessToken: entry.apiKey }),
        })),
    );

    for (const result of results) {
        if (result.status === 'fulfilled') {
            const { mailbox, list } = result.value;
            for (const campaign of list) {
                if (seenCampaignIds.has(campaign.id)) continue;
                seenCampaignIds.add(campaign.id);
                const link = linkByCampaign.get(campaign.id);
                campaigns.push({
                    ...campaign,
                    mailboxId: mailbox.id,
                    mailboxEmail: mailbox.email,
                    client: link ? { id: link.clientId, name: link.clientName } : null,
                });
            }
        } else {
            errors.push({ mailboxEmail: 'ReachInbox', message: result.reason instanceof Error ? result.reason.message : String(result.reason) });
        }
    }

    return { campaigns, errors };
}

export async function connectReachInboxApiKey(params: {
    userId: string;
    apiKey: string;
}): Promise<{ id: string; email: string; displayName: string | null }> {
    const apiKey = params.apiKey.trim();
    const profile = await reachInboxProvider.getUserProfile({ accessToken: apiKey });
    await reachInboxProvider.getAnalyticsSummary({
        accessToken: apiKey,
    }, {
        startDate: toDateParam(daysAgo(7)),
        endDate: toDateParam(new Date()),
    });

    const email = profile.email && profile.email !== 'reachinbox-account'
        ? profile.email
        : `reachinbox-${params.userId}@integration.local`;
    const displayName = profile.name || 'ReachInbox';

    const mailbox = await prisma.mailbox.upsert({
        where: {
            ownerId_email: {
                ownerId: params.userId,
                email,
            },
        },
        update: {
            provider: 'REACHINBOX' as EmailProvider,
            displayName,
            accessToken: encrypt(apiKey),
            syncStatus: 'SYNCED',
            lastSyncAt: new Date(),
            lastError: null,
            isActive: true,
        },
        create: {
            ownerId: params.userId,
            provider: 'REACHINBOX' as EmailProvider,
            email,
            displayName,
            accessToken: encrypt(apiKey),
            type: 'PERSONAL',
            syncStatus: 'SYNCED',
            lastSyncAt: new Date(),
            isActive: true,
        },
        select: {
            id: true,
            email: true,
            displayName: true,
        },
    });

    return mailbox;
}

export async function fetchReachInboxDashboard(params: {
    startDate: string;
    endDate: string;
    campaignIds?: string[];
    includeCampaigns?: boolean;
}): Promise<ReachInboxDashboardData> {
    const mailbox = await findActiveReachInboxMailbox();

    if (!mailbox?.accessToken) {
        return emptyDashboard(false);
    }

    let apiKey: string;
    try {
        apiKey = decrypt(mailbox.accessToken);
    } catch {
        return {
            ...emptyDashboard(true),
            connection: {
                id: mailbox.id,
                email: mailbox.email,
                displayName: mailbox.displayName,
                lastSyncAt: mailbox.lastSyncAt,
                lastError: 'Cle API illisible',
                createdAt: mailbox.createdAt,
            },
            errors: [{ mailboxEmail: mailbox.email, message: 'Cle API illisible' }],
        };
    }

    const errors: { mailboxEmail: string; message: string }[] = [];
    const connection = {
        id: mailbox.id,
        email: mailbox.email,
        displayName: mailbox.displayName,
        lastSyncAt: mailbox.lastSyncAt,
        lastError: mailbox.lastError,
        createdAt: mailbox.createdAt,
    };

    let summary = emptyDashboard(true).summary;
    let daily: ReachInboxDashboardData['daily'] = [];
    let warmup: ReachInboxDashboardData['warmup'] = null;
    let campaigns: ReachInboxCampaignWithContext[] = [];

    const [analyticsResult, campaignResult, warmupResult] = await Promise.allSettled([
        reachInboxProvider.getAnalyticsSummary(
            { accessToken: apiKey },
            {
                startDate: params.startDate,
                endDate: params.endDate,
                campaignIds: params.campaignIds,
            },
        ),
        params.includeCampaigns === false
            ? Promise.resolve({ campaigns: [], errors: [] })
            : fetchAllReachInboxCampaigns(),
        reachInboxProvider.getWarmupAnalytics({ accessToken: apiKey }),
    ]);

    if (analyticsResult.status === 'fulfilled') {
        summary = withRates(analyticsResult.value);
        daily = analyticsResult.value.daily;
        await prisma.mailbox.update({
            where: { id: mailbox.id },
            data: { lastSyncAt: new Date(), lastError: null, syncStatus: 'SYNCED' },
        });
    } else {
        const message = analyticsResult.reason instanceof Error ? analyticsResult.reason.message : String(analyticsResult.reason);
        errors.push({ mailboxEmail: mailbox.email, message });
        await prisma.mailbox.update({
            where: { id: mailbox.id },
            data: { lastError: message, syncStatus: 'ERROR' },
        }).catch(() => undefined);
    }

    if (campaignResult.status === 'fulfilled') {
        campaigns = campaignResult.value.campaigns;
        errors.push(...campaignResult.value.errors);
    } else {
        errors.push({
            mailboxEmail: mailbox.email,
            message: campaignResult.reason instanceof Error ? campaignResult.reason.message : String(campaignResult.reason),
        });
    }

    if (warmupResult.status === 'fulfilled') {
        warmup = warmupResult.value;
    }

    return {
        connected: true,
        connection,
        summary,
        daily,
        campaigns,
        warmup,
        errors,
    };
}

export async function fetchReachInboxCampaignAnalytics(params: {
    campaignId: string;
    startDate: string;
    endDate: string;
}): Promise<ReachInboxCampaignAnalytics & { connected: boolean; connection: { id: string; email: string } | null }> {
    const mailbox = await findActiveReachInboxMailbox();
    if (!mailbox?.accessToken) {
        throw new Error('ReachInbox n est pas connecte');
    }

    let apiKey: string;
    try {
        apiKey = decrypt(mailbox.accessToken);
    } catch {
        throw new Error('Cle API ReachInbox illisible');
    }

    const analytics = await reachInboxProvider.getCampaignAnalytics(
        { accessToken: apiKey },
        {
            campaignId: params.campaignId,
            startDate: params.startDate,
            endDate: params.endDate,
        },
    );

    return {
        ...analytics,
        connected: true,
        connection: { id: mailbox.id, email: mailbox.email },
    };
}

function withRates(summary: Omit<ReachInboxDashboardData['summary'], 'openRate' | 'replyRate' | 'clickRate' | 'bounceRate'>): ReachInboxDashboardData['summary'] {
    return {
        ...summary,
        openRate: rate(summary.opened, summary.sent),
        replyRate: rate(summary.replied, summary.sent),
        clickRate: rate(summary.clicked, summary.sent),
        bounceRate: rate(summary.bounced, summary.sent),
    };
}

async function findActiveReachInboxMailbox(): Promise<ReachInboxMailboxCredentials | null> {
    return prisma.mailbox.findFirst({
        where: {
            provider: 'REACHINBOX' as EmailProvider,
            isActive: true,
            accessToken: { not: null },
        },
        select: {
            id: true,
            email: true,
            displayName: true,
            accessToken: true,
            lastSyncAt: true,
            lastError: true,
            createdAt: true,
        },
        orderBy: { updatedAt: 'desc' },
    });
}

function emptyDashboard(connected: boolean): ReachInboxDashboardData {
    return {
        connected,
        connection: null,
        summary: withRates({
            sent: 0,
            opened: 0,
            replied: 0,
            clicked: 0,
            bounced: 0,
            leads: 0,
            opportunities: 0,
            positiveReplies: 0,
            negativeReplies: 0,
            automaticLeadReplies: 0,
            openRateTracked: 0,
            clickedRateTracked: 0,
            opportunitiesRate: 0,
            userOpportunityRate: 0,
        }),
        daily: [],
        campaigns: [],
        warmup: null,
        errors: [],
    };
}

function rate(part: number, total: number): number {
    if (!total) return 0;
    return Math.round((part / total) * 1000) / 10;
}

function daysAgo(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
}

function toDateParam(date: Date): string {
    return date.toISOString().slice(0, 10);
}
