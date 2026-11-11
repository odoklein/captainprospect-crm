"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useSWRConfig } from "swr";
import { ArrowUpRight, ChevronRight, Loader2, Plus, Sparkles } from "lucide-react";
import { useAgentFindings, useAgentRuns } from "@/lib/agent/client/hooks";
import { ensureClientFolder } from "@/lib/assistant/client/folder-hooks";
import { ASSISTANT_API, type FolderDetail } from "@/lib/assistant/api-contract";
import { Button } from "@/components/ui/shadcn/button";
import { RunsTimeline } from "@/components/agent/RunsTimeline";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/shadcn/tabs";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/shadcn/sheet";
import { useToast } from "@/components/ui/Toast";
import { managerWorkItems, type WorkItem } from "./manager-work";
import { useBrand } from "@/lib/brand/client";

// Operational surfaces are loaded only when requested, keeping the conversation light.
const Onboarding = dynamic(() => import("@/components/manager/client-onboarding/ClientOnboardingWizard").then(m => m.ClientOnboardingModal));
const Delegate = dynamic(() => import("@/components/agent/DelegateComposer").then(m => m.DelegateComposer));
const Run = dynamic(() => import("@/components/agent/RunDetail").then(m => m.RunDetail));
const Inbox = dynamic(() => import("@/components/agent/Inbox").then(m => m.Inbox));

export function ManagerWork({ folderId, detail, onOpenFolder, onStartConversation }: {
    folderId: string | null; detail: FolderDetail | null; onOpenFolder(id: string): void;
    onStartConversation(opts: { folderId: string | null; clientId?: string | null; firstMessage?: string }): Promise<boolean>;
}) {
    const brand = useBrand();
    const [onboarding, setOnboarding] = useState(false);
    const [delegate, setDelegate] = useState(false);
    const [inbox, setInbox] = useState(false);
    const [runId, setRunId] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const toast = useToast();
    const { mutate } = useSWRConfig();
    const runs = useAgentRuns({ folderId }, { refreshInterval: 30000 });
    const pending = useAgentRuns({ folderId, status: "WAITING_APPROVAL" }, { refreshInterval: 30000 });
    const findings = useAgentFindings({ folderId, state: "OPEN" });
    const work = managerWorkItems([...pending.items, ...runs.items], findings.items, folderId);
    const unavailable = !!(runs.error || pending.error || findings.error || runs.degraded || pending.degraded || findings.degraded);
    const loading = runs.isLoading || pending.isLoading || findings.isLoading;
    const client = detail?.clientId ? { clientId: detail.clientId, folderId, name: detail.name } : null;

    const openItem = async (item: WorkItem) => {
        if (item.runId) { setRunId(item.runId); return; }
        if (!item.finding || busy) return;
        setBusy(item.id);
        try {
            await onStartConversation({ folderId: item.finding.folderId, clientId: item.finding.clientId,
                firstMessage: `Examine ce signal : « ${item.finding.title} ». Vérifie les données actuelles, explique ce qui bloque et prépare une action concrète avec les personnes concernées. N'applique aucun changement avant que je choisisse la suite.` });
        } finally { setBusy(null); }
    };
    const openCreated = async (clientId: string) => {
        try {
            const folder = await ensureClientFolder(clientId);
            setOnboarding(false);
            onOpenFolder(folder.id);
        } catch (e) { toast.error("Client créé, espace indisponible", e instanceof Error ? e.message : "Réessayez depuis la liste des clients."); }
    };
    return <div className="space-y-8">
        <div className="flex flex-wrap justify-center gap-2" aria-label={`Actions de ${brand.assistantName}`}>
            {!folderId && <Button variant="outline" className="min-h-11 rounded-full text-sm" onClick={() => setOnboarding(true)}><Plus aria-hidden />Lancer un client</Button>}
            <Button variant="outline" className="min-h-11 rounded-full text-sm" onClick={() => setDelegate(true)}><Sparkles aria-hidden />Confier un travail</Button>
            <Button variant="ghost" className="min-h-11 rounded-full text-sm text-ink-3" onClick={() => setInbox(true)}>Examiner les priorités<ArrowUpRight aria-hidden /></Button>
        </div>
        <section aria-labelledby="captain-work-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-3"><h2 id="captain-work-heading" className="text-sm font-medium text-ink">À faire avancer</h2><span className="text-xs text-ink-3">{folderId ? detail?.name : "Tous les clients"}</span></div>
            {loading && work.length === 0 ? <p role="status" className="py-4 text-sm text-ink-3">Recherche des travaux et des priorités…</p> : null}
            {unavailable && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 p-3 text-sm text-ink-3"><span>Le suivi est partiellement indisponible. Les éléments affichés peuvent être incomplets.</span><Button variant="ghost" size="sm" onClick={() => { runs.reload(); pending.reload(); findings.reload(); }}>Réessayer</Button></div>}
            {!loading && !unavailable && work.length === 0 && <p className="py-4 text-sm leading-relaxed text-ink-3">Aucun travail à suivre dans les données chargées. Confiez une première opération à {brand.assistantName} ou préparez un lancement.</p>}
            <ul className="divide-y divide-line-subtle">
                {work.slice(0, 3).map(item => <li key={item.id}><button type="button" disabled={!!busy} onClick={() => void openItem(item)} className="group flex min-h-20 w-full items-center gap-3 rounded-xl px-3 py-4 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60">
                    <div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap gap-x-2 text-xs text-ink-3"><span className={item.priority < 2 ? "font-medium text-accent-600" : ""}>{item.label}</span><span>· {item.context}</span></div><p className="line-clamp-2 text-sm font-medium text-ink">{item.title}</p></div>
                    {busy === item.id ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />}
                </button></li>)}
            </ul>
            {(work.length > 3 || runs.hasMore || pending.hasMore || findings.hasMore) && <Button variant="ghost" size="sm" onClick={() => setInbox(true)}>Voir les autres priorités<ArrowUpRight aria-hidden /></Button>}
        </section>
        {onboarding && <Onboarding isOpen onClose={() => setOnboarding(false)} onSuccess={() => { void mutate(ASSISTANT_API.folders); }} onOpenClient={(id) => void openCreated(id)} />}
        {delegate && <Delegate open onClose={() => setDelegate(false)} client={client} onLaunched={setRunId} />}
        <Sheet open={inbox} onOpenChange={setInbox}><SheetContent className="w-full overflow-y-auto sm:max-w-3xl"><SheetTitle>Décisions et priorités</SheetTitle><SheetDescription>Examinez les faits et les changements proposés avant de choisir la suite.</SheetDescription>{inbox && <Tabs defaultValue="decisions"><TabsList aria-label="Suivi du travail"><TabsTrigger value="decisions">À décider</TabsTrigger><TabsTrigger value="activity">Travaux et historique</TabsTrigger></TabsList><TabsContent value="decisions"><Inbox folderId={folderId} onOpenRun={(id) => { setInbox(false); setRunId(id); }} compact /></TabsContent><TabsContent value="activity"><RunsTimeline folderId={folderId} onOpenRun={(id) => { setInbox(false); setRunId(id); }} /></TabsContent></Tabs>}</SheetContent></Sheet>
        {runId && <Run runId={runId} onClose={() => setRunId(null)} />}
    </div>;
}
