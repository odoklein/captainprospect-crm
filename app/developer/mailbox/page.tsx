// ============================================
// DEVELOPER MAILBOX PAGE
// Full-featured email client powered by InboxLayout
// ============================================

import { InboxLayout } from "@/components/email/inbox";

export const metadata = {
    title: "Mailbox | Suzalink Dev",
    description: "Boîte de réception et gestion des emails développeur",
};

export default function DeveloperMailboxPage() {
    return <InboxLayout showTeamInbox={true} standalone />;
}
