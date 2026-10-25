import { NextRequest } from 'next/server';
import { errorResponse, requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';
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
    { params }: { params: Promise<{ id: string }> },
) => {
    await requireRole(['MANAGER'], request);
    // Next 15: route params are a Promise (reading params.id directly gave undefined).
    const { id } = await params;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || defaultStartDate();
    const endDate = searchParams.get('endDate') || defaultEndDate();

    try {
        const analytics = await fetchReachInboxCampaignAnalytics({
            campaignId: id,
            startDate,
            endDate,
        });
        return successResponse(analytics);
    } catch (error) {
        // ReachInbox / key errors are user-facing ("not connected", timeout…), not 500 noise.
        return errorResponse(error instanceof Error ? error.message : 'Analytics ReachInbox indisponibles', 502);
    }
});
