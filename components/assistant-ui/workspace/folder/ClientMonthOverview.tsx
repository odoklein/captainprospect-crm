"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowUpRight, CalendarDays, MessageSquare, Phone, RefreshCw, Target, type LucideIcon } from "lucide-react";
import { ASSISTANT_API, type ClientWorkspaceContext } from "@/lib/assistant/api-contract";
import { apiGet } from "@/lib/assistant/client/fetcher";
import { getMissionStatusLabel, type MissionStatusValue } from "@/lib/constants/missionStatus";
import { Button } from "@/components/ui/shadcn/button";

export function ClientMonthOverview({ folderId, onAsk }: { folderId: string; onAsk(question: string, missionId?: string): void }) {
    const { data, error, isLoading, isValidating, mutate } = useSWR<ClientWorkspaceContext>(`${ASSISTANT_API.folder(folderId)}/context`, apiGet, { shouldRetryOnError: false, keepPreviousData: false });
    if (error) return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 text-sm text-ink-3">Le contexte client n’est pas disponible.<Button variant="outline" size="sm" onClick={() => void mutate()}>Réessayer</Button></div>;
    if (isLoading) return <p role="status" className="text-sm text-ink-3">Lecture de l’activité client…</p>;
    if (!data?.client) return null;
    const activity = data.activity;
    const metrics: Array<{ label: string; value: string; icon: LucideIcon }> = activity ? [
        { label: "Appels enregistrés", value: activity.calls.toLocaleString("fr-FR"), icon: Phone },
        { label: "RDV pris", value: activity.meetingsBooked.toLocaleString("fr-FR"), icon: Target },
        { label: "Jours avec appels", value: String(activity.workedDays), icon: CalendarDays },
        { label: activity.estimatedPlan ? "Jours prévus (estimation)" : "Jours prévus", value: activity.plannedDays === null ? "—" : String(activity.plannedDays), icon: CalendarDays },
    ] : [];
    return <div className="space-y-5">
        <section className="overflow-hidden rounded-2xl border border-line bg-surface" aria-labelledby="client-month-title">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle px-5 py-4">
                <div><h2 id="client-month-title" className="text-sm font-semibold text-ink">Activité du mois</h2><p className="mt-1 text-xs text-ink-3">{activity?.month || "Période non renseignée"} · Toutes les missions du client</p></div>
                <Button variant="ghost" size="icon-sm" aria-label="Actualiser l’activité client" onClick={() => void mutate()} disabled={isValidating}><RefreshCw className={isValidating ? "motion-safe:animate-spin" : ""} aria-hidden /></Button>
            </header>
            {activity ? <dl className="grid grid-cols-2 divide-x divide-line-subtle sm:grid-cols-4">
                {metrics.map(({ label, value, icon: Mark }) => <div key={label} className="min-w-0 px-4 py-5 sm:px-5"><dt className="flex items-center gap-2 text-xs text-ink-3"><Mark className="size-3.5 shrink-0" aria-hidden /><span>{label}</span></dt><dd className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</dd></div>)}
            </dl> : <p className="p-5 text-sm text-ink-3">Aucune activité disponible pour cette période.</p>}
            <p className="border-t border-line-subtle px-5 py-3 text-[11px] leading-relaxed text-ink-3">Sources : actions CRM et planning. Les RDV pris ne sont pas les RDV réalisés. Un jour avec appels est compté par mission et SDR.{activity?.estimatedPlan ? " Le planning est estimé sur quatre semaines." : ""}</p>
        </section>
        <section aria-label="Missions du client" className="grid gap-3 xl:grid-cols-2">
            {data.missions.map(mission => <div key={mission.id} className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold text-ink">{mission.name}</h3><span className="rounded-md bg-surface-2 px-2 py-1 text-[10px] text-ink-3">{getMissionStatusLabel(mission.status as MissionStatusValue)}</span></div>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-ink-3">{mission.objective || "Objectif à renseigner dans la mission."}</p>
                <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onAsk(`Fais le point sur la mission « ${mission.name} ». Vérifie les données actuelles, les blocages et les prochaines décisions.`, mission.id)}><MessageSquare aria-hidden />Faire le point</Button><Button asChild variant="ghost" size="sm"><Link href={`/manager/missions/${mission.id}`}>Ouvrir<ArrowUpRight aria-hidden /></Link></Button></div>
            </div>)}
        </section>
    </div>;
}
