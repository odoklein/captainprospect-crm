"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useSWRConfig } from "swr";
import { ArrowUpRight, CircleCheck, MessageSquare, Plus, RefreshCw, Sparkles, TriangleAlert, Workflow } from "lucide-react";
import { useAgentFindings, useAgentRuns } from "@/lib/agent/client/hooks";
import { ensureClientFolder } from "@/lib/assistant/client/folder-hooks";
import { ASSISTANT_API, type FolderDetail } from "@/lib/assistant/api-contract";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shadcn/button";
import { RunsTimeline } from "@/components/agent/RunsTimeline";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/shadcn/sheet";
import { useToast } from "@/components/ui/Toast";
import { managerWorkItems, workMatchesFilter, type WorkFilter } from "./manager-work";
import { OperationReview } from "./OperationReview";

const Onboarding = dynamic(() => import("@/components/manager/client-onboarding/ClientOnboardingWizard").then(m => m.ClientOnboardingModal));
const Delegate = dynamic(() => import("@/components/agent/DelegateComposer").then(m => m.DelegateComposer));
const Run = dynamic(() => import("@/components/agent/RunDetail").then(m => m.RunDetail));
const FILTERS: Array<[WorkFilter, string]> = [["all", "Tout"], ["decisions", "À décider"], ["blocked", "Bloqués"], ["active", "En cours"]];

