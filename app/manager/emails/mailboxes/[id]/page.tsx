import { redirect } from "next/navigation";

// Old links (/manager/emails/mailboxes/<id>, e.g. the inbox mailbox dialog) open
// the settings drawer of the mailboxes page.
export default async function MailboxSettingsRedirect({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    redirect(`/manager/emails/mailboxes?mailbox=${encodeURIComponent(id)}`);
}
