"use client";

/**
 * « Activité »: every run, newest first, bucketed by day like a deployments
 * list. Filter by kind and status; live runs carry a pulsing dot and a
 * ticking duration. A row opens RunDetail.
 */

import { useState } from "react";
import { ChevronRight, History, Lightbulb, ListChecks, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING, TONE_SOFT } from "@/components/ui/recipes";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import type { AgentJobKind, AgentRunCard, AgentRunStatus } from "@/lib/assistant/api-contract";
import { formatClock, formatDuration, formatEur, groupByDay, isLiveStatus, KIND_LABEL, RUN_STATUS_LABEL, runDurationMs, runTitle } from "@/lib/agent/client/format";
import { useAgentRuns } from "@/lib/agent/client/hooks";
import { EmptyState, ErrorBlock, KIND_ICON, LiveDot, RUN_STATUS_TONE, RunStatusBadge, stagger, TriggerTag, useNow } from "./shared";

const KINDS: AgentJobKind[] = ["WATCH", "REPORT", "MISSION", "DIGEST"];
const STATUSES: AgentRunStatus[] = ["RUNNING", "QUEUED", "WAITING_APPROVAL", "DONE", "FAILED", "CANCELLED", "DEFERRED"];

export function RunsTimeline({
    folderId,
    onOpenRun,
    activeRunId,
    compact,
    limit,
}: {
    folderId?: string | null;
    onOpenRun: (id: string) => void;
    /** The run open in the detail panel, marked in the list. */
    activeRunId?: string | null;
    /** Folder panel: no filters, fewer rows. */
    compact?: boolean;
    limit?: number;
}) {
    const [kind, setKind] = useState<AgentJobKind | "ALL">("ALL");
    const [status, setStatus] = useState<AgentRunStatus | "ALL">("ALL");
    const runs = useAgentRuns(
        { kind: kind === "ALL" ? null : kind, status: status === "ALL" ? null : status, folderId: folderId ?? null },
        { refreshInterval: 15_000 },
    );
    const anyLive = runs.items.some((r) => isLiveStatus(r.status));
    const now = useNow(1000, anyLive);
    const items = limit ? runs.items.slice(0, limit) : runs.items;
    const days = groupByDay(items, (r) => r.createdAt, now);
    const filtered = kind !== "ALL" || status !== "ALL";
    const liveCount = runs.items.filter((r) => isLiveStatus(r.status)).length;

    return (
        <div className="space-y-4">
            {!compact && (
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={kind} onValueChange={(v) => setKind(v as AgentJobKind | "ALL")}>
                        <SelectTrigger size="sm" className="w-40" aria-label="Filtrer par type">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Tous les types</SelectItem>
                            <SelectSeparator />
                            {KINDS.map((k) => {
                                const Icon = KIND_ICON[k];
                                return (
                                    <SelectItem key={k} value={k}>
                                        <Icon aria-hidden />
                                        {KIND_LABEL[k]}
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                    <Select value={status} onValueChange={(v) => setStatus(v as AgentRunStatus | "ALL")}>
                        <SelectTrigger size="sm" className="w-44" aria-label="Filtrer par statut">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">Tous les statuts</SelectItem>
                            <SelectSeparator />
                            {STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                    <LiveDot tone={RUN_STATUS_TONE[s]} />
                                    {RUN_STATUS_LABEL[s]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {filtered && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                                setKind("ALL");
                                setStatus("ALL");
                            }}
                        >
                            Réinitialiser
                        </Button>
                    )}
                    {liveCount > 0 && (
                        <Badge variant="ai" className="ml-auto gap-1.5">
                            <LiveDot tone="accent" live />
                            {liveCount} en cours
                        </Badge>
                    )}
                </div>
            )}

            {runs.error && runs.items.length === 0 ? (
                <ErrorBlock message={runs.error.message} onRetry={runs.reload} />
            ) : runs.isLoading && runs.items.length === 0 ? (
                <div className="overflow-hidden rounded-panel border border-line bg-surface">
                    {Array.from({ length: compact ? 3 : 6 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 border-b border-line-subtle px-3.5 py-3 last:border-b-0">
                            <Skeleton className="size-8 rounded-[10px]" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-3.5 w-2/5 rounded-md" style={stagger(i)} />
                                <Skeleton className="h-3 w-1/4 rounded-md" style={stagger(i)} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : items.length === 0 ? (
                <EmptyState
                    compact={compact}
                    icon={History}
                    title={filtered ? "Aucune exécution pour ces filtres" : "Aucune exécution"}
                    hint={filtered ? undefined : "Les veilles planifiées, rapports et missions déléguées apparaîtront ici."}
                />
            ) : (
                <div className="space-y-5">
                    {days.map((day) => (
                        <section key={day.label} aria-label={day.label}>
                            <h3 className="mb-2 flex items-center gap-2 px-0.5 text-2xs font-bold uppercase tracking-[0.08em] text-ink-4">
                                {day.label}
                                <span className="h-px flex-1 bg-line-subtle" aria-hidden />
                                <span className="font-semibold tabular-nums normal-case tracking-normal">{day.items.length}</span>
                            </h3>
                            <ol className="divide-y divide-line-subtle overflow-hidden rounded-panel border border-line bg-surface shadow-2xs">
                                {day.items.map((run, i) => (
                                    <RunRow key={run.id} run={run} now={now} index={i} compact={compact} active={run.id === activeRunId} onOpen={() => onOpenRun(run.id)} />
                                ))}
                            </ol>
                        </section>
                    ))}
                    {!limit && runs.hasMore && (
                        <div className="flex justify-center">
                            <Button type="button" variant="outline" size="sm" onClick={runs.loadMore} disabled={runs.isLoadingMore}>
                                {runs.isLoadingMore && <Loader2 className="motion-safe:animate-spin" aria-hidden />}
                                Charger plus
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function RunRow({ run, now, index, compact, active, onOpen }: { run: AgentRunCard; now: Date; index: number; compact?: boolean; active?: boolean; onOpen: () => void }) {
    const live = isLiveStatus(run.status);
    const Icon = KIND_ICON[run.kind];
    const duration = runDurationMs(run, now);
    const tone = RUN_STATUS_TONE[run.status];
    return (
        <li className="motion-safe:animate-ds-enter" style={stagger(index)}>
            <button
                type="button"
                onClick={onOpen}
                aria-current={active ? "true" : undefined}
                className={cn(
                    "group relative flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-150 ease-snappy",
                    active ? "bg-surface-2" : "hover:bg-surface-2/70",
                    FOCUS_RING,
                    "focus-visible:ring-inset focus-visible:ring-offset-0",
                )}
            >
                {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary" />}
                <span className={cn("relative inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border", TONE_SOFT[tone])}>
                    <Icon className="size-4" aria-hidden />
                    {live && (
                        <span className="absolute -top-0.5 -right-0.5 flex size-2.5 rounded-full ring-2 ring-surface" aria-hidden>
                            <LiveDot tone="accent" live className="size-full" />
                        </span>
                    )}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{runTitle(run)}</p>
                        {run.pendingProposals > 0 && (
                            <Badge variant="warning" className="gap-1 tabular-nums">
                                <ListChecks aria-hidden />
                                {run.pendingProposals}
                            </Badge>
                        )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-3">
                        <span className="truncate">{run.clientName ?? "Vue agence"}</span>
                        <span aria-hidden className="text-ink-4">·</span>
                        <TriggerTag trigger={run.trigger} />
                        {!compact && run.actorName && (
                            <>
                                <span aria-hidden className="text-ink-4">·</span>
                                <span className="truncate">{run.actorName}</span>
                            </>
                        )}
                        {run.findingsCount > 0 && (
                            <>
                                <span aria-hidden className="text-ink-4">·</span>
                                <span className="inline-flex items-center gap-0.5">
                                    <Lightbulb className="size-3" aria-hidden />
                                    {run.findingsCount} constat{run.findingsCount > 1 ? "s" : ""}
                                </span>
                            </>
                        )}
                    </p>
                </div>
                <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                    <RunStatusBadge status={run.status} />
                    <span className="text-2xs tabular-nums text-ink-4">
                        <span className={cn(live && "font-semibold text-accent-soft-ink")}>{live ? formatClock(duration ?? 0) : formatDuration(duration)}</span> · {formatEur(run.costEur)}
                    </span>
                </div>
                <span className="sm:hidden" role="img" aria-label={RUN_STATUS_LABEL[run.status]}>
                    <LiveDot tone={tone} live={live} className="size-2" />
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-4 transition-transform duration-150 ease-snappy group-hover:translate-x-0.5" aria-hidden />
            </button>
        </li>
    );
}
