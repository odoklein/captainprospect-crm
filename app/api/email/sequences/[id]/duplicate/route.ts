// ============================================
// POST /api/email/sequences/[id]/duplicate — copy settings + steps as a new DRAFT
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSequenceUser, jsonError, loadOwnedSequence, unauthorized } from '../../_lib/shared';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getSequenceUser();
        if (!user) return unauthorized();
        const { id } = await params;
        const owned = await loadOwnedSequence(id, user);
        if ('response' in owned) return owned.response;

        const source = await prisma.emailSequence.findUnique({
            where: { id },
            include: { steps: { orderBy: { order: 'asc' } } },
        });
        if (!source) return jsonError('Séquence introuvable', 404);

        const copy = await prisma.emailSequence.create({
            data: {
                name: `${source.name} (copie)`.slice(0, 120),
                description: source.description,
                mailboxId: source.mailboxId,
                campaignId: source.campaignId,
                createdById: user.id,
                status: 'DRAFT',
                stopOnReply: source.stopOnReply,
                stopOnBounce: source.stopOnBounce,
                trackOpens: source.trackOpens,
                trackClicks: source.trackClicks,
                sendOnWeekends: source.sendOnWeekends,
                sendTimeStart: source.sendTimeStart,
                sendTimeEnd: source.sendTimeEnd,
                timezone: source.timezone,
                steps: {
                    create: source.steps.map((s, index) => ({
                        order: index,
                        name: s.name,
                        subject: s.subject,
                        bodyHtml: s.bodyHtml,
                        bodyText: s.bodyText,
                        delayDays: s.delayDays,
                        delayHours: s.delayHours,
                        delayMinutes: s.delayMinutes,
                        skipIfOpened: s.skipIfOpened,
                        skipIfClicked: s.skipIfClicked,
                        skipIfReplied: s.skipIfReplied,
                    })),
                },
            },
            select: { id: true, name: true },
        });

        return NextResponse.json({ success: true, data: copy });
    } catch (error) {
        console.error('POST /api/email/sequences/[id]/duplicate error:', error);
        return jsonError('Impossible de dupliquer la séquence', 500);
    }
}
