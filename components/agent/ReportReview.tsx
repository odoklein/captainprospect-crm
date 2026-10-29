"use client";

/**
 * A report the agent wrote: the markdown body with its visuals (same
 * renderer as a chat answer, so `[[visuel N]]` markers land in place), its
 * status, and the publish proposal to approve or refuse inline.
 */

import { ArrowLeft, FileText, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnswerBody } from "@/components/assistant-ui/AnswerBody";
import { CARD, EmptyBlock, Shimmer } from "@/components/accueil/AccueilUI";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { formatEur, isLiveStatus } from "@/lib/agent/client/format";
import { useAgentRun } from "@/lib/agent/client/hooks";
import { ProposalBatch } from "./ProposalBatch";
import { ErrorBlock, MINI_BUTTON, MINI_GHOST, RunStatusPill, stagger } from "./shared";

function asVisuals(visuals: unknown[] | null | undefined): StoredVisual[] {
    return (visuals ?? []).filter(
        (v): v is StoredVisual => !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" && "spec" in (v as object),
    );
}

export function ReportBody({ body, visuals }: { body: string; visuals: unknown[] | null | undefined }) {
    return (
        <div className="max-w-none text-sm leading-relaxed text-ink-2">
            <AnswerBody content={body} visuals={asVisuals(visuals)} />
        </div>
    );
}

export function ReportReview({
    runId,
    onBack,
    onOpenRun,
    className,
}: {
    runId: string;
    /** Mobile: back to the list. */
    onBack?: () => void;
    onOpenRun: (id: string) => void;
    className?: string;
}) {
    const { data: run, error, isLoading, mutate } = useAgentRun(runId);

    return (
        <article className={cn(CARD, "min-w-0 p-5 sm:p-6", className)} aria-label="Rapport">
            {onBack && (
                <button type="button" onClick={onBack} className={cn(MINI_GHOST, "-ml-2 mb-3 lg:hidden")}>
                    <ArrowLeft className="size-3.5" aria-hidden />
                    Tous les rapports
                </button>
            )}
            {error && !run ? (
                <ErrorBlock message={error instanceof Error ? error.message : "Rapport introuvable."} onRetry={() => void mutate()} />
            ) : isLoading || !run ? (
                <div className="space-y-3" aria-busy="true">
                    <Shimmer className="h-7 w-2/3 rounded-xl" />
                    <Shimmer className="h-4 w-1/3 rounded-lg" />
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Shimmer key={i} className="h-4 rounded-lg" style={stagger(i)} />
                    ))}
                </div>
            ) : (
                <div className="space-y-5 motion-safe:animate-ds-enter" key={run.id}>
                    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle pb-4">
                        <div className="min-w-0">
                            <h2 className="text-lg font-extrabold tracking-tight text-ink">{run.report?.title ?? run.jobName ?? "Rapport"}</h2>
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                                <span>{run.clientName ?? "Vue agence"}</span>
                                <span aria-hidden>·</span>
                                <span>{new Date(run.finishedAt ?? run.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</span>
                                <span aria-hidden>·</span>
                                <span>{formatEur(run.costEur)}</span>
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <RunStatusPill status={run.status} />
                            <button type="button" className={MINI_BUTTON} onClick={() => onOpenRun(run.id)}>
                                <PanelRightOpen className="size-3.5" aria-hidden />
                                Exécution
                            </button>
                        </div>
                    </header>

                    {run.proposals.length > 0 && <ProposalBatch proposals={run.proposals} showContext={false} />}

                    {run.report ? (
                        <ReportBody body={run.report.body} visuals={run.report.visuals} />
                    ) : (
                        <EmptyBlock
                            icon={FileText}
                            tone="slate"
                            title={isLiveStatus(run.status) ? "Rapport en cours de rédaction" : "Pas de rapport produit"}
                            hint={
                                isLiveStatus(run.status)
                                    ? "Il s’affichera ici dès que l’agent l’aura terminé."
                                    : run.error ?? "Cette exécution s’est terminée sans document. Ouvre l’exécution pour voir pourquoi."
                            }
                        />
                    )}
                </div>
            )}
        </article>
    );
}
