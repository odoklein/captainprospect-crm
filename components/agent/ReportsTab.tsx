"use client";

/**
 * « Rapports »: the REPORT runs on the left, the selected report on the
 * right (stacked on mobile, with a back button). The first report is open
 * by default; reports waiting for publication carry an « À publier » pill.
 */

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD, EmptyBlock, FOCUS, Shimmer, relativeTime } from "@/components/accueil/AccueilUI";
import { formatEur } from "@/lib/agent/client/format";
import { useAgentRuns } from "@/lib/agent/client/hooks";
import { ReportReview } from "./ReportReview";
import { runTitle } from "./RunDetail";
import { ErrorBlock, MINI_BUTTON, Pill, RunStatusPill, stagger } from "./shared";

export function ReportsTab({ folderId, onOpenRun }: { folderId?: string | null; onOpenRun: (id: string) => void }) {
    const runs = useAgentRuns({ kind: "REPORT", folderId: folderId ?? null });
    const [picked, setPicked] = useState<string | null>(null);
    const [mobileReading, setMobileReading] = useState(false);
    const selected = picked && runs.items.some((r) => r.id === picked) ? picked : runs.items[0]?.id ?? null;

    if (runs.error && runs.items.length === 0) {
        return <ErrorBlock message={runs.error.message} onRetry={runs.reload} />;
    }

    if (runs.isLoading && runs.items.length === 0) {
        return (
            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Shimmer key={i} className="h-16 rounded-panel" style={stagger(i)} />
                    ))}
                </div>
                <Shimmer className="h-96 rounded-3xl" />
            </div>
        );
    }

    if (runs.items.length === 0) {
        return (
            <EmptyBlock
                icon={FileText}
                tone="violet"
                title="Aucun rapport pour l’instant"
                hint="Active le bilan hebdomadaire d’un client dans Réglages : l’agent le rédige et te le soumet avant publication."
            />
        );
    }

    return (
        <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <nav aria-label="Rapports" className={cn(CARD, "p-2", mobileReading && "hidden lg:block")}>
                <ul className="space-y-1">
                    {runs.items.map((run, i) => {
                        const active = run.id === selected;
                        return (
                            <li key={run.id} className="motion-safe:animate-ds-enter" style={stagger(i)}>
                                <button
                                    type="button"
                                    aria-current={active ? "true" : undefined}
                                    onClick={() => {
                                        setPicked(run.id);
                                        setMobileReading(true);
                                    }}
                                    className={cn(
                                        "w-full rounded-panel px-3 py-2.5 text-left transition-colors duration-150 ease-snappy",
                                        FOCUS,
                                        active ? "bg-surface-3" : "hover:bg-surface-2",
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-sm font-semibold text-ink">{run.clientName ?? "Vue agence"}</span>
                                        <span className="shrink-0 text-[11px] text-ink-4">{relativeTime(run.finishedAt ?? run.createdAt)}</span>
                                    </div>
                                    <p className="mt-0.5 truncate text-xs text-ink-3">{runTitle(run)}</p>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                        <RunStatusPill status={run.status} />
                                        {run.pendingProposals > 0 && <Pill tone="warning">À publier</Pill>}
                                        <span className="ml-auto text-[11px] tabular-nums text-ink-4">{formatEur(run.costEur)}</span>
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
                {runs.hasMore && (
                    <div className="p-2">
                        <button type="button" className={cn(MINI_BUTTON, "w-full")} onClick={runs.loadMore} disabled={runs.isLoadingMore}>
                            {runs.isLoadingMore && <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />}
                            Plus de rapports
                        </button>
                    </div>
                )}
            </nav>
            {selected && (
                <ReportReview
                    runId={selected}
                    onOpenRun={onOpenRun}
                    onBack={() => setMobileReading(false)}
                    className={cn(!mobileReading && "hidden lg:block")}
                />
            )}
        </div>
    );
}
