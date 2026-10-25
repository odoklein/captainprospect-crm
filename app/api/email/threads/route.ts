// ============================================
// EMAIL THREADS API ROUTES
// GET /api/email/threads - List threads
//
// Query:
//   folder      inbox | unread | starred | sent | archive | trash | all | label:<name>
//   mailboxId   one mailbox (must be readable)
//   scope=team  MANAGER/DEVELOPER: every mailbox of the team
//   search      subject, snippet, participants, sender name/address
//   contactId, companyId, missionId, clientId, campaignId, assignedToId
//   page, limit
//
// Visibility: readable mailboxes (lib/email/permissions) + threads the user
// sent a message in (SDR sending from a mission default mailbox).
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { Prisma } from '@prisma/client';
import {
    canReadMailbox,
    getReadableMailboxIds,
    readableThreadWhere,
} from '@/lib/email/permissions';

function messageTime(e: { receivedAt: Date | null; sentAt: Date | null; createdAt: Date }): number {
    return (e.receivedAt ?? e.sentAt ?? e.createdAt).getTime();
}

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Non autorisé' },
                { status: 401 }
            );
        }
        const userId = session.user.id;
        const role = session.user.role;

        const { searchParams } = new URL(req.url);

        const mailboxId = searchParams.get('mailboxId');
        const scope = searchParams.get('scope');
        const folder = searchParams.get('folder') || 'inbox';
        const isRead = searchParams.get('isRead');
        const isStarred = searchParams.get('isStarred');
        const assignedToId = searchParams.get('assignedToId');
        const clientId = searchParams.get('clientId');
        const missionId = searchParams.get('missionId');
        const campaignId = searchParams.get('campaignId');
        const contactId = searchParams.get('contactId');
        const companyId = searchParams.get('companyId');
        const search = searchParams.get('search')?.trim();
        const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));
        const skip = (page - 1) * limit;

        // ---- Visibility -------------------------------------------------
        let visibility: Prisma.EmailThreadWhereInput;
        if (mailboxId) {
            const readable = await canReadMailbox(mailboxId, userId, role);
            visibility = readable
                ? { mailboxId }
                // Not their mailbox: only the threads they took part in
                : { mailboxId, emails: { some: { sentById: userId } } };
        } else {
            const mailboxIds = await getReadableMailboxIds(userId, role, { team: scope === 'team' });
            visibility = readableThreadWhere(userId, mailboxIds);
        }

        const and: Prisma.EmailThreadWhereInput[] = [visibility];

        // ---- Folder -----------------------------------------------------
        if (folder.startsWith('label:')) {
            const label = folder.slice('label:'.length);
            and.push({ labels: { has: label }, isTrashed: false });
        } else {
            switch (folder) {
                case 'inbox':
                    and.push({ isArchived: false, isTrashed: false, emails: { some: { direction: 'INBOUND' } } });
                    break;
                case 'unread':
                    and.push({ isRead: false, isArchived: false, isTrashed: false, emails: { some: { direction: 'INBOUND' } } });
                    break;
                case 'sent':
                    and.push({ isTrashed: false, emails: { some: { direction: 'OUTBOUND' } } });
                    break;
                case 'archive':
                    and.push({ isArchived: true, isTrashed: false });
                    break;
                case 'trash':
                    and.push({ isTrashed: true });
                    break;
                case 'starred':
                    and.push({ isStarred: true, isTrashed: false });
                    break;
                case 'drafts':
                    and.push({ isTrashed: false, emails: { some: { status: 'DRAFT' } } });
                    break;
                case 'all':
                default:
                    and.push({ isTrashed: false });
                    break;
            }
        }

        // ---- Filters ----------------------------------------------------
        if (isRead === 'true' || isRead === 'false') and.push({ isRead: isRead === 'true' });
        if (isStarred === 'true') and.push({ isStarred: true });
        if (assignedToId) and.push({ assignedToId });
        if (clientId) and.push({ clientId });
        if (missionId) and.push({ missionId });
        if (campaignId) and.push({ campaignId });
        if (contactId) {
            and.push({
                OR: [
                    { contactId },
                    { emails: { some: { contactId } } },
                ],
            });
        }
        if (companyId) {
            and.push({
                OR: [
                    { contact: { companyId } },
                    { emails: { some: { contact: { companyId } } } },
                ],
            });
        }

        if (search) {
            and.push({
                OR: [
                    { subject: { contains: search, mode: 'insensitive' } },
                    { snippet: { contains: search, mode: 'insensitive' } },
                    { participantEmails: { has: search.toLowerCase() } },
                    {
                        emails: {
                            some: {
                                OR: [
                                    { fromAddress: { contains: search, mode: 'insensitive' } },
                                    { fromName: { contains: search, mode: 'insensitive' } },
                                ],
                            },
                        },
                    },
                ],
            });
        }

        const where: Prisma.EmailThreadWhereInput = { AND: and };

        const [threads, total] = await Promise.all([
            prisma.emailThread.findMany({
                where,
                select: {
                    id: true,
                    mailboxId: true,
                    subject: true,
                    snippet: true,
                    participantEmails: true,
                    isRead: true,
                    isStarred: true,
                    isArchived: true,
                    isTrashed: true,
                    labels: true,
                    sentiment: true,
                    priority: true,
                    slaDeadline: true,
                    lastEmailAt: true,
                    createdAt: true,
                    clientId: true,
                    missionId: true,
                    campaignId: true,
                    contactId: true,
                    opportunityId: true,
                    contact: {
                        select: { id: true, firstName: true, lastName: true, companyId: true },
                    },
                    mission: { select: { id: true, name: true } },
                    assignedToId: true,
                    assignedTo: { select: { id: true, name: true, email: true } },
                    mailbox: {
                        select: {
                            id: true,
                            email: true,
                            displayName: true,
                            provider: true,
                            owner: { select: { id: true, name: true } },
                        },
                    },
                    _count: { select: { emails: true } },
                    // Small rows only: used for the latest message and the
                    // envoyé / ouvert / répondu status of the conversation
                    emails: {
                        select: {
                            id: true,
                            fromAddress: true,
                            fromName: true,
                            toAddresses: true,
                            direction: true,
                            status: true,
                            openCount: true,
                            firstOpenedAt: true,
                            receivedAt: true,
                            sentAt: true,
                            createdAt: true,
                            sentBy: { select: { id: true, name: true } },
                        },
                        take: 50,
                    },
                },
                orderBy: { lastEmailAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.emailThread.count({ where }),
        ]);

        const transformedThreads = threads.map(({ emails, _count, ...thread }) => {
            const sorted = [...emails].sort((a, b) => messageTime(b) - messageTime(a));
            const latest = sorted[0] ?? null;
            const outbound = sorted.filter((e) => e.direction === 'OUTBOUND');
            const lastOutbound = outbound[0] ?? null;
            const hasReply = lastOutbound
                ? lastOutbound.status === 'REPLIED'
                    || sorted.some((e) => e.direction === 'INBOUND' && messageTime(e) > messageTime(lastOutbound))
                : false;
            const opened = outbound.some((e) => e.openCount > 0 || !!e.firstOpenedAt || e.status === 'OPENED' || e.status === 'CLICKED');
            const bounced = lastOutbound?.status === 'BOUNCED' || lastOutbound?.status === 'FAILED';

            return {
                ...thread,
                messageCount: _count.emails,
                inboundCount: emails.filter((e) => e.direction === 'INBOUND').length,
                outboundCount: outbound.length,
                latestEmail: latest
                    ? {
                        id: latest.id,
                        fromAddress: latest.fromAddress,
                        fromName: latest.fromName,
                        toAddresses: latest.toAddresses,
                        direction: latest.direction,
                        status: latest.status,
                        date: (latest.receivedAt ?? latest.sentAt ?? latest.createdAt).toISOString(),
                    }
                    : null,
                /** Delivery status of our side of the conversation (null when we never wrote). */
                outreachStatus: lastOutbound
                    ? (bounced ? 'bounced' : hasReply ? 'replied' : opened ? 'opened' : 'sent')
                    : null,
                lastSentBy: lastOutbound?.sentBy ?? null,
            };
        });

        return NextResponse.json({
            success: true,
            data: {
                threads: transformedThreads,
                total,
                page,
                limit,
                hasMore: skip + threads.length < total,
            },
        });
    } catch (error) {
        console.error('GET /api/email/threads error:', error);
        return NextResponse.json(
            { success: false, error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