export function DecisionDesk({ folderId, detail, onOpenFolder, onStartConversation, onDiscussConversation, selectedRunId, onSelectRun, operations = false }: {
    folderId: string | null; detail: FolderDetail | null;
    onOpenFolder(id: string): void;
    onStartConversation(opts: { folderId: string | null; clientId?: string | null; firstMessage?: string }): Promise<boolean>;
    onDiscussConversation(id: string): void;
    selectedRunId: string | null; onSelectRun(id: string | null): void; operations?: boolean;
}) {
    const [onboarding, setOnboarding] = useState(false);
    const [delegate, setDelegate] = useState(false);
    const [history, setHistory] = useState(false);
    const [detailsId, setDetailsId] = useState<string | null>(null);
    const [selection, setSelection] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [filter, setFilter] = useState<WorkFilter>("all");
    const toast = useToast();
    const { mutate } = useSWRConfig();
    const runs = useAgentRuns({ folderId }, { refreshInterval: 30000 });
    const pending = useAgentRuns({ folderId, status: "WAITING_APPROVAL" }, { refreshInterval: 30000 });
    const findings = useAgentFindings({ folderId, state: "OPEN" });
    const work = managerWorkItems([...pending.items, ...runs.items], findings.items, folderId);
    const filtered = work.filter(item => workMatchesFilter(item, filter));
    const selected = work.find(item => item.id === selection && (!selectedRunId || item.runId === selectedRunId))
        ?? (selectedRunId ? work.find(item => item.id === `run:${selectedRunId}`) : filtered[0]);
    const reviewRunId = selected?.finding ? null : (selectedRunId ?? selected?.runId ?? null);
    const unavailable = !!(runs.error || pending.error || findings.error || runs.degraded || pending.degraded || findings.degraded);
    const loading = runs.isLoading || pending.isLoading || findings.isLoading;
    const Queue = operations ? "details" : "section";
    const client = detail?.clientId ? { clientId: detail.clientId, folderId, name: detail.name } : null;
    const chooseRun = (id: string | null) => { setSelection(id ? `run:${id}` : null); onSelectRun(id); };
    const openCreated = async (clientId: string) => {
        try { const folder = await ensureClientFolder(clientId); setOnboarding(false); onOpenFolder(folder.id); }
        catch (e) { toast.error("Client créé, espace indisponible", e instanceof Error ? e.message : "Réessayez depuis la liste des clients."); }
    };
    const discussFinding = async () => {
        if (!selected?.finding || busy) return;
        setBusy(true);
        try { await onStartConversation({ folderId: selected.finding.folderId, clientId: selected.finding.clientId,
            firstMessage: `Examine ce signal : « ${selected.finding.title} ». Vérifie les données actuelles, explique ce qui bloque et prépare une action concrète. N'applique aucun changement avant que je choisisse la suite.` }); }
        finally { setBusy(false); }
    };
    return <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold tracking-tight text-ink">{operations ? "Travaux et opérations" : "À faire avancer"}</h2><p className="mt-1 text-xs text-ink-3">{folderId ? detail?.name : "Tous les clients"} · Plans, décisions et signaux disponibles</p></div>
            <div className="flex flex-wrap gap-2">
                {!folderId && <Button variant="outline" size="sm" onClick={() => setOnboarding(true)}><Plus aria-hidden />Lancer un client</Button>}
                <Button size="sm" className="bg-accent-600 text-accent-fg hover:bg-accent-700" onClick={() => setDelegate(true)}><Sparkles aria-hidden />Confier un travail</Button>
                <Button variant="ghost" size="sm" onClick={() => setHistory(true)}>Historique<ArrowUpRight aria-hidden /></Button>
            </div>
        </div>
        {unavailable && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-xs text-warning-ink"><span>Le suivi est partiellement indisponible. Les éléments affichés peuvent être incomplets.</span><Button variant="ghost" size="sm" onClick={() => { runs.reload(); pending.reload(); findings.reload(); }}><RefreshCw aria-hidden />Réessayer</Button></div>}
        <div className={cn("grid min-w-0 items-start gap-5", !operations && "@[900px]:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)]")}>
            <Queue aria-label="File des décisions" className={cn("min-w-0 space-y-3", operations && "rounded-xl border border-line bg-surface p-4")}>
                {operations && <summary className="cursor-pointer rounded-md text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">Choisir un travail<span className="ml-2 text-xs font-normal text-ink-3">{selected?.title || "Plans et propositions disponibles"}</span></summary>}
                <div className="flex flex-wrap gap-1 rounded-xl bg-surface-3/60 p-1" aria-label="Filtrer le travail">
                    {FILTERS.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setSelection(null); onSelectRun(null); }} className={cn("min-h-9 rounded-lg px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus", filter === value ? "bg-surface font-medium text-accent-600 shadow-2xs" : "text-ink-3 hover:text-ink")}>
                        {label}<span className="ml-1.5 tabular-nums text-ink-4">{work.filter(item => workMatchesFilter(item, value)).length}</span>
                    </button>)}
                </div>
                {loading && work.length === 0 && <p role="status" className="p-4 text-sm text-ink-3">Lecture des priorités…</p>}
                {!loading && filtered.length === 0 && <div className="rounded-xl border border-dashed border-line p-5 text-sm leading-relaxed text-ink-3"><CircleCheck className="mb-3 size-5 text-ink-4" aria-hidden />Aucun élément dans cette vue parmi les données chargées. Vous pouvez confier un travail à Captain.</div>}
                <ul className="space-y-2">
                    {filtered.map(item => <li key={item.id}><button type="button" aria-pressed={selected?.id === item.id} onClick={() => { if (item.finding) { setSelection(item.id); onSelectRun(null); } else chooseRun(item.runId); }} className={cn("relative flex min-h-28 w-full flex-col items-start gap-2 overflow-hidden rounded-xl border p-4 text-left transition-[background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus", selected?.id === item.id ? "border-accent-200 bg-accent-soft/50 before:absolute before:inset-y-4 before:left-0 before:w-0.5 before:bg-accent-600" : "border-line bg-surface hover:border-line-strong")}>
                        <span className="flex w-full flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium text-ink-2">{item.context}</span><span className={cn("rounded-md px-2 py-1 text-[10px] font-medium", item.priority <= 2 ? "bg-warning-soft text-warning-ink" : item.priority === 3 ? "bg-surface-3 text-ink-3" : "bg-accent-soft text-accent-600")}>{item.label}</span></span>
                        <span className="line-clamp-3 text-sm font-medium leading-relaxed text-ink">{item.title}</span>
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">{item.finding ? <TriangleAlert className="size-3" aria-hidden /> : <Workflow className="size-3" aria-hidden />}{item.finding ? "Signal à examiner" : "Plan et exécution"}</span>
                    </button></li>)}
                </ul>
                {(runs.hasMore || pending.hasMore || findings.hasMore) && <Button variant="outline" size="sm" onClick={() => { if (runs.hasMore) runs.loadMore(); if (pending.hasMore) pending.loadMore(); if (findings.hasMore) findings.loadMore(); }}>Charger davantage</Button>}
                <p className="text-[11px] leading-relaxed text-ink-4">Les compteurs portent sur les éléments chargés. L’historique reste accessible.</p>
            </Queue>
            <section className="min-w-0" aria-label="Examen du travail sélectionné">
                {reviewRunId ? <OperationReview key={reviewRunId} runId={reviewRunId} folderId={folderId} onDiscuss={onDiscussConversation} onDetails={setDetailsId} /> : selected?.finding ? <article className="overflow-hidden rounded-2xl border border-line bg-surface">
                    <header className="space-y-3 border-b border-line-subtle p-5"><span className="inline-flex items-center gap-2 text-xs font-medium text-warning-ink"><TriangleAlert className="size-4" aria-hidden />{selected.label}</span><h3 className="text-lg font-semibold tracking-tight text-ink">{selected.title}</h3><p className="text-xs text-ink-3">{selected.context}{selected.finding.subjectName ? ` · ${selected.finding.subjectName}` : ""}</p></header>
                    <div className="space-y-5 p-5"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">{selected.finding.body}</p><p className="text-xs text-ink-3">Dernier signal : {new Date(selected.finding.lastSeenAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p><div className="rounded-xl bg-surface-2 p-4 text-xs leading-relaxed text-ink-3">Captain peut relire les données et préparer une prochaine étape. L’ouverture de ce signal n’applique aucun changement.</div><Button onClick={() => void discussFinding()} disabled={busy}><MessageSquare aria-hidden />{busy ? "Ouverture…" : "Examiner avec Captain"}</Button>{selected.runId && <Button variant="ghost" size="sm" onClick={() => chooseRun(selected.runId)}>Voir l’exécution liée<ArrowUpRight aria-hidden /></Button>}</div>
                </article> : <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/70 p-8 text-center"><Workflow className="size-7 text-accent-600" aria-hidden /><h3 className="mt-4 text-base font-semibold text-ink">Le travail, prêt à examiner</h3><p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-3">Sélectionnez une priorité pour retrouver son contexte, ses étapes et les propositions à valider.</p></div>}
            </section>
        </div>
        {operations && <details className="rounded-xl border border-line bg-surface p-4"><summary className="cursor-pointer text-sm font-medium text-ink">Toutes les exécutions et l’historique</summary><div className="pt-4"><RunsTimeline folderId={folderId} onOpenRun={chooseRun} activeRunId={selectedRunId} /></div></details>}
        {onboarding && <Onboarding isOpen onClose={() => setOnboarding(false)} onSuccess={() => { void mutate(ASSISTANT_API.folders); }} onOpenClient={id => void openCreated(id)} />}
        {delegate && <Delegate open onClose={() => setDelegate(false)} client={client} onLaunched={chooseRun} />}
        <Sheet open={history} onOpenChange={setHistory}><SheetContent className="w-full overflow-y-auto sm:max-w-3xl"><SheetTitle>Exécutions et historique</SheetTitle><SheetDescription>Les travaux du périmètre sélectionné, avec leurs résultats et propositions.</SheetDescription>{history && <RunsTimeline folderId={folderId} onOpenRun={id => { setHistory(false); chooseRun(id); }} />}</SheetContent></Sheet>
        {detailsId && <Run runId={detailsId} onClose={() => setDetailsId(null)} />}
    </div>;
}
