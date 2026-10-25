// ============================================
// SINGLE THREAD API ROUTES
// GET /api/email/threads/[id] - Get thread with messages, CRM links, permissions
// PATCH /api/email/threads/[id] - Update thread (read, star, archive, labels…)
// DELETE /api/email/threads/[id] - Trash (or ?permanent=true delete) a thread
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMailboxSendAccess, isMailboxSupervisor } from '@/lib/email/permissions';
import { THREAD_LINKS_SELECT, authorizeThread } from '../_lib/thread-context';

function messageTime(e: { receivedAt: Date | null; sentAt: Date | null; createdAt: Date }): number {
    return (e.receivedAt ?? e.sentAt ?? e.createdAt).getTime();
}

function forbidden() {
    return NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 });
}

function notFound() {
    return NextResponse.json({ success: false, error: 'Conversation introuvable' }, { status: 404 });
}

// ============================================
// GET - Get thread with all messages
// ============================================

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
        }

        const { id } = await params;
        const access = await authorizeThread(id, session.user.id, session.user.role);
        if (access === null) return notFound();
        if (access === false) return forbidden();

        const thread = await prisma.emailThread.findUnique({
            where: { id },
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
                summary: true,
                slaDeadline: true,
                lastEmailAt: true,
                createdAt: true,
                assignedToId: true,
                ...THREAD_LINKS_SELECT,
                mailbox: {
                    select: {
                        id: true,
                        ownerId: true,
                        email: true,
                        displayName: true,
                        provider: true,
                        owner: { select: { id: true, name: true } },
                    },
                },
                emails: {
                    select: {
                        id: true,
                        fromAddress: true,
                        fromName: true,
                        toAddresses: true,
                        ccAddresses: true,
                        subject: true,
                        bodyHtml: true,
                        bodyText: true,
                        direction: true,
                        status: true,
                        openCount: true,
                        firstOpenedAt: true,
                        receivedAt: true,
                        sentAt: true,
                        createdAt: true,
                        sentBy: { select: { id: true, name: true } },
                        attachments: {
                            select: { id: true, filename: true, mimeType: true, size: true, storageKey: true, url: true },
                        },
                    },
                },
                comments: {
                    orderBy: { createdAt: 'asc' },
                    select: {
                        id: true,
                        content: true,
                        createdAt: true,
                        user: { select: { id: true, name: true, email: true } },
                    },
                },
                assignedTo: { select: { id: true, name: true, email: true } },
            },
        });

        if (!thread) return notFound();

        // Chronological order: synced messages carry receivedAt, ours sentAt
        const emails = [...thread.emails]
            .sort((a, b) => messageTime(a) - messageTime(b))
            .map((e) => ({
                ...e,
                // Storage details stay server-side; the UI only needs to know
                // whether the file can be downloaded
                attachments: e.attachments.map(({ storageKey, url, ...a }) => ({
                    ...a,
                    downloadable: !!storageKey || !!url,
                })),
            }));

        if (!thread.isRead) {
            await prisma.emailThread.update({ where: { id }, data: { isRead: true } });
        }

        // Same rule as /api/email/send, so the reply button never lies
        const sendAccess = await getMailboxSendAccess({
            mailboxId: thread.mailboxId,
            userId: session.user.id,
            userRole: session.user.role,
            missionId: thread.missionId,
        });

        const permissions = {
            canRead: true,
            canSend: sendAccess.allowed,
            canSendAs: sendAccess.allowed,
            sendBlockedReason: sendAccess.allowed ? null : sendAccess.reason ?? null,
            canDelete:
                thread.mailbox.ownerId === session.user.id || isMailboxSupervisor(session.user.role),
        };

        return NextResponse.json({
            success: true,
            data: {
                ...thread,
                isRead: true,
                emails,
                permissions,
            },
        });
    } catch (error) {
        console.error('GET /api/email/threads/[id] error:', error);
        return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
    }
}

// ============================================
// PATCH - Update thread
// ============================================

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
        }

        const { id } = await params;
        const access = await authorizeThread(id, session.user.id, session.user.role);
        if (access === null) return notFound();
        if (access === false) return forbidden();

        const body = await req.json();
        const updateData: Record<string, unknown> = {};

        if (typeof body.isRead === 'boolean') updateData.isRead = body.isRead;
        if (typeof body.isStarred === 'boolean') updateData.isStarred = body.isStarred;
        if (typeof body.isArchived === 'boolean') updateData.isArchived = body.isArchived;
        if (typeof body.isTrashed === 'boolean') updateData.isTrashed = body.isTrashed;
        if (body.assignedToId !== undefined) updateData.assignedToId = body.assignedToId || null;
        if (Array.isArray(body.labels)) {
            updateData.labels = Array.from(
                new Set(
                    (body.labels as unknown[])
                        .filter((l): l is string => typeof l === 'string')
                        .map((l) => l.trim())
                        .filter((l) => l.length > 0 && l.length <= 40),
                ),
            ).slice(0, 20);
        }
        if (body.slaDeadline !== undefined) {
            updateData.slaDeadline = body.slaDeadline ? new Date(body.slaDeadline) : null;
        }

        const updated = await prisma.emailThread.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                isRead: true,
                isStarred: true,
                isArchived: true,
                isTrashed: true,
                labels: true,
                assignedToId: true,
                slaDeadline: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({ success: true, data: updated });
    } catch (error) {
        console.error('PATCH /api/email/threads/[id] error:', error);
        return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
    }
}

// ============================================
// DELETE - Trash (default) or permanently delete a thread
// ============================================

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
        }

        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const permanent = searchParams.get('permanent') === 'true';

        const thread = await prisma.emailThread.findUnique({
            where: { id },
            select: { id: true, mailbox: { select: { ownerId: true } } },
        });
        if (!thread) return notFound();

        // Only the mailbox owner or a supervisor can delete
        if (thread.mailbox.ownerId !== session.user.id && !isMailboxSupervisor(session.user.role)) {
            return forbidden();
        }

        if (permanent) {
            await prisma.emailThread.delete({ where: { id } });
            return NextResponse.json({ success: true, message: 'Conversation supprimée définitivement' });
        }

        await prisma.emailThread.update({ where: { id }, data: { isTrashed: true } });
        return NextResponse.json({ success: true, message: 'Conversation déplacée dans la corbeille' });
    } catch (error) {
        console.error('DELETE /api/email/threads/[id] error:', error);
        return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
    }
}
