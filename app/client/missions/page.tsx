"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Plus, Target } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { MissionBriefForm } from "@/components/onboarding/MissionBriefForm";
import type { MissionBrief } from "@/lib/onboarding/self-service-schema";
import "@/components/onboarding/self-service.css";

type ClientMission = Pick<MissionBrief, "name" | "objective" | "channels" | "targetMeetings"> & { id: string; startDate: string; endDate: string; status: string; isActive: boolean; brief: MissionBrief | null };
const STATUS: Record<string, string> = { DRAFT: "En préparation", ACTIVE: "En cours", PAUSED: "En pause", COMPLETED: "Terminée", ARCHIVED: "Archivée" };
const date = (value: string) => new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function ClientMissions() {
    const params = useSearchParams();
    const { data: session } = useSession();
    const queryClient = useQueryClient();
    const queryKey = ["client", "mission-briefs", session?.user.id];
    const [creating, setCreating] = useState(() => params.get("new") === "1");
    const [selected, setSelected] = useState<ClientMission | null>(null);
    const [saved, setSaved] = useState(false);
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
    function closeBrief() {
        setCreating(false); setSelected(null);
        if (params.get("new") === "1") {
            const url = new URL(window.location.href);
            url.searchParams.delete("new");
            window.history.replaceState(window.history.state, "", url.pathname + url.search);
        }
    }
    const editable = !selected || (selected.status === "DRAFT" && !selected.isActive);

    return <div className="ss-workspace">
        <header className="ss-workspace-head"><div><p className="ss-eyebrow">{query.data?.client.name ?? "Votre espace client"}</p><h1>Mes missions</h1><p>Donnez le cap. Votre agence prépare la suite avec vous.</p></div>
            <Button onClick={() => { setSelected(null); setCreating(true); setSaved(false); }} leftIcon={<Plus size={16} />}>Créer une mission</Button>
        </header>
        {saved && <div role="status" className="ss-note"><CheckNote /><p>Votre brief est enregistré. L’agence peut le consulter et préparer le lancement de votre mission.</p></div>}
        {query.isPending ? <div className="ss-empty" role="status">Chargement de vos missions…</div>
        : query.isError ? <div className="ss-empty"><p role="alert">{query.error.message}</p><Button variant="secondary" onClick={() => void query.refetch()}>Réessayer</Button></div>
        : query.data.missions.length === 0 ? <section className="ss-empty"><Target size={32} aria-hidden /><h2>Tout commence par votre brief</h2><p>Présentez vos objectifs, votre cible et votre offre. Votre agence s’appuiera sur ces informations pour préparer votre première mission.</p><Button onClick={() => setCreating(true)} leftIcon={<Plus size={16} />}>Créer ma première mission</Button></section>
        : <div className="ss-mission-grid">{query.data.missions.map((mission) => <article key={mission.id} className="ss-mission-card">
            <div className="ss-mission-top"><Target size={20} aria-hidden /><span className="ss-status" data-active={mission.status === "ACTIVE"}>{STATUS[mission.status] ?? mission.status}</span></div>
            <h2>{mission.name}</h2><p className="ss-mission-objective">{mission.objective}</p>
            <dl><div><dt>Période souhaitée</dt><dd>{date(mission.startDate)} – {date(mission.endDate)}</dd></div><div><dt>Canaux</dt><dd>{mission.channels.map((channel) => ({ CALL: "Appel", EMAIL: "Email", LINKEDIN: "LinkedIn" })[channel]).join(" · ")}</dd></div></dl>
            <Button variant="ghost" onClick={() => { setSelected(mission); setCreating(false); }} rightIcon={<ArrowUpRight size={16} />}>{mission.status === "DRAFT" && !mission.isActive ? "Compléter mon brief" : "Consulter la mission"}</Button>
        </article>)}</div>}
        <Modal isOpen={creating || Boolean(selected)} onClose={closeBrief} title={selected ? selected.name : "Votre nouvelle mission"} description={editable ? "Un brief en trois étapes pour préparer votre prospection." : "Le brief partagé avec votre agence."} size="xl" closeOnOverlay={false}>
            {(creating || selected) && (editable ? <MissionBriefForm key={selected?.id ?? "new"} missionId={selected?.id}
                initial={selected ? { ...(selected.brief ?? {}), name: selected.name, objective: selected.objective, channels: selected.channels, targetMeetings: selected.targetMeetings, startDate: selected.startDate.slice(0, 10), endDate: selected.endDate.slice(0, 10) } : undefined}
                onSaved={() => { closeBrief(); setSaved(true); void queryClient.invalidateQueries({ queryKey }); }} />
                : <div className="ss-readonly"><p>Pour modifier une mission prise en charge, contactez votre agence depuis la messagerie.</p><h3>Objectif</h3><p>{selected?.objective}</p>
                    {selected?.brief && ([ ["Cible", selected.brief.targetAudience], ["Géographie", selected.brief.geography], ["Offre", selected.brief.offer], ["Différenciation", selected.brief.differentiators], ["Exclusions", selected.brief.exclusions] ].map(([label, value]) => value && <section key={label}><h3>{label}</h3><p>{value}</p></section>))}
                </div>)}
        </Modal>
    </div>;
}

function CheckNote() { return <Target size={18} aria-hidden />; }

export default function Page() {
    return <Suspense fallback={<p role="status">Chargement…</p>}><ClientMissions /></Suspense>;
}
