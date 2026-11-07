"use client";

/**
 * « Rapports »: master/detail. The REPORT runs in a scrollable list on the
 * left, the selected report on the right (stacked on mobile, with a back
 * button). The first report is open by default; reports waiting for
 * publication carry an « À publier » badge.
 */

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { ScrollArea } from "@/components/ui/shadcn/scroll-area";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { formatEur, relativeTime, runTitle } from "@/lib/agent/client/format";
import { useAgentRuns } from "@/lib/agent/client/hooks";
import { ReportReview } from "./ReportReview";
import { EmptyState, ErrorBlock, LiveDot, RUN_STATUS_TONE, stagger } from "./shared";

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
                <div className="space-y-1.5 rounded-card border border-line bg-surface p-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-[68px] rounded-panel" style={stagger(i)} />
                    ))}
                </div>
                <Skeleton className="hidden h-[480px] rounded-card lg:block" />
            </div>
        );
    }

    if (runs.items.length === 0) {
        return (
            <EmptyState
                icon={FileText}
                tone="accent"
                title="Aucun rapport pour l’instant"
                hint="Active le bilan hebdomadaire d’un client dans Réglages : l’agent le rédige et te le soumet avant publication."
            />
        );
    }

    return (
        <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <nav
                aria-label="Rapports"
                className={cn("overflow-hidden rounded-card border border-line bg-surface shadow-card lg:sticky lg:top-4", mobileReading && "hidden lg:block")}
            >
                <div className="flex items-center justify-between border-b border-line-subtle px-4 py-2.5">
                    <span className="text-2xs font-bold uppercase tracking-[0.08em] text-ink-3">Rapports</span>
                    <span className="text-2xs font-semibold tabular-nums text-ink-4">{runs.items.length}</span>
                </div>
                <ScrollArea className="lg:h-[min(640px,calc(100dvh-16rem))]">
                    <ul className="space-y-0.5 p-1.5">
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
                                            "relative w-full rounded-[12px] px-3 py-2.5 text-left transition-colors duration-150 ease-snappy",
                                            FOCUS_RING,
                                            active ? "bg-surface-3" : "hover:bg-surface-2",
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="flex min-w-0 items-center gap-2">
                                                <LiveDot tone={RUN_STATUS_TONE[run.status]} live={run.status === "RUNNING" || run.status === "QUEUED"} />
                                                <span className="truncate text-sm font-semibold text-ink">{run.clientName ?? "Vue agence"}</span>
                                            </span>
                                            <span className="shrink-0 text-2xs text-ink-4">{relativeTime(run.finishedAt ?? run.createdAt)}</span>
                                        </div>
                                        <p className="mt-0.5 truncate pl-3.5 text-xs text-ink-3">{runTitle(run)}</p>
                                        <div className="mt-1.5 flex items-center gap-1.5 pl-3.5">
                                            {run.pendingProposals > 0 && <Badge variant="warning">À publier</Badge>}
                                            <span className="ml-auto text-2xs tabular-nums text-ink-4">{formatEur(run.costEur)}</span>
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    {runs.hasMore && (
                        <div className="p-2 pt-0">
                            <Button type="button" variant="outline" size="sm" className="w-full" onClick={runs.loadMore} disabled={runs.isLoadingMore}>
                                {runs.isLoadingMore && <Loader2 className="motion-safe:animate-spin" aria-hidden />}
                                Plus de rapports
                            </Button>
                        </div>
                    )}
                </ScrollArea>
            </nav>
            {selected && (
                <ReportReview runId={selected} onOpenRun={onOpenRun} onBack={() => setMobileReading(false)} className={cn(!mobileReading && "hidden lg:block")} />
            )}
        </div>
    );
}
