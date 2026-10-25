// ============================================
// Shared thread loading for /api/email/threads/[id]/** routes
// (private folder: not a route)
// ============================================

import { prisma } from '@/lib/prisma';
import { canReadThread } from '@/lib/email/permissions';

/** CRM entities a thread is linked to, with what the UI needs to link to them. */
export const THREAD_LINKS_SELECT = {
    clientId: true,
    missionId: true,
    contactId: true,
    campaignId: true,
    opportunityId: true,
    client: { select: { id: true, name: true, email: true, industry: true } },
    mission: {
        select: {
            id: true,
            name: true,
            clientId: true,
            client: { select: { id: true, name: true } },
        },
    },
    campaign: { select: { id: true, name: true } },
    contact: {
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            title: true,
            company: {
                select: {
                    id: true,
                    name: true,
                    listId: true,
                    list: { select: { id: true, name: true, missionId: true } },
                },
            },
        },
    },
    opportunity: { select: { id: true, needSummary: true, urgency: true } },
} as const;

export async function loadThreadLinks(threadId: string) {
    return prisma.emailThread.findUnique({
        where: { id: threadId },
        select: { id: true, ...THREAD_LINKS_SELECT },
    });
}

/**
 * Loads the thread's mailbox access shape and checks read access.
 * Returns null when the thread does not exist, false when access is denied.
 */
export async function authorizeThread(threadId: string, userId: string, role?: string | null) {
    const thread = await prisma.emailThread.findUnique({
        where: { id: threadId },
        select: {
            id: true,
            mailboxId: true,
            missionId: true,
            mailbox: {
                select: {
                    ownerId: true,
                    permissions: { where: { userId }, select: { canRead: true } },
                },
            },
        },
    });
    if (!thread) return null;
    const allowed = await canReadThread(thread, userId, role);
    return allowed ? thread : false;
}
