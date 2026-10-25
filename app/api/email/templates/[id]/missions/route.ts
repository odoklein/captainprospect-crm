// ============================================
// PUT /api/email/templates/[id]/missions
// Replace the set of missions a template is assigned to.
// Body: { missionIds: string[] }
// Same MissionEmailTemplate rows as /api/missions/[id]/templates: new
// assignments go to the end of each mission's list, removed ones are deleted,
// untouched ones keep their order.
// ============================================

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { errorResponse, requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    await requireRole(['MANAGER', 'BUSINESS_DEVELOPER', 'DEVELOPER'], request);
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body.missionIds)) {
        return errorResponse('missionIds requis', 400);
    }
    const wanted = Array.from(new Set(
        (body.missionIds as unknown[]).filter((m): m is string => typeof m === 'string' && m.length > 0),
    ));

    const template = await prisma.emailTemplate.findUnique({ where: { id }, select: { id: true } });
    if (!template) return errorResponse('Template non trouvé', 404);

    if (wanted.length > 0) {
        const found = await prisma.mission.count({ where: { id: { in: wanted } } });
        if (found !== wanted.length) return errorResponse('Mission introuvable', 404);
    }

    const current = await prisma.missionEmailTemplate.findMany({
        where: { templateId: id },
        select: { missionId: true },
    });
    const currentIds = new Set(current.map((c) => c.missionId));
    const toAdd = wanted.filter((m) => !currentIds.has(m));
    const toRemove = [...currentIds].filter((m) => !wanted.includes(m));

    await prisma.$transaction(async (tx) => {
        if (toRemove.length > 0) {
            await tx.missionEmailTemplate.deleteMany({ where: { templateId: id, missionId: { in: toRemove } } });
        }
        for (const missionId of toAdd) {
            const max = await tx.missionEmailTemplate.findFirst({
                where: { missionId },
                orderBy: { order: 'desc' },
                select: { order: true },
            });
            await tx.missionEmailTemplate.create({
                data: { missionId, templateId: id, order: (max?.order ?? 0) + 1 },
            });
        }
    });

    const missions = await prisma.missionEmailTemplate.findMany({
        where: { templateId: id },
        select: {
            missionId: true,
            mission: { select: { id: true, name: true, status: true, client: { select: { id: true, name: true } } } },
        },
    });

    return successResponse({ added: toAdd.length, removed: toRemove.length, missionTemplates: missions });
});
