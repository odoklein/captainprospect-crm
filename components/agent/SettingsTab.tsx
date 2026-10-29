"use client";

/**
 * « Réglages »: the agent's scheduled tasks. Toggle (optimistic), run now,
 * edit, delete; « Nouvelle tâche » opens the playbook catalog. Also used,
 * compact and scoped, in the folder « Agent » tab.
 */

import { useState } from "react";
import { AlertTriangle, CalendarClock, Loader2, Pencil, Play, Plus, Settings2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { CARD, EmptyBlock, SECONDARY_BUTTON, Shimmer, relativeTime } from "@/components/accueil/AccueilUI";
import type { AgentJobItem } from "@/lib/assistant/api-contract";
import { futureLabel } from "@/lib/agent/client/format";
import { describeCron } from "@/lib/agent/client/schedule";
import { deleteJob, patchJob, runJob, useAgentJobs } from "@/lib/agent/client/hooks";
import { JobForm, type JobFormTarget } from "./JobForm";
import { ErrorBlock, KindTag, MINI_BUTTON, MINI_GHOST, Pill, RunStatusPill, stagger } from "./shared";

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
                    {jobs.length === 0 ? "Aucune tâche planifiée" : `${jobs.filter((j) => enabledOverride[j.id] ?? j.enabled).length} active(s) sur ${jobs.length}`}
                </p>
                <button type="button" className={compact ? MINI_BUTTON : SECONDARY_BUTTON} onClick={() => setForm({ client: lockedClient })}>
                    <Plus className="size-3.5" aria-hidden />
                    Nouvelle tâche
                </button>
            </div>

            {error && jobs.length === 0 ? (
                <ErrorBlock message={error instanceof Error ? error.message : "Tâches indisponibles."} onRetry={() => void mutate()} />
            ) : isLoading && jobs.length === 0 ? (
                <div className="space-y-2">
                    {Array.from({ length: compact ? 2 : 4 }).map((_, i) => (
                        <Shimmer key={i} className="h-20 rounded-panel" style={stagger(i)} />
                    ))}
                </div>
            ) : jobs.length === 0 ? (
                <EmptyBlock
                    compact={compact}
                    icon={Settings2}
                    tone="violet"
                    title="Aucune tâche planifiée"
                    hint="Crée une veille ou un rapport récurrent : l’agent le lancera seul, aux heures choisies."
                />
            ) : (
                <ul className={cn(compact ? "space-y-2" : cn(CARD, "divide-y divide-line-subtle overflow-hidden p-0"))}>
                    {sorted.map((job, i) => {
                        const enabled = enabledOverride[job.id] ?? job.enabled;
                        const schedule = job.scheduleLabel ?? (job.schedule ? describeCron(job.schedule) : "Manuel uniquement");
                        return (
                            <li
                                key={job.id}
                                style={stagger(i)}
                                className={cn(
                                    "flex flex-col gap-3 px-4 py-3.5 motion-safe:animate-ds-enter sm:flex-row sm:items-center",
                                    compact && "rounded-panel border border-line bg-surface",
                                    !enabled && "bg-surface-2/60",
                                )}
                            >
                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                    <Switch checked={enabled} onChange={(v) => void toggle(job, v)} ariaLabel={enabled ? `Mettre en pause ${job.name}` : `Activer ${job.name}`} size="sm" className="mt-0.5" />
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <p className={cn("truncate text-sm font-semibold", enabled ? "text-ink" : "text-ink-3")}>{job.name}</p>
                                            <KindTag kind={job.kind} />
                                            {job.config?.dryRun === true && <Pill tone="neutral">Essai</Pill>}
                                            {job.failures > 0 && (
                                                <Pill tone="danger" icon={AlertTriangle}>
                                                    {job.failures} échec{job.failures > 1 ? "s" : ""}
                                                </Pill>
                                            )}
                                        </div>
                                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-3">
                                            <span>{job.playbookLabel}</span>
                                            {!scope && (
                                                <>
                                                    <span aria-hidden className="text-ink-4">·</span>
                                                    <span>{job.clientName ?? "Vue agence"}</span>
                                                </>
                                            )}
                                            <span aria-hidden className="text-ink-4">·</span>
                                            <span className="inline-flex items-center gap-1">
                                                <CalendarClock className="size-3" aria-hidden />
                                                {schedule}
                                            </span>
                                        </p>
                                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-4">
                                            {enabled && job.nextRunAt && <span>Prochaine : {futureLabel(job.nextRunAt)}</span>}
                                            {job.lastRunAt && <span>Dernière : {relativeTime(job.lastRunAt)}</span>}
                                            {job.lastStatus && <RunStatusPill status={job.lastStatus} className="h-5 px-2 text-[10px]" />}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1 pl-12 sm:pl-0">
                                    <button type="button" className={MINI_BUTTON} onClick={() => void runNow(job)} disabled={running[job.id]}>
                                        {running[job.id] ? <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
                                        Lancer maintenant
                                    </button>
                                    <button type="button" className={MINI_GHOST} onClick={() => setForm({ job })} aria-label={`Modifier ${job.name}`} title="Modifier">
                                        <Pencil className="size-3.5" aria-hidden />
                                    </button>
                                    <button
                                        type="button"
                                        className={cn(MINI_GHOST, "hover:text-danger")}
                                        onClick={() => setToDelete(job)}
                                        aria-label={`Supprimer ${job.name}`}
                                        title="Supprimer"
                                    >
                                        <Trash2 className="size-3.5" aria-hidden />
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <JobForm target={form} onClose={() => setForm(null)} />
            <ConfirmModal
                isOpen={toDelete !== null}
                onClose={() => setToDelete(null)}
                onConfirm={() => void confirmDelete()}
                isLoading={deleting}
                variant="danger"
                title="Supprimer la tâche ?"
                message={`« ${toDelete?.name ?? ""} » ne tournera plus. L’historique de ses exécutions reste consultable.`}
                confirmText="Supprimer"
            />
        </div>
    );
}
