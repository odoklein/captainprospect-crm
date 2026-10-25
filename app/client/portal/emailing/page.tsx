import { Suspense } from "react";
import { ClientEmailingPage } from "@/components/emailing/ClientEmailingPage";

export const metadata = {
    title: "Emailing | Portail client",
    description: "Campagnes emailing et emails envoyés",
};

export default function ClientPortalEmailingPage() {
    return (
        <Suspense fallback={null}>
            <ClientEmailingPage />
        </Suspense>
    );
}
