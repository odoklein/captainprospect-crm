import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { successResponse, requireRole, withErrorHandler, validateRequest, NotFoundError, ValidationError } from '@/lib/api-utils';
import { MAX_TITLE, PAGE_TEMPLATES, PAGE_TEMPLATE_IDS, type PageTemplate } from '@/lib/client-pages/blocks';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

// Client workspace pages: list and create. Managers only, like the rest of the
// client workspace (app/api/clients/[id]).

const PAGE_SUMMARY_SELECT = {
    id: true,
    title: true,
    icon: true,
    missionId: true,
    position: true,
    createdAt: true,
    updatedAt: true,
    updatedBy: { select: { id: true, name: true } },
} as const;

export const GET = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireRole(['MANAGER'], request);
    const { id } = await params;
    const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
    if (!client) throw new NotFoundError('Client introuvable');

    const pages = await prisma.clientPage.findMany({
        where: { clientId: id },
        select: PAGE_SUMMARY_SELECT,
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return successResponse(pages);
});

const createSchema = z.object({
    title: z.string().max(MAX_TITLE).optional(),
    template: z.enum(PAGE_TEMPLATE_IDS as [PageTemplate, ...PageTemplate[]]).default('blank'),
    missionId: z.string().nullable().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(['MANAGER'], request);
    const { id } = await params;
    const body = await validateRequest(request, createSchema);

    const client = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!client) throw new NotFoundError('Client introuvable');
    if (body.missionId) {
        const mission = await prisma.mission.findFirst({ where: { id: body.missionId, clientId: id }, select: { id: true } });
        if (!mission) throw new ValidationError('Cette mission n’appartient pas au client');
    }

    const template = PAGE_TEMPLATES[body.template];
    const last = await prisma.clientPage.findFirst({ where: { clientId: id }, orderBy: { position: 'desc' }, select: { position: true } });
    const blocks = template.blocks().map((item) =>
        item.type === 'callQueue' && body.missionId ? { ...item, missionId: body.missionId } : item);

    const page = await prisma.clientPage.create({
        data: {
            clientId: id,
            missionId: body.missionId ?? null,
            title: (body.title ?? template.title).trim(),
            blocks,
            position: (last?.position ?? -1) + 1,
            createdById: session.user.id,
            updatedById: session.user.id,
        },
        select: PAGE_SUMMARY_SELECT,
    });

    audit(request, session, {
        action: AUDIT_ACTIONS.CREATE,
        entityType: 'ClientPage',
        entityId: page.id,
        summary: `Page « ${page.title || 'Sans titre'} » créée pour ${client.name}`,
    });
    return successResponse(page, 201);
});
