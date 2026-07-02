"use client";

// ============================================
// REACHINBOX DASHBOARD - Email Hub section
// /manager/emails/campaigns
// API-key onboarding + read-only stats.
// ============================================

import { ReachInboxCampaignsPanel } from "@/components/email/ReachInboxCampaignsPanel";

export default function EmailHubCampaignsPage() {
    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-4">
            <ReachInboxCampaignsPanel variant="manager" />
            <p className="text-[11px] px-1" style={{ color: "var(--cp-ink-3)" }}>
                Lecture seule : cette page affiche les statistiques ReachInbox sans creer, modifier,
                lancer ou mettre en pause des campagnes.
            </p>
        </div>
    );
}
