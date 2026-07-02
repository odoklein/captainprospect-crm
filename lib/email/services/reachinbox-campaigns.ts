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
import { decrypt } from '@/lib/encryption';
import { reachInboxProvider, type ReachInboxCampaignSummary } from '../providers/reachinbox';

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

        try {
            const list = await reachInboxProvider.listCampaigns({ accessToken: apiKey });
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
        } catch (err) {
            errors.push({ mailboxEmail: mailbox.email, message: (err as Error).message });
        }
    }

    return { campaigns, errors };
}
