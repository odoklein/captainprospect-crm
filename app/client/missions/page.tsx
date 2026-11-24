"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Check, Plus, Target } from "lucide-react";
import { Button } from "@/components/ui";
import type { MissionBrief } from "@/lib/onboarding/self-service-schema";
import "@/components/onboarding/self-service.css";

type ClientMission = Pick<MissionBrief, "name" | "objective" | "channels" | "targetMeetings"> & { id: string; startDate: string; endDate: string; status: string; isActive: boolean; brief: MissionBrief | null };
const STATUS: Record<string, string> = { DRAFT: "En préparation", ACTIVE: "En cours", PAUSED: "En pause", COMPLETED: "Terminée", ARCHIVED: "Archivée" };
const date = (value: string) => new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function ClientMissions() {
    const params = useSearchParams();
    const router = useRouter();
    const { data: session } = useSession();
    const queryKey = ["client", "mission-briefs", session?.user.id];
    // Read once: Next syncs useSearchParams with the replaceState below, which would drop the note at once.
    const [sent] = useState(() => params.get("sent"));
    // The tile that just received the brief card keeps its transition name only for that landing.
    const [landing, setLanding] = useState(sent);
    useEffect(() => {
        // Older links (signup redirect, e-mails) still open the brief.
        if (params.get("new") === "1") router.replace("/client/missions/new");
    }, [params, router]);
    useEffect(() => {
        if (!sent) return;
        const timer = window.setTimeout(() => setLanding(null), 900);
        const url = new URL(window.location.href);
        url.searchParams.delete("sent");
        window.history.replaceState(window.history.state, "", url.pathname + url.search);
        return () => window.clearTimeout(timer);
    }, [sent]);
    const query = useQuery({
        queryKey,
        enabled: Boolean(session?.user.id),
        queryFn: async ({ signal }): Promise<{ client: { name: string }; missions: ClientMission[] }> => {
            const response = await fetch("/api/client/missions", { signal, cache: "no-store" });
            const json = await response.json();
            if (!response.ok || !json.success) throw new Error(json.error || "Impossible de charger vos missions.");
            return json.data;
        }, retry: 1,
    });

    return <div className="ss-workspace">
        <header className="ss-workspace-head"><div><p className="ss-eyebrow">{query.data?.client.name ?? "Votre espace client"}</p><h1>Mes missions</h1><p>Donnez le cap. Votre agence prépare la suite avec vous.</p></div>
            <Button onClick={() => router.push("/client/missions/new")} leftIcon={<Plus size={16} />}>Créer une mission</Button>
        </header>
        {sent && <div role="status" className="ss-note"><Check size={18} aria-hidden /><p>Votre brief est envoyé. L’agence le consulte et prépare le lancement de votre mission avec vous.</p></div>}
        {query.isPending ? <div className="ss-empty" role="status">Chargement de vos missions…</div>
        : query.isError ? <div className="ss-empty"><p role="alert">{query.error.message}</p><Button variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button></div>
        : query.data.missions.length === 0 ? <section className="ss-empty"><Target size={32} aria-hidden /><h2>Tout commence par votre brief</h2><p>Présentez vos objectifs, votre cible et votre offre. Votre agence s’appuiera sur ces informations pour préparer votre première mission.</p><Button onClick={() => router.push("/client/missions/new")} leftIcon={<Plus size={16} />}>Créer ma première mission</Button></section>
        : <div className="ss-mission-grid">{query.data.missions.map((mission) => <article key={mission.id} className="ss-mission-card" data-mission-id={mission.id}
            data-landed={mission.id === sent || undefined} style={mission.id === landing ? { viewTransitionName: "ms-brief" } : undefined}>
            <div className="ss-mission-top"><Target size={20} aria-hidden /><span className="ss-status" data-active={mission.status === "ACTIVE"}>{STATUS[mission.status] ?? mission.status}</span></div>
            <h2>{mission.name}</h2><p className="ss-mission-objective">{mission.objective}</p>
            <dl><div><dt>Période souhaitée</dt><dd>{mission.startDate ? `${date(mission.startDate)} – ${date(mission.endDate)}` : "—"}</dd></div><div><dt>Canaux</dt><dd>{(mission.channels ?? []).map((channel) => ({ CALL: "Appel", EMAIL: "Email", LINKEDIN: "LinkedIn" })[channel]).join(" · ")}</dd></div></dl>
            <Link className="ss-card-link" href={`/client/missions/${encodeURIComponent(mission.id)}`}>{mission.status === "DRAFT" && !mission.isActive ? "Compléter mon brief" : "Consulter la mission"}<ArrowUpRight size={16} aria-hidden /></Link>
        </article>)}</div>}
    </div>;
}

export default function Page() {
    return <Suspense fallback={<p role="status">Chargement…</p>}><ClientMissions /></Suspense>;
}
