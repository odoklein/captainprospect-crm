"use client";

/**
 * « Activité »: every run, newest first, bucketed by day like a deployments
 * timeline. Filter by kind and status; live runs show a pulsing dot and a
 * ticking duration. A row opens RunDetail.
 */

import { useState } from "react";
import { ChevronRight, History, Lightbulb, ListChecks, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyBlock, FOCUS, SelectField, Shimmer } from "@/components/accueil/AccueilUI";
import type { AgentJobKind, AgentRunCard, AgentRunStatus } from "@/lib/assistant/api-contract";
import { formatClock, formatDuration, formatEur, groupByDay, isLiveStatus, KIND_LABEL, RUN_STATUS_LABEL, runDurationMs } from "@/lib/agent/client/format";
import { useAgentRuns } from "@/lib/agent/client/hooks";
import { runTitle } from "./RunDetail";
import { ErrorBlock, KIND_ICON, MINI_BUTTON, RUN_STATUS_TONE, RunStatusPill, stagger, TriggerTag, useNow } from "./shared";
import { TONE_FILL, TONE_SOFT } from "@/components/ui/recipes";

const KINDS: AgentJobKind[] = ["WATCH", "REPORT", "MISSION", "DIGEST"];
const STATUSES: AgentRunStatus[] = ["RUNNING", "QUEUED", "WAITING_APPROVAL", "DONE", "FAILED", "CANCELLED", "DEFERRED"];

export function RunsTimeline({
    folderId,
    onOpenRun,
    compact,
    limit,
}: {
    folderId?: string | null;
    onOpenRun: (id: string) => void;
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

    return (
        <div className="space-y-4">
            {!compact && (
                <div className="flex flex-wrap items-center gap-2">
                    <SelectField value={kind} onChange={(v) => setKind(v as AgentJobKind | "ALL")} ariaLabel="Filtrer par type" className="w-40">
                        <option value="ALL">Tous les types</option>
                        {KINDS.map((k) => (
                            <option key={k} value={k}>
                                {KIND_LABEL[k]}
                            </option>
                        ))}
                    </SelectField>
                    <SelectField value={status} onChange={(v) => setStatus(v as AgentRunStatus | "ALL")} ariaLabel="Filtrer par statut" className="w-44">
                        <option value="ALL">Tous les statuts</option>
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {RUN_STATUS_LABEL[s]}
                            </option>
                        ))}
                    </SelectField>
                    {filtered && (
                        <button
                            type="button"
                            className="h-9 px-2 text-xs font-semibold text-ink-3 hover:text-ink"
                            onClick={() => {
                                setKind("ALL");
                                setStatus("ALL");
                            }}
                        >
                            Réinitialiser
                        </button>
                    )}
                </div>
            )}

            {runs.error && runs.items.length === 0 ? (
                <ErrorBlock message={runs.error.message} onRetry={runs.reload} />
            ) : runs.isLoading && runs.items.length === 0 ? (
                <div className="space-y-2">
                    {Array.from({ length: compact ? 3 : 6 }).map((_, i) => (
                        <Shimmer key={i} className="h-16 rounded-panel" style={stagger(i)} />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <EmptyBlock
                    compact={compact}
                    icon={History}
                    tone="slate"
                    title={filtered ? "Aucune exécution pour ces filtres" : "Aucune exécution"}
                    hint={filtered ? undefined : "Les veilles planifiées, rapports et missions déléguées apparaîtront ici."}
                />
            ) : (
                <div className="space-y-5">
                    {days.map((day) => (
                        <section key={day.label} aria-label={day.label}>
                            <h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-4">{day.label}</h3>
                            <ol className="overflow-hidden rounded-panel border border-line bg-surface divide-y divide-line-subtle">
                                {day.items.map((run, i) => (
                                    <RunRow key={run.id} run={run} now={now} index={i} compact={compact} onOpen={() => onOpenRun(run.id)} />
                                ))}
                            </ol>
                        </section>
                    ))}
                    {!limit && runs.hasMore && (
                        <div className="flex justify-center">
                            <button type="button" className={MINI_BUTTON} onClick={runs.loadMore} disabled={runs.isLoadingMore}>
                                {runs.isLoadingMore && <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />}
                                Charger plus
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function RunRow({ run, now, index, compact, onOpen }: { run: AgentRunCard; now: Date; index: number; compact?: boolean; onOpen: () => void }) {
    const live = isLiveStatus(run.status);
    const Icon = KIND_ICON[run.kind];
    const duration = runDurationMs(run, now);
    const tone = RUN_STATUS_TONE[run.status];
    return (
        <li className="motion-safe:animate-ds-enter" style={stagger(index)}>
            <button
                type="button"
                onClick={onOpen}
                className={cn(
                    "group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-150 ease-snappy hover:bg-surface-2",
                    FOCUS,
                    "focus-visible:ring-inset focus-visible:ring-offset-0",
                )}
            >
                <span className={cn("relative inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border", TONE_SOFT[tone])}>
                    <Icon className="size-4" aria-hidden />
                    {live && (
                        <span className="absolute -right-0.5 -top-0.5 flex size-2.5" aria-hidden>
                            <span className={cn("absolute inset-0 rounded-full opacity-70 motion-safe:animate-ping", TONE_FILL.accent)} />
                            <span className={cn("relative size-2.5 rounded-full border-2 border-surface", TONE_FILL.accent)} />
                        </span>
                    )}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{runTitle(run)}</p>
                        {run.pendingProposals > 0 && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-1.5 text-[10px] font-bold text-warning-ink">
                                <ListChecks className="size-3" aria-hidden />
                                {run.pendingProposals}
                            </span>
                        )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-3">
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
                    <RunStatusPill status={run.status} />
                    <span className="text-[11px] tabular-nums text-ink-4">
                        {live ? formatClock(duration ?? 0) : formatDuration(duration)} · {formatEur(run.costEur)}
                    </span>
                </div>
                <span className={cn("size-2 shrink-0 rounded-full sm:hidden", TONE_FILL[tone], live && "motion-safe:animate-pulse")} aria-label={RUN_STATUS_LABEL[run.status]} role="img" />
                <ChevronRight className="size-4 shrink-0 text-ink-4 transition-transform duration-150 ease-snappy group-hover:translate-x-0.5" aria-hidden />
            </button>
        </li>
    );
}
