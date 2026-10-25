// ============================================
// MAILBOX USAGE
// GET /api/email/mailboxes/[id]/usage[?withOptions=1]
//   Which missions / clients send from this mailbox by default, plus the
//   missions it could be made the default of (for the settings drawer).
// PUT /api/email/mailboxes/[id]/usage
//   Body: { missionId, isDefault } — set or clear Mission.defaultMailboxId.
// ============================================

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { errorResponse, requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';

const MISSION_SELECT = {
    id: true,
    name: true,
    status: true,
    defaultMailboxId: true,
    client: { select: { id: true, name: true } },
} as const;

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    await requireRole(['MANAGER', 'DEVELOPER', 'BUSINESS_DEVELOPER'], request);
    const { id } = await params;

    const withOptions = new URL(request.url).searchParams.get('withOptions') === '1';

    const mailbox = await prisma.mailbox.findUnique({ where: { id }, select: { id: true } });
    if (!mailbox) return errorResponse('Boîte mail non trouvée', 404);

    const [missions, missionOptions] = await Promise.all([
        prisma.mission.findMany({ where: { defaultMailboxId: id }, select: MISSION_SELECT, orderBy: { name: 'asc' } }),
        withOptions
            ? prisma.mission.findMany({
                where: { status: { in: ['ACTIVE', 'PAUSED', 'DRAFT'] } },
                select: MISSION_SELECT,
                orderBy: [{ status: 'asc' }, { name: 'asc' }],
                take: 500,
            })
            : Promise.resolve([]),
    ]);

    // Client defaults live in two places: the Client.defaultMailboxId column and
    // ClientOnboarding.onboardingData.defaultMailboxId (what the client page writes).
    const clients = new Map<string, { id: string; name: string }>();
    try {
        const byColumn = await prisma.client.findMany({ where: { defaultMailboxId: id }, select: { id: true, name: true } });
        byColumn.forEach((c) => clients.set(c.id, c));
    } catch {
        // Column missing on a lagging schema: ignore.
    }
    try {
        const byOnboarding = await prisma.clientOnboarding.findMany({
            where: { onboardingData: { path: ['defaultMailboxId'], equals: id } },
            select: { client: { select: { id: true, name: true } } },
        });
        byOnboarding.forEach((o) => clients.set(o.client.id, o.client));
    } catch {
        // JSON path filter unsupported: ignore.
    }

    return successResponse({
        missions,
        clients: [...clients.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
        missionOptions,
    });
});

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    await requireRole(['MANAGER', 'DEVELOPER', 'BUSINESS_DEVELOPER'], request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const missionId = typeof body.missionId === 'string' ? body.missionId : '';
    const isDefault = body.isDefault !== false;
    if (!missionId) return errorResponse('missionId requis', 400);

    const [mailbox, mission] = await Promise.all([
        prisma.mailbox.findUnique({ where: { id }, select: { id: true, isActive: true } }),
        prisma.mission.findUnique({ where: { id: missionId }, select: { id: true, defaultMailboxId: true } }),
    ]);
    if (!mailbox) return errorResponse('Boîte mail non trouvée', 404);
    if (!mission) return errorResponse('Mission introuvable', 404);
    if (isDefault && !mailbox.isActive) return errorResponse('Cette boîte mail est désactivée', 400);

    if (isDefault) {
        await prisma.mission.update({ where: { id: missionId }, data: { defaultMailboxId: id } });
    } else if (mission.defaultMailboxId === id) {
        await prisma.mission.update({ where: { id: missionId }, data: { defaultMailboxId: null } });
    }

    const updated = await prisma.mission.findUnique({ where: { id: missionId }, select: MISSION_SELECT });
    return successResponse(updated);
});
