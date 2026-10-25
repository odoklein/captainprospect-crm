// ============================================
// GET /api/email/sequences/[id]/enrollments?status=&q=&page=
// Enrolled contacts with their progress and last email event.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { EnrollmentStatus, Prisma } from '@prisma/client';
import { ENROLLMENT_STATUSES, getSequenceUser, jsonError, loadOwnedSequence, unauthorized } from '../../_lib/shared';

const PAGE_SIZE = 50;

function tokenValue(tokens: unknown, key: string): string | null {
    if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return null;
    const v = (tokens as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getSequenceUser();
        if (!user) return unauthorized();
        const { id } = await params;
        const owned = await loadOwnedSequence(id, user);
        if ('response' in owned) return owned.response;

        const sp = new URL(req.url).searchParams;
        const status = sp.get('status') as EnrollmentStatus | null;
        const q = (sp.get('q') || '').trim();
        const page = Math.max(1, Number(sp.get('page')) || 1);

        const where: Prisma.EmailSequenceEnrollmentWhereInput = { sequenceId: id };
        if (status && ENROLLMENT_STATUSES.includes(status)) where.status = status;
        if (q) {
            where.contact = {
                OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                    { email: { contains: q, mode: 'insensitive' } },
                    { company: { name: { contains: q, mode: 'insensitive' } } },
                ],
            };
        }

        const [total, rows] = await Promise.all([
            prisma.emailSequenceEnrollment.count({ where }),
            prisma.emailSequenceEnrollment.findMany({
                where,
                orderBy: [{ enrolledAt: 'desc' }],
                skip: (page - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
                select: {
                    id: true,
                    status: true,
                    currentStep: true,
                    nextStepAt: true,
                    enrolledAt: true,
                    completedAt: true,
                    exitedAt: true,
                    exitReason: true,
                    tokens: true,
                    contact: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            title: true,
                            company: { select: { name: true } },
                        },
                    },
                    emails: {
                        where: { direction: 'OUTBOUND' },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: {
                            id: true,
                            subject: true,
                            status: true,
                            sentAt: true,
                            openCount: true,
                            clickCount: true,
                            firstOpenedAt: true,
                        },
                    },
                    _count: { select: { emails: true } },
                },
            }),
        ]);

        const data = rows.map((r) => ({
            id: r.id,
            status: r.status,
            currentStep: r.currentStep,
            nextStepAt: r.nextStepAt,
            enrolledAt: r.enrolledAt,
            completedAt: r.completedAt,
            exitedAt: r.exitedAt,
            exitReason: r.exitReason,
            lastError: tokenValue(r.tokens, '__lastError'),
            repliedAt: tokenValue(r.tokens, '__repliedAt'),
            emailsSent: r._count.emails,
            contact: {
                id: r.contact.id,
                name: [r.contact.firstName, r.contact.lastName].filter(Boolean).join(' ') || null,
                email: r.contact.email,
                title: r.contact.title,
                companyName: r.contact.company?.name ?? null,
            },
            lastEmail: r.emails[0] ?? null,
        }));

        return NextResponse.json({ success: true, data, meta: { total, page, pageSize: PAGE_SIZE } });
    } catch (error) {
        console.error('GET /api/email/sequences/[id]/enrollments error:', error);
        return jsonError('Impossible de charger les contacts inscrits', 500);
    }
}
