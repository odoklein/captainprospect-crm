// ============================================
// MAILBOX PERMISSIONS API
// GET /api/email/mailboxes/[id]/permissions
// PUT /api/email/mailboxes/[id]/permissions
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type PermissionInput = {
    userId: string;
    canRead?: boolean;
    canSend?: boolean;
    canSendAs?: boolean;
    requiresApproval?: boolean;
};

async function canManageMailbox(mailboxId: string, userId: string, role?: string | null) {
    const mailbox = await prisma.mailbox.findUnique({
        where: { id: mailboxId },
        select: { id: true, ownerId: true },
    });

    if (!mailbox) return { allowed: false, mailbox: null };

    return {
        allowed: mailbox.ownerId === userId || role === 'MANAGER',
        mailbox,
    };
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Non autorisÃ©' }, { status: 401 });
        }

        const { id } = await params;
        const { allowed, mailbox } = await canManageMailbox(id, session.user.id, session.user.role);

        if (!mailbox) {
            return NextResponse.json({ success: false, error: 'BoÃ®te mail non trouvÃ©e' }, { status: 404 });
        }

        if (!allowed) {
            return NextResponse.json({ success: false, error: 'AccÃ¨s non autorisÃ©' }, { status: 403 });
        }

        const permissions = await prisma.mailboxPermission.findMany({
            where: { mailboxId: id },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        return NextResponse.json({ success: true, data: permissions });
    } catch (error) {
        console.error('GET /api/email/mailboxes/[id]/permissions error:', error);
        return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Non autorisÃ©' }, { status: 401 });
        }

        const { id } = await params;
        const { allowed, mailbox } = await canManageMailbox(id, session.user.id, session.user.role);

        if (!mailbox) {
            return NextResponse.json({ success: false, error: 'BoÃ®te mail non trouvÃ©e' }, { status: 404 });
        }

        if (!allowed) {
            return NextResponse.json({ success: false, error: 'AccÃ¨s non autorisÃ©' }, { status: 403 });
        }

        const body = await req.json();
        const permissions: PermissionInput[] = Array.isArray(body.permissions) ? body.permissions : [];

        if (permissions.length === 0) {
            return NextResponse.json({ success: false, error: 'Permissions requises' }, { status: 400 });
        }

        const targetUserIds = permissions
            .map((permission) => permission.userId)
            .filter((userId): userId is string => typeof userId === 'string' && userId.trim().length > 0);

        const users = await prisma.user.findMany({
            where: {
                id: { in: targetUserIds },
                isActive: true,
            },
            select: { id: true },
        });

        const activeUserIds = new Set(users.map((user) => user.id));

        await prisma.$transaction(
            permissions
                .filter((permission) => activeUserIds.has(permission.userId) && permission.userId !== mailbox.ownerId)
                .map((permission) => {
                    const canRead = permission.canRead ?? true;
                    const canSend = permission.canSend ?? false;

                    return prisma.mailboxPermission.upsert({
                        where: {
                            mailboxId_userId: {
                                mailboxId: id,
                                userId: permission.userId,
                            },
                        },
                        update: {
                            canRead,
                            canSend,
                            canSendAs: permission.canSendAs ?? false,
                            requiresApproval: permission.requiresApproval ?? false,
                        },
                        create: {
                            mailboxId: id,
                            userId: permission.userId,
                            canRead,
                            canSend,
                            canSendAs: permission.canSendAs ?? false,
                            requiresApproval: permission.requiresApproval ?? false,
                        },
                    });
                }),
        );

        const updated = await prisma.mailboxPermission.findMany({
            where: { mailboxId: id },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        return NextResponse.json({ success: true, data: updated });
    } catch (error) {
        console.error('PUT /api/email/mailboxes/[id]/permissions error:', error);
        return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
    }
}
