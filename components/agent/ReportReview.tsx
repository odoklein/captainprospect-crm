"use client";

/**
 * A report the agent wrote: the markdown body with its visuals (same
 * renderer as a chat answer, so `[[visuel N]]` markers land in place), its
 * status, the publish proposal to approve or refuse inline, and the PDF export.
 */

import { useState } from "react";
import { ArrowLeft, Download, FileText, Loader2, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnswerBody } from "@/components/assistant-ui/AnswerBody";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/shadcn/button";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { downloadRunReportPdf } from "@/lib/assistant/client/export";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { formatEur, isLiveStatus } from "@/lib/agent/client/format";
import { useAgentRun } from "@/lib/agent/client/hooks";
import { ProposalBatch } from "./ProposalBatch";
import { EmptyState, ErrorBlock, RunStatusBadge, stagger } from "./shared";

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
    const toast = useToast();
    const [exporting, setExporting] = useState(false);

    const onExport = async () => {
        setExporting(true);
        try {
            const fileName = await downloadRunReportPdf(runId);
            toast.success("PDF téléchargé", fileName);
        } catch (e) {
            toast.error("Export PDF impossible", e instanceof Error ? e.message : undefined);
        } finally {
            setExporting(false);
        }
    };

    return (
        <article className={cn("min-w-0 rounded-card border border-line bg-surface shadow-card", className)} aria-label="Rapport">
            {onBack && (
                <div className="border-b border-line-subtle px-3 py-2 lg:hidden">
                    <Button type="button" variant="ghost" size="xs" onClick={onBack}>
                        <ArrowLeft aria-hidden />
                        Tous les rapports
                    </Button>
                </div>
            )}
            {error && !run ? (
                <div className="p-5">
                    <ErrorBlock message={error instanceof Error ? error.message : "Rapport introuvable."} onRetry={() => void mutate()} />
                </div>
            ) : isLoading || !run ? (
                <div className="space-y-3 p-6" aria-busy="true" aria-label="Chargement du rapport">
                    <Skeleton className="h-7 w-2/3 rounded-lg" />
                    <Skeleton className="h-4 w-1/3 rounded-md" />
                    <div className="h-3" />
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className={cn("h-3.5 rounded-md", i % 3 === 2 ? "w-3/5" : "w-full")} style={stagger(i)} />
                    ))}
                </div>
            ) : (
                <div key={run.id} className="motion-safe:animate-ds-enter">
                    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle px-5 py-4 sm:px-6">
                        <div className="min-w-0">
                            <div className="mb-1.5 flex items-center gap-2">
                                <RunStatusBadge status={run.status} />
                            </div>
                            <h2 className="text-lg font-semibold tracking-tight text-ink">{run.report?.title ?? run.jobName ?? "Rapport"}</h2>
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                                <span className="font-medium text-ink-2">{run.clientName ?? "Vue agence"}</span>
                                <span aria-hidden>·</span>
                                <span>{new Date(run.finishedAt ?? run.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</span>
                                <span aria-hidden>·</span>
                                <span className="tabular-nums">{formatEur(run.costEur)}</span>
                            </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Button type="button" variant="outline" size="sm" onClick={() => void onExport()} disabled={exporting || !run.report}>
                                {exporting ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <Download aria-hidden />}
                                Exporter en PDF
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenRun(run.id)}>
                                <PanelRightOpen aria-hidden />
                                Exécution
                            </Button>
                        </div>
                    </header>

                    <div className="space-y-5 px-5 py-5 sm:px-6">
                        {run.proposals.length > 0 && <ProposalBatch proposals={run.proposals} showContext={false} />}

                        {run.report ? (
                            <ReportBody body={run.report.body} visuals={run.report.visuals} />
                        ) : (
                            <EmptyState
                                icon={FileText}
                                title={isLiveStatus(run.status) ? "Rapport en cours de rédaction" : "Pas de rapport produit"}
                                hint={
                                    isLiveStatus(run.status)
                                        ? "Il s’affichera ici dès que l’agent l’aura terminé."
                                        : run.error ?? "Cette exécution s’est terminée sans document. Ouvre l’exécution pour voir pourquoi."
                                }
                            />
                        )}
                    </div>
                </div>
            )}
        </article>
    );
}
