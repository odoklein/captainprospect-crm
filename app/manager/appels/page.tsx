"use client";

import { CallsJournal } from "@/components/calls/CallsJournal";
import { TelephonyDiagnosticsButton } from "@/components/calls/TelephonyDiagnostics";

export default function ManagerCallsJournalPage() {
    return (
        <CallsJournal
            scope="team"
            apiBase="/api/manager/calls"
            title="Journal d'appels"
            subtitle="Chaque appel de l'équipe avec son statut, sa durée, son enregistrement et son résumé."
            headerActions={<TelephonyDiagnosticsButton />}
        />
    );
}
