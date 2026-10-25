"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";
import { EmailHubPage } from "@/components/email/EmailHubPage";
import { SentEmailsView } from "./SentEmailsView";

/** /manager/emails/sent — every email the team sent from the CRM. */
export default function ManagerSentView() {
    return (
        <SentEmailsView
            scope="manager"
            title="Envoyés"
            description="Tous les emails envoyés depuis le CRM par l'équipe."
            emptyHint={{
                title: "Aucun email envoyé depuis le CRM",
                description:
                    "Les emails envoyés depuis l'écran d'appel, la réception ou les séquences apparaîtront ici. Les campagnes ReachInbox sont suivies dans l'onglet Campagnes.",
                action: (
                    <Link href="/manager/emails/campaigns" className={cn("rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 hover:border-line-strong hover:text-ink", FOCUS_RING)}>
                        Voir les campagnes
                    </Link>
                ),
            }}
            frame={({ actions, children }) => (
                <EmailHubPage title="Envoyés" description="Tous les emails envoyés depuis le CRM par l'équipe : statut, ouvertures, réponses." actions={actions}>
                    {children}
                </EmailHubPage>
            )}
        />
    );
}
