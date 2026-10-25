// ============================================
// CRM LINKING SERVICE
// Links email threads to CRM entities (contact → mission → client).
//
// In this CRM a Contact belongs to a Company, which belongs to a List, which
// belongs to a Mission, which belongs to a Client. So a contact link carries
// its mission and client with it; a mission link carries its client.
// Automatic linking only fills empty fields: a manual link is never replaced.
// ============================================

import { prisma } from '@/lib/prisma';

// ============================================
// TYPES
// ============================================

export interface LinkingResult {
    threadId: string;
    linked: {
        clientId?: string;
        missionId?: string;
        contactId?: string;
        campaignId?: string;
        opportunityId?: string;
    };
    confidence: number;
    method: 'exact_match' | 'domain_match' | 'manual' | 'sequence';
}

export interface LinkingConfig {
    autoLinkOnSync: boolean;
    autoLinkToClient: boolean;
    autoLinkToMission: boolean;
    autoLinkToContact: boolean;
    autoLinkToCampaign: boolean;
    confidenceThreshold: number;
}

export type LinkField = 'client' | 'mission' | 'contact' | 'campaign' | 'opportunity';

export interface ResolvedLinks {
    contactId?: string;
    missionId?: string;
    clientId?: string;
}

const PUBLIC_EMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com',
    'outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr', 'live.com', 'live.fr', 'msn.com',
    'yahoo.com', 'yahoo.fr', 'ymail.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com',
    'protonmail.com', 'proton.me',
    'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'laposte.net', 'bbox.fr',
    'gmx.com', 'gmx.fr',
]);

// ============================================
// CRM LINKING SERVICE CLASS
// ============================================

export class CrmLinkingService {
    private defaultConfig: LinkingConfig = {
        autoLinkOnSync: true,
        autoLinkToClient: true,
        autoLinkToMission: true,
        autoLinkToContact: true,
        autoLinkToCampaign: true,
        confidenceThreshold: 0.7,
    };

    // ============================================
    // RESOLUTION HELPERS (shared with the sending service)
    // ============================================

