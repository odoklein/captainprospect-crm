import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
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
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { getCooldownDisabledListIds } from '@/lib/sdr-queue/cooldown';
import { RESULT_META, REACHED_CATEGORIES } from '@/lib/api-v1/glossary';
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

    // ── Insights: 30-day daily series + the previous 30 days to compare against.
    // Aggregated in SQL: a busy mission would otherwise ship tens of thousands
    // of rows just to be bucketed by day in JS.
    const TREND_DAYS = 30;
    const DAY_MS = 24 * 60 * 60 * 1000;
    // UTC-aligned throughout: date_trunc runs in the DB session timezone (UTC),
    // so mixing in local midnight would misfile the boundary buckets.
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const windowStart = new Date(startOfToday.getTime() - (TREND_DAYS - 1) * DAY_MS);
    const previousStart = new Date(windowStart.getTime() - TREND_DAYS * DAY_MS);

    // Result groups from the shared glossary: « reached » = spoken to (refusal, follow-up or meeting).
    const reachedResults = Object.entries(RESULT_META).filter(([, meta]) => REACHED_CATEGORIES.includes(meta.category)).map(([code]) => code);
    const interestedResults = Object.entries(RESULT_META).filter(([, meta]) => meta.category === 'rdv' || meta.category === 'follow_up').map(([code]) => code);

    const trendRows = await prisma.$queryRaw<Array<{ day: Date; actions: number; meetings: number; reached: number }>>(
        Prisma.sql`
            SELECT date_trunc('day', a."createdAt") AS day,
                   COUNT(a.id)::int AS actions,
                   COUNT(CASE WHEN a."result" = 'MEETING_BOOKED' THEN 1 END)::int AS meetings,
                   COUNT(CASE WHEN a."result"::text = ANY(${reachedResults}) THEN 1 END)::int AS reached
            FROM "Action" a
            JOIN "Campaign" c ON c.id = a."campaignId"
            WHERE c."missionId" = ${id}
              AND a."createdAt" >= ${previousStart}
            GROUP BY 1
            ORDER BY 1
        `
    );

    const bucketed = new Map<string, { actions: number; meetings: number; reached: number }>();
    for (const row of trendRows) {
        const key = new Date(row.day).toISOString().slice(0, 10);
        bucketed.set(key, { actions: Number(row.actions), meetings: Number(row.meetings), reached: Number(row.reached) });
    }

    const series: Array<{ date: string; actions: number; meetings: number; reached: number }> = [];
    for (let i = 0; i < TREND_DAYS; i++) {
        const date = new Date(windowStart.getTime() + i * DAY_MS).toISOString().slice(0, 10);
        const hit = bucketed.get(date);
        series.push({ date, actions: hit?.actions ?? 0, meetings: hit?.meetings ?? 0, reached: hit?.reached ?? 0 });
    }

    // ── Pulse: the mission funnel per prospect (a contact, or the company when
    // called directly), counted once at each stage, over the whole mission.
    type FunnelRow = { called: number; reached: number; interested: number; meetings: number };
    const [funnelRows, prospectRows, benchmarkRows] = await Promise.all([
        prisma.$queryRaw<FunnelRow[]>(Prisma.sql`
            WITH t AS (
                SELECT COALESCE(a."contactId", a."companyId") AS target, a."result"::text AS r
                FROM "Action" a
                JOIN "Campaign" c ON c.id = a."campaignId"
                WHERE c."missionId" = ${id}
            )
            SELECT COUNT(DISTINCT target)::int AS called,
                   COUNT(DISTINCT target) FILTER (WHERE r = ANY(${reachedResults}))::int AS reached,
                   COUNT(DISTINCT target) FILTER (WHERE r = ANY(${interestedResults}))::int AS interested,
                   COUNT(DISTINCT target) FILTER (WHERE r = 'MEETING_BOOKED')::int AS meetings
            FROM t
        `),
        prisma.$queryRaw<Array<{ prospects: number }>>(Prisma.sql`
            SELECT COUNT(ct.id)::int AS prospects
            FROM "Contact" ct
            JOIN "Company" co ON co.id = ct."companyId"
            JOIN "List" l ON l.id = co."listId"
            WHERE l."missionId" = ${id} AND l."isActive" = true AND l."isArchived" = false
        `),
        // Agency reference: the same step rates on every other mission, last 90 days.
        prisma.$queryRaw<FunnelRow[]>(Prisma.sql`
            WITH t AS (
                SELECT c."missionId" AS m, COALESCE(a."contactId", a."companyId") AS target, a."result"::text AS r
                FROM "Action" a
                JOIN "Campaign" c ON c.id = a."campaignId"
                WHERE c."missionId" <> ${id} AND a."createdAt" >= ${new Date(startOfToday.getTime() - 90 * DAY_MS)}
            )
            SELECT COUNT(DISTINCT (m, target))::int AS called,
                   COUNT(DISTINCT (m, target)) FILTER (WHERE r = ANY(${reachedResults}))::int AS reached,
                   COUNT(DISTINCT (m, target)) FILTER (WHERE r = ANY(${interestedResults}))::int AS interested,
                   COUNT(DISTINCT (m, target)) FILTER (WHERE r = 'MEETING_BOOKED')::int AS meetings
            FROM t
        `),
    ]);
    const funnel = funnelRows[0] ?? { called: 0, reached: 0, interested: 0, meetings: 0 };
    const agency = benchmarkRows[0] ?? { called: 0, reached: 0, interested: 0, meetings: 0 };
    // Below 50 prospects at a stage, the agency rate is noise: leave it out.
    const ratio = (part: number, whole: number) => (whole >= 50 ? part / whole : null);

    const sumWindow = (from: Date, to: Date) => {
        let actions = 0;
        let meetings = 0;
        for (const [date, value] of bucketed) {
            const t = new Date(`${date}T00:00:00.000Z`).getTime();
            if (t >= from.getTime() && t < to.getTime()) {
                actions += value.actions;
                meetings += value.meetings;
            }
        }
        return { actions, meetings };
    };

    const currentWindow = sumWindow(windowStart, new Date(startOfToday.getTime() + DAY_MS));
    const previousWindow = sumWindow(previousStart, windowStart);

    // Per-SDR contribution on this mission: one group-by rather than a request
    // per assignee, so the Equipe tab stays cheap however big the team is.
    const teamRows = await prisma.$queryRaw<
        Array<{ sdrId: string; name: string; actions: number; meetings: number; recentActions: number }>
    >(
        Prisma.sql`
            SELECT a."sdrId" AS "sdrId",
                   MAX(u.name) AS name,
                   COUNT(a.id)::int AS actions,
                   COUNT(CASE WHEN a."result" = 'MEETING_BOOKED' THEN 1 END)::int AS meetings,
                   COUNT(CASE WHEN a."createdAt" >= ${windowStart} THEN 1 END)::int AS "recentActions"
            FROM "Action" a
            JOIN "Campaign" c ON c.id = a."campaignId"
            JOIN "User" u ON u.id = a."sdrId"
            WHERE c."missionId" = ${id}
            GROUP BY a."sdrId"
        `
    );

    const opportunityWhere = {
        contact: { company: { list: { missionId: id } } },
    };
    const [currentOpportunities, previousOpportunities] = await Promise.all([
        prisma.opportunity.count({
            where: { ...opportunityWhere, createdAt: { gte: windowStart } },
        }),
        prisma.opportunity.count({
            where: {
                ...opportunityWhere,
                createdAt: { gte: previousStart, lt: windowStart },
            },
        }),
    ]);

    // Per-list strategy readiness + mission-level rollup (lib/missions/readiness)
    const defaultMissionCampaign = defaultCampaignOf(mission.campaigns) as ReadinessCampaign;
    const cooldownOffListIds = await getCooldownDisabledListIds(mission.lists.map((l) => l.id));
    const listsWithReadiness = mission.lists.map((l) => ({
        ...l,
        readiness: computeListReadiness(l.campaign as ReadinessCampaign, defaultMissionCampaign),
        queueCooldownEnabled: !cooldownOffListIds.has(l.id),
    }));
    const missionReadiness = summarizeReadiness(listsWithReadiness);

    return successResponse({
        ...mission,
        lists: listsWithReadiness,
        missionReadiness,
        stats: {
            totalActions: stats._count,
            meetingsBooked: meetings,
            opportunities,
        },
        teamStats: teamRows.map((row) => ({
            sdrId: row.sdrId,
            name: row.name,
            actions: Number(row.actions),
            meetings: Number(row.meetings),
            recentActions: Number(row.recentActions),
        })),
        pulse: {
            funnel: {
                prospects: Number(prospectRows[0]?.prospects ?? 0),
                called: Number(funnel.called),
                reached: Number(funnel.reached),
                interested: Number(funnel.interested),
                meetings: Number(funnel.meetings),
            },
            benchmark: {
                reach: ratio(Number(agency.reached), Number(agency.called)),
                interest: ratio(Number(agency.interested), Number(agency.reached)),
                meeting: ratio(Number(agency.meetings), Number(agency.interested)),
            },
        },
        insights: {
            windowDays: TREND_DAYS,
            series,
            current: {
                actions: currentWindow.actions,
                meetings: currentWindow.meetings,
                opportunities: currentOpportunities,
            },
            previous: {
                actions: previousWindow.actions,
                meetings: previousWindow.meetings,
                opportunities: previousOpportunities,
            },
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
