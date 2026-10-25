// ============================================
// GET /api/email/threads/labels - Labels in use on the threads the user sees
// Query: mailboxId | scope=team (same visibility as GET /api/email/threads)
// Returns [{ label, count }] sorted by name.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { canReadMailbox, getReadableMailboxIds, readableThreadWhere } from '@/lib/email/permissions';

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
        }
        const userId = session.user.id;
        const role = session.user.role;
        const { searchParams } = new URL(req.url);
        const mailboxId = searchParams.get('mailboxId');
        const scope = searchParams.get('scope');

        let visibility: Prisma.EmailThreadWhereInput;
        if (mailboxId) {
            visibility = (await canReadMailbox(mailboxId, userId, role))
                ? { mailboxId }
                : { mailboxId, emails: { some: { sentById: userId } } };
        } else {
            const ids = await getReadableMailboxIds(userId, role, { team: scope === 'team' });
            visibility = readableThreadWhere(userId, ids);
        }

        const threads = await prisma.emailThread.findMany({
            where: { AND: [visibility, { isTrashed: false, labels: { isEmpty: false } }] },
            select: { labels: true },
            take: 2000,
        });

        const counts = new Map<string, number>();
        for (const t of threads) {
            for (const label of t.labels) counts.set(label, (counts.get(label) ?? 0) + 1);
        }

        const data = Array.from(counts.entries())
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('GET /api/email/threads/labels error:', error);
        return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
    }
}
