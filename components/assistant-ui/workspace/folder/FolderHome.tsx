"use client";

import { useState, type ReactNode } from "react";
import { Building2, ChevronDown, Globe2, MessageSquare, Workflow } from "lucide-react";
import { useFolderDetail } from "@/lib/assistant/client/folder-hooks";
import { Button } from "@/components/ui/shadcn/button";
import { ConversationsTab } from "./ConversationsTab";
import { DecisionDesk } from "./DecisionDesk";
import { ClientMonthOverview } from "./ClientMonthOverview";
import type { WorkspaceView } from "../workspace-state";
import { ContextPanel } from "./ContextPanel";
import { EmptyState } from "./parts";
import { useBrand } from "@/lib/brand/client";

export function FolderHome(props: {
    folderId: string | null; tab: string; onTabChange(tab: string): void;
    onOpenConversation(id: string): void;
    onStartConversation(opts: { folderId: string | null; clientId?: string | null; missionId?: string | null; firstMessage?: string }): Promise<boolean>;
    onOpenFolder(id: string): void;
    onOpenSearch?(): void; leading?: ReactNode;
    view: WorkspaceView;
    selectedRunId: string | null;
    onSelectRun(id: string | null): void;
    onDiscussConversation(id: string): void;
    onOpenDiscussion(): void;
}) {
    const brand = useBrand();
    const { folderId, tab, onTabChange, onOpenConversation, onStartConversation, onOpenSearch, leading, onOpenFolder, view, selectedRunId, onSelectRun, onDiscussConversation, onOpenDiscussion } = props;
    const { data: detail, error, isLoading } = useFolderDetail(folderId);
    const [contextOpen, setContextOpen] = useState(false);
    const name = folderId ? (detail?.name ?? "Dossier") : brand.assistantName;
    const Icon = view === "operations" ? Workflow : folderId ? Building2 : Globe2;
    const linkedTab = tab !== "conversations";
    return <div className="flex h-full flex-col">
        <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line-subtle bg-surface px-3 py-2 sm:px-6">
            <div className="flex min-w-0 items-center gap-1">{leading}<Button variant="ghost" onClick={onOpenSearch} className="min-w-0 gap-2 font-medium text-ink-2"><Icon className="size-4 text-ink-3" aria-hidden /><span className="truncate">{name}</span><ChevronDown className="size-3.5 text-ink-4" aria-hidden /></Button></div>
            <div className="flex items-center gap-1"><Button data-captain-discussion-toggle size="sm" variant="outline" onClick={onOpenDiscussion}><MessageSquare aria-hidden /><span className="hidden sm:inline">Discuter avec</span> {brand.assistantName}</Button><ContextPanel key={`${folderId}:${linkedTab ? tab : "default"}`} folderId={folderId} folderName={name} onOpenConversation={onOpenConversation}
                initialTab={!folderId ? "memoire" : linkedTab ? tab : "overview"} open={contextOpen || linkedTab}
                onOpenChange={(open) => { setContextOpen(open); if (!open && linkedTab) onTabChange("conversations"); }} /></div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="@container mx-auto w-full max-w-[1600px] space-y-7 px-4 py-6 sm:px-6 sm:py-8">
                {error && folderId ? <EmptyState icon={Building2} title="Dossier indisponible" hint={error.message} /> : isLoading && folderId ? <p role="status" className="text-center text-sm text-ink-3">Chargement du contexte client…</p> : <>
                    <div>
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-accent-600">{view === "operations" ? "Opérations" : folderId ? "Espace client et dossier" : "Pilotage"}</p>
                        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{view === "operations" ? "De la discussion au travail suivi." : folderId ? name : "Les décisions du jour"}</h1>
                        <p className="mt-2 text-sm leading-relaxed text-ink-3">{view === "operations" ? "Retrouvez les plans, les propositions à valider et le résultat de chaque exécution." : folderId ? `Votre activité, vos missions et vos prochaines décisions, avec ${brand.assistantName} à vos côtés.` : "Les priorités de vos clients, prêtes à examiner avec Captain."}</p>
                    </div>
                    {folderId && detail?.kind === "CLIENT" && view !== "operations" && <ClientMonthOverview key={folderId} folderId={folderId} onAsk={(firstMessage, missionId) => { void onStartConversation({ folderId, clientId: detail.clientId, missionId, firstMessage }); }} />}
                    <DecisionDesk folderId={folderId} detail={detail ?? null} onOpenFolder={onOpenFolder} onStartConversation={onStartConversation} onDiscussConversation={onDiscussConversation} selectedRunId={selectedRunId} onSelectRun={onSelectRun} operations={view === "operations"} />
                    <details className="rounded-xl border border-line bg-surface p-4"><summary className="cursor-pointer rounded-lg text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">Conversations du dossier</summary><div className="pt-5"><ConversationsTab listOnly folderId={folderId} detail={detail ?? null} onOpenConversation={onOpenConversation} onStartConversation={onStartConversation} /></div></details>
                </>}
            </div>
        </div>
    </div>;
}
