"use client";

/**
 * One agent run, live. Polls every 3 s while the run is queued or running
 * (useAgentRun stops by itself after), shows the plan as a checklist, the
 * steps as a timeline that grows one entry at a time, the budget burn, the
 * findings and proposals the run produced, and its report.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Ban, Bot, CheckCircle2, Circle, Loader2, MessageSquare, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/Toast";
import { Shimmer } from "@/components/accueil/AccueilUI";
import { TONE_FILL } from "@/components/ui/recipes";
import type { AgentRunCard, AgentRunDetail, AgentStepItem } from "@/lib/assistant/api-contract";
import {
    budgetPercent,
    formatClock,
    formatDuration,
    formatEur,
    isLiveStatus,
    KIND_LABEL,
    runDurationMs,
} from "@/lib/agent/client/format";
import { cancelRun, refreshAgent, useAgentRun } from "@/lib/agent/client/hooks";
import { ProposalBatch } from "./ProposalBatch";
import { ReportBody } from "./ReportReview";
import {
    ErrorBlock,
    KindTag,
    MetaItem,
    MINI_BUTTON,
    MINI_DANGER,
    phaseIcon,
    RunStatusPill,
    SeverityPill,
    StepStatusIcon,
    stagger,
    TriggerTag,
    useNow,
} from "./shared";

export function runTitle(run: Pick<AgentRunCard, "jobName" | "goal" | "kind">): string {
    if (run.jobName) return run.jobName;
    if (run.goal) return run.goal.length > 90 ? `${run.goal.slice(0, 88)}…` : run.goal;
    return KIND_LABEL[run.kind];
}

export function conversationHref(conversationId: string): string {
    return `/manager/assistant?c=${encodeURIComponent(conversationId)}`;
}

export function RunDetail({ runId, onClose }: { runId: string | null; onClose: () => void }) {
    const { data: run, error, isLoading, mutate } = useAgentRun(runId);
    const toast = useToast();
    const [cancelling, setCancelling] = useState(false);
    const live = isLiveStatus(run?.status);

    // A run that just settled refreshes the lists behind the drawer.
    const previous = useRef<string | null>(null);
    useEffect(() => {
        if (!run) return;
        const was = previous.current;
        previous.current = run.status;
        if (was && isLiveStatus(was as AgentRunCard["status"]) && !isLiveStatus(run.status)) refreshAgent();
    }, [run]);

    const onCancel = async () => {
        if (!run) return;
        setCancelling(true);
        try {
            await cancelRun(run.id);
            toast.info("Annulation demandée", "L’agent s’arrête à la fin de l’étape en cours.");
            void mutate();
        } catch (e) {
            toast.error("Annulation impossible", e instanceof Error ? e.message : undefined);
        } finally {
            setCancelling(false);
        }
    };

    const footer = run ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
            {run.conversationId ? (
                <Link href={conversationHref(run.conversationId)} className={MINI_BUTTON}>
                    <MessageSquare className="size-3.5" aria-hidden />
                    Ouvrir la conversation de l’agent
                </Link>
            ) : (
                <span className="text-[11px] text-ink-4">Pas de conversation liée</span>
            )}
            {live && (
                <button type="button" className={MINI_DANGER} onClick={onCancel} disabled={cancelling}>
                    {cancelling ? <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden /> : <Ban className="size-3.5" aria-hidden />}
                    Annuler
                </button>
            )}
        </div>
    ) : undefined;

    return (
        <Drawer
            isOpen={runId !== null}
            onClose={onClose}
            size="lg"
            title={run ? runTitle(run) : "Exécution"}
            description={run ? [run.clientName ?? "Vue agence", KIND_LABEL[run.kind]].join(" · ") : undefined}
            headerLeft={run ? <RunStatusPill status={run.status} /> : undefined}
            footer={footer}
        >
            {error && !run ? (
                <ErrorBlock message={error instanceof Error ? error.message : "Exécution introuvable."} onRetry={() => void mutate()} />
            ) : isLoading || !run ? (
                <RunDetailSkeleton />
            ) : (
                <RunDetailBody run={run} />
            )}
        </Drawer>
    );
}

function RunDetailSkeleton() {
    return (
        <div className="space-y-4" aria-busy="true" aria-label="Chargement de l’exécution">
            <Shimmer className="h-24" />
            <Shimmer className="h-10 w-2/3 rounded-xl" />
            {Array.from({ length: 4 }).map((_, i) => (
                <Shimmer key={i} className="h-14 rounded-xl" style={stagger(i)} />
            ))}
        </div>
    );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">{title}</h3>
                {aside}
            </div>
            {children}
        </section>
    );
}

function RunDetailBody({ run }: { run: AgentRunDetail }) {
    const live = isLiveStatus(run.status);
    const now = useNow(1000, live);
    const startRef = run.startedAt ?? run.createdAt;
    const elapsed = live ? Math.max(0, now.getTime() - new Date(startRef).getTime()) : runDurationMs(run, now) ?? 0;
    const toolCalls = run.steps.filter((s) => s.tool).length;

    return (
        <div className="space-y-6">
            {/* Live banner / summary */}
            <div
                className={cn(
                    "rounded-panel border p-4",
                    live ? "border-accent-200 bg-accent-50/60" : run.status === "FAILED" ? "border-danger-line bg-danger-soft/60" : "border-line bg-surface-2",
                )}
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        {live ? (
                            <span className="relative flex size-2.5" aria-hidden>
                                <span className={cn("absolute inset-0 rounded-full opacity-70 motion-safe:animate-ping", TONE_FILL.accent)} />
                                <span className={cn("relative size-2.5 rounded-full", TONE_FILL.accent)} />
                            </span>
                        ) : (
                            <Bot className="size-4 text-ink-3" aria-hidden />
                        )}
                        <p className="text-sm font-semibold text-ink truncate">
                            {run.status === "QUEUED"
                                ? "En file d’attente"
                                : run.status === "RUNNING"
                                  ? run.steps.find((s) => s.status === "RUNNING")?.title ?? "L’agent travaille…"
                                  : run.status === "WAITING_APPROVAL"
                                    ? "En attente de ta validation"
                                    : run.status === "DONE"
                                      ? "Exécution terminée"
                                      : run.status === "FAILED"
                                        ? "L’exécution a échoué"
                                        : run.status === "CANCELLED"
                                          ? "Exécution annulée"
                                          : "Exécution reportée"}
                        </p>
                    </div>
                    <span className={cn("font-mono text-sm font-semibold tabular-nums", live ? "text-accent-700" : "text-ink-2")} aria-live="off">
                        {live ? formatClock(elapsed) : formatDuration(elapsed)}
                    </span>
                </div>
                {run.summary && <p className="mt-2.5 text-xs leading-relaxed text-ink-2">{run.summary}</p>}
                {run.error && (
                    <p className="mt-2.5 flex items-start gap-1.5 text-xs font-medium text-danger-ink">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {run.error}
                    </p>
                )}
                <dl className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MetaItem label="Déclencheur">
                        <TriggerTag trigger={run.trigger} />
                    </MetaItem>
                    <MetaItem label="Par">{run.actorName ?? "Agent"}</MetaItem>
                    <MetaItem label="Coût">{formatEur(run.costEur)}</MetaItem>
                    <MetaItem label="Mode">{run.mode === "lite" ? "Réduit" : run.mode === "worker" ? "Worker" : run.mode}</MetaItem>
                </dl>
            </div>

            {run.goal && run.jobName && (
                <Section title="Objectif">
                    <p className="text-sm leading-relaxed text-ink-2">{run.goal}</p>
                </Section>
            )}

            <BudgetBars run={run} elapsed={elapsed} toolCalls={toolCalls} live={live} />

            {run.plan && run.plan.steps.length > 0 && (
                <Section title="Plan" aside={<span className="text-[11px] font-semibold text-ink-4">{run.plan.steps.length} étapes</span>}>
                    <ol className="space-y-1.5">
                        {run.plan.steps.map((s, i) => {
                            const done = s.status === "DONE" || s.status === "done";
                            const active = s.status === "RUNNING" || s.status === "running";
                            return (
                                <li key={i} className="flex items-start gap-2.5 text-sm motion-safe:animate-ds-enter" style={stagger(i)}>
                                    {done ? (
                                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Fait" />
                                    ) : active ? (
                                        <Loader2 className="mt-0.5 size-4 shrink-0 text-accent-600 motion-safe:animate-spin" aria-label="En cours" />
                                    ) : (
                                        <Circle className="mt-0.5 size-4 shrink-0 text-ink-4" aria-label="À venir" />
                                    )}
                                    <span className={cn("min-w-0", done ? "text-ink-3 line-through decoration-line-strong" : "text-ink-2", active && "font-semibold text-ink")}>
                                        {s.title}
                                        {s.intent && <span className="block text-[11px] text-ink-4 no-underline">{s.intent}</span>}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                </Section>
            )}

            <Section title="Étapes" aside={<span className="text-[11px] font-semibold text-ink-4">{run.steps.length}</span>}>
                {run.steps.length === 0 ? (
                    <p className="rounded-panel border border-dashed border-line bg-surface-2/60 px-4 py-5 text-center text-xs text-ink-3">
                        {live ? "Les premières étapes arrivent…" : "Aucune étape enregistrée."}
                    </p>
                ) : (
                    <StepTimeline steps={run.steps} />
                )}
            </Section>

            {run.proposals.length > 0 && (
                <Section title="Propositions" aside={<span className="text-[11px] font-semibold text-ink-4">{run.proposals.length}</span>}>
                    <ProposalBatch proposals={run.proposals} showContext={false} />
                </Section>
            )}

            {run.findings.length > 0 && (
                <Section title="Constats" aside={<span className="text-[11px] font-semibold text-ink-4">{run.findings.length}</span>}>
                    <ul className="divide-y divide-line-subtle rounded-panel border border-line bg-surface">
                        {run.findings.map((f, i) => (
                            <li key={f.id} className="flex items-start gap-3 px-3.5 py-2.5 motion-safe:animate-ds-enter" style={stagger(i)}>
                                <SeverityPill severity={f.severity} className="mt-0.5" />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-ink">{f.title}</p>
                                    {f.body && <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{f.body}</p>}
                                </div>
                            </li>
                        ))}
                    </ul>
                </Section>
            )}

            {run.report && (
                <Section title="Rapport">
                    <div className="rounded-panel border border-line bg-surface p-4">
                        <h4 className="mb-2 text-base font-bold text-ink">{run.report.title}</h4>
                        <ReportBody body={run.report.body} visuals={run.report.visuals} />
                    </div>
                </Section>
            )}

            <p className="flex items-center gap-1.5 text-[11px] text-ink-4">
                <KindTag kind={run.kind} />
                <span aria-hidden>·</span>
                <span>Créée le {new Date(run.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</span>
                {run.heartbeatAt && live && (
                    <>
                        <span aria-hidden>·</span>
                        <span>dernier signal il y a {formatDuration(Math.max(0, now.getTime() - new Date(run.heartbeatAt).getTime()))}</span>
                    </>
                )}
            </p>
        </div>
    );
}

function BudgetBars({ run, elapsed, toolCalls, live }: { run: AgentRunDetail; elapsed: number; toolCalls: number; live: boolean }) {
    const cost = budgetPercent(run.costEur, run.budget?.maxCostEur);
    const time = budgetPercent(elapsed, run.budget?.deadlineMs);
    const tools = budgetPercent(toolCalls, run.budget?.maxToolCalls);
    const bars = [
        cost !== null && { label: "Coût", value: `${formatEur(run.costEur)} / ${formatEur(run.budget.maxCostEur)}`, percent: cost },
        time !== null && { label: "Temps", value: `${formatDuration(elapsed)} / ${formatDuration(run.budget.deadlineMs)}`, percent: time },
        tools !== null && { label: "Appels d’outils", value: `${toolCalls} / ${run.budget.maxToolCalls}`, percent: tools },
    ].filter(Boolean) as Array<{ label: string; value: string; percent: number }>;
    if (bars.length === 0) return null;
    return (
        <Section title="Budget">
            <div className="grid gap-3 sm:grid-cols-3">
                {bars.map((b) => (
                    <div key={b.label} className="min-w-0 rounded-[12px] border border-line bg-surface px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[11px] font-semibold text-ink-3">{b.label}</span>
                            <span className="truncate text-[11px] font-semibold tabular-nums text-ink-2">{b.value}</span>
                        </div>
                        <div
                            className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-3"
                            role="progressbar"
                            aria-label={b.label}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(b.percent)}
                        >
                            <div
                                className={cn(
                                    "h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 ease-snappy",
                                    b.percent >= 90 ? TONE_FILL.danger : b.percent >= 70 ? TONE_FILL.warning : live ? TONE_FILL.accent : TONE_FILL.neutral,
                                )}
                                style={{ width: `${b.percent}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </Section>
    );
}

function StepTimeline({ steps }: { steps: AgentStepItem[] }) {
    const ordered = [...steps].sort((a, b) => a.index - b.index);
    return (
        <ol className="relative">
            {ordered.map((step, i) => {
                const PhaseIcon = phaseIcon(step.phase);
                const last = i === ordered.length - 1;
                return (
                    <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0 motion-safe:animate-ds-enter" style={stagger(i)}>
                        {!last && <span aria-hidden className="absolute left-[11px] top-7 bottom-0 w-px bg-line" />}
                        <span
                            className={cn(
                                "relative z-[1] mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border bg-surface",
                                step.status === "RUNNING" ? "border-accent-200" : step.status === "FAILED" ? "border-danger-line" : "border-line",
                            )}
                        >
                            <StepStatusIcon status={step.status} className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                                    <PhaseIcon className="size-3" aria-hidden />
                                    {step.phase}
                                </span>
                                <p className={cn("text-sm font-semibold", step.status === "RUNNING" ? "text-ink" : "text-ink-2")}>{step.title}</p>
                            </div>
                            {step.resultDigest && <p className="mt-1 text-xs leading-relaxed text-ink-3 whitespace-pre-line">{step.resultDigest}</p>}
                            {step.error && (
                                <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-danger-ink">
                                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                    {step.error}
                                </p>
                            )}
                            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-ink-4 tabular-nums">
                                {step.tool && <span className="font-mono">{step.tool}</span>}
                                {step.model && <span>{step.model}</span>}
                                {step.costEur > 0 && <span>{formatEur(step.costEur)}</span>}
                                {step.durationMs !== null && <span>{formatDuration(step.durationMs)}</span>}
                            </p>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
