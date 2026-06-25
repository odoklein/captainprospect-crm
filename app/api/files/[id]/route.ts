import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { storageService } from '@/lib/storage/storage-service';
import {
    successResponse,
    errorResponse,
    requireAuth,
    withErrorHandler,
    validateRequest,
    NotFoundError,
} from '@/lib/api-utils';
import { z } from 'zod';
import { canMutateFile, canReadFile } from '@/lib/files/permissions';

// ============================================
// SCHEMAS
// ============================================

const updateFileSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    folderId: z.string().optional().nullable(),
});

// ============================================
// GET /api/files/[id] - Get file details
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth(request);
    const { id } = await params;

    const file = await prisma.file.findUnique({
        where: { id },
        include: {
            uploadedBy: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
            folder: {
                select: {
                    id: true,
                    name: true,
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
            campaign: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    if (!file || file.deletedAt) {
        throw new NotFoundError('Fichier introuvable');
    }

    if (!canReadFile(session.user, file)) {
        return errorResponse('Vous n\'avez pas la permission d\'accéder à ce fichier', 403);
    }

    return successResponse({
        ...file,
        formattedSize: storageService.formatSize(file.size),
    });
});

// ============================================
// PUT /api/files/[id] - Update file metadata
// ============================================

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth(request);
    const { id } = await params;
    const data = await validateRequest(request, updateFileSchema);

    // Check if file exists and user has permission
    const file = await prisma.file.findUnique({
        where: { id },
    });

    if (!file || file.deletedAt) {
        throw new NotFoundError('Fichier introuvable');
    }

    // Only uploader or managers can update
    if (!canMutateFile(session.user, file)) {
        return errorResponse('Vous n\'avez pas la permission de modifier ce fichier', 403);
    }

    const updatedFile = await prisma.file.update({
        where: { id },
        data,
        include: {
            uploadedBy: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
        },
    });

    return successResponse(updatedFile);
});

// ============================================
// DELETE /api/files/[id] - Delete file (soft delete)
// ============================================

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth(request);
    const { id } = await params;

    // Check if file exists and user has permission
    const file = await prisma.file.findUnique({
        where: { id },
    });

    if (!file || file.deletedAt) {
        throw new NotFoundError('Fichier introuvable');
    }

    // Only uploader or managers can delete
    if (!canMutateFile(session.user, file)) {
        return errorResponse('Vous n\'avez pas la permission de supprimer ce fichier', 403);
    }

    // Soft delete (mark as deleted, don't actually delete from storage yet)
    await prisma.file.update({
        where: { id },
        data: { deletedAt: new Date() },
    });

    // TODO: Schedule permanent deletion after 30 days
    // For now, we keep the file in storage for recovery

    return successResponse({ deleted: true });
});
