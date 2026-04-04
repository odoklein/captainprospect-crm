import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';

const avatarSchema = z.object({
    avatarUrl: z.string().url('URL invalide'),
});

export const PATCH = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER'], request);
    const { id } = await params;
    const data = await validateRequest(request, avatarSchema);

    const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!user) {
        return errorResponse('Utilisateur non trouvé', 404);
    }

    const updated = await prisma.user.update({
        where: { id },
        data: { avatar: data.avatarUrl },
        select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
            isActive: true,
        },
    });

    return successResponse(updated);
});
