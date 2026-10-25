// ============================================
// GET /api/email/sequences/options
// Everything the sequence editor and enrolment picker need in one call:
// usable mailboxes (with health), missions and their lists, the current user,
// and the sending engine's health.
// ============================================

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { MAILBOX_SELECT, engineStatus, getSequenceUser, jsonError, unauthorized } from '../_lib/shared';

export async function GET() {
    try {
        const user = await getSequenceUser();
        if (!user) return unauthorized();

        const [mailboxes, missions, me, engine] = await Promise.all([
            prisma.mailbox.findMany({
                where: user.isAdmin
                    ? {}
                    : { OR: [{ ownerId: user.id }, { permissions: { some: { userId: user.id, canSend: true } } }] },
                select: MAILBOX_SELECT,
                orderBy: [{ isActive: 'desc' }, { email: 'asc' }],
            }),
            prisma.mission.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    name: true,
                    client: { select: { name: true } },
                    lists: {
                        where: { isArchived: false },
                        select: { id: true, name: true },
                        orderBy: { name: 'asc' },
                    },
                },
                orderBy: { name: 'asc' },
            }),
            prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, email: true } }),
            engineStatus(),
        ]);

        return NextResponse.json({
            success: true,
            data: {
                mailboxes,
                missions: missions.map((m) => ({
                    id: m.id,
                    name: m.name,
                    clientName: m.client?.name ?? null,
                    lists: m.lists,
                })),
                me,
                engine,
            },
        });
    } catch (error) {
        console.error('GET /api/email/sequences/options error:', error);
        return jsonError('Impossible de charger les options', 500);
    }
}
