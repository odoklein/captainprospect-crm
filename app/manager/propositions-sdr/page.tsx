"use client";

/**
 * Sociétés proposées par les SDR — every submission waiting for a manager on
 * missions set to « Avec validation ». Target of the manager notification
 * and of the « À valider » group in the home's « Tâches du jour ».
 * The per-mission setting lives in the mission workspace, onglet Réglages.
 */

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PendingProspectSubmissionsPanel } from "@/components/prospect-submissions/PendingProspectSubmissionsPanel";

function Content() {
    const missionId = useSearchParams().get("mission") || undefined;
    return (
        <div className="space-y-6">
            <PageHeader
                title="Sociétés proposées par les SDR"
                subtitle="Recommandations de confrères et leads entrants à valider avant d'entrer dans la file d'appels."
                icon={<Building2 className="w-5 h-5" />}
            />
            <PendingProspectSubmissionsPanel missionId={missionId} showMission />
        </div>
    );
}

export default function PropositionsSdrPage() {
    return (
        <Suspense fallback={null}>
            <Content />
        </Suspense>
    );
}
