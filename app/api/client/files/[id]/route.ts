import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    AuthError,
    NotFoundError,
} from "@/lib/api-utils";
import { canMutateFile } from "@/lib/files/permissions";

// ============================================
// DELETE /api/client/files/[id] - Delete file (CLIENT only, must own the file via clientId)
// ============================================

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(["CLIENT"], request);
    const { id } = await params;

    const clientId = (session.user as { clientId?: string })?.clientId;
    if (!clientId) {
        throw new AuthError("Accès non autorisé", 403);
    }

    const file = await prisma.file.findUnique({
        where: { id },
    });

    if (!file || file.deletedAt) {
        throw new NotFoundError("Fichier introuvable");
    }

    if (file.clientId !== clientId || !canMutateFile(session.user, file)) {
        return errorResponse("Vous n'avez pas la permission de supprimer ce fichier", 403);
    }

    await prisma.file.update({
        where: { id },
        data: { deletedAt: new Date() },
    });

    return successResponse({ deleted: true });
});
