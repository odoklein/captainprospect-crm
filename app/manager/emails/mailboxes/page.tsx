import { Suspense } from "react";
import MailboxesView from "@/components/email/mailboxes/MailboxesView";

export const metadata = { title: "Boîtes mail · Email Hub" };

export default function EmailHubMailboxesPage() {
    return (
        <Suspense fallback={null}>
            <MailboxesView />
        </Suspense>
    );
}
