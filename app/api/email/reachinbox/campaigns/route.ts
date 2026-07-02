// ============================================
// GET /api/email/reachinbox/campaigns
// Manager view: all ReachInbox campaigns (live stats) across the
// connected REACHINBOX mailboxes, merged with client links.
// Optional ?clientId= filters to campaigns linked to that client.
// ============================================

import { NextRequest } from 'next/server';
import { requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';
import { fetchAllReachInboxCampaigns } from '@/lib/email/services/reachinbox-campaigns';

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER'], request);

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');

    const { campaigns, errors } = await fetchAllReachInboxCampaigns();
    const filtered = clientId
        ? campaigns.filter((campaign) => campaign.client?.id === clientId)
        : campaigns;

    return successResponse({ campaigns: filtered, errors });
});
