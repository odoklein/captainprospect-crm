"use client";

/**
 * « Réglages »: the agent's scheduled tasks as a list with columns. Switch
 * (optimistic, with undo), run now, edit, delete (AlertDialog). « Nouvelle
 * tâche » opens the playbook catalog (JobForm). Also used, compact and
 * scoped, in the folder agent panel.
 */

import { useState } from "react";
import { AlertTriangle, CalendarClock, Loader2, MoreHorizontal, Pencil, Play, Plus, Settings2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/shadcn/dropdown-menu";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Switch } from "@/components/ui/shadcn/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import type { AgentJobItem } from "@/lib/assistant/api-contract";
import { futureLabel, relativeTime } from "@/lib/agent/client/format";
import { describeCron } from "@/lib/agent/client/schedule";
import { deleteJob, patchJob, runJob, useAgentJobs } from "@/lib/agent/client/hooks";
import { JobForm, type JobFormTarget } from "./JobForm";
import { EmptyState, ErrorBlock, KindTag, RunStatusBadge, stagger } from "./shared";

const COLS = "md:grid md:grid-cols-[auto_minmax(0,1.7fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4";

export function SettingsTab({
    onOpenRun,
    scope,
    compact,
}: {
    onOpenRun: (id: string) => void;
    /** Folder panel: only this client's tasks, new ones locked to it. */
    scope?: { folderId: string | null; clientId: string | null; clientName: string } | null;
    compact?: boolean;
}) {
    const toast = useToast();
    const { jobs, isLoading, error, mutate } = useAgentJobs(scope ? { folderId: scope.folderId, clientId: scope.clientId } : undefined);
    const [enabledOverride, setEnabledOverride] = useState<Record<string, boolean>>({});
    const [running, setRunning] = useState<Record<string, boolean>>({});
    const [form, setForm] = useState<JobFormTarget | null>(null);
    const [toDelete, setToDelete] = useState<AgentJobItem | null>(null);
    const [deleting, setDeleting] = useState(false);

    const lockedClient = scope?.clientId ? { clientId: scope.clientId, folderId: scope.folderId, name: scope.clientName } : null;
    const sorted = [...jobs].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name, "fr"));
    const activeCount = jobs.filter((j) => enabledOverride[j.id] ?? j.enabled).length;

    const toggle = async (job: AgentJobItem, next: boolean) => {
        setEnabledOverride((o) => ({ ...o, [job.id]: next }));
        try {
            await patchJob(job.id, { enabled: next });
            toast.addToast({
                type: "success",
                title: next ? "Tâche activée" : "Tâche mise en pause",
                message: job.name,
                duration: 6000,
                action: { label: "Annuler", onClick: () => void toggle(job, !next) },
            });
        } catch (e) {
            setEnabledOverride((o) => ({ ...o, [job.id]: !next }));
            toast.error("Modification impossible", e instanceof Error ? e.message : undefined);
        }
    };

    const runNow = async (job: AgentJobItem) => {
        setRunning((r) => ({ ...r, [job.id]: true }));
        try {
            const runId = await runJob(job.id);
            toast.info("Exécution lancée", runId ? job.name : `${job.name} : elle apparaîtra dans Activité.`);
            if (runId) onOpenRun(runId);
        } catch (e) {
            toast.error("Lancement impossible", e instanceof Error ? e.message : undefined);
        } finally {
            setRunning((r) => ({ ...r, [job.id]: false }));
        }
    };

    const confirmDelete = async () => {
        if (!toDelete) return;
        setDeleting(true);
        try {
            await deleteJob(toDelete.id);
            toast.success("Tâche supprimée", toDelete.name);
            setToDelete(null);
        } catch (e) {
            toast.error("Suppression impossible", e instanceof Error ? e.message : undefined);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-ink-3">
                    {jobs.length === 0 ? (
                        "Aucune tâche planifiée"
                    ) : (
                        <>
                            <span className="font-semibold text-ink tabular-nums">{activeCount}</span> active{activeCount > 1 ? "s" : ""} sur{" "}
                            <span className="tabular-nums">{jobs.length}</span>
                        </>
                    )}
                </p>
                <Button type="button" variant="outline" size={compact ? "xs" : "sm"} onClick={() => setForm({ client: lockedClient })}>
                    <Plus aria-hidden />
                    Nouvelle tâche
                </Button>
            </div>

            {error && jobs.length === 0 ? (
                <ErrorBlock message={error instanceof Error ? error.message : "Tâches indisponibles."} onRetry={() => void mutate()} />
            ) : isLoading && jobs.length === 0 ? (
                <div className="overflow-hidden rounded-panel border border-line bg-surface">
                    {Array.from({ length: compact ? 2 : 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 border-b border-line-subtle px-4 py-3.5 last:border-b-0">
                            <Skeleton className="h-4 w-7 rounded-full" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-3.5 w-1/3 rounded-md" style={stagger(i)} />
                                <Skeleton className="h-3 w-1/2 rounded-md" style={stagger(i)} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : jobs.length === 0 ? (
                <EmptyState
                    compact={compact}
                    icon={Settings2}
                    tone="accent"
                    title="Aucune tâche planifiée"
                    hint="Crée une veille ou un rapport récurrent : l’agent le lancera seul, aux heures choisies."
                />
            ) : (
                <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-2xs">
                    {!compact && (
                        <div className={cn("hidden border-b border-line-subtle bg-surface-2/60 px-4 py-2 text-3xs font-semibold uppercase tracking-[0.08em] text-ink-4", COLS)} aria-hidden>
                            <span className="w-7" />
                            <span>Tâche</span>
                            <span>Planification</span>
                            <span>Exécutions</span>
                            {/* Same widths as the switch and the two icon buttons, so the columns line up. */}
                            <span className="w-[66px]" />
                        </div>
                    )}
                    <ul className="divide-y divide-line-subtle">
                        {sorted.map((job, i) => {
                            const enabled = enabledOverride[job.id] ?? job.enabled;
                            const schedule = job.scheduleLabel ?? (job.schedule ? describeCron(job.schedule) : "Manuel uniquement");
                            const isRunning = running[job.id] === true;
                            return (
                                <li
                                    key={job.id}
                                    style={stagger(i)}
                                    className={cn(
                                        "group flex items-start gap-3 px-4 py-3 transition-colors duration-150 ease-snappy motion-safe:animate-ds-enter hover:bg-surface-2/50",
                                        !compact && COLS,
                                        !enabled && "bg-surface-2/40",
                                    )}
                                >
                                    <Switch
                                        size="sm"
                                        checked={enabled}
                                        onCheckedChange={(v) => void toggle(job, v)}
                                        aria-label={enabled ? `Mettre en pause ${job.name}` : `Activer ${job.name}`}
                                        className="mt-0.5 md:mt-0"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <button
                                                type="button"
                                                onClick={() => setForm({ job })}
                                                className={cn("truncate rounded-sm text-left text-sm font-semibold hover:underline hover:underline-offset-2", enabled ? "text-ink" : "text-ink-3")}
                                            >
                                                {job.name}
                                            </button>
                                            {job.config?.dryRun === true && <Badge variant="secondary">Essai</Badge>}
                                            {job.failures > 0 && (
                                                <Badge variant="danger">
                                                    <AlertTriangle aria-hidden />
                                                    {job.failures} échec{job.failures > 1 ? "s" : ""}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-3">
                                            <KindTag kind={job.kind} className="font-medium" />
                                            <span aria-hidden className="text-ink-4">·</span>
                                            <span className="truncate">{job.playbookLabel}</span>
                                            {!scope && (
                                                <>
                                                    <span aria-hidden className="text-ink-4">·</span>
                                                    <span className="truncate">{job.clientName ?? "Vue agence"}</span>
                                                </>
                                            )}
                                        </p>
                                        {/* Narrow layouts: schedule and runs under the name. */}
                                        <div className={cn("mt-1.5 space-y-1", !compact && "md:hidden")}>
                                            <ScheduleCell schedule={schedule} />
                                            <RunsCell job={job} enabled={enabled} />
                                        </div>
                                    </div>
                                    {!compact && (
                                        <>
                                            <div className="hidden min-w-0 md:block">
                                                <ScheduleCell schedule={schedule} />
                                                {enabled && job.nextRunAt && <p className="mt-0.5 text-2xs text-ink-4">Prochaine {futureLabel(job.nextRunAt)}</p>}
                                            </div>
                                            <div className="hidden min-w-0 md:block">
                                                <RunsCell job={job} enabled={enabled} hideNext />
                                            </div>
                                        </>
                                    )}
                                    <div className="flex shrink-0 items-center gap-0.5">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button type="button" variant="ghost" size="icon-sm" onClick={() => void runNow(job)} disabled={isRunning} aria-label={`Lancer ${job.name} maintenant`}>
                                                    {isRunning ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <Play aria-hidden />}
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Lancer maintenant</TooltipContent>
                                        </Tooltip>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions pour ${job.name}`}>
                                                    <MoreHorizontal aria-hidden />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuItem onSelect={() => void runNow(job)} disabled={isRunning}>
                                                    <Play aria-hidden />
                                                    Lancer maintenant
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onSelect={() => setForm({ job })}>
                                                    <Pencil aria-hidden />
                                                    Modifier
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(job)}>
                                                    <Trash2 aria-hidden />
                                                    Supprimer
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            <JobForm target={form} onClose={() => setForm(null)} />

            <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && !deleting && setToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer la tâche ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            « {toDelete?.name ?? ""} » ne tournera plus. L’historique de ses exécutions reste consultable.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            className={buttonVariants({ variant: "destructive" })}
                            disabled={deleting}
                            onClick={(e) => {
                                e.preventDefault();
                                void confirmDelete();
                            }}
                        >
                            {deleting && <Loader2 className="motion-safe:animate-spin" aria-hidden />}
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function ScheduleCell({ schedule }: { schedule: string }) {
    return (
        <p className="flex items-center gap-1.5 text-xs text-ink-2">
            <CalendarClock className="size-3.5 shrink-0 text-ink-4" aria-hidden />
            <span className="truncate">{schedule}</span>
        </p>
    );
}

function RunsCell({ job, enabled, hideNext }: { job: AgentJobItem; enabled: boolean; hideNext?: boolean }) {
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-4">
            {job.lastStatus && <RunStatusBadge status={job.lastStatus} />}
            {job.lastRunAt ? <span>{relativeTime(job.lastRunAt)}</span> : <span>Jamais lancée</span>}
            {!hideNext && enabled && job.nextRunAt && <span>· prochaine {futureLabel(job.nextRunAt)}</span>}
        </div>
    );
}
