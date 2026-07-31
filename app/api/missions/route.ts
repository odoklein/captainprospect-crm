import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    errorResponse,
    paginatedResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
    getPaginationParams,
} from '@/lib/api-utils';
import { z } from 'zod';
import type { MissionStatusValue } from '@/lib/constants/missionStatus';
import { portalVisibleMissionWhere } from '@/lib/portal-visibility';

// ============================================
// SCHEMAS
// ============================================

const channelEnum = z.enum(['CALL', 'EMAIL', 'LINKEDIN']);
const missionStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']);
const createMissionSchema = z.object({
    clientId: z.string().min(1, 'Client requis'),
    name: z.string().min(1, 'Nom requis'),
    objective: z.string().min(1, 'Objectif requis'),
    channel: channelEnum.optional(),
    channels: z.array(channelEnum).min(1, 'Sélectionnez au moins un canal').optional(),
    startDate: z.string().transform((s) => new Date(s)),
    endDate: z.string().transform((s) => new Date(s)),
    status: missionStatusEnum.optional().default('DRAFT'),
    isActive: z.boolean().optional(),
}).transform((data) => {
    const channels = data.channels ?? (data.channel ? [data.channel] : ['CALL']);
    const channel = channels[0];
    const status = data.isActive !== undefined
        ? (data.isActive ? 'ACTIVE' : 'PAUSED')
        : data.status;
    return { ...data, channel, channels, status, isActive: status === 'ACTIVE' };
});

const updateMissionSchema = z.object({
    clientId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    objective: z.string().min(1).optional(),
    channel: channelEnum.optional(),
    channels: z.array(channelEnum).min(1).optional(),
    startDate: z.string().transform((s) => new Date(s)).optional(),
    endDate: z.string().transform((s) => new Date(s)).optional(),
    status: missionStatusEnum.optional(),
    isActive: z.boolean().optional(),
}).partial().transform((data) => {
    const status = data.status ?? (data.isActive !== undefined ? (data.isActive ? 'ACTIVE' : 'PAUSED') : undefined);
    if (data.channels !== undefined) {
        const channel = data.channels[0];
        return { ...data, channel, ...(status !== undefined ? { status, isActive: status === 'ACTIVE' } : {}) };
    }
    return status !== undefined ? { ...data, status, isActive: status === 'ACTIVE' } : data;
});

// ============================================
// GET /api/missions - List all missions
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['MANAGER', 'CLIENT', 'SDR', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);

    // Filters
    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');
    const statuses = searchParams.get('statuses');
    const isActive = searchParams.get('isActive'); // legacy compat
    const search = searchParams.get('search');
    const channel = searchParams.get('channel');

    const where: Record<string, unknown> = {};

    // Role-based filtering
    if (session.user.role === 'CLIENT') {
        // Clients only see missions for their own company
        where.client = { users: { some: { id: session.user.id } } };
        where.AND = [portalVisibleMissionWhere()];
    } else if (session.user.role === 'SDR') {
        // SDRs only see missions they're assigned to
        where.sdrAssignments = { some: { sdrId: session.user.id } };
    }

    if (clientId) where.clientId = clientId;
    const allowedStatuses: MissionStatusValue[] = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'];
    const parsedStatuses = statuses
        ? statuses
            .split(',')
            .map((s) => s.trim())
            .filter((s): s is MissionStatusValue => allowedStatuses.includes(s as MissionStatusValue))
        : null;
    if (status && missionStatusEnum.safeParse(status).success) {
        where.status = status as MissionStatusValue;
    } else if (parsedStatuses && parsedStatuses.length > 0) {
        where.status = { in: parsedStatuses };
    } else if (isActive !== null) {
        where.status = isActive === 'true' ? 'ACTIVE' : 'PAUSED';
    }
    if (channel && ['CALL', 'EMAIL', 'LINKEDIN'].includes(channel)) {
        where.channels = { has: channel };
    }
    if (search?.trim()) {
        where.OR = [
            { name: { contains: search.trim(), mode: 'insensitive' } },
            { objective: { contains: search.trim(), mode: 'insensitive' } },
            { client: { name: { contains: search.trim(), mode: 'insensitive' } } },
        ];
    }

    const [missions, total] = await Promise.all([
        prisma.mission.findMany({
            where,
            include: {
                client: { select: { id: true, name: true } },
                campaigns: { select: { id: true, name: true, isActive: true } },
                lists: { select: { id: true, name: true, type: true } },
                sdrAssignments: {
                    include: { sdr: { select: { id: true, name: true } } },
                },
                _count: {
                    select: {
                        campaigns: true,
                        lists: true,
                        sdrAssignments: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        }),
        prisma.mission.count({ where }),
    ]);

    return paginatedResponse(missions, total, page, limit);
});

// ============================================
// POST /api/missions - Create new mission
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
    const data = await validateRequest(request, createMissionSchema);

    // Verify client exists
    const client = await prisma.client.findUnique({
        where: { id: data.clientId },
    });

    if (!client) {
        return errorResponse('Client introuvable', 404);
    }

    const mission = await prisma.mission.create({
        data,
        include: {
            client: { select: { id: true, name: true } },
        },
    });

    return successResponse(mission, 201);
});
