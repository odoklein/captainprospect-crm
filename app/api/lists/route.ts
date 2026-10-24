import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
    successResponse,
    paginatedResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
    getPaginationParams,
} from '@/lib/api-utils';
import { z } from 'zod';

// ============================================
// SCHEMAS
// ============================================

const createListSchema = z.object({
    missionId: z.string().min(1, 'Mission requise'),
    name: z.string().min(1, 'Nom requis'),
    type: z.enum(['SUZALI', 'CLIENT', 'MIXED']),
    source: z.string().optional(),
});

// ============================================
// GET /api/lists - List all lists
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER'], request);
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);

    const missionId = searchParams.get('missionId');
    const type = searchParams.get('type');

    const where: Record<string, unknown> = {};
    if (missionId) where.missionId = missionId;
    if (type) where.type = type;

    const [lists, total] = await Promise.all([
        prisma.list.findMany({
            where,
            include: {
                mission: { select: { id: true, name: true, client: { select: { name: true } } } },
                _count: { select: { companies: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        }),
        prisma.list.count({ where }),
    ]);

    // Completeness stats, counted in SQL — never load every company of the page.
    const listIds = lists.map((l) => l.id);
    const [statusRows, contactRows] = listIds.length === 0 ? [[], []] : await Promise.all([
        prisma.company.groupBy({
            by: ['listId', 'status'],
            where: { listId: { in: listIds } },
            _count: { _all: true },
        }),
        prisma.$queryRaw<{ list_id: string; contacts: bigint }[]>`
            SELECT co."listId" AS list_id, COUNT(*)::bigint AS contacts
            FROM "Contact" c
            INNER JOIN "Company" co ON co.id = c."companyId"
            WHERE co."listId" IN (${Prisma.join(listIds)})
            GROUP BY co."listId"
        `,
    ]);
    const contactsByList = new Map(contactRows.map((r) => [r.list_id, Number(r.contacts)]));

    const listsWithStats = lists.map((list) => {
        const statusCounts = { INCOMPLETE: 0, PARTIAL: 0, ACTIONABLE: 0 };
        for (const row of statusRows) {
            if (row.listId === list.id) statusCounts[row.status] += row._count._all;
        }

        return {
            ...list,
            stats: {
                companyCount: list._count.companies,
                contactCount: contactsByList.get(list.id) ?? 0,
                completeness: statusCounts,
            },
        };
    });

    return paginatedResponse(listsWithStats, total, page, limit);
});

// ============================================
// POST /api/lists - Create new list
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER'], request);
    const data = await validateRequest(request, createListSchema);

    const list = await prisma.list.create({
        data,
        include: {
            mission: { select: { id: true, name: true } },
        },
    });

    return successResponse(list, 201);
});
