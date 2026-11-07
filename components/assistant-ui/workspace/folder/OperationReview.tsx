"use client";

import { ArrowUpRight, MessageSquare, RefreshCw, Workflow } from "lucide-react";
import { useAgentRun } from "@/lib/agent/client/hooks";
import { RunDetailBody } from "@/components/agent/RunDetail";
import { RunStatusBadge } from "@/components/agent/shared";
import { Button } from "@/components/ui/shadcn/button";

/** The same plan/proposals as the existing run drawer, now reviewable in place. */
export function OperationReview({ runId, folderId, onDiscuss, onDetails }: {
    runId: string; folderId: string | null;
    onDiscuss(id: string): void; onDetails(id: string): void;
}) {
    const { data, error, isLoading, mutate } = useAgentRun(runId);
    // Never flash a run from an older client-scoped request.
    const run = data?.id === runId && (!folderId || data.folderId === folderId) ? data : null;
    if (error || (!isLoading && data && !run)) return <div role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-5 text-sm text-danger-ink">Ce travail est indisponible dans ce périmètre.<Button variant="ghost" size="sm" onClick={() => void mutate()}>Réessayer</Button></div>;
    if (!run) return <div role="status" className="space-y-4 p-6"><div className="h-5 w-2/3 animate-pulse rounded bg-surface-3" /><p className="text-sm text-ink-3">Lecture du plan et de ses propositions…</p></div>;
    return <article className="overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Studio de l’opération">
        <header className="space-y-4 border-b border-line-subtle p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-xs font-medium text-accent-600"><Workflow className="size-4" aria-hidden />Studio de l’opération</span><RunStatusBadge status={run.status} /></div>
            <div><h3 className="text-lg font-semibold tracking-tight text-ink">{run.goal || run.jobName || "Travail confié à Captain"}</h3><p className="mt-2 text-xs text-ink-3">{run.clientName || "Vue agence"}{run.actorName ? ` · ${run.actorName}` : ""} · {new Date(run.createdAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</p></div>
            <div className="flex flex-wrap gap-2">
                {run.conversationId && <Button size="sm" variant="outline" onClick={() => onDiscuss(run.conversationId!)}><MessageSquare aria-hidden />Discuter avec Captain</Button>}
                <Button size="sm" variant="ghost" onClick={() => onDetails(run.id)}>Tous les détails<ArrowUpRight aria-hidden /></Button>
                <Button size="icon-sm" variant="ghost" aria-label="Actualiser l’opération" onClick={() => void mutate()}><RefreshCw aria-hidden /></Button>
            </div>
            {run.pendingProposals > 0 && <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning-ink">Les propositions ci-dessous attendent votre décision. Leur affichage ne les exécute pas.</p>}
        </header>
        <div className="p-5 sm:p-6"><RunDetailBody key={run.id} run={run} embedded /></div>
    </article>;
}
