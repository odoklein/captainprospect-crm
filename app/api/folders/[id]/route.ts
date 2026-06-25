import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    errorResponse,
    requireAuth,
    requireRole,
    withErrorHandler,
    validateRequest,
    NotFoundError,
} from '@/lib/api-utils';
import { z } from 'zod';
import { canMutateFolder, canReadFolder } from '@/lib/files/permissions';

// ============================================
// SCHEMAS
// ============================================

const updateFolderSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    parentId: z.string().optional().nullable(),
    color: z.string().optional(),
    icon: z.string().optional(),
});

// ============================================
// GET /api/folders/[id] - Get folder details
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth(request);
    const { id } = await params;

    const folder = await prisma.folder.findUnique({
        where: { id },
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
                    color: true,
                    icon: true,
                    _count: {
                        select: {
                            files: true,
                            children: true,
                        },
                    },
                },
            },
            files: {
                where: {
                    deletedAt: null,
                },
                include: {
                    uploadedBy: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
            },
            mission: {
                select: {
                    id: true,
                    name: true,
                },
            },
            client: {
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

    if (!folder) {
        throw new NotFoundError('Dossier introuvable');
    }

    if (!canReadFolder(session.user, folder)) {
        return errorResponse('Vous n\'avez pas la permission d\'accéder à ce dossier', 403);
    }

    return successResponse(folder);
});

// ============================================
// PUT /api/folders/[id] - Update folder
// ============================================

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['MANAGER', 'SDR'], request);
    const { id } = await params;
    const data = await validateRequest(request, updateFolderSchema);

    // Check if folder exists
    const folder = await prisma.folder.findUnique({
        where: { id },
    });

    if (!folder) {
        throw new NotFoundError('Dossier introuvable');
    }

    if (!canMutateFolder(session.user, folder)) {
        return errorResponse('Vous n\'avez pas la permission de modifier ce dossier', 403);
    }

    // Check if trying to move to a child folder (would create circular reference)
    if (data.parentId && data.parentId !== folder.parentId) {
        const isChild = await isChildFolder(id, data.parentId);
        if (isChild) {
            return errorResponse('Impossible de déplacer un dossier vers un de ses sous-dossiers', 400);
        }
    }

    const updatedFolder = await prisma.folder.update({
        where: { id },
        data: {
            name: data.name,
            description: data.description,
            parentId: data.parentId,
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

    return successResponse(updatedFolder);
});

// ============================================
// DELETE /api/folders/[id] - Delete folder
// ============================================

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['MANAGER'], request);
    const { id } = await params;

    // Check if folder exists
    const folder = await prisma.folder.findUnique({
        where: { id },
        include: {
            _count: {
                select: {
                    files: true,
                    children: true,
                },
            },
        },
    });

    if (!folder) {
        throw new NotFoundError('Dossier introuvable');
    }

    if (!canMutateFolder(session.user, folder)) {
        return errorResponse('Vous n\'avez pas la permission de supprimer ce dossier', 403);
    }

    // Check if folder is empty
    if (folder._count.files > 0 || folder._count.children > 0) {
        return errorResponse(
            'Impossible de supprimer un dossier non vide. Veuillez d\'abord déplacer ou supprimer son contenu.',
            400
        );
    }

    await prisma.folder.delete({
        where: { id },
    });

    return successResponse({ deleted: true });
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if targetId is a child of folderId (prevent circular references)
 */
async function isChildFolder(folderId: string, targetId: string): Promise<boolean> {
    if (folderId === targetId) {
        return true;
    }

    const target = await prisma.folder.findUnique({
        where: { id: targetId },
        select: { parentId: true },
    });

    if (!target || !target.parentId) {
        return false;
    }

    return isChildFolder(folderId, target.parentId);
}
