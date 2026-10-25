import { Suspense } from "react";
import { EmailHubPage } from "@/components/email/EmailHubPage";
import { ReachInboxWorkspace } from "@/components/emailing/ReachInboxWorkspace";

// ============================================
// CAMPAIGNS — Email Hub section (/manager/emails/campaigns)
// ReachInbox: API-key onboarding, read-only stats, campaign → client links.
// ?connect=1 opens the API key dialog (from "Ajouter une boîte mail").
// ============================================

export const metadata = { title: "Campagnes · Email Hub" };

export default function EmailHubCampaignsPage() {
    return (
        <EmailHubPage>
            <Suspense fallback={null}>
                <ReachInboxWorkspace variant="manager" />
            </Suspense>
        </EmailHubPage>
    );
}
