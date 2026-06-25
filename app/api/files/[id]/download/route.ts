import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { storageService } from '@/lib/storage/storage-service';
import {
    errorResponse,
    requireAuth,
    withErrorHandler,
    NotFoundError,
} from '@/lib/api-utils';
import { canReadFile } from '@/lib/files/permissions';

// ============================================
// GET /api/files/[id]/download - Download file
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth(request);
    const { id } = await params;

    // Get file metadata
    const file = await prisma.file.findUnique({
        where: { id },
    });

    if (!file || file.deletedAt) {
        throw new NotFoundError('Fichier introuvable');
    }

    if (!canReadFile(session.user, file)) {
        return errorResponse('Vous n\'avez pas la permission d\'accéder à ce fichier', 403);
    }

    try {
        // Download file from storage
        const buffer = await storageService.download(file.path);

        // Return file with appropriate headers (Uint8Array is valid BodyInit; Buffer is not in DOM types)
        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': file.mimeType,
                'Content-Disposition': `attachment; filename="${encodeURIComponent(file.originalName)}"`,
                'Content-Length': buffer.length.toString(),
            },
        });
    } catch (error) {
        console.error('Download error:', error);
        return errorResponse('Erreur lors du téléchargement du fichier', 500);
    }
});
