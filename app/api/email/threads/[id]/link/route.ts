// ============================================
// THREAD LINKING API ROUTES
// POST /api/email/threads/[id]/link - Link thread to a CRM entity
//      body: { type: 'contact'|'mission'|'client'|'campaign', entityId } | { autoLink: true }
// DELETE /api/email/threads/[id]/link?type=… - Unlink thread from a CRM entity
// Both return the thread's links afterwards (same shape as GET /threads/[id]).
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { crmLinkingService, type LinkField } from '@/lib/email/services/linking-service';
import { authorizeThread, loadThreadLinks } from '../../_lib/thread-context';

const LINK_TYPES: LinkField[] = ['client', 'mission', 'contact', 'campaign', 'opportunity'];

async function entityExists(type: string, id: string): Promise<boolean> {
    switch (type) {
        case 'client':
            return !!(await prisma.client.findUnique({ where: { id }, select: { id: true } }));
        case 'mission':
            return !!(await prisma.mission.findUnique({ where: { id }, select: { id: true } }));
        case 'contact':
            return !!(await prisma.contact.findUnique({ where: { id }, select: { id: true } }));
        case 'campaign':
            return !!(await prisma.campaign.findUnique({ where: { id }, select: { id: true } }));
        default:
            return false;
    }
}

// ============================================
// POST - Link thread to CRM entity
// ============================================

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
        }

        const { id: threadId } = await params;
        const body = await req.json().catch(() => ({}));
        const { type, entityId, autoLink } = body as { type?: string; entityId?: string; autoLink?: boolean };

        const access = await authorizeThread(threadId, session.user.id, session.user.role);
        if (access === null) {
            return NextResponse.json({ success: false, error: 'Conversation introuvable' }, { status: 404 });
        }
        if (access === false) {
            return NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 });
        }

        if (autoLink) {
            const result = await crmLinkingService.autoLinkThread(threadId);
            const links = await loadThreadLinks(threadId);
            return NextResponse.json({
                success: true,
                data: { ...links, autoLink: result },
            });
        }

        if (!type || !entityId) {
            return NextResponse.json({ success: false, error: 'Type et entityId requis' }, { status: 400 });
        }
        if (!['client', 'mission', 'contact', 'campaign'].includes(type)) {
            return NextResponse.json({ success: false, error: 'Type de lien invalide' }, { status: 400 });
        }
        if (!(await entityExists(type, entityId))) {
            return NextResponse.json({ success: false, error: 'Élément introuvable' }, { status: 404 });
        }

        switch (type) {
            case 'client':
                await crmLinkingService.linkThreadToClient(threadId, entityId);
                break;
            case 'mission':
                await crmLinkingService.linkThreadToMission(threadId, entityId);
                break;
            case 'contact':
                await crmLinkingService.linkThreadToContact(threadId, entityId);
                break;
            case 'campaign':
                await crmLinkingService.linkThreadToCampaign(threadId, entityId);
                break;
        }

        const links = await loadThreadLinks(threadId);
        return NextResponse.json({ success: true, data: links });
    } catch (error) {
        console.error('POST /api/email/threads/[id]/link error:', error);
        return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
    }
}

// ============================================
// DELETE - Unlink thread from CRM entity
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

        const { id: threadId } = await params;
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type') as LinkField | null;

        if (!type || !LINK_TYPES.includes(type)) {
            return NextResponse.json({ success: false, error: 'Type requis' }, { status: 400 });
        }

        const access = await authorizeThread(threadId, session.user.id, session.user.role);
        if (access === null) {
            return NextResponse.json({ success: false, error: 'Conversation introuvable' }, { status: 404 });
        }
        if (access === false) {
            return NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 });
        }

        await crmLinkingService.unlinkThread(threadId, type);
        const links = await loadThreadLinks(threadId);

        return NextResponse.json({ success: true, data: links });
    } catch (error) {
        console.error('DELETE /api/email/threads/[id]/link error:', error);
        return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
    }
}
