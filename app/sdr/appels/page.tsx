"use client";

// « Mes appels » — the SDR's own call journal: every call with its status,
// recording, summary and transcript; and, under « Sans statut », the calls
// placed from the integrated phone that still have no result, each one
// qualified in the usual action drawer and linked to that exact call.

import { useState } from "react";
import dynamic from "next/dynamic";
import { CallsJournal } from "@/components/calls/CallsJournal";
import type { JournalRow } from "@/lib/calls-journal/types";
import { useToast } from "@/components/ui";
import { useCallQualified } from "@/components/telephony/PostCallSuggestion";

const UnifiedActionDrawer = dynamic(
    () => import("@/components/drawers/UnifiedActionDrawer").then((m) => ({ default: m.UnifiedActionDrawer })),
    { ssr: false },
);

export default function MyCallsPage() {
    const { success } = useToast();
    const [qualifying, setQualifying] = useState<JournalRow | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    // A call qualified from the island shows up here at once.
    useCallQualified(() => setRefreshKey((k) => k + 1));

    return (
        <>
            <CallsJournal
                scope="mine"
                apiBase="/api/sdr/calls"
                title="Mes appels"
                subtitle="Vos appels avec leur statut, leur enregistrement et leur résumé. Qualifiez ceux restés sans statut."
                onQualify={setQualifying}
                refreshKey={refreshKey}
            />
            {qualifying?.company && (
                <UnifiedActionDrawer
                    isOpen
                    onClose={() => setQualifying(null)}
                    contactId={qualifying.contact?.id ?? null}
                    companyId={qualifying.company.id}
                    missionId={qualifying.mission?.id}
                    missionName={qualifying.mission?.name}
                    telephonyCallId={qualifying.id}
                    onActionRecorded={() => {
                        setQualifying(null);
                        setRefreshKey((k) => k + 1);
                        success("Appel qualifié", "Le résultat est rattaché à cet appel.");
                    }}
                />
            )}
        </>
    );
}
