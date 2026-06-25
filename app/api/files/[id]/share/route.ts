import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    errorResponse,
    requireAuth,
    withErrorHandler,
} from "@/lib/api-utils";
import { z } from "zod";
import { canAssignClientVisibility } from "@/lib/files/permissions";

const shareBodySchema = z.object({
    clientId: z.string().min(1, "Client requis"),
    folderId: z.string().optional().nullable(),
});

// POST /api/files/[id]/share - Make a file visible to a client
export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth(request);
    const { id: fileId } = await params;

    const file = await prisma.file.findUnique({
        where: { id: fileId },
        select: { id: true, clientId: true, folderId: true },
    });
    if (!file) return errorResponse("Fichier introuvable", 404);
    if (!canAssignClientVisibility(session.user)) {
        return errorResponse("Vous n'avez pas la permission de modifier la visibilité client", 403);
    }

    const body = await request.json();
    const parsed = shareBodySchema.safeParse(body);
    if (!parsed.success) {
        return errorResponse(parsed.error.errors[0]?.message ?? "Données invalides", 400);
    }

    const client = await prisma.client.findUnique({
        where: { id: parsed.data.clientId },
        select: { id: true, name: true },
    });
    if (!client) return errorResponse("Client introuvable", 404);

    if (parsed.data.folderId) {
        const folder = await prisma.folder.findUnique({
            where: { id: parsed.data.folderId },
            select: { id: true, clientId: true },
        });
        if (!folder) return errorResponse("Dossier introuvable", 404);
        if (folder.clientId && folder.clientId !== client.id) {
            return errorResponse("Le dossier sélectionné n'appartient pas au client choisi", 400);
        }
    }

    const updatedFile = await prisma.file.update({
        where: { id: fileId },
        data: {
            clientId: client.id,
            ...(parsed.data.folderId !== undefined ? { folderId: parsed.data.folderId || null } : {}),
        },
        select: {
            id: true,
            clientId: true,
            folderId: true,
        },
    });

    return successResponse({
        fileId: updatedFile.id,
        clientId: updatedFile.clientId,
        folderId: updatedFile.folderId,
        message: `Le fichier est maintenant visible pour ${client.name}.`,
    });
});
