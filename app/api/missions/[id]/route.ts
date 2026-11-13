import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
    NotFoundError,
} from '@/lib/api-utils';
import { z } from 'zod';
import { canTransitionMissionStatus } from '@/lib/constants/missionStatus';
import type { MissionStatusValue } from '@/lib/constants/missionStatus';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { getCooldownDisabledListIds } from '@/lib/sdr-queue/cooldown';
import { fetchListCounts, getLegacyMissionInsights } from '@/lib/missions/insights.server';
import { EMPTY_LIST_COUNTS } from '@/lib/missions/insights';
import { denyMissionRead, MISSION_READ_ROLES } from './_access';
import { computeListReadiness, defaultCampaignOf, summarizeReadiness, type ReadinessCampaign } from '@/lib/missions/readiness';

// ============================================
// SCHEMAS
// ============================================

const channelEnum = z.enum(['CALL', 'EMAIL', 'LINKEDIN']);
const missionStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']);
const updateMissionSchema = z
    .object({
        clientId: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        objective: z
            .union([z.string().min(1), z.literal(null)])
            .optional()
            .transform((v) => (v === null ? '' : v)),
        /** « RDV visés » over the mission period; null clears it. */
        targetMeetings: z.number().int().min(0).max(100000).nullable().optional(),
        channel: channelEnum.optional(),
        channels: z.array(channelEnum).min(1).optional(),
        startDate: z.string().transform((s) => new Date(s)).optional(),
        endDate: z.string().transform((s) => new Date(s)).optional(),
        status: missionStatusEnum.optional(),
        isActive: z.boolean().optional(),
        teamLeadSdrId: z.string().nullable().optional(),
        defaultInterlocuteurId: z.string().nullable().optional(),
        // Allow empty string from UI but normalize to null later
        defaultMailboxId: z.string().optional().or(z.literal('')),
    })
    .partial()
    .transform((data) => {
        const status = data.status ?? (data.isActive !== undefined ? (data.isActive ? 'ACTIVE' : 'PAUSED') : undefined);
        const base = data.channels !== undefined ? { ...data, channel: data.channels[0] } : data;
        // Normalize empty string to null so we can safely disconnect the relation
        if (base.defaultMailboxId === '') {
            return {
                ...base,
                ...(status !== undefined ? { status, isActive: status === 'ACTIVE' } : {}),
                defaultMailboxId: null,
            };
        }
        return status !== undefined ? { ...base, status, isActive: status === 'ACTIVE' } : base;
    });

const assignSdrSchema = z.object({
    sdrId: z.string().min(1, 'SDR ID requis'),
});

// ============================================
// GET /api/missions/[id] - Get mission details
//   ?view=brief → same payload without `pulse`, `insights`, `teamStats`
//   (and without their queries); those live in /api/missions/[id]/insights.
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(MISSION_READ_ROLES, request);
    const { id } = await params;
    const brief = request.nextUrl.searchParams.get('view') === 'brief';

    const mission = await prisma.mission.findUnique({
        where: { id },
        include: {
            client: {
                include: {
                    interlocuteurs: {
                        where: { isActive: true },
                        orderBy: { createdAt: 'asc' },
                    },
                },
            },
            campaigns: true,
            lists: {
                // D1: no Company rows here — per-list counts come from one
                // grouped query (fetchListCounts) below.
                include: {
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
                },
            },
            defaultInterlocuteur: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    title: true,
                },
            },
            sdrAssignments: {
                include: {
                    sdr: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                            selectedListId: true,
                            selectedMissionId: true,
                        },
                    },
                },
            },
            teamLeadSdr: { select: { id: true, name: true, email: true } },
            // Include default mailbox so SDR flows can use mission-level mailbox
            defaultMailbox: { select: { id: true, email: true, displayName: true } },
            _count: {
                select: {
                    sdrAssignments: true,
                    campaigns: true,
                    lists: true,
                },
            },
        },
    });

    if (!mission) {
        throw new NotFoundError('Mission introuvable');
    }

    // Access control (shared with /insights)
    const denied = await denyMissionRead(session.user, mission);
    if (denied) return denied;

    // Independent queries, in parallel.
    const [totalActions, meetings, opportunities, listCounts, cooldownOffListIds, legacyInsights] = await Promise.all([
        prisma.action.count({
            where: { campaign: { missionId: id } },
        }),
        prisma.action.count({
            where: {
                campaign: { missionId: id },
                result: 'MEETING_BOOKED',
            },
        }),
        prisma.opportunity.count({
            where: {
                contact: {
                    company: {
                        list: { missionId: id },
                    },
                },
            },
        }),
        fetchListCounts(prisma, id),
        getCooldownDisabledListIds(mission.lists.map((l) => l.id)),
        brief ? null : getLegacyMissionInsights(prisma, id),
    ]);

    // Per-list counts + strategy readiness + mission-level rollup (lib/missions/readiness)
    const defaultMissionCampaign = defaultCampaignOf(mission.campaigns) as ReadinessCampaign;
    const listsWithReadiness = mission.lists.map((l) => {
        const counts = listCounts.get(l.id) ?? EMPTY_LIST_COUNTS;
        return {
            ...l,
            _count: { companies: counts.companies, contacts: counts.contacts },
            companyStatusCounts: counts.companyStatusCounts,
            readiness: computeListReadiness(l.campaign as ReadinessCampaign, defaultMissionCampaign),
            queueCooldownEnabled: !cooldownOffListIds.has(l.id),
        };
    });
    const missionReadiness = summarizeReadiness(listsWithReadiness);

    return successResponse({
        ...mission,
        lists: listsWithReadiness,
        missionReadiness,
        stats: {
            totalActions,
            meetingsBooked: meetings,
            opportunities,
        },
        ...(legacyInsights ?? {}),
    });
});

