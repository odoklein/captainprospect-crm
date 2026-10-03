import { EmailingReachInboxWorkspace } from "@/components/emailing/EmailingReachInboxWorkspace";

export const metadata = {
    title: "Emailing",
    description: "Statistiques ReachInbox en lecture seule",
};

export default function ManagerEmailingPage() {
    return <EmailingReachInboxWorkspace variant="manager" />;
}
