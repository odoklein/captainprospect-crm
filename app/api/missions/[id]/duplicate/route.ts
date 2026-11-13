import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    requireRole,
    withErrorHandler,
    NotFoundError,
    ValidationError,
} from '@/lib/api-utils';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

const duplicateSchema = z.object({
    name: z.string().trim().min(1, 'Nom requis').max(200).optional(),
});

// ============================================
// POST /api/missions/[id]/duplicate - Copy a mission's framing
//   Copies: client, framing (objective, channels, RDV visés, dates, defaults),
//   strategies (campaigns) and the email templates linked to the mission.
//   Not copied: lists / bases, SDR assignments, team lead, actions, portal state.
//   The copy starts as a DRAFT, inactive (same default as POST /api/missions).
// ============================================

export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['MANAGER'], request);
    const { id } = await params;

    // Body is optional: an empty or absent body means « default name ».
    const raw = await request.text();
    let body: unknown = {};
    if (raw.trim()) {
        try {
            body = JSON.parse(raw);
        } catch {
            throw new ValidationError('Données invalides');
        }
    }
    const parsed = duplicateSchema.safeParse(body ?? {});
    if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '));
    }

    const source = await prisma.mission.findUnique({
        where: { id },
        include: {
            client: { select: { name: true } },
            campaigns: { orderBy: { createdAt: 'asc' } },
            emailTemplates: { orderBy: { order: 'asc' } },
        },
    });
    if (!source) {
        throw new NotFoundError('Mission introuvable');
    }

    const name = parsed.data.name ?? `${source.name} (copie)`;

    const created = await prisma.$transaction(async (tx) => {
        const mission = await tx.mission.create({
            data: {
                clientId: source.clientId,
                name,
                objective: source.objective,
                targetMeetings: source.targetMeetings,
                channel: source.channel,
                channels: source.channels,
                startDate: source.startDate,
                endDate: source.endDate,
                status: 'DRAFT',
                isActive: false,
                totalContractDays: source.totalContractDays,
                defaultMailboxId: source.defaultMailboxId,
                defaultInterlocuteurId: source.defaultInterlocuteurId,
                ...(source.playbook != null ? { playbook: source.playbook } : {}),
            },
            select: { id: true, name: true, clientId: true },
        });

        // Strategies are copied as-is; no list links them in the copy (bases are not copied).
        if (source.campaigns.length > 0) {
            await tx.campaign.createMany({
                data: source.campaigns.map((c) => ({
                    missionId: mission.id,
                    name: c.name,
                    icp: c.icp,
                    pitch: c.pitch,
                    script: c.script,
                    isActive: c.isActive,
                    ...(c.rules != null ? { rules: c.rules } : {}),
                })),
            });
        }

        if (source.emailTemplates.length > 0) {
            await tx.missionEmailTemplate.createMany({
                data: source.emailTemplates.map((t) => ({
                    missionId: mission.id,
                    templateId: t.templateId,
                    order: t.order,
                })),
            });
        }

        return mission;
    });

    audit(request, session, {
        action: AUDIT_ACTIONS.CREATE,
        entityType: 'Mission',
        entityId: created.id,
        summary: `Mission "${created.name}" (${source.client.name}) dupliquée depuis "${source.name}" — ${source.campaigns.length} stratégie(s), ${source.emailTemplates.length} modèle(s) d'email`,
        after: { name: created.name, clientId: created.clientId },
        metadata: {
            sourceMissionId: source.id,
            campaigns: source.campaigns.length,
            emailTemplates: source.emailTemplates.length,
        },
    });

    return successResponse(created, 201);
});
