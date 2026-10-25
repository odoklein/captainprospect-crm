// ============================================
// SINGLE MAILBOX API ROUTES
// GET /api/email/mailboxes/[id] - Get mailbox details
// PATCH /api/email/mailboxes/[id] - Update mailbox
// DELETE /api/email/mailboxes/[id] - Delete mailbox
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MailboxType } from '@prisma/client';

// ============================================
// GET - Get mailbox details
// ============================================

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Non autorisé' },
                { status: 401 }
            );
        }

        const { id } = await params;

        // Get mailbox
        const mailbox = await prisma.mailbox.findUnique({
            where: { id },
            select: {
                id: true,
                ownerId: true,
                provider: true,
                email: true,
                displayName: true,
                type: true,
                syncStatus: true,
                warmupStatus: true,
                warmupDailyLimit: true,
                dailySendLimit: true,
                sentToday: true,
                signature: true,
                signatureHtml: true,
                healthScore: true,
                lastSyncAt: true,
                lastError: true,
                lastSendReset: true,
                trackingDomain: true,
                consecutiveFailures: true,
                lastFailureAt: true,
                disabledAt: true,
                disabledReason: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                owner: { select: { id: true, name: true } },
                _count: {
                    select: {
                        threads: true,
                        emails: true,
                        sequences: true,
                    },
                },
                permissions: {
                    select: {
                        id: true,
                        userId: true,
                        canRead: true,
                        canSend: true,
                        canSendAs: true,
                        requiresApproval: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                role: true,
                            },
                        },
                    },
                },
            },
        });

        if (!mailbox) {
            return NextResponse.json(
                { success: false, error: 'Boîte mail non trouvée' },
                { status: 404 }
            );
        }

        // Check access
        const hasAccess = mailbox.ownerId === session.user.id ||
            mailbox.permissions.some(p => p.userId === session.user.id && p.canRead) ||
            session.user.role === 'MANAGER';

        if (!hasAccess) {
            return NextResponse.json(
                { success: false, error: 'Accès non autorisé' },
                { status: 403 }
            );
        }

        // sentToday is only reset lazily on the next send: if the last reset was
        // before today (Paris), nothing has been sent today yet.
        const parisDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
        const sentTodayEffective = parisDay(mailbox.lastSendReset) === parisDay(new Date()) ? mailbox.sentToday : 0;

        return NextResponse.json({
            success: true,
            data: { ...mailbox, sentTodayEffective },
        });
    } catch (error) {
        console.error('GET /api/email/mailboxes/[id] error:', error);
        return NextResponse.json(
            { success: false, error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// ============================================
// PATCH - Update mailbox
// ============================================

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Non autorisé' },
                { status: 401 }
            );
        }

        const { id } = await params;
        const body = await req.json();

        // Get mailbox
        const mailbox = await prisma.mailbox.findUnique({
            where: { id },
            select: { ownerId: true },
        });

        if (!mailbox) {
            return NextResponse.json(
                { success: false, error: 'Boîte mail non trouvée' },
                { status: 404 }
            );
        }

        // Only owner or manager can update
        if (mailbox.ownerId !== session.user.id && session.user.role !== 'MANAGER') {
            return NextResponse.json(
                { success: false, error: 'Accès non autorisé' },
                { status: 403 }
            );
        }

        // Build update data
        const updateData: Record<string, unknown> = {};

        if (body.displayName !== undefined) {
            updateData.displayName = body.displayName?.trim() || null;
        }
        if (body.type !== undefined && ['PERSONAL', 'SHARED', 'CLIENT', 'CAMPAIGN'].includes(body.type)) {
            updateData.type = body.type as MailboxType;
        }
        if (body.signature !== undefined) {
            updateData.signature = body.signature;
        }
        if (body.signatureHtml !== undefined) {
            updateData.signatureHtml = body.signatureHtml;
        }
        if (typeof body.dailySendLimit === 'number') {
            updateData.dailySendLimit = Math.max(1, Math.min(500, body.dailySendLimit));
        }
        if (typeof body.warmupDailyLimit === 'number') {
            updateData.warmupDailyLimit = Math.max(1, Math.min(100, body.warmupDailyLimit));
        }
        if (typeof body.isActive === 'boolean') {
            updateData.isActive = body.isActive;
        }
        if (body.trackingDomain !== undefined) {
            const raw = typeof body.trackingDomain === 'string' ? body.trackingDomain.trim() : '';
            if (!raw) {
                updateData.trackingDomain = null;
            } else {
                let parsed: URL;
                try {
                    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
                } catch {
                    return NextResponse.json(
                        { success: false, error: 'Domaine de suivi invalide (ex. : https://track.mondomaine.fr)' },
                        { status: 400 }
                    );
                }
                updateData.trackingDomain = `${parsed.protocol}//${parsed.host}`;
            }
        }

        // Update mailbox
        const updated = await prisma.mailbox.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                provider: true,
                email: true,
                displayName: true,
                type: true,
                syncStatus: true,
                warmupStatus: true,
                warmupDailyLimit: true,
                dailySendLimit: true,
                signature: true,
                signatureHtml: true,
                healthScore: true,
                trackingDomain: true,
                isActive: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({
            success: true,
            data: updated,
        });
    } catch (error) {
        console.error('PATCH /api/email/mailboxes/[id] error:', error);
        return NextResponse.json(
            { success: false, error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}

// ============================================
// DELETE - Delete mailbox
// ============================================

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Non autorisé' },
                { status: 401 }
            );
        }

        const { id } = await params;

        // Get mailbox
        const mailbox = await prisma.mailbox.findUnique({
            where: { id },
            select: { ownerId: true },
        });

        if (!mailbox) {
            return NextResponse.json(
                { success: false, error: 'Boîte mail non trouvée' },
                { status: 404 }
            );
        }

        // Only owner or manager can delete
        if (mailbox.ownerId !== session.user.id && session.user.role !== 'MANAGER') {
            return NextResponse.json(
                { success: false, error: 'Accès non autorisé' },
                { status: 403 }
            );
        }

        // Delete mailbox (cascades to threads, emails, etc.)
        await prisma.mailbox.delete({
            where: { id },
        });

        return NextResponse.json({
            success: true,
            message: 'Boîte mail supprimée',
        });
    } catch (error) {
        console.error('DELETE /api/email/mailboxes/[id] error:', error);
        return NextResponse.json(
            { success: false, error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
