// ============================================
// SDR EMAIL PAGE
// Reuse InboxLayout but focused on SDR
// ============================================

import { InboxLayout } from "@/components/email/inbox";

export const metadata = {
    title: "Email",
    description: "Gérez vos emails",
};

export default function SDREmailPage() {
    return <InboxLayout showTeamInbox={false} standalone />;
}
