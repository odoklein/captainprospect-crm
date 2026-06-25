import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    errorResponse,
    requireAuth,
    requireRole,
    withErrorHandler,
    validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';
import { canReadFolder } from '@/lib/files/permissions';

// ============================================
// SCHEMAS
// ============================================

const createFolderSchema = z.object({
    name: z.string().min(1, 'Le nom est requis'),
    description: z.string().optional(),
    parentId: z.string().optional().nullable(),
    missionId: z.string().optional().nullable(),
    clientId: z.string().optional().nullable(),
    color: z.string().optional(),
    icon: z.string().optional(),
});

// ============================================
// GET /api/folders - List folders
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const { searchParams } = new URL(request.url);

    const parentId = searchParams.get('parentId');
    const missionId = searchParams.get('missionId');
    const clientId = searchParams.get('clientId');
    const includeFiles = searchParams.get('includeFiles') === 'true';

    const where: Prisma.FolderWhereInput = {};

    if (parentId === 'root' || parentId === null) {
        where.parentId = null;
    } else if (parentId) {
        where.parentId = parentId;
    }

    if (missionId) {
        where.missionId = missionId;
    }

    if (clientId) {
        where.clientId = clientId;
    }

    if (session.user.role === 'CLIENT') {
        where.clientId = session.user.clientId ?? '__forbidden__';
    }

    const folders = await prisma.folder.findMany({
        where,
        include: {
            parent: {
                select: {
                    id: true,
                    name: true,
                },
            },
            children: {
                select: {
                    id: true,
                    name: true,
                },
            },
            _count: {
                select: {
                    files: true,
                    children: true,
                },
            },
            ...(includeFiles && {
                files: {
                    where: {
                        deletedAt: null,
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 10,
                },
            }),
        },
        orderBy: {
            createdAt: 'desc',
        },
    });

    return successResponse({
        folders: folders.filter((folder) => canReadFolder(session.user, folder)),
    });
});

// ============================================
// POST /api/folders - Create folder
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER', 'SDR'], request);
    const data = await validateRequest(request, createFolderSchema);

    // Check if parent exists if provided
    if (data.parentId) {
        const parent = await prisma.folder.findUnique({
            where: { id: data.parentId },
        });

        if (!parent) {
            return errorResponse('Dossier parent introuvable', 404);
        }
    }

    const folder = await prisma.folder.create({
        data: {
            name: data.name,
            description: data.description,
            parentId: data.parentId || undefined,
            missionId: data.missionId || undefined,
            clientId: data.clientId || undefined,
            color: data.color,
            icon: data.icon,
        },
        include: {
            parent: {
                select: {
                    id: true,
                    name: true,
                },
            },
            _count: {
                select: {
                    files: true,
                    children: true,
                },
            },
        },
    });

    return successResponse(folder, 201);
});
