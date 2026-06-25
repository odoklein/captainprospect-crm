import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { storageService } from '@/lib/storage/storage-service';
import {
    successResponse,
    requireAuth,
    withErrorHandler,
    getPaginationParams,
} from '@/lib/api-utils';
import { canReadFile } from '@/lib/files/permissions';

// ============================================
// GET /api/files - List files
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);

    const folderId = searchParams.get('folderId');
    const missionId = searchParams.get('missionId');
    const clientId = searchParams.get('clientId');
    const campaignId = searchParams.get('campaignId');
    const search = searchParams.get('search');
    const type = searchParams.get('type'); // 'image', 'video', 'document', etc.

    const where: Prisma.FileWhereInput = {
        deletedAt: null, // Only show non-deleted files
    };

    if (session.user.role === 'CLIENT') {
        where.clientId = session.user.clientId ?? '__forbidden__';
    } else if (session.user.role !== 'MANAGER' && session.user.role !== 'DEVELOPER') {
        where.uploadedById = session.user.id;
    }

    if (folderId) {
        where.folderId = folderId;
    }

    if (missionId) {
        where.missionId = missionId;
    }

    if (clientId) {
        where.clientId = clientId;
    }

    if (campaignId) {
        where.campaignId = campaignId;
    }

    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { originalName: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { tags: { hasSome: [search] } },
        ];
    }

    if (type === 'image') where.mimeType = { startsWith: 'image/' };
    if (type === 'video') where.mimeType = { startsWith: 'video/' };
    if (type === 'audio') where.mimeType = { startsWith: 'audio/' };
    if (type === 'text') where.mimeType = { startsWith: 'text/' };
    if (type === 'document') {
        where.OR = [
            ...(where.OR ?? []),
            { mimeType: 'application/pdf' },
            { mimeType: 'application/msword' },
            { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
            { mimeType: 'application/vnd.ms-excel' },
            { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
            { mimeType: 'application/vnd.ms-powerpoint' },
            { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
            { mimeType: 'text/plain' },
            { mimeType: 'text/csv' },
        ];
    }

    const [files, total] = await Promise.all([
        prisma.file.findMany({
            where,
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
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        }),
        prisma.file.count({ where }),
    ]);

    // Add formatted size to each file
    const filesWithFormattedSize = files
        .filter((file) => canReadFile(session.user, file))
        .map(file => ({
            ...file,
            formattedSize: storageService.formatSize(file.size),
        }));

    return successResponse({
        files: filesWithFormattedSize,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasMore: page * limit < total,
        },
    });
});
