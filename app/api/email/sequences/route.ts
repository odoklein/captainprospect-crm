// ============================================
// SEQUENCES API ROUTES
// GET  /api/email/sequences - List sequences (+ per-sequence stats, engine health)
// POST /api/email/sequences - Create sequence (settings + steps)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma, SequenceStatus } from '@prisma/client';
import { sequenceService } from '@/lib/email/services/sequence-service';
import {
    MAILBOX_SELECT,
    canUseMailbox,
    engineStatus,
    getSequenceUser,
    jsonError,
    parseSettings,
    unauthorized,
    validateStepsInput,
} from './_lib/shared';

// ============================================
// GET - List sequences
// ============================================

export async function GET(req: NextRequest) {
    try {
        const user = await getSequenceUser();
        if (!user) return unauthorized();

        const { searchParams } = new URL(req.url);
        const mailboxId = searchParams.get('mailboxId');
        const status = searchParams.get('status') as SequenceStatus | null;
        const campaignId = searchParams.get('campaignId');

        const where: Prisma.EmailSequenceWhereInput = user.isAdmin ? {} : { createdById: user.id };
        if (mailboxId) where.mailboxId = mailboxId;
        if (status && ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'].includes(status)) where.status = status;
        if (campaignId) where.campaignId = campaignId;

        const sequences = await prisma.emailSequence.findMany({
            where,
            include: {
                mailbox: { select: MAILBOX_SELECT },
                campaign: { select: { id: true, name: true } },
                createdBy: { select: { id: true, name: true } },
                _count: { select: { steps: true, enrollments: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });

        const ids = sequences.map((s) => s.id);
        const [byStatus, nextSends, sentBySequence, contactedRows, engine] = await Promise.all([
            prisma.emailSequenceEnrollment.groupBy({
                by: ['sequenceId', 'status'],
                where: { sequenceId: { in: ids } },
                _count: { _all: true },
            }),
            prisma.emailSequenceEnrollment.groupBy({
                by: ['sequenceId'],
                where: { sequenceId: { in: ids }, status: 'ACTIVE', nextStepAt: { not: null } },
                _min: { nextStepAt: true },
            }),
            prisma.emailSequenceStep.groupBy({
                by: ['sequenceId'],
                where: { sequenceId: { in: ids } },
                _sum: { totalSent: true },
            }),
            prisma.emailSequenceEnrollment.groupBy({
                by: ['sequenceId'],
                where: { sequenceId: { in: ids }, emails: { some: {} } },
                _count: { _all: true },
            }),
            engineStatus(),
        ]);

        const data = sequences.map((s) => {
            const statusCounts: Record<string, number> = {};
            for (const row of byStatus) if (row.sequenceId === s.id) statusCounts[row.status] = row._count._all;
            return {
                id: s.id,
                name: s.name,
                description: s.description,
                status: s.status,
                mailbox: s.mailbox,
                campaign: s.campaign,
                createdBy: s.createdBy,
                createdAt: s.createdAt,
                updatedAt: s.updatedAt,
                stepsCount: s._count.steps,
                enrolled: s._count.enrollments,
                active: statusCounts.ACTIVE ?? 0,
                paused: statusCounts.PAUSED ?? 0,
                completed: statusCounts.COMPLETED ?? 0,
                replied: Math.max(statusCounts.REPLIED ?? 0, s.totalReplied),
                bounced: Math.max(statusCounts.BOUNCED ?? 0, s.totalBounced),
                sent: sentBySequence.find((r) => r.sequenceId === s.id)?._sum.totalSent ?? 0,
                contacted: contactedRows.find((r) => r.sequenceId === s.id)?._count._all ?? 0,
                nextSendAt: nextSends.find((r) => r.sequenceId === s.id)?._min.nextStepAt ?? null,
                // Kept for older consumers
                _count: s._count,
            };
        });

        return NextResponse.json({ success: true, data, meta: { engine } });
    } catch (error) {
        console.error('GET /api/email/sequences error:', error);
        return jsonError('Impossible de charger les séquences', 500);
    }
}

// ============================================
// POST - Create sequence
// ============================================

export async function POST(req: NextRequest) {
    try {
        const user = await getSequenceUser();
        if (!user) return unauthorized();

        const body = (await req.json()) as Record<string, unknown>;
        if (!String(body.name ?? '').trim()) return jsonError('Donnez un nom à la séquence', 400);
        if (!body.mailboxId) return jsonError("Choisissez une boîte d'envoi", 400);

        const { data: settings, error } = parseSettings(body);
        if (error) return jsonError(error, 400);

        const mailboxId = String(body.mailboxId);
        if (!(await canUseMailbox(user, mailboxId))) {
            return jsonError("Vous ne pouvez pas envoyer depuis cette boîte", 403);
        }

        const parsedSteps = validateStepsInput(body.steps ?? []);
        if (parsedSteps.error) return jsonError(parsedSteps.error, 400);

        const sequence = await prisma.emailSequence.create({
            data: {
                name: settings.name as string,
                description: (settings.description as string | null | undefined) ?? null,
                mailboxId,
                campaignId: (settings.campaignId as string | null | undefined) ?? null,
                createdById: user.id,
                status: 'DRAFT',
                stopOnReply: (settings.stopOnReply as boolean | undefined) ?? true,
                stopOnBounce: (settings.stopOnBounce as boolean | undefined) ?? true,
                trackOpens: (settings.trackOpens as boolean | undefined) ?? true,
                trackClicks: (settings.trackClicks as boolean | undefined) ?? true,
                sendOnWeekends: (settings.sendOnWeekends as boolean | undefined) ?? false,
                sendTimeStart: (settings.sendTimeStart as string | null | undefined) ?? null,
                sendTimeEnd: (settings.sendTimeEnd as string | null | undefined) ?? null,
                timezone: (settings.timezone as string | undefined) ?? 'Europe/Paris',
            },
            select: { id: true },
        });

        if (parsedSteps.steps && parsedSteps.steps.length > 0) {
            const saved = await sequenceService.saveSteps(sequence.id, parsedSteps.steps);
            if (!saved.ok) return jsonError(saved.error, 400);
        }

        return NextResponse.json({ success: true, data: { id: sequence.id } });
    } catch (error) {
        console.error('POST /api/email/sequences error:', error);
        return jsonError('Impossible de créer la séquence', 500);
    }
}
