// ============================================
// GET /api/email/sequences/[id]/candidates?missionId=&listId=&q=
// Contacts the enrolment picker can show, each with the reason it would be
// skipped (no email, excluded, unsubscribed, already enrolled), plus totals
// across the whole selection (not just the rows returned).
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getContactSkipReason } from '@/lib/email/services/sequence-service';
import { getSequenceUser, jsonError, loadOwnedSequence, unauthorized } from '../../_lib/shared';
import { candidateWhere, eligibleWhere, readCandidateFilter } from '../../_lib/candidates';

const PAGE = 200;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getSequenceUser();
        if (!user) return unauthorized();
        const { id } = await params;
        const owned = await loadOwnedSequence(id, user);
        if ('response' in owned) return owned.response;

        const filter = readCandidateFilter(new URL(req.url).searchParams);
        const base = candidateWhere(filter);
        if (!base) return jsonError('Choisissez une mission ou une liste', 400);

        const [total, eligible, noEmail, excluded, unsubscribed, alreadyEnrolled, rows] = await Promise.all([
            prisma.contact.count({ where: base }),
            prisma.contact.count({ where: { AND: [base, eligibleWhere(id)] } }),
            prisma.contact.count({ where: { AND: [base, { OR: [{ email: null }, { email: '' }] }] } }),
            prisma.contact.count({
                where: { AND: [base, { OR: [{ excludedAt: { not: null } }, { company: { excludedAt: { not: null } } }] }] },
            }),
            prisma.contact.count({ where: { AND: [base, { unsubscribed: true }] } }),
            prisma.contact.count({ where: { AND: [base, { sequenceEnrollments: { some: { sequenceId: id } } }] } }),
            prisma.contact.findMany({
                where: base,
                take: PAGE,
                orderBy: [{ company: { name: 'asc' } }, { lastName: 'asc' }],
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    title: true,
                    unsubscribed: true,
                    excludedAt: true,
                    company: { select: { name: true, excludedAt: true } },
                    sequenceEnrollments: {
                        where: { OR: [{ sequenceId: id }, { status: 'ACTIVE' }] },
                        select: { sequenceId: true, sequence: { select: { name: true, status: true } } },
                    },
                },
            }),
        ]);

        const data = rows.map((c) => {
            const inThis = c.sequenceEnrollments.some((e) => e.sequenceId === id);
            const other = c.sequenceEnrollments.find((e) => e.sequenceId !== id && e.sequence.status === 'ACTIVE');
            return {
                id: c.id,
                name: [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
                email: c.email,
                title: c.title,
                companyName: c.company?.name ?? null,
                skipReason: getContactSkipReason(c, inThis),
                otherSequence: other?.sequence.name ?? null,
            };
        });

        return NextResponse.json({
            success: true,
            data,
            meta: {
                total,
                eligible,
                shown: data.length,
                skipped: { NO_EMAIL: noEmail, EXCLUDED: excluded, UNSUBSCRIBED: unsubscribed, ALREADY_ENROLLED: alreadyEnrolled },
            },
        });
    } catch (error) {
        console.error('GET /api/email/sequences/[id]/candidates error:', error);
        return jsonError('Impossible de charger les contacts', 500);
    }
}
