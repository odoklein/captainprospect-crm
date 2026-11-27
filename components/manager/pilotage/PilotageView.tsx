"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PilotagePayload } from "@/lib/manager-pilotage/types";
import { hhmm } from "@/lib/manager-pilotage/team";
import { ICON_CONTROL, KeyHints, LoadingBar, WorkspaceFooter, WorkspaceFrame, WorkspaceHeader, WorkspaceMain } from "@/components/workspace/Workspace";
import { useWorkspaceKeys } from "@/components/workspace/useWorkspaceKeys";
import { LandingHero } from "./LandingHero";
import { DecideNow } from "./DecideNow";
import { TeamLive } from "./TeamLive";
import { PitchHeatmap, type HeatMode } from "./PitchHeatmap";
import { CloserBoard } from "./CloserBoard";
import { longDay } from "./format";

// ============================================
// /manager/pilotage — « Salle de pilotage ». A manager reads risk, not rows,
// top to bottom in the order they decide: will the month land, what needs me
// now, who is on the phone, where the pitch lands or bounces, who deserves
// more hours. No call table: the journal stays one click away.
// ============================================

export const PILOTAGE_QUERY_KEY = ["manager", "pilotage"] as const;

async function fetchPilotage(): Promise<PilotagePayload> {
    const res = await fetch("/api/manager/pilotage");
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Impossible de charger la salle de pilotage");
    return json.data as PilotagePayload;
}

function useAgo(iso: string | undefined): string {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 10_000);
        return () => clearInterval(t);
    }, []);
    if (!iso) return "";
    const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
    return s < 60 ? "à l’instant" : `il y a ${Math.round(s / 60)} min`;
}

export function PilotageView() {
    const { data, error, isLoading, isFetching, refetch } = useQuery({
        queryKey: PILOTAGE_QUERY_KEY,
        queryFn: fetchPilotage,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
    });
    const [mode, setMode] = useState<HeatMode>("sdr");
    const ago = useAgo(data?.generatedAt);

    useWorkspaceKeys({
        r: () => void refetch(),
        "1": () => setMode("sdr"),
        "2": () => setMode("mission"),
    });

    const planned = data?.team.filter((m) => m.status !== "absent" && m.status !== "unplanned").length ?? 0;
    const missions = data ? data.forecast.missions.length + data.untargeted.length : 0;

    return (
        <WorkspaceFrame>
            <WorkspaceMain>
                <WorkspaceHeader
                    title="Salle de pilotage"
                    subtitle={
                        data
                            ? `${longDay(data.today.key)} · ${hhmm(data.today.minute)} · ${planned} SDR planifié${planned > 1 ? "s" : ""} · ${missions} mission${missions > 1 ? "s" : ""} active${missions > 1 ? "s" : ""} ce mois`
                            : "Atterrissage du mois, décisions, équipe en direct"
                    }
                    actions={
                        <>
                            {data && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[12px] font-semibold text-success-ink" title="Rafraîchi chaque minute">
                                    <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                                    Mis à jour {ago}
                                </span>
                            )}
                            <button type="button" onClick={() => refetch()} disabled={isFetching} aria-label="Actualiser" title="Actualiser (r)" className={ICON_CONTROL}>
                                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin motion-reduce:animate-none")} />
                            </button>
                        </>
                    }
                />

                <div className="relative min-h-0 flex-1 overflow-auto" aria-busy={isLoading}>
                    <LoadingBar loading={isFetching && !isLoading} />
                    <div className="mx-auto flex max-w-[1360px] flex-col gap-4 px-4 py-5 sm:px-6">
                        {error && !data ? (
                            <div className="rounded-panel border border-line bg-surface px-5 py-8 text-center">
                                <p className="text-[14px] font-semibold text-ink">La salle de pilotage n’a pas pu se charger.</p>
                                <p className="mt-1 text-[13px] text-ink-3">{error instanceof Error ? error.message : "Erreur inconnue"}</p>
                                <button type="button" onClick={() => refetch()} className="mt-4 text-[13px] font-medium text-link hover:underline">
                                    Réessayer
                                </button>
                            </div>
                        ) : !data ? (
                            <Skeleton />
                        ) : (
                            <>
                                <LandingHero data={data} />
                                <div className="flex flex-wrap items-stretch gap-4">
                                    <DecideNow signals={data.signals} />
                                    <TeamLive team={data.team} />
                                </div>
                                <PitchHeatmap data={data.heatmap} mode={mode} onMode={setMode} windowDays={data.window.days} />
                                <CloserBoard data={data.closers} windowDays={data.window.days} />
                            </>
                        )}
                    </div>
                </div>

                <WorkspaceFooter>
                    {data && (
                        <span className="mr-auto truncate">
                            Joint = toute réponse sauf pas de réponse, barrage et faux numéro · Taux de RDV = RDV pris ÷ joints · quota {data.config.quota} appels/jour
                        </span>
                    )}
                    <KeyHints hints={[[["r"], "actualiser"], [["1", "2"], "carte par SDR, par mission"]]} />
                </WorkspaceFooter>
            </WorkspaceMain>
        </WorkspaceFrame>
    );
}

function Skeleton() {
    return (
        <>
            <div className="h-[300px] animate-pulse rounded-panel bg-inverse/90 motion-reduce:animate-none" />
            <div className="flex flex-wrap gap-4">
                <div className="h-[280px] flex-[1_1_420px] animate-pulse rounded-panel bg-surface-3 motion-reduce:animate-none" />
                <div className="h-[280px] flex-[1_1_420px] animate-pulse rounded-panel bg-surface-3 motion-reduce:animate-none" />
            </div>
            <div className="h-[360px] animate-pulse rounded-panel bg-surface-3 motion-reduce:animate-none" />
        </>
    );
}
