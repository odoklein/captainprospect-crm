"use client";

/**
 * Captain Agent — the home of the background agent: worker status, today's
 * figures, and four tabs in the URL (`?tab=`): « À traiter » (inbox),
 * « Activité » (runs timeline), « Rapports », « Réglages » (scheduled
 * tasks). The open run lives in the URL too (`?run=<id>`), so a run can be
 * linked to and survives a reload.
 *
 * Needs a nuqs adapter above it (app/manager/assistant/agent/page.tsx).
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { ArrowLeft, Coins, Info, Lightbulb, ListChecks, Loader2, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ui/AiMark";
import { Tooltip } from "@/components/ui/Tooltip";
import { FOCUS, IconTile, KpiCard, PRIMARY_BUTTON, SegmentedControl, Shimmer, relativeTime } from "@/components/accueil/AccueilUI";
import type { AgentOverview } from "@/lib/assistant/api-contract";
import { formatEur } from "@/lib/agent/client/format";
import { useAgentOverview } from "@/lib/agent/client/hooks";
import { DelegateComposer } from "./DelegateComposer";
import { Inbox } from "./Inbox";
import { ReportsTab } from "./ReportsTab";
import { RunDetail } from "./RunDetail";
import { RunsTimeline } from "./RunsTimeline";
import { SettingsTab } from "./SettingsTab";
import { Pill, stagger } from "./shared";

const TABS = ["a-traiter", "activite", "rapports", "reglages"] as const;
type AgentTab = (typeof TABS)[number];

export function AgentHome() {
    const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("a-traiter"));
    const [runId, setRunId] = useQueryState("run");
    const [composing, setComposing] = useState(false);
    const { data: overview, isLoading } = useAgentOverview();

    const openRun = useCallback((id: string) => void setRunId(id), [setRunId]);
    const counts = overview?.counts;
    const toHandle = counts ? counts.openFindings + counts.pendingProposals : 0;

    return (
        <div className="w-full space-y-6 pb-12 antialiased">
            {/* Header */}
            <header className="space-y-4 pt-1 motion-safe:animate-ds-enter">
                <Link
                    href="/manager/assistant"
                    className={cn("inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 -ml-1.5 text-xs font-semibold text-ink-3 transition-colors hover:text-ink", FOCUS)}
                >
                    <ArrowLeft className="size-3.5" aria-hidden />
                    Captain AI
                </Link>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-xs">
                            <AiMark className="size-6" aria-hidden />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">Captain Agent</h1>
                                <WorkerStatus overview={overview} loading={isLoading} />
                            </div>
                            <p className="mt-0.5 text-xs font-medium text-ink-3 sm:text-sm">
                                Il surveille, rédige et enquête en arrière-plan. Rien ne s’exécute sans ta validation.
                            </p>
                        </div>
                    </div>
                    <button type="button" className={cn(PRIMARY_BUTTON, "self-start md:self-auto")} onClick={() => setComposing(true)}>
                        <AiMark className="size-4" aria-hidden />
                        Déléguer une mission
                    </button>
                </div>
            </header>

            {overview?.degraded && (
                <p className="flex items-start gap-2 rounded-panel border border-warning-line bg-warning-soft px-4 py-3 text-xs text-warning-ink">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    Les tables de l’agent ne sont pas encore installées sur cette instance : les chiffres restent à zéro tant que la migration n’est pas appliquée.
                </p>
            )}

            {/* KPIs */}
            <section aria-label="Chiffres du jour" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
                {isLoading && !overview
                    ? Array.from({ length: 5 }).map((_, i) => <Shimmer key={i} className={cn("h-[104px] rounded-3xl", i === 4 && "col-span-2 lg:col-span-1")} style={stagger(i)} />)
                    : (
                        <>
                            <KpiCard
                                className="motion-safe:animate-ds-enter"
                                label="Constats ouverts"
                                value={counts?.openFindings ?? 0}
                                sub="À lire et classer"
                                visual={<IconTile icon={Lightbulb} tone="amber" />}
                            />
                            <KpiCard
                                className="motion-safe:animate-ds-enter [animation-delay:30ms]"
                                label="Critiques"
                                value={counts?.critical ?? 0}
                                badge={counts && counts.critical > 0 ? { text: "à voir", tone: "rose" } : undefined}
                                sub={counts && counts.critical > 0 ? "Demandent une action rapide" : "Aucune alerte grave"}
                                visual={<IconTile icon={OctagonAlert} tone={counts && counts.critical > 0 ? "rose" : "slate"} />}
                            />
                            <KpiCard
                                className="motion-safe:animate-ds-enter [animation-delay:60ms]"
                                label="À valider"
                                value={counts?.pendingProposals ?? 0}
                                sub="Propositions de l’agent"
                                visual={<IconTile icon={ListChecks} tone="indigo" />}
                            />
                            <KpiCard
                                className="motion-safe:animate-ds-enter [animation-delay:90ms]"
                                label="En cours"
                                value={counts?.running ?? 0}
                                sub={counts && counts.queued > 0 ? `${counts.queued} en file d’attente` : "Aucune en attente"}
                                visual={
                                    counts && counts.running > 0 ? (
                                        <span className="inline-flex size-8 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-xs">
                                            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
                                        </span>
                                    ) : (
                                        <IconTile icon={AiMark} tone="violet" />
                                    )
                                }
                            />
                            <KpiCard
                                className="col-span-2 motion-safe:animate-ds-enter [animation-delay:120ms] lg:col-span-1"
                                label="Coût du jour"
                                value={<span className="tabular-nums">{formatEur(overview?.costTodayEur ?? 0)}</span>}
                                sub="Modèles et outils, toutes exécutions"
                                visual={<IconTile icon={Coins} tone="teal" />}
                            />
                        </>
                    )}
            </section>

            {/* Tabs */}
            <div className="overflow-x-auto -mx-1 px-1 pb-1">
                <SegmentedControl<AgentTab>
                    ariaLabel="Sections de Captain Agent"
                    value={tab}
                    onChange={(v) => void setTab(v === "a-traiter" ? null : v)}
                    options={[
                        { value: "a-traiter", label: toHandle > 0 ? <TabLabel text="À traiter" count={toHandle} /> : "À traiter" },
                        { value: "activite", label: counts && counts.running + counts.queued > 0 ? <TabLabel text="Activité" count={counts.running + counts.queued} live /> : "Activité" },
                        { value: "rapports", label: "Rapports" },
                        { value: "reglages", label: "Réglages" },
                    ]}
                />
            </div>

            <div key={tab} className="motion-safe:animate-ds-enter" role="region" aria-label={TAB_LABEL[tab]}>
                {tab === "a-traiter" && <Inbox onOpenRun={openRun} />}
                {tab === "activite" && <RunsTimeline onOpenRun={openRun} />}
                {tab === "rapports" && <ReportsTab onOpenRun={openRun} />}
                {tab === "reglages" && <SettingsTab onOpenRun={openRun} />}
            </div>

            <RunDetail runId={runId} onClose={() => void setRunId(null)} />
            <DelegateComposer open={composing} onClose={() => setComposing(false)} onLaunched={openRun} />
        </div>
    );
}

