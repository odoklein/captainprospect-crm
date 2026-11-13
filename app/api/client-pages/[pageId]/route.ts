import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { successResponse, requireRole, withErrorHandler, validateRequest, NotFoundError, ValidationError } from '@/lib/api-utils';
import { blocksSchema, MAX_TITLE, readBlocks } from '@/lib/client-pages/blocks';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

// One client workspace page: read, save (autosave from the editor), delete.

const PAGE_SELECT = {
    id: true,
    clientId: true,
    missionId: true,
    title: true,
    icon: true,
    blocks: true,
    createdAt: true,
    updatedAt: true,
    createdBy: { select: { id: true, name: true } },
    updatedBy: { select: { id: true, name: true } },
} as const;

type Params = { params: Promise<{ pageId: string }> };

async function findPage(pageId: string) {
    const page = await prisma.clientPage.findUnique({ where: { id: pageId }, select: PAGE_SELECT });
    if (!page) throw new NotFoundError('Page introuvable');
    return { ...page, blocks: readBlocks(page.blocks) };
}

export const GET = withErrorHandler(async (request: NextRequest, { params }: Params) => {
    await requireRole(['MANAGER'], request);
    const { pageId } = await params;
    return successResponse(await findPage(pageId));
});

const patchSchema = z.object({
    title: z.string().max(MAX_TITLE).optional(),
    icon: z.string().max(16).nullable().optional(),
    blocks: blocksSchema.optional(),
    missionId: z.string().nullable().optional(),
    /** updatedAt the editor started from; a newer save by someone else is refused. */
    baseUpdatedAt: z.string().datetime().optional(),
});

export const PATCH = withErrorHandler(async (request: NextRequest, { params }: Params) => {
    const session = await requireRole(['MANAGER'], request);
    const { pageId } = await params;
    const body = await validateRequest(request, patchSchema);

    const current = await prisma.clientPage.findUnique({
        where: { id: pageId },
        select: { clientId: true, updatedAt: true, updatedById: true, updatedBy: { select: { name: true } } },
    });
    if (!current) throw new NotFoundError('Page introuvable');

    if (body.baseUpdatedAt && current.updatedAt.getTime() > Date.parse(body.baseUpdatedAt) && current.updatedById !== session.user.id) {
        return NextResponse.json({
            success: false,
            error: `${current.updatedBy?.name ?? 'Quelqu’un'} a modifié cette page entre-temps.`,
            conflict: { updatedAt: current.updatedAt, updatedBy: current.updatedBy?.name ?? null },
        }, { status: 409 });
    }
    if (body.missionId) {
        const mission = await prisma.mission.findFirst({ where: { id: body.missionId, clientId: current.clientId }, select: { id: true } });
        if (!mission) throw new ValidationError('Cette mission n’appartient pas au client');
    }

    await prisma.clientPage.update({
        where: { id: pageId },
        data: {
            ...(body.title !== undefined && { title: body.title.trim() }),
            ...(body.icon !== undefined && { icon: body.icon }),
            ...(body.blocks !== undefined && { blocks: body.blocks }),
            ...(body.missionId !== undefined && { missionId: body.missionId }),
            updatedById: session.user.id,
        },
    });
    return successResponse(await findPage(pageId));
});

export const DELETE = withErrorHandler(async (request: NextRequest, { params }: Params) => {
    const session = await requireRole(['MANAGER'], request);
    const { pageId } = await params;
    const page = await prisma.clientPage.findUnique({ where: { id: pageId }, select: { id: true, title: true, client: { select: { name: true } } } });
    if (!page) throw new NotFoundError('Page introuvable');
    await prisma.clientPage.delete({ where: { id: pageId } });
    audit(request, session, {
        action: AUDIT_ACTIONS.DELETE,
        entityType: 'ClientPage',
        entityId: page.id,
        summary: `Page « ${page.title || 'Sans titre'} » supprimée (${page.client.name})`,
    });
    return successResponse({ id: page.id });
});
