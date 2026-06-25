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
});

// POST /api/folders/[id]/share - Make a folder visible to a client
export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth(request);
    const { id: folderId } = await params;

    const folder = await prisma.folder.findUnique({
        where: { id: folderId },
        select: { id: true, name: true },
    });
    if (!folder) return errorResponse("Dossier introuvable", 404);
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

    await prisma.folder.update({
        where: { id: folderId },
        data: { clientId: client.id },
    });
    await prisma.file.updateMany({
        where: { folderId, deletedAt: null },
        data: { clientId: client.id },
    });

    return successResponse({
        folderId,
        clientId: client.id,
        message: `Le dossier ${folder.name} est maintenant visible pour ${client.name}.`,
    });
});
