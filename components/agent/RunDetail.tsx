"use client";

/**
 * One agent run, live. A right Sheet on desktop, a full-height bottom Drawer
 * on mobile; the run id lives in the caller's state (`?run=` on the agent
 * screen), so a run can be linked to. Polls every 3 s while the run is
 * queued or running (useAgentRun stops by itself after), and shows: the live
 * status, the budget burn, the plan as a checklist, the steps as a timeline
 * that grows one entry at a time, the findings and proposals the run
 * produced, and its report. Cancel, open the agent's conversation, export
 * the report as PDF.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Ban, Bot, CheckCircle2, Circle, Download, Loader2, MessageSquare, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/shadcn/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/shadcn/drawer";
import { Progress } from "@/components/ui/shadcn/progress";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { downloadRunReportPdf } from "@/lib/assistant/client/export";
import type { AgentRunCard, AgentRunDetail, AgentStepItem } from "@/lib/assistant/api-contract";
import {
    budgetPercent,
    conversationHref,
    formatClock,
    formatDuration,
    formatEur,
    isLiveStatus,
    KIND_LABEL,
    runDurationMs,
    runHeadline,
    runTitle,
} from "@/lib/agent/client/format";
import { cancelRun, refreshAgent, useAgentRun } from "@/lib/agent/client/hooks";
import { ProposalBatch } from "./ProposalBatch";
import { ReportBody } from "./ReportReview";
import {
    ErrorBlock,
    KindTag,
    LiveDot,
    MetaItem,
    phaseIcon,
    RUN_STATUS_TONE,
    RunStatusBadge,
    SectionTitle,
    SeverityBadge,
    StepStatusIcon,
    stagger,
    TriggerTag,
    useMediaQuery,
    useNow,
} from "./shared";

export function RunDetail({ runId, onClose }: { runId: string | null; onClose: () => void }) {
    const desktop = useMediaQuery("(min-width: 768px)", null);
    const { data: run, error, isLoading, mutate } = useAgentRun(runId);
    const toast = useToast();
    const [cancelling, setCancelling] = useState(false);
    const [exporting, setExporting] = useState(false);
    const live = isLiveStatus(run?.status);
    const open = runId !== null;

    // A run that just settled refreshes the lists behind the panel.
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

    const onExport = async () => {
        if (!run) return;
        setExporting(true);
        try {
            const fileName = await downloadRunReportPdf(run.id);
            toast.success("PDF téléchargé", fileName);
        } catch (e) {
            toast.error("Export PDF impossible", e instanceof Error ? e.message : undefined);
        } finally {
            setExporting(false);
        }
    };

    const title = run ? runTitle(run) : "Exécution";
    const description = run ? [run.clientName ?? "Vue agence", KIND_LABEL[run.kind]].join(" · ") : "Chargement…";

    const body =
        error && !run ? (
            <ErrorBlock message={error instanceof Error ? error.message : "Exécution introuvable."} onRetry={() => void mutate()} />
        ) : isLoading || !run ? (
            <RunDetailSkeleton />
        ) : (
            <RunDetailBody run={run} />
        );

    const footer = run ? (
        <div className="flex flex-wrap items-center gap-2">
            {run.conversationId ? (
                <Button asChild variant="outline" size="sm">
                    <Link href={conversationHref(run.conversationId)}>
                        <MessageSquare aria-hidden />
                        Ouvrir la conversation
                    </Link>
                </Button>
            ) : (
                <span className="text-2xs text-ink-4">Pas de conversation liée</span>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => void onExport()} disabled={exporting || live}>
                {exporting ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <Download aria-hidden />}
                Exporter le rapport en PDF
            </Button>
            {live && (
                <Button type="button" variant="destructive" size="sm" className="ml-auto" onClick={() => void onCancel()} disabled={cancelling}>
                    {cancelling ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <Ban aria-hidden />}
                    Annuler
                </Button>
            )}
        </div>
    ) : null;

    const heading = (titleNode: ReactNode, descriptionNode: ReactNode) => (
        <div className="flex min-w-0 items-start gap-3">
            <span
                className={cn(
                    "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[12px] border",
                    live ? "border-accent-200 bg-accent-soft text-accent-soft-ink" : "border-line bg-surface-2 text-ink-3",
                )}
            >
                {live ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : <Bot className="size-4" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
                {run && <RunStatusBadge status={run.status} />}
                {titleNode}
                {descriptionNode}
            </div>
        </div>
    );

    if (desktop === null) return null;

    if (desktop) {
        return (
            <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
                <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
                    <SheetHeader>
                        {heading(
                            <SheetTitle className="line-clamp-2">{title}</SheetTitle>,
                            <SheetDescription className="text-xs">{description}</SheetDescription>,
                        )}
                    </SheetHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{body}</div>
                    {footer && <SheetFooter className="mt-0">{footer}</SheetFooter>}
                </SheetContent>
            </Sheet>
        );
    }

    return (
        <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
            <DrawerContent className="data-[vaul-drawer-direction=bottom]:h-[96dvh] data-[vaul-drawer-direction=bottom]:max-h-[96dvh]">
                <DrawerHeader className="border-b border-line-subtle text-left">
                    {heading(
                        <DrawerTitle className="line-clamp-2 text-left">{title}</DrawerTitle>,
                        <DrawerDescription className="text-left text-xs">{description}</DrawerDescription>,
                    )}
                </DrawerHeader>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{body}</div>
                {footer && <DrawerFooter className="border-t border-line-subtle">{footer}</DrawerFooter>}
            </DrawerContent>
        </Drawer>
    );
}

function RunDetailSkeleton() {
    return (
        <div className="space-y-4" aria-busy="true" aria-label="Chargement de l’exécution">
            <Skeleton className="h-28 rounded-panel" />
            <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-[12px]" />
                ))}
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-[12px]" style={stagger(i)} />
            ))}
        </div>
    );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
    return (
        <section className="space-y-2.5">
            <SectionTitle aside={aside}>{title}</SectionTitle>
            {children}
        </section>
    );
}

const Count = ({ n }: { n: number }) => <span className="text-2xs font-semibold tabular-nums text-ink-4">{n}</span>;

function RunDetailBody({ run }: { run: AgentRunDetail }) {
    const live = isLiveStatus(run.status);
    const now = useNow(1000, live);
    const startRef = run.startedAt ?? run.createdAt;
    const elapsed = live ? Math.max(0, now.getTime() - new Date(startRef).getTime()) : runDurationMs(run, now) ?? 0;
    const toolCalls = run.steps.filter((s) => s.tool).length;
    const current = run.steps.find((s) => s.status === "RUNNING")?.title ?? null;
    const tone = RUN_STATUS_TONE[run.status];

    return (
        <div className="space-y-6">
            {/* Live status */}
            <div
                className={cn(
                    "rounded-panel border p-4 motion-safe:animate-ds-enter",
                    live ? "border-accent-200 bg-accent-soft/50" : run.status === "FAILED" ? "border-danger-line bg-danger-soft/50" : "border-line bg-surface-2",
                )}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <LiveDot tone={tone} live={live} className="size-2" />
                        <p className="truncate text-sm font-semibold text-ink" aria-live="polite">
                            {runHeadline(run.status, current)}
                        </p>
                    </div>
                    <span className={cn("font-mono text-sm font-semibold tabular-nums", live ? "text-accent-soft-ink" : "text-ink-2")} aria-live="off">
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
                <dl className="mt-3.5 grid grid-cols-2 gap-3 border-t border-line-subtle pt-3 sm:grid-cols-4">
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
                <Section title="Plan" aside={<Count n={run.plan.steps.length} />}>
                    <ol className="space-y-1 rounded-panel border border-line bg-surface p-2">
                        {run.plan.steps.map((s, i) => {
                            const done = s.status === "DONE" || s.status === "done";
                            const active = s.status === "RUNNING" || s.status === "running";
                            return (
                                <li
                                    key={i}
                                    className={cn("flex items-start gap-2.5 rounded-[10px] px-2 py-1.5 text-sm motion-safe:animate-ds-enter", active && "bg-accent-soft/50")}
                                    style={stagger(i)}
                                >
                                    {done ? (
                                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Fait" />
                                    ) : active ? (
                                        <Loader2 className="mt-0.5 size-4 shrink-0 text-accent motion-safe:animate-spin" aria-label="En cours" />
                                    ) : (
                                        <Circle className="mt-0.5 size-4 shrink-0 text-ink-4" aria-label="À venir" />
                                    )}
                                    <span className={cn("min-w-0", done ? "text-ink-3 line-through decoration-line-strong" : "text-ink-2", active && "font-semibold text-ink")}>
                                        {s.title}
                                        {s.intent && <span className="block text-2xs text-ink-4 no-underline">{s.intent}</span>}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                </Section>
            )}

            <Section title="Étapes" aside={<Count n={run.steps.length} />}>
                {run.steps.length === 0 ? (
                    <p className="rounded-panel border border-dashed border-line bg-surface-2/50 px-4 py-5 text-center text-xs text-ink-3">
                        {live ? (
                            <span className="inline-flex items-center gap-2">
                                <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
                                Les premières étapes arrivent…
                            </span>
                        ) : (
                            "Aucune étape enregistrée."
                        )}
                    </p>
                ) : (
                    <StepTimeline steps={run.steps} />
                )}
            </Section>

            {run.proposals.length > 0 && (
                <Section title="Propositions" aside={<Count n={run.proposals.length} />}>
                    <ProposalBatch proposals={run.proposals} showContext={false} />
                </Section>
            )}

            {run.findings.length > 0 && (
                <Section title="Constats" aside={<Count n={run.findings.length} />}>
                    <ul className="divide-y divide-line-subtle overflow-hidden rounded-panel border border-line bg-surface">
                        {run.findings.map((f, i) => (
                            <li key={f.id} className="flex items-start gap-3 px-3.5 py-2.5 motion-safe:animate-ds-enter" style={stagger(i)}>
                                <SeverityBadge severity={f.severity} className="mt-0.5" />
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
                        <h4 className="mb-2 text-base font-semibold tracking-tight text-ink">{run.report.title}</h4>
                        <ReportBody body={run.report.body} visuals={run.report.visuals} />
                    </div>
                </Section>
            )}

            <p className="flex flex-wrap items-center gap-1.5 text-2xs text-ink-4">
                <KindTag kind={run.kind} className="font-medium text-ink-4" />
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
        tools !== null && { label: "Outils", value: `${toolCalls} / ${run.budget.maxToolCalls}`, percent: tools },
    ].filter(Boolean) as Array<{ label: string; value: string; percent: number }>;
    if (bars.length === 0) return null;
    return (
        <Section title="Budget">
            <div className="grid gap-2 sm:grid-cols-3">
                {bars.map((b) => (
                    <div key={b.label} className="min-w-0 rounded-[12px] border border-line bg-surface px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-2xs font-semibold text-ink-3">{b.label}</span>
                            <span className="truncate text-2xs font-semibold tabular-nums text-ink-2">{b.value}</span>
                        </div>
                        <Progress
                            value={b.percent}
                            aria-label={b.label}
                            className={cn(
                                "mt-2 h-1",
                                b.percent >= 90
                                    ? "[&>[data-slot=progress-indicator]]:bg-danger"
                                    : b.percent >= 70
                                      ? "[&>[data-slot=progress-indicator]]:bg-warning"
                                      : live
                                        ? "[&>[data-slot=progress-indicator]]:bg-accent"
                                        : "[&>[data-slot=progress-indicator]]:bg-ink-4",
                            )}
                        />
                    </div>
                ))}
            </div>
        </Section>
    );
}

function StepTimeline({ steps }: { steps: AgentStepItem[] }) {
    const ordered = [...steps].sort((a, b) => a.index - b.index);
    // Steps on screen at first paint stagger in; the ones that arrive while polling slide in at once.
    const [initial] = useState(() => new Set(steps.map((s) => s.id)));
    return (
        <ol className="relative">
            {ordered.map((step, i) => {
                const PhaseIcon = phaseIcon(step.phase);
                const last = i === ordered.length - 1;
                const fresh = !initial.has(step.id);
                return (
                    <li
                        key={step.id}
                        className={cn(
                            "relative flex gap-3 pb-4 last:pb-0",
                            fresh ? "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2 motion-safe:duration-200 ease-snappy" : "motion-safe:animate-ds-enter",
                        )}
                        style={fresh ? undefined : stagger(i)}
                    >
                        {!last && <span aria-hidden className="absolute top-7 bottom-0 left-[11px] w-px bg-line" />}
                        <span
                            className={cn(
                                "relative z-[1] mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border bg-surface",
                                step.status === "RUNNING" ? "border-accent-200 ring-4 ring-accent-soft" : step.status === "FAILED" ? "border-danger-line" : "border-line",
                            )}
                        >
                            <StepStatusIcon status={step.status} className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-ink-3">
                                    <PhaseIcon className="size-3" aria-hidden />
                                    {step.phase}
                                </span>
                                <p className={cn("text-sm font-semibold", step.status === "RUNNING" ? "text-ink" : "text-ink-2")}>{step.title}</p>
                            </div>
                            {step.resultDigest && <p className="mt-1 text-xs leading-relaxed whitespace-pre-line text-ink-3">{step.resultDigest}</p>}
                            {step.error && (
                                <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-danger-ink">
                                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                    {step.error}
                                </p>
                            )}
                            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs text-ink-4 tabular-nums">
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