    /** Mission and client a contact belongs to (through company → list → mission). */
    async resolveContactLinks(contactId: string): Promise<ResolvedLinks> {
        const contact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: {
                id: true,
                company: {
                    select: {
                        list: { select: { missionId: true, mission: { select: { clientId: true } } } },
                    },
                },
            },
        });
        if (!contact) return {};
        const list = contact.company?.list;
        return {
            contactId: contact.id,
            missionId: list?.missionId ?? undefined,
            clientId: list?.mission?.clientId ?? undefined,
        };
    }

    /** Client of a mission. */
    async resolveMissionClient(missionId: string): Promise<string | undefined> {
        const mission = await prisma.mission.findUnique({
            where: { id: missionId },
            select: { clientId: true },
        });
        return mission?.clientId ?? undefined;
    }

    /**
     * Links for an outbound email: explicit contact/mission first, the rest
     * derived (contact → its list's mission → client).
     */
    async resolveOutboundLinks(input: { contactId?: string | null; missionId?: string | null }): Promise<ResolvedLinks> {
        const out: ResolvedLinks = {};
        if (input.contactId) {
            const fromContact = await this.resolveContactLinks(input.contactId);
            Object.assign(out, fromContact);
        }
        if (input.missionId) {
            out.missionId = input.missionId;
            out.clientId = (await this.resolveMissionClient(input.missionId)) ?? out.clientId;
        }
        return out;
    }

    // ============================================
    // AUTO-LINK THREAD
    // ============================================

    async autoLinkThread(
        threadId: string,
        config?: Partial<LinkingConfig>
    ): Promise<LinkingResult> {
        const cfg = { ...this.defaultConfig, ...config };
        const result: LinkingResult = {
            threadId,
            linked: {},
            confidence: 0,
            method: 'exact_match',
        };

        try {
            const thread = await prisma.emailThread.findUnique({
                where: { id: threadId },
                select: {
                    id: true,
                    participantEmails: true,
                    contactId: true,
                    missionId: true,
                    clientId: true,
                    campaignId: true,
                    emails: {
                        select: {
                            fromAddress: true,
                            toAddresses: true,
                            ccAddresses: true,
                            contactId: true,
                            missionId: true,
                        },
                    },
                    mailbox: { select: { email: true } },
                },
            });

            if (!thread) return result;

            const mailboxEmail = thread.mailbox.email.toLowerCase();
            const mailboxDomain = mailboxEmail.split('@')[1];
            const externalEmails = this.extractEmailAddresses(thread).filter(
                (e) => e !== mailboxEmail && e.split('@')[1] !== mailboxDomain,
            );

            const found: ResolvedLinks & { campaignId?: string } = {};

            // 1. An email of the thread was sent with an explicit contact/mission
            const sentWithContext = thread.emails.find((e) => e.contactId || e.missionId);
            if (sentWithContext) {
                Object.assign(found, await this.resolveOutboundLinks(sentWithContext));
                result.method = 'manual';
                result.confidence = 1;
            }

            // 2. A participant is a known contact
            if (!found.contactId && cfg.autoLinkToContact && externalEmails.length > 0) {
                const contact = await prisma.contact.findFirst({
                    where: { email: { in: externalEmails, mode: 'insensitive' } },
                    select: { id: true },
                    orderBy: { updatedAt: 'desc' },
                });
                if (contact) {
                    const links = await this.resolveContactLinks(contact.id);
                    found.contactId = links.contactId;
                    if (cfg.autoLinkToMission && !found.missionId) found.missionId = links.missionId;
                    if (cfg.autoLinkToClient && !found.clientId) found.clientId = links.clientId;
                    result.confidence = 1;
                    result.method = 'exact_match';
                }
            }

            // 3. A participant is (from the domain of) a client
            if (!found.clientId && cfg.autoLinkToClient && externalEmails.length > 0) {
                const client = await this.findClientMatch(externalEmails);
                if (client) {
                    found.clientId = client.id;
                    if (!found.contactId) {
                        result.confidence = client.confidence;
                        result.method = client.confidence === 1 ? 'exact_match' : 'domain_match';
                    }
                    if (cfg.autoLinkToMission && !found.missionId) {
                        const mission = await this.findSingleActiveMission(client.id);
                        if (mission) found.missionId = mission.id;
                    }
                }
            }

            // 4. Thread started by a sequence
            if (cfg.autoLinkToCampaign) {
                const campaign = await this.findCampaignMatch(thread.id);
                if (campaign) {
                    found.campaignId = campaign.id;
                    if (!found.contactId && !found.clientId) result.method = 'sequence';
                }
            }

            // Only fill what is empty — never overwrite a manual link
            const data: LinkingResult['linked'] = {};
            if (found.contactId && !thread.contactId) data.contactId = found.contactId;
            if (found.missionId && !thread.missionId) data.missionId = found.missionId;
            if (found.clientId && !thread.clientId) data.clientId = found.clientId;
            if (found.campaignId && !thread.campaignId) data.campaignId = found.campaignId;

            if (Object.keys(data).length > 0) {
                await prisma.emailThread.update({ where: { id: threadId }, data });
            }
            result.linked = data;
            return result;
        } catch (error) {
            console.error('Auto-link thread error:', error);
            return result;
        }
    }

    // ============================================
    // MANUAL LINKING
    // ============================================

    async linkThreadToClient(threadId: string, clientId: string): Promise<void> {
        const thread = await prisma.emailThread.findUnique({
            where: { id: threadId },
            select: { mission: { select: { clientId: true } } },
        });
        await prisma.emailThread.update({
            where: { id: threadId },
            data: {
                clientId,
                // A mission of another client no longer makes sense
                ...(thread?.mission && thread.mission.clientId !== clientId ? { missionId: null } : {}),
            },
        });
    }

    async linkThreadToMission(threadId: string, missionId: string): Promise<void> {
        const clientId = await this.resolveMissionClient(missionId);
        await prisma.emailThread.update({
            where: { id: threadId },
            data: { missionId, ...(clientId ? { clientId } : {}) },
        });
    }

    async linkThreadToContact(threadId: string, contactId: string): Promise<void> {
        const [thread, links] = await Promise.all([
            prisma.emailThread.findUnique({
                where: { id: threadId },
                select: { missionId: true, clientId: true },
            }),
            this.resolveContactLinks(contactId),
        ]);
        await prisma.emailThread.update({
            where: { id: threadId },
            data: {
                contactId,
                // The contact's mission/client fill the thread when it has none
                ...(!thread?.missionId && links.missionId ? { missionId: links.missionId } : {}),
                ...(!thread?.clientId && links.clientId ? { clientId: links.clientId } : {}),
            },
        });
    }

    async linkThreadToCampaign(threadId: string, campaignId: string): Promise<void> {
        const campaign = await prisma.campaign.findUnique({
            where: { id: campaignId },
            select: { missionId: true, mission: { select: { clientId: true } } },
        });

        await prisma.emailThread.update({
            where: { id: threadId },
            data: {
                campaignId,
                missionId: campaign?.missionId,
                clientId: campaign?.mission?.clientId,
            },
        });
    }

    async unlinkThread(threadId: string, field: LinkField): Promise<void> {
        const fieldMap: Record<LinkField, string> = {
            client: 'clientId',
            mission: 'missionId',
            contact: 'contactId',
            campaign: 'campaignId',
            opportunity: 'opportunityId',
        };

        await prisma.emailThread.update({
            where: { id: threadId },
            data: { [fieldMap[field]]: null },
        });
    }

    // ============================================
    // BULK LINKING
    // ============================================

    async autoLinkUnlinkedThreads(
        mailboxId?: string,
        limit: number = 100
    ): Promise<{ processed: number; linked: number }> {
        const threads = await prisma.emailThread.findMany({
            where: {
                ...(mailboxId && { mailboxId }),
                clientId: null,
                contactId: null,
                missionId: null,
            },
            select: { id: true },
            take: limit,
            orderBy: { createdAt: 'desc' },
        });

        let linked = 0;
        for (const thread of threads) {
            const result = await this.autoLinkThread(thread.id);
            if (Object.keys(result.linked).length > 0) linked++;
        }

        return { processed: threads.length, linked };
    }

    // ============================================
    // PRIVATE HELPERS
    // ============================================

    private extractEmailAddresses(thread: {
        participantEmails: string[];
        emails: { fromAddress: string; toAddresses: string[]; ccAddresses: string[] }[];
    }): string[] {
        const emails = new Set<string>();
        thread.participantEmails.forEach((e) => emails.add(e.toLowerCase()));
        for (const email of thread.emails) {
            emails.add(email.fromAddress.toLowerCase());
            email.toAddresses.forEach((e) => emails.add(e.toLowerCase()));
            email.ccAddresses.forEach((e) => emails.add(e.toLowerCase()));
        }
        return Array.from(emails).filter((e) => e.includes('@'));
    }

    private async findClientMatch(emails: string[]): Promise<{ id: string; confidence: number } | null> {
        const exact = await prisma.client.findFirst({
            where: { email: { in: emails, mode: 'insensitive' } },
            select: { id: true },
        });
        if (exact) return { id: exact.id, confidence: 1 };

        const domains = Array.from(new Set(emails.map((e) => e.split('@')[1]).filter(Boolean)));
        for (const domain of domains) {
            if (PUBLIC_EMAIL_DOMAINS.has(domain)) continue;
            const byDomain = await prisma.client.findFirst({
                where: { email: { endsWith: `@${domain}`, mode: 'insensitive' } },
                select: { id: true },
            });
            if (byDomain) return { id: byDomain.id, confidence: 0.8 };
        }
        return null;
    }

    /** The client's active mission, only when there is exactly one (no guessing). */
    private async findSingleActiveMission(clientId: string): Promise<{ id: string } | null> {
        const missions = await prisma.mission.findMany({
            where: { clientId, status: 'ACTIVE' },
            select: { id: true },
            take: 2,
        });
        return missions.length === 1 ? missions[0] : null;
    }

    private async findCampaignMatch(threadId: string): Promise<{ id: string } | null> {
        const sequenceEmail = await prisma.email.findFirst({
            where: { threadId, sequenceEnrollmentId: { not: null } },
            select: {
                sequenceEnrollment: {
                    select: { sequence: { select: { campaignId: true } } },
                },
            },
        });
        const campaignId = sequenceEmail?.sequenceEnrollment?.sequence?.campaignId;
        return campaignId ? { id: campaignId } : null;
    }
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const crmLinkingService = new CrmLinkingService();
