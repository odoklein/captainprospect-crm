"use client";

import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";
import { EmailHubPage } from "@/components/email/EmailHubPage";
import { SentEmailsView } from "./SentEmailsView";

const newActionLink = (
    <Link
        href="/sdr/action"
        className={cn("inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3.5 text-[13px] font-semibold text-primary-fg shadow-primary hover:bg-primary-hover", FOCUS_RING)}
    >
        <PhoneCall className="size-4" aria-hidden /> Nouvelle action
    </Link>
);

/** /sdr/emails/sent — the emails I sent. */
export default function SdrSentView() {
    return (
        <SentEmailsView
            scope="sdr"
            title="Mes envois"
            description="Les emails que vous avez envoyés."
            actions={newActionLink}
            emptyHint={{
                title: "Aucun email envoyé pour l'instant",
                description: "Envoyez un email depuis l'écran d'appel (résultat « Envoie mail ») : il apparaîtra ici.",
                action: newActionLink,
            }}
            frame={({ actions, children }) => (
                <EmailHubPage title="Mes envois" description="Les emails que vous avez envoyés : statut, ouvertures et réponses." actions={actions}>
                    {children}
                </EmailHubPage>
            )}
        />
    );
}
