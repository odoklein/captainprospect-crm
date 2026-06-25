import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage-service";
import {
    errorResponse,
    requireAuth,
    successResponse,
    withErrorHandler,
    NotFoundError,
} from "@/lib/api-utils";
import { canReadFile } from "@/lib/files/permissions";

// ============================================
// GET /api/files/[id]/signed-url - Temporary file access URL
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const session = await requireAuth(request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const expiresIn = Number(searchParams.get("expiresIn") ?? 3600);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 86400) {
        return errorResponse("expiresIn doit etre entre 1 et 86400 secondes", 400);
    }

    const file = await prisma.file.findUnique({
        where: { id },
        select: {
            uploadedById: true,
            clientId: true,
            path: true,
            originalName: true,
            deletedAt: true,
        },
    });

    if (!file || file.deletedAt) {
        throw new NotFoundError("Fichier introuvable");
    }

    if (!canReadFile(session.user, file)) {
        return errorResponse("Vous n'avez pas la permission d'accéder à ce fichier", 403);
    }

    const url = await storageService.getSignedUrl(file.path, expiresIn);

    return successResponse({
        url,
        expiresIn,
        originalName: file.originalName,
    });
});
