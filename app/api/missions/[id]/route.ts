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
import { isMissionInPortalLaunch } from '@/lib/portal-visibility';

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
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['MANAGER', 'CLIENT', 'SDR', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
    const { id } = await params;

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
                include: {
                    // List has no "contacts" relation; only "companies". Contact count is per company below.
                    _count: { select: { companies: true } },
                    companies: {
                        select: {
                            status: true,
                            _count: { select: { contacts: true } },
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

    // Access control
    if (session.user.role === 'CLIENT') {
        const hasAccess = await prisma.user.findFirst({
            where: { id: session.user.id, clientId: mission.clientId },
        });
        if (!hasAccess) {
            return errorResponse('Accès non autorisé', 403);
        }
        if (isMissionInPortalLaunch(mission)) {
            return errorResponse('Mission en phase de démarrage', 403);
        }
    }

    if (session.user.role === 'SDR' || session.user.role === 'BUSINESS_DEVELOPER') {
        const isAssigned = mission.sdrAssignments.some(
            (a: { sdrId: string }) => a.sdrId === session.user.id
        );
        if (!isAssigned) {
            return errorResponse('Accès non autorisé', 403);
        }
    }

    // Get stats
    const stats = await prisma.action.aggregate({
        where: {
            campaign: { missionId: id },
        },
        _count: true,
    });

    const meetings = await prisma.action.count({
        where: {
            campaign: { missionId: id },
            result: 'MEETING_BOOKED',
        },
    });

    const opportunities = await prisma.opportunity.count({
        where: {
            contact: {
                company: {
                    list: { missionId: id },
                },
            },
        },
    });

    // Per-list strategy readiness + mission-level rollup
    type LinkedCampaign = { icp: string | null; pitch: string | null; script: string | null } | null;
    const computeReadiness = (campaign: LinkedCampaign) => {
        const hasIcp = !!campaign?.icp?.trim();
        const hasPitch = !!campaign?.pitch?.trim();
        const hasScript = !!campaign?.script?.trim();
        const hasStrategy = !!campaign;
        return {
            hasStrategy,
            hasIcp,
            hasPitch,
            hasScript,
            isReady: hasStrategy && hasIcp && hasPitch && hasScript,
        };
    };

    const listsWithReadiness = mission.lists.map((l) => ({
        ...l,
        readiness: computeReadiness(l.campaign as LinkedCampaign),
    }));

    const activeListsWithReadiness = listsWithReadiness.filter(
        (l) => l.isActive !== false && l.isArchived !== true
    );
    const missionReadiness = {
        activeLists: activeListsWithReadiness.length,
        readyLists: activeListsWithReadiness.filter((l) => l.readiness.isReady).length,
        missingStrategy: activeListsWithReadiness.filter((l) => !l.readiness.hasStrategy).length,
        missingIcp: activeListsWithReadiness.filter((l) => l.readiness.hasStrategy && !l.readiness.hasIcp).length,
        missingPitch: activeListsWithReadiness.filter((l) => l.readiness.hasStrategy && !l.readiness.hasPitch).length,
        missingScript: activeListsWithReadiness.filter((l) => l.readiness.hasStrategy && !l.readiness.hasScript).length,
    };

    return successResponse({
        ...mission,
        lists: listsWithReadiness,
        missionReadiness,
        stats: {
            totalActions: stats._count,
            meetingsBooked: meetings,
            opportunities,
        },
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
    await requireRole(['MANAGER'], request);
    const { id } = await params;

    await prisma.mission.delete({
        where: { id },
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
