// ============================================
// POST /api/email/reachinbox/campaigns/link
// Link (or unlink) a ReachInbox campaign to a CRM client.
// Body: { campaignId, campaignName, mailboxId?, clientId }
// clientId null/"" removes the link.
// ============================================

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { errorResponse, requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';
import {
    deleteCampaignLink,
    isMissingLinkTableError,
    upsertCampaignLink,
} from '@/lib/email/services/reachinbox-campaigns';

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER'], request);

    const body = await request.json() as {
        campaignId?: string;
        campaignName?: string;
        mailboxId?: string | null;
        clientId?: string | null;
    };

    const campaignId = body.campaignId?.trim();
    if (!campaignId) {
        return errorResponse('campaignId requis', 400);
    }

    const clientId = body.clientId?.trim() || null;

    try {
        if (!clientId) {
            await deleteCampaignLink(campaignId);
            return successResponse({ campaignId, clientId: null });
        }

        const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: { id: true, name: true },
        });
        if (!client) {
            return errorResponse('Client introuvable', 404);
        }

        await upsertCampaignLink({
            campaignId,
            campaignName: body.campaignName?.trim() || 'Campagne ReachInbox',
            mailboxId: body.mailboxId?.trim() || null,
            clientId,
        });

        return successResponse({ campaignId, clientId, clientName: client.name });
    } catch (error) {
        if (isMissingLinkTableError(error)) {
            return errorResponse(
                'Table ReachInboxCampaignLink manquante — exécutez add-reachinbox-campaign-links.sql dans Supabase.',
                503
            );
        }
        throw error;
    }
});
