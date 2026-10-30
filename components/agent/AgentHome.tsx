"use client";

/**
 * Captain Agent — the home of the background agent: worker status, today's
 * figures, and four tabs in the URL (`?tab=`): « À traiter » (inbox),
 * « Activité » (runs), « Rapports », « Réglages » (scheduled tasks). The
 * open run lives in the URL too (`?run=<id>`), so a run can be linked to and
 * survives a reload.
 *
 * Needs a nuqs adapter above it (app/manager/assistant/agent/page.tsx).
 */

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { ArrowLeft, Coins, Info, Lightbulb, ListChecks, Loader2, OctagonAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ui/AiMark";
import { FOCUS_RING } from "@/components/ui/recipes";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import type { AgentOverview } from "@/lib/assistant/api-contract";
import { formatEur, workerStatusInfo } from "@/lib/agent/client/format";
import { useAgentOverview } from "@/lib/agent/client/hooks";
import { DelegateComposer } from "./DelegateComposer";
import { Inbox } from "./Inbox";
import { ReportsTab } from "./ReportsTab";
import { RunDetail } from "./RunDetail";
import { RunsTimeline } from "./RunsTimeline";
import { SettingsTab } from "./SettingsTab";
import { CountChip, CountUp, LiveDot, stagger, TONE_BADGE } from "./shared";

const TABS = ["a-traiter", "activite", "rapports", "reglages"] as const;
type AgentTab = (typeof TABS)[number];

const TAB_CONTENT = "outline-none motion-safe:data-[state=active]:animate-in motion-safe:data-[state=active]:fade-in-0 motion-safe:data-[state=active]:slide-in-from-bottom-1 motion-safe:duration-200 ease-snappy";

export function AgentHome() {
    const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("a-traiter"));
    const [runId, setRunId] = useQueryState("run");
    const [composing, setComposing] = useState(false);
    const { data: overview, isLoading } = useAgentOverview();

    const openRun = useCallback((id: string) => void setRunId(id), [setRunId]);
    const counts = overview?.counts;
    const toHandle = counts ? counts.openFindings + counts.pendingProposals : 0;
    const liveRuns = counts ? counts.running + counts.queued : 0;
    const loadingFirst = isLoading && !overview;

    return (
        <div className="w-full space-y-6 pb-12 antialiased">
            {/* Header */}
            <header className="space-y-4 pt-1 motion-safe:animate-ds-enter">
                <Link
                    href="/manager/assistant"
                    className={cn("-ml-1.5 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-ink-3 transition-colors duration-150 hover:text-ink", FOCUS_RING)}
                >
                    <ArrowLeft className="size-3.5" aria-hidden />
                    Captain AI
                </Link>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-center gap-3.5">
                        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-accent text-accent-fg shadow-raised">
                            <AiMark className="size-[22px]" aria-hidden />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <h1 className="text-2xl font-bold tracking-tight text-ink">Captain Agent</h1>
                                <WorkerStatus overview={overview} loading={loadingFirst} />
                            </div>
                            <p className="mt-0.5 text-xs text-ink-3 sm:text-sm">Il surveille, rédige et enquête en arrière-plan. Rien ne s’exécute sans ta validation.</p>
                        </div>
                    </div>
                    <Button type="button" variant="ai" className="self-start md:self-auto" onClick={() => setComposing(true)}>
                        <AiMark aria-hidden />
                        Déléguer une mission
                    </Button>
                </div>
            </header>

            {overview?.degraded && (
                <p className="flex items-start gap-2 rounded-panel border border-warning-line bg-warning-soft px-4 py-3 text-xs text-warning-ink">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    Les tables de l’agent ne sont pas encore installées sur cette instance : les chiffres restent à zéro tant que la migration n’est pas appliquée.
                </p>
            )}

            {/* KPIs */}
            <section aria-label="Chiffres du jour" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {loadingFirst ? (
                    Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className={cn("h-[108px] rounded-card", i === 4 && "col-span-2 lg:col-span-1")} style={stagger(i)} />)
                ) : (
                    <>
                        <Kpi index={0} label="Constats ouverts" icon={Lightbulb} value={counts?.openFindings ?? 0} sub="À lire et classer" onClick={() => void setTab(null)} />
                        <Kpi
                            index={1}
                            label="Critiques"
                            icon={OctagonAlert}
                            tone={counts && counts.critical > 0 ? "danger" : undefined}
                            value={counts?.critical ?? 0}
                            sub={counts && counts.critical > 0 ? "Demandent une action rapide" : "Aucune alerte grave"}
                            onClick={() => void setTab(null)}
                        />
                        <Kpi index={2} label="À valider" icon={ListChecks} value={counts?.pendingProposals ?? 0} sub="Propositions de l’agent" onClick={() => void setTab(null)} />
                        <Kpi
                            index={3}
                            label="En cours"
                            icon={counts && counts.running > 0 ? Loader2 : AiMark}
                            spin={Boolean(counts && counts.running > 0)}
                            tone={counts && counts.running > 0 ? "accent" : undefined}
                            value={counts?.running ?? 0}
                            sub={counts && counts.queued > 0 ? `${counts.queued} en file d’attente` : "Aucune en attente"}
                            onClick={() => void setTab("activite")}
                        />
                        <Kpi
                            index={4}
                            className="col-span-2 lg:col-span-1"
                            label="Coût du jour"
                            icon={Coins}
                            value={overview?.costTodayEur ?? 0}
                            decimals={2}
                            format={formatEur}
                            sub="Modèles et outils, toutes exécutions"
                        />
                    </>
                )}
            </section>

            {/* Tabs */}
            <Tabs value={tab} onValueChange={(v) => void setTab(v === "a-traiter" ? null : (v as AgentTab))} className="gap-5">
                <div className="-mx-1 overflow-x-auto px-1">
                    <TabsList variant="underline" aria-label="Sections de Captain Agent" className="min-w-full">
                        <TabsTrigger value="a-traiter">
                            À traiter
                            {toHandle > 0 && <CountChip count={toHandle} tone={counts && counts.critical > 0 ? "danger" : "primary"} />}
                        </TabsTrigger>
                        <TabsTrigger value="activite">
                            Activité
                            {liveRuns > 0 && (
                                <span className="inline-flex items-center gap-1">
                                    <LiveDot tone="accent" live />
                                    <CountChip count={liveRuns} tone="accent" />
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="rapports">Rapports</TabsTrigger>
                        <TabsTrigger value="reglages">Réglages</TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="a-traiter" className={TAB_CONTENT}>
                    <Inbox onOpenRun={openRun} />
                </TabsContent>
                <TabsContent value="activite" className={TAB_CONTENT}>
                    <RunsTimeline onOpenRun={openRun} activeRunId={runId} />
                </TabsContent>
                <TabsContent value="rapports" className={TAB_CONTENT}>
                    <ReportsTab onOpenRun={openRun} />
                </TabsContent>
                <TabsContent value="reglages" className={TAB_CONTENT}>
                    <SettingsTab onOpenRun={openRun} />
                </TabsContent>
            </Tabs>

            <RunDetail runId={runId} onClose={() => void setRunId(null)} />
            <DelegateComposer open={composing} onClose={() => setComposing(false)} onLaunched={openRun} />
        </div>
    );
}

function Kpi({
    index,
    label,
    icon: Icon,
    value,
    sub,
    tone,
    spin,
    decimals = 0,
    format,
    className,
    onClick,
}: {
    index: number;
    label: string;
    icon: LucideIcon;
    value: number;
    sub: ReactNode;
    tone?: "danger" | "accent";
    spin?: boolean;
    decimals?: number;
    format?: (n: number) => string;
    className?: string;
    onClick?: () => void;
}) {
    const inner = (
        <>
            <div className="flex items-start justify-between gap-2">
                <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</span>
                <span
                    className={cn(
                        "inline-flex size-7 shrink-0 items-center justify-center rounded-[10px] border",
                        tone === "danger" ? "border-danger-line bg-danger-soft text-danger" : tone === "accent" ? "border-accent-200 bg-accent-soft text-accent-soft-ink" : "border-line bg-surface-2 text-ink-3",
                    )}
                >
                    <Icon className={cn("size-3.5", spin && "motion-safe:animate-spin")} aria-hidden />
                </span>
            </div>
            <CountUp
                value={value}
                decimals={decimals}
                format={format}
                className={cn("mt-2 block text-[28px] leading-none font-semibold tracking-tight", tone === "danger" && value > 0 ? "text-danger" : "text-ink")}
            />
            <p className="mt-2 truncate text-2xs text-ink-3">{sub}</p>
        </>
    );
    return (
        <Card
            className={cn(
                "gap-0 rounded-card px-4 py-4 shadow-card motion-safe:animate-ds-enter sm:px-5",
                onClick && "transition-[border-color,box-shadow,transform] duration-150 ease-snappy hover:border-line-strong hover:shadow-raised",
                className,
            )}
            style={stagger(index)}
        >
            {onClick ? (
                <button type="button" onClick={onClick} className={cn("-m-1 rounded-[14px] p-1 text-left", FOCUS_RING)} aria-label={`${label} : ${value}`}>
                    {inner}
                </button>
            ) : (
                inner
            )}
        </Card>
    );
}

function WorkerStatus({ overview, loading }: { overview: AgentOverview | undefined; loading: boolean }) {
    if (loading) return <Skeleton className="h-5 w-16 rounded-chip" />;
    if (!overview) return null;
    const info = workerStatusInfo(overview.worker);
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Badge variant={TONE_BADGE[info.tone]} tabIndex={0} className="cursor-default gap-1.5" aria-label={`${info.label} : ${info.description}`}>
                    <LiveDot tone={info.tone} live={info.live} />
                    {info.label}
                </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{info.description}</TooltipContent>
        </Tooltip>
    );
}
