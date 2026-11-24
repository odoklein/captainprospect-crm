"use client";

import { use } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { MissionStudio, type StudioMission } from "@/components/onboarding/mission-studio/MissionStudio";
import "@/components/onboarding/self-service.css";

/** A draft keeps the brief page; a mission the agency has taken over is read-only. */
export default function MissionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { data: session } = useSession();
    const query = useQuery({
        queryKey: ["client", "mission-brief", session?.user.id, id],
        enabled: Boolean(session?.user.id),
        queryFn: async ({ signal }): Promise<StudioMission> => {
            const response = await fetch(`/api/client/missions/${encodeURIComponent(id)}`, { signal, cache: "no-store" });
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error || "Impossible de charger cette mission.");
            return json.data;
        },
        retry: 1, refetchOnWindowFocus: false,
    });
    if (query.isPending) return <div className="ss-workspace"><div className="ss-loading" role="status"><p><span className="ss-pulse" aria-hidden />Chargement de votre brief…</p><span /><span /><span /></div></div>;
    if (query.isError) return <div className="ss-workspace"><div className="ss-empty"><p role="alert">{query.error.message}</p><Link className="ss-text-link" href="/client/missions"><ArrowLeft size={15} aria-hidden />Mes missions</Link></div></div>;
    const mission = query.data;
    if (mission.status === "DRAFT" && !mission.isActive) return <MissionStudio mission={mission} />;
    const brief = mission.brief;
    return <div className="ss-workspace">
        <header className="ss-workspace-head"><div><Link className="ss-text-link" href="/client/missions"><ArrowLeft size={15} aria-hidden />Mes missions</Link><h1>{mission.name}</h1><p>Pour modifier une mission prise en charge, contactez votre agence depuis la messagerie.</p></div></header>
        <div className="ss-readonly"><section><h3>Objectif</h3><p>{mission.objective}</p></section>
            {brief && ([["Cible", brief.targetAudience], ["Géographie", brief.geography], ["Offre", brief.offer], ["Différenciation", brief.differentiators], ["Exclusions", brief.exclusions]] as const)
                .map(([label, value]) => value && <section key={label}><h3>{label}</h3><p>{value}</p></section>)}
        </div>
    </div>;
}
