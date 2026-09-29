import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { actionService } from '@/lib/services/ActionService';
import { successResponse, errorResponse, requireRole, withErrorHandler } from '@/lib/api-utils';

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER', 'SDR', 'BUSINESS_DEVELOPER'], request);
    const { id } = await params;

    const mission = await prisma.mission.findUnique({
        where: { id },
        select: { id: true }
    });

    if (!mission) {
        return errorResponse('Mission introuvable', 404);
    }

    const { searchParams } = new URL(request.url);
    const sdrId = searchParams.get('sdrId') || undefined;
    const channelParam = searchParams.get('channel')?.toUpperCase();
    const channel = (channelParam === 'CALL' || channelParam === 'EMAIL' || channelParam === 'LINKEDIN')
        ? channelParam as 'CALL' | 'EMAIL' | 'LINKEDIN'
        : undefined;
    const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined;
    const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : undefined;
    const listId = searchParams.get('listId') || undefined;

    const stats = await actionService.getActionStats({
        missionId: id,
        sdrId,
        channel,
        from,
        to,
        listId,
    });

    return successResponse(stats);
});
