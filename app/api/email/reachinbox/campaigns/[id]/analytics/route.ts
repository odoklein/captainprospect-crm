import { NextRequest } from 'next/server';
import { requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';
import { fetchReachInboxCampaignAnalytics } from '@/lib/email/services/reachinbox-campaigns';

function defaultStartDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().slice(0, 10);
}

function defaultEndDate(): string {
    return new Date().toISOString().slice(0, 10);
}

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: { id: string } },
) => {
    await requireRole(['MANAGER'], request);

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || defaultStartDate();
    const endDate = searchParams.get('endDate') || defaultEndDate();

    const analytics = await fetchReachInboxCampaignAnalytics({
        campaignId: params.id,
        startDate,
        endDate,
    });

    return successResponse(analytics);
});
