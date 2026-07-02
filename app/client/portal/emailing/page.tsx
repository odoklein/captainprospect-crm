import { EmailingReachInboxWorkspace } from "@/components/emailing/EmailingReachInboxWorkspace";

export const metadata = {
    title: "Emailing | Portail client",
    description: "Statistiques emailing ReachInbox",
};

export default function ClientEmailingPage() {
    return <EmailingReachInboxWorkspace variant="client" />;
}
