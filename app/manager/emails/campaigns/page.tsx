"use client";

// ============================================
// CAMPAGNES REACHINBOX — Email Hub section
// /manager/emails/campaigns
// Live campaign stats + client linking.
// ============================================

import { ReachInboxCampaignsPanel } from "@/components/email/ReachInboxCampaignsPanel";

export default function EmailHubCampaignsPage() {
    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-4">
            <ReachInboxCampaignsPanel variant="manager" />
            <p className="text-[11px] px-1" style={{ color: "var(--cp-ink-3)" }}>
                Liez une campagne à un client pour qu&apos;elle apparaisse automatiquement dans son portail
                et sur sa fiche client.
            </p>
        </div>
    );
}
