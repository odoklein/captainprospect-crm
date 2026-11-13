"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Brain, ExternalLink, RefreshCw } from "lucide-react";
import type { ClientWorkspaceContext } from "@/lib/assistant/api-contract";
import { ASSISTANT_API } from "@/lib/assistant/api-contract";
import { apiGet } from "@/lib/assistant/client/fetcher";
import { useFolderDetail } from "@/lib/assistant/client/folder-hooks";
import { Button } from "@/components/ui/shadcn/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/shadcn/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { MemoryTab } from "./MemoryTab";
import { FilesTab } from "./FilesTab";
import { BoardTab } from "./BoardTab";
import { AgentTab } from "./AgentTab";
import { FolderHeader } from "./FolderHeader";
import { useBrand } from "@/lib/brand/client";

export function ContextPanel({ folderId, folderName, onOpenConversation, initialTab = "overview", open: controlledOpen, onOpenChange }: {
    folderId: string | null; folderName: string; onOpenConversation(id: string): void;
    initialTab?: string; open?: boolean; onOpenChange?(open: boolean): void;
}) {
    const brand = useBrand();
    const [localOpen, setLocalOpen] = useState(false);
    const [tab, setTab] = useState(initialTab);
    const open = controlledOpen ?? localOpen;
    const changeOpen = (next: boolean) => { setLocalOpen(next); onOpenChange?.(next); };
    const { data: detail } = useFolderDetail(open ? folderId : null);
    const navigate = (id: string) => { changeOpen(false); onOpenConversation(id); };
    return (
        <Sheet open={open} onOpenChange={changeOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-ink-3"><Brain aria-hidden />Mémoire<span className="hidden sm:inline"> et contexte</span></Button>
            </SheetTrigger>
            <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
                <div className="border-b border-line-subtle px-5 pb-4 pt-6 pr-12">
                    <SheetTitle className="text-lg">{folderName}</SheetTitle>
                    <SheetDescription className="mt-1">Le contexte de travail de {brand.assistantName}, accessible à tout moment.</SheetDescription>
                </div>
                <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
                    <div className="overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <TabsList variant="underline" className="min-w-max" aria-label="Contexte du dossier">
                            {folderId && <TabsTrigger value="overview">Vue d’ensemble</TabsTrigger>}
                            <TabsTrigger value="memoire">Mémoire</TabsTrigger>
                            {folderId && <>
                                <TabsTrigger value="fichiers">Fichiers</TabsTrigger>
                                <TabsTrigger value="tableau">Épingles</TabsTrigger>
                                <TabsTrigger value="agent">Agent</TabsTrigger>
                                <TabsTrigger value="settings">Réglages</TabsTrigger>
                            </>}
                        </TabsList>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6">
                        <TabsContent value="overview">{folderId && <LiveContext folderId={folderId} />}</TabsContent>
                        <TabsContent value="memoire"><MemoryTab folderId={folderId} folderName={folderId ? folderName : null} onOpenConversation={navigate} /></TabsContent>
                        {folderId && <>
                            <TabsContent value="fichiers"><FilesTab folderId={folderId} isClient={detail?.kind === "CLIENT"} /></TabsContent>
                            <TabsContent value="tableau"><BoardTab folderId={folderId} onOpenConversation={navigate} /></TabsContent>
                            <TabsContent value="agent"><AgentTab folderId={folderId} clientId={detail?.clientId ?? null} /></TabsContent>
                            <TabsContent value="settings">{detail && <FolderHeader detail={detail} onTabChange={(next) => next === "conversations" ? changeOpen(false) : setTab(next)} />}</TabsContent>
                        </>}
                    </div>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}

function LiveContext({ folderId }: { folderId: string }) {
    const { data, error, isLoading, isValidating, mutate } = useSWR<ClientWorkspaceContext>(`${ASSISTANT_API.folder(folderId)}/context`, apiGet, { shouldRetryOnError: false });
    if (isLoading) return <p role="status" className="text-sm text-ink-3">Lecture de la fiche client et de l’activité…</p>;
    if (error) return <div role="alert" className="space-y-3 text-sm text-ink-3"><p>Le contexte CRM est indisponible. La mémoire et les fichiers restent accessibles.</p><Button variant="outline" size="sm" onClick={() => void mutate()}>Réessayer</Button></div>;
    if (!data) return null;
    return <div className="space-y-7 text-sm">
        <div className="flex items-center justify-between gap-3 text-xs text-ink-3">
            <span>Données CRM · {new Date(data.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}</span>
            <Button variant="ghost" size="sm" onClick={() => void mutate()} disabled={isValidating} aria-label="Actualiser le contexte"><RefreshCw className={isValidating ? "animate-spin" : ""} aria-hidden /></Button>
        </div>
        {data.client ? <section className="space-y-2">
            <h3 className="font-semibold text-ink">Profil client</h3>
            <p className="text-ink-2">{data.client.name} · {data.client.industry || "Secteur non renseigné"}</p>
            {data.client.email && <p className="break-all text-ink-3">{data.client.email}</p>}
            <Link href={`/manager/clients?client=${data.client.id}`} className="inline-flex items-center gap-1.5 text-accent-600 hover:underline">Ouvrir la fiche client<ExternalLink className="size-3.5" aria-hidden /></Link>
        </section> : <p className="text-ink-3">Ce dossier n’est pas lié à un client. Ses instructions, sa mémoire et ses fichiers constituent son contexte.</p>}
        {data.client && <section className="space-y-3 border-t border-line-subtle pt-5">
            <h3 className="font-semibold text-ink">Missions et objectifs</h3>
            {data.missions.length ? data.missions.map(m => <div key={m.id} className="space-y-1"><p className="font-medium text-ink-2">{m.name}</p><p className="whitespace-pre-wrap text-ink-3">{m.objective || "Objectif à renseigner"}</p></div>) : <p className="text-ink-3">Aucune mission active.</p>}
            <p className="text-xs text-ink-4">Source : objectifs définis dans les fiches mission.</p>
        </section>}
        {data.activity && <section className="space-y-4 border-t border-line-subtle pt-5">
            <div><h3 className="font-semibold text-ink">Activité du mois</h3><p className="mt-1 text-xs text-ink-3">{data.activity.month} · périmètre client, toutes missions</p></div>
            <dl className="grid grid-cols-2 gap-6">
                <div><dt className="text-xs text-ink-3">Appels enregistrés</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.activity.calls.toLocaleString("fr-FR")}</dd></div>
                <div><dt className="text-xs text-ink-3">RDV pris</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-ink">{data.activity.meetingsBooked.toLocaleString("fr-FR")}</dd></div>
                <div><dt className="text-xs text-ink-3">Jours avec appels</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-ink">{data.activity.workedDays}</dd></div>
                <div><dt className="text-xs text-ink-3">Jours prévus{data.activity.estimatedPlan ? " (estimation)" : ""}</dt><dd className="mt-1 text-xl font-semibold text-ink">{data.activity.plannedDays ?? "Non renseigné"}</dd></div>
            </dl>
            <p className="text-xs leading-relaxed text-ink-3">Source : actions CRM et planning. Un jour avec appels est compté par mission et par SDR. Les RDV pris ne représentent pas les RDV réalisés.{data.activity.estimatedPlan ? " Planning estimé sur quatre semaines." : ""}</p>
            <Link href={`/manager/clients?client=${data.client?.id}&espace=activite`} className="inline-flex items-center gap-1.5 text-accent-600 hover:underline">Consulter l’activité client<ExternalLink className="size-3.5" aria-hidden /></Link>
        </section>}
    </div>;
}