const TAB_LABEL: Record<AgentTab, string> = {
    "a-traiter": "À traiter",
    activite: "Activité",
    rapports: "Rapports",
    reglages: "Réglages",
};

function TabLabel({ text, count, live }: { text: string; count: number; live?: boolean }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            {text}
            <span
                className={cn(
                    "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black tabular-nums",
                    live ? "bg-accent-100 text-accent-700" : "bg-primary-100 text-primary-700",
                )}
            >
                {count}
            </span>
        </span>
    );
}

function WorkerStatus({ overview, loading }: { overview: AgentOverview | undefined; loading: boolean }) {
    if (loading && !overview) return <Shimmer className="h-6 w-20 rounded-full" />;
    if (!overview) return null;
    const { mode, seenAt, enabled } = overview.worker;
    const seen = seenAt ? `Dernier signal ${relativeTime(seenAt)}.` : "";
    if (!enabled || mode === "off") {
        return (
            <Tooltip content={`L’agent ne tourne pas : aucune veille ni mission ne sera lancée. ${seen}`.trim()}>
                <Pill tone="neutral">Arrêté</Pill>
            </Tooltip>
        );
    }
    if (mode === "lite") {
        return (
            <Tooltip
                maxWidth="max-w-sm"
                content={`Mode réduit : le second service (worker) n’est pas déployé. Seules les veilles tournent, toutes les 5 minutes ; les missions et rapports attendent le worker. ${seen}`.trim()}
            >
                <span tabIndex={0} className={cn("rounded-full", FOCUS)} aria-label="Mode réduit : le worker n’est pas déployé, seules les veilles tournent toutes les 5 minutes.">
                    <Pill tone="warning" pulse>
                        Mode réduit
                    </Pill>
                </span>
            </Tooltip>
        );
    }
    return (
        <Tooltip content={`Le worker est en ligne. ${seen}`.trim()}>
            <Pill tone="success" pulse>
                Actif
            </Pill>
        </Tooltip>
    );
}