// ============================================
// PUT /api/missions/[id] - Update mission
// ============================================

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['MANAGER', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
    const { id } = await params;
    const data = await validateRequest(request, updateMissionSchema);

    if (data.status) {
        const currentMission = await prisma.mission.findUnique({
            where: { id },
            select: { status: true },
        });
        if (!currentMission) {
            throw new NotFoundError('Mission introuvable');
        }
        if (
            data.status !== currentMission.status &&
            !canTransitionMissionStatus(
                currentMission.status as MissionStatusValue,
                data.status as MissionStatusValue,
                session.user.role
            )
        ) {
            return errorResponse('Transition de statut non autorisée', 403);
        }
    }

    // If setting teamLeadSdrId, ensure they are assigned to this mission
    if (data.teamLeadSdrId !== undefined) {
        if (data.teamLeadSdrId) {
            const assigned = await prisma.sDRAssignment.findUnique({
                where: { missionId_sdrId: { missionId: id, sdrId: data.teamLeadSdrId } },
            });
            if (!assigned) {
                return errorResponse('Le responsable d\'équipe doit être assigné à la mission', 400);
            }
        }
    }

    // Build Prisma update data: relations (client, teamLeadSdr, defaultMailbox) and array (channels) use special syntax
    const {
        clientId,
        teamLeadSdrId,
        channels,
        defaultMailboxId,
        defaultInterlocuteurId,
        ...scalars
    } = data;
    const updateData: Parameters<typeof prisma.mission.update>[0]['data'] = {
        ...scalars,
        ...(channels !== undefined && { channels: { set: channels } }),
        ...(clientId !== undefined && { client: { connect: { id: clientId } } }),
        ...(teamLeadSdrId !== undefined && {
            teamLeadSdr: teamLeadSdrId ? { connect: { id: teamLeadSdrId } } : { disconnect: true },
        }),
        ...(defaultMailboxId !== undefined && {
            defaultMailbox: defaultMailboxId ? { connect: { id: defaultMailboxId } } : { disconnect: true },
        }),
        ...(defaultInterlocuteurId !== undefined && {
            defaultInterlocuteur: defaultInterlocuteurId
                ? { connect: { id: defaultInterlocuteurId } }
                : { disconnect: true },
        }),
    };

    const mission = await prisma.mission.update({
        where: { id },
        data: updateData,
        include: {
            client: { select: { id: true, name: true } },
            teamLeadSdr: { select: { id: true, name: true, email: true } },
        },
    });

    return successResponse(mission);
});

// ============================================
// DELETE /api/missions/[id] - Delete mission
// ============================================

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['MANAGER'], request);
    const { id } = await params;

    const mission = await prisma.mission.findUnique({
        where: { id },
        select: {
            name: true,
            clientId: true,
            client: { select: { name: true } },
            _count: { select: { lists: true, campaigns: true } },
        },
    });
    if (!mission) {
        throw new NotFoundError('Mission introuvable');
    }

    await prisma.mission.delete({
        where: { id },
    });

    audit(request, session, {
        action: AUDIT_ACTIONS.DELETE,
        entityType: 'Mission',
        entityId: id,
        summary: `Mission "${mission.name}" (${mission.client.name}) supprimée — ${mission._count.lists} liste(s), ${mission._count.campaigns} stratégie(s) en cascade`,
        before: { name: mission.name, clientId: mission.clientId },
        metadata: { lists: mission._count.lists, campaigns: mission._count.campaigns },
    });

    return successResponse({ deleted: true });
});

// ============================================
// POST /api/missions/[id]/assign - Assign SDR
// ============================================

export const PATCH = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
    const { id } = await params;
    const { sdrId } = await validateRequest(request, assignSdrSchema);

    // Verify user exists and has SDR or BUSINESS_DEVELOPER role
    const sdr = await prisma.user.findFirst({
        where: { id: sdrId, role: { in: ['SDR', 'BUSINESS_DEVELOPER', 'BOOKER'] } },
    });

    if (!sdr) {
        return errorResponse('SDR ou Business Developer introuvable', 404);
    }

    // Check if already assigned
    const existing = await prisma.sDRAssignment.findUnique({
        where: { missionId_sdrId: { missionId: id, sdrId } },
    });

    if (existing) {
        return errorResponse('SDR déjà assigné à cette mission', 400);
    }

    const assignment = await prisma.sDRAssignment.create({
        data: { missionId: id, sdrId },
        include: {
            sdr: { select: { id: true, name: true } },
            mission: { select: { id: true, name: true } },
        },
    });

    return successResponse(assignment, 201);
});
