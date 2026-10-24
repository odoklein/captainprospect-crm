"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ShieldCheck, Zap } from "lucide-react";
import { RadioCardGroup, useToast } from "@/components/ui";
import type { RadioCardOption } from "@/components/ui";
import type { ProspectCreationMode } from "@/lib/prospect-submissions/types";
import { PendingProspectSubmissionsPanel } from "./PendingProspectSubmissionsPanel";

const OPTIONS: RadioCardOption<ProspectCreationMode>[] = [
    { value: "OFF", title: "Désactivé", description: "Les SDR ne peuvent pas ajouter de société.", icon: Ban },
    {
        value: "VALIDATION",
        title: "Avec validation manager",
        description: "Un manager valide chaque ajout avant qu'il n'entre dans la file.",
        icon: ShieldCheck,
    },
    {
        value: "DIRECT",
        title: "Direct",
        description: "La société arrive tout de suite dans la file d'appels.",
        icon: Zap,
    },
];

/**
 * Mission setting "Ajout de sociétés par les SDR" (recommandation d'un
 * confrère, lead entrant du client) + the submissions waiting for validation.
 */
export function ProspectCreationSettingsCard({ missionId }: { missionId: string }) {
    const queryClient = useQueryClient();
    const { success, error: showError } = useToast();
    const queryKey = ["mission-prospect-creation", missionId];

    const { data: mode = null } = useQuery<ProspectCreationMode>({
        queryKey,
        queryFn: async () => {
            const res = await fetch(`/api/missions/${missionId}/prospect-creation`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            return json.data.mode;
        },
    });

    async function change(next: ProspectCreationMode) {
        const previous = mode;
        queryClient.setQueryData(queryKey, next);
        try {
            const res = await fetch(`/api/missions/${missionId}/prospect-creation`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: next }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            success("Réglage enregistré");
        } catch (err) {
            queryClient.setQueryData(queryKey, previous);
            showError("Réglage non enregistré", err instanceof Error ? err.message : undefined);
        }
    }

    return (
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Ajout de sociétés par les SDR</h2>
            <p className="mt-1 text-sm text-ink-3">
                Quand un prospect oriente le SDR vers un confrère, ou quand le client transmet un lead entrant, le SDR
                peut l&apos;ajouter lui-même à la base. Les doublons et les sociétés en BlackList sont toujours refusés.
            </p>
            <div className="mt-4">
                <RadioCardGroup name={`prospect-creation-${missionId}`} options={OPTIONS} value={mode} onChange={change} columns={3} />
            </div>
            {mode === "VALIDATION" && (
                <div className="mt-6 space-y-3">
                    <h3 className="text-sm font-semibold text-ink">En attente de validation</h3>
                    <PendingProspectSubmissionsPanel missionId={missionId} />
                </div>
            )}
        </div>
    );
}
