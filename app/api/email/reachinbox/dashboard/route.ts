import { NextRequest } from 'next/server';
import { requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';
import { fetchReachInboxDashboard } from '@/lib/email/services/reachinbox-campaigns';

function defaultStartDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().slice(0, 10);
}

function defaultEndDate(): string {
    return new Date().toISOString().slice(0, 10);
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER'], request);

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || defaultStartDate();
    const endDate = searchParams.get('endDate') || defaultEndDate();
    const campaignIds = searchParams.getAll('campaignId').filter(Boolean);
    const includeCampaigns = searchParams.get('includeCampaigns') !== 'false';

    const dashboard = await fetchReachInboxDashboard({
        startDate,
        endDate,
        campaignIds,
        includeCampaigns,
    });

    return successResponse(dashboard);
});
