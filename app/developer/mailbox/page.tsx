// ============================================
// DEVELOPER MAILBOX PAGE
// Full inbox (team mailboxes) inside the developer layout
// ============================================

import { Suspense } from "react";
import { InboxLayout } from "@/components/email/inbox";

export const metadata = {
    title: "Mailbox",
    description: "Boîte de réception et gestion des emails développeur",
};

export default function DeveloperMailboxPage() {
    return (
        <Suspense fallback={null}>
            <InboxLayout showTeamInbox={true} standalone />
        </Suspense>
    );
}
