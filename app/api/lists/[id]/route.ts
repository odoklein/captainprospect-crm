import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    NotFoundError,
} from '@/lib/api-utils';

// ============================================
// GET /api/lists/[id] - Get list details
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER', 'CLIENT', 'SDR'], request);
    const { id } = await params;

    const list = await prisma.list.findUnique({
        where: { id },
        include: {
            mission: {
                select: {
                    id: true,
                    name: true,
                    client: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
            commercialInterlocuteur: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    title: true,
                },
            },
            _count: {
                select: {
                    companies: true,
                },
            },
        },
    });

    if (!list) {
        throw new NotFoundError('Liste introuvable');
    }

    return successResponse(list);
});

// ============================================
// DELETE /api/lists/[id] - Delete list
// ============================================

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER'], request);
    const { id } = await params;

    // Delete list (cascade will delete companies and contacts)
    await prisma.list.delete({
        where: { id },
    });

    return successResponse({ deleted: true });
});

// ============================================
// PATCH /api/lists/[id] - Update list
// ============================================

export const PATCH = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER'], request);
    const { id } = await params;
    const body = await request.json();

    const { name, type, source, missionId, commercialInterlocuteurId, campaignId, isActive, isArchived, contactsViewEnabled } = body;

    // Load current list with mission + client for validation
    const existing = await prisma.list.findUnique({
        where: { id },
        include: {
            mission: {
                select: {
                    id: true,
                    clientId: true,
                },
            },
        },
    });

    if (!existing) {
        return errorResponse('Liste introuvable', 404);
    }

    // If missionId is changing, we will treat the list as moved to another mission.
    // In that case, we clear any explicit commercialInterlocuteurId to avoid mismatched clients.
    let nextMissionId: string | undefined;
    if (missionId && missionId !== existing.missionId) {
        nextMissionId = missionId;
    }

    // Validate commercialInterlocuteurId, if provided (non-null)
    let commercialInterlocuteurConnect:
        | { connect: { id: string } }
        | { disconnect: true }
        | undefined;

    if (commercialInterlocuteurId !== undefined) {
        if (commercialInterlocuteurId === null) {
            commercialInterlocuteurConnect = { disconnect: true };
        } else {
            // Ensure interlocuteur belongs to the same client as the (current) mission
            const interlocuteur = await prisma.clientInterlocuteur.findFirst({
                where: {
                    id: commercialInterlocuteurId,
                    clientId: existing.mission.clientId,
                },
                select: { id: true },
            });

            if (!interlocuteur) {
                return errorResponse(
                    'Ce commercial n’appartient pas au même client que la mission de cette liste',
                    400
                );
            }

            commercialInterlocuteurConnect = { connect: { id: commercialInterlocuteurId } };
        }
    }

    // Validate and build campaign connect/disconnect
    let campaignConnect:
        | { connect: { id: string } }
        | { disconnect: true }
        | undefined;

    if (campaignId !== undefined) {
        if (campaignId === null || campaignId === '') {
            campaignConnect = { disconnect: true };
        } else {
            const targetMissionId = nextMissionId ?? existing.missionId;
            const camp = await prisma.campaign.findFirst({
                where: { id: campaignId, missionId: targetMissionId },
                select: { id: true },
            });
            if (!camp) {
                return errorResponse(
                    'Cette stratégie n’appartient pas à la même mission que la liste',
                    400
                );
            }
            campaignConnect = { connect: { id: campaignId } };
        }
    }

    // isActive: use raw SQL so this works even if Prisma client was generated before the column existed
    if (typeof isActive === 'boolean') {
        await prisma.$executeRaw`UPDATE "List" SET "isActive" = ${isActive} WHERE id = ${id}`;
    }

    // isArchived: use raw SQL so this works even if Prisma client was generated before the column existed
    if (typeof isArchived === 'boolean') {
        const archivedAt = isArchived ? new Date() : null;
        await prisma.$executeRaw`UPDATE "List" SET "isArchived" = ${isArchived}, "archivedAt" = ${archivedAt} WHERE id = ${id}`;
    }

    // contactsViewEnabled: toggle commercial portal visibility for this list
    if (typeof contactsViewEnabled === 'boolean') {
        await prisma.$executeRaw`UPDATE "List" SET "contactsViewEnabled" = ${contactsViewEnabled} WHERE id = ${id}`;
    }

    const hasOtherUpdates =
        (name && name !== existing.name) ||
        (type && type !== existing.type) ||
        source !== undefined ||
        nextMissionId ||
        commercialInterlocuteurConnect !== undefined ||
        campaignConnect !== undefined;

    const includeBlock = {
        mission: {
            select: {
                id: true,
                name: true,
            },
        },
        commercialInterlocuteur: {
            select: {
                id: true,
                firstName: true,
                lastName: true,
                title: true,
            },
        },
        campaign: {
            select: {
                id: true,
                name: true,
                icp: true,
                pitch: true,
                script: true,
                isActive: true,
            },
        },
    } as const;

    let updatedList;
    if (hasOtherUpdates) {
        updatedList = await prisma.list.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(type && { type }),
                ...(source !== undefined && { source }),
                ...(nextMissionId && { missionId: nextMissionId }),
                ...(commercialInterlocuteurConnect && {
                    commercialInterlocuteur: commercialInterlocuteurConnect,
                }),
                ...(campaignConnect && {
                    campaign: campaignConnect,
                }),
            },
            include: includeBlock,
        });
    } else {
        updatedList = await prisma.list.findUnique({
            where: { id },
            include: includeBlock,
        });
    }

    // Attach isActive from DB when we updated it (client may not have the field in its type yet)
    if (typeof isActive === 'boolean' && updatedList) {
        (updatedList as { isActive?: boolean }).isActive = isActive;
    }

    // Attach isArchived from DB when we updated it
    if (typeof isArchived === 'boolean' && updatedList) {
        (updatedList as { isArchived?: boolean; archivedAt?: Date | null }).isArchived = isArchived;
        (updatedList as { isArchived?: boolean; archivedAt?: Date | null }).archivedAt = isArchived ? new Date() : null;
    }

    // Attach contactsViewEnabled from DB when we updated it
    if (typeof contactsViewEnabled === 'boolean' && updatedList) {
        (updatedList as { contactsViewEnabled?: boolean }).contactsViewEnabled = contactsViewEnabled;
    }

    return successResponse(updatedList!);
});
