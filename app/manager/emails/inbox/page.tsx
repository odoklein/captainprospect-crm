import { Suspense } from "react";
import { InboxLayout } from "@/components/email/inbox";

export const metadata = { title: "Boîte de réception · Email Hub" };

export default function EmailHubInboxPage() {
    // InboxLayout reads its state from the URL (useSearchParams)
    return (
        <Suspense fallback={null}>
            <InboxLayout showTeamInbox={true} />
        </Suspense>
    );
}
