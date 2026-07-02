// ============================================
// GET /api/client/reachinbox-campaigns
// Client portal view: ReachInbox campaigns linked to the
// logged-in client, with live stats. Client identity comes from
// the session — clients can only ever see their own campaigns.
// ============================================

import { NextRequest } from 'next/server';
import { requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';
import { fetchAllReachInboxCampaigns } from '@/lib/email/services/reachinbox-campaigns';

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['CLIENT'], request);
    const clientId = (session.user as { clientId?: string | null }).clientId;

    if (!clientId) {
        return successResponse({ campaigns: [] });
    }

    const { campaigns } = await fetchAllReachInboxCampaigns();
    const own = campaigns
        .filter((campaign) => campaign.client?.id === clientId)
        // The client does not need to know about mailboxes or other clients.
        .map(({ client: _client, mailboxEmail: _mailboxEmail, mailboxId: _mailboxId, ...campaign }) => campaign);

    return successResponse({ campaigns: own });
});
