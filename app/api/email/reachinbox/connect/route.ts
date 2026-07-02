import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
    errorResponse,
    requireRole,
    successResponse,
    validateRequest,
    withErrorHandler,
} from '@/lib/api-utils';
import { connectReachInboxApiKey } from '@/lib/email/services/reachinbox-campaigns';

const connectSchema = z.object({
    apiKey: z.string().trim().min(12, 'Cle API ReachInbox requise'),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['MANAGER'], request);
    const body = await validateRequest(request, connectSchema);

    try {
        const connection = await connectReachInboxApiKey({
            userId: session.user.id,
            apiKey: body.apiKey,
        });

        return successResponse(connection, 201);
    } catch (error) {
        return errorResponse(
            error instanceof Error ? error.message : 'Impossible de connecter ReachInbox',
            400,
        );
    }
});
