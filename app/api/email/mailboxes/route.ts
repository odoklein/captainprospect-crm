// ============================================
// MAILBOX API ROUTES
// GET /api/email/mailboxes - List mailboxes
// POST /api/email/mailboxes - Create custom IMAP/SMTP mailbox
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { encrypt } from '@/lib/encryption';
import { EmailProvider, MailboxType } from '@prisma/client';
import { scheduleEmailSync } from '@/lib/email/queue';
import { getSendableMailboxes, isMailboxSupervisor } from '@/lib/email/permissions';

const MAILBOX_LIST_SELECT = {
    id: true,
    provider: true,
    email: true,
    displayName: true,
    type: true,
    syncStatus: true,
    warmupStatus: true,
    healthScore: true,
    dailySendLimit: true,
    sentToday: true,
    lastSyncAt: true,
    lastError: true,
    isActive: true,
    createdAt: true,
    ownerId: true,
    owner: { select: { id: true, name: true } },
    _count: {
        select: {
            threads: true,
            emails: true,
        },
    },
} as const;

// ============================================
// GET - List mailboxes
//   (default)            owned (+ shared when includeShared=true)
//   scope=team           MANAGER/DEVELOPER: every active mailbox, with owner
//   scope=sendable       mailboxes the user can send from; with missionId the
//                        mission default mailbox comes first (isMissionDefault)
// ============================================

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Non autorisé' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(req.url);
        const includeShared = searchParams.get('includeShared') === 'true';
        const type = searchParams.get('type') as MailboxType | null;
        const scope = searchParams.get('scope');

        if (scope === 'sendable') {
            const sendable = await getSendableMailboxes(
                session.user.id,
                session.user.role,
                searchParams.get('missionId'),
            );
            return NextResponse.json({ success: true, data: sendable });
        }

        if (scope === 'team') {
            if (!isMailboxSupervisor(session.user.role)) {
                return NextResponse.json(
                    { success: false, error: 'Accès réservé aux managers' },
                    { status: 403 }
                );
            }
            const team = await prisma.mailbox.findMany({
                where: { isActive: true, ...(type && { type }) },
                select: MAILBOX_LIST_SELECT,
                orderBy: [{ ownerId: 'asc' }, { createdAt: 'asc' }],
            });
            // The user's own mailboxes first, then colleagues'
            team.sort((a, b) => Number(b.ownerId === session.user.id) - Number(a.ownerId === session.user.id));
            return NextResponse.json({
                success: true,
                data: team.map((m) => ({ ...m, isOwn: m.ownerId === session.user.id })),
            });
        }

        // Get owned mailboxes
        const whereClause = {
            ownerId: session.user.id,
            isActive: true,
            ...(type && { type }),
        };

        const ownedMailboxes = await prisma.mailbox.findMany({
            where: whereClause,
            select: MAILBOX_LIST_SELECT,
            orderBy: { createdAt: 'desc' },
        });

        // Get shared mailboxes if requested
        let sharedMailboxes: typeof ownedMailboxes = [];
        if (includeShared) {
            const permissions = await prisma.mailboxPermission.findMany({
                where: {
                    userId: session.user.id,
                    canRead: true,
                },
                include: {
                    mailbox: { select: MAILBOX_LIST_SELECT },
                },
            });

            sharedMailboxes = permissions
                .map(p => p.mailbox)
                .filter(m => m.isActive);
        }

        // Merge and dedupe
        const allMailboxes = [...ownedMailboxes];
        for (const shared of sharedMailboxes) {
            if (!allMailboxes.find(m => m.id === shared.id)) {
                allMailboxes.push(shared);
            }
        }

        return NextResponse.json({
            success: true,
            data: allMailboxes.map((m) => ({ ...m, isOwn: m.ownerId === session.user.id })),
        });
    } catch (error) {
        console.error('GET /api/email/mailboxes error:', error);
        return NextResponse.json(
            { success: false, error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// ============================================
// POST - Create custom IMAP/SMTP mailbox
// ============================================

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Non autorisé' },
                { status: 401 }
            );
        }

        // Only allow certain roles (CLIENT for portal IMAP connection)
        const allowedRoles = ['MANAGER', 'SDR', 'BUSINESS_DEVELOPER', 'CLIENT'];
        if (!allowedRoles.includes(session.user.role)) {
            return NextResponse.json(
                { success: false, error: 'Rôle non autorisé' },
                { status: 403 }
            );
        }

        const body = await req.json();
        const {
            provider,
            email,
            displayName,
            imapHost,
            imapPort,
            smtpHost,
            smtpPort,
            password,
            apiKey,
            type: requestedType,
        } = body;

        const type = session.user.role === 'CLIENT' ? 'CLIENT' : (requestedType || 'PERSONAL');
        const requestedProvider: EmailProvider = provider === 'REACHINBOX' ? 'REACHINBOX' : 'CUSTOM';

        // Validate required fields
        if (!email?.trim()) {
            return NextResponse.json(
                { success: false, error: 'Email requis' },
                { status: 400 }
            );
        }

        if (requestedProvider === 'CUSTOM' && (!imapHost || !smtpHost || !password)) {
            return NextResponse.json(
                { success: false, error: 'Configuration IMAP/SMTP requise' },
                { status: 400 }
            );
        }

        if (requestedProvider === 'REACHINBOX' && !apiKey?.trim()) {
            return NextResponse.json(
                { success: false, error: 'Clé API ReachInbox requise' },
                { status: 400 }
            );
        }

        // Check if mailbox already exists
        const existing = await prisma.mailbox.findFirst({
            where: {
                ownerId: session.user.id,
                email: email.trim(),
            },
        });

        if (existing) {
            return NextResponse.json(
                { success: false, error: 'Cette boîte mail est déjà connectée' },
                { status: 400 }
            );
        }

        // Create mailbox
        const mailbox = await prisma.mailbox.create({
            data: {
                ownerId: session.user.id,
                provider: requestedProvider,
                email: email.trim(),
                displayName: displayName?.trim() || null,
                imapHost: requestedProvider === 'CUSTOM' ? imapHost.trim() : null,
                imapPort: requestedProvider === 'CUSTOM' ? (imapPort || 993) : null,
                smtpHost: requestedProvider === 'CUSTOM' ? smtpHost.trim() : null,
                smtpPort: requestedProvider === 'CUSTOM' ? (smtpPort || 587) : null,
                password: requestedProvider === 'CUSTOM' ? encrypt(password) : null,
                accessToken: requestedProvider === 'REACHINBOX' ? encrypt(apiKey.trim()) : null,
                type: type as MailboxType,
                syncStatus: 'PENDING',
                isActive: true,
            },
            select: {
                id: true,
                provider: true,
                email: true,
                displayName: true,
                type: true,
                syncStatus: true,
                isActive: true,
                createdAt: true,
            },
        });

        // Schedule initial sync (queue-based if Redis available, or trigger synchronously)
        try {
            await scheduleEmailSync({
                mailboxId: mailbox.id,
                userId: session.user.id,
                fullSync: true,
                maxThreads: 100,
            });
            console.log('[Mailbox] Initial sync scheduled via queue');
        } catch (syncError) {
            console.warn('[Mailbox] Queue not available, will sync on next manual trigger:', syncError instanceof Error ? syncError.message : syncError);
            // Queue not available (Redis not running) - user can manually sync
            // Don't fail the request, mailbox is created successfully
        }

        return NextResponse.json({
            success: true,
            data: mailbox,
        });
    } catch (error) {
        console.error('POST /api/email/mailboxes error:', error);
        return NextResponse.json(
            { success: false, error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
