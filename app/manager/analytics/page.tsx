"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui";
import { Tabs } from "@/components/ui/Tabs";
import { AiMark } from "@/components/ui/AiMark";
import { SECONDARY_BUTTON, ICON_BUTTON } from "@/components/accueil/AccueilUI";
import { ACTION_RESULT_LABELS } from "@/lib/types";
import type { OutcomeKey } from "@/lib/manager-home/outcomes";
import { formatDay, formatInt, formatRangeLabel } from "@/lib/stats/format";
import { scopeParams, type StatsTab } from "@/lib/stats/period";
import { useFilterOptions, useOverview, useStatsState, useTelephony } from "@/components/stats/hooks";
import { StatsToolbar } from "@/components/stats/StatsToolbar";
import { OverviewTab } from "@/components/stats/OverviewTab";
import { TeamTab } from "@/components/stats/TeamTab";
import { TargetsTab } from "@/components/stats/TargetsTab";
import { JournalTab } from "@/components/stats/JournalTab";
import { AiTab } from "@/components/stats/AiTab";
import { OverviewSkeleton } from "@/components/stats/shared";

// ============================================
// /manager/analytics — Statistiques
//
// One question per tab, headline first:
//   Aperçu      are we producing, and is it moving?  (RDV, funnel, results)
//   Équipe      who, and when?                        (SDR table, hour × day map)
//   Missions    where, and on whom?                   (missions, personas)
//   Journal     the calls behind the numbers
//   Synthèse IA what the notes say
// Every figure comes with its previous period; nothing here is a fixed target
// or a made-up trend. See lib/stats for the definitions.
// ============================================

function StatsPage() {
    const toast = useToast();
    const { state, setState, range } = useStatsState();
    const options = useFilterOptions();
    const overviewQuery = useOverview(state, range);
    const overview = overviewQuery.data;
    const telephony = useTelephony(state, overview);

    const [journalFamilies, setJournalFamilies] = useState<OutcomeKey[]>([]);
    const [exporting, setExporting] = useState(false);

    // Mission-specific status labels (a mission can rename its result codes).
    const [statusLabels, setStatusLabels] = useState<Record<string, string>>(ACTION_RESULT_LABELS);
    const singleMission = state.missionIds.length === 1 ? state.missionIds[0] : null;
    useEffect(() => {
        if (!singleMission) { setStatusLabels(ACTION_RESULT_LABELS); return; }
        let cancelled = false;
        fetch(`/api/config/action-statuses?missionId=${encodeURIComponent(singleMission)}`)
            .then((r) => r.json())
            .then((json) => {
                if (cancelled || !json.success || !json.data?.statuses) return;
                const labels: Record<string, string> = { ...ACTION_RESULT_LABELS };
                for (const s of json.data.statuses as { code: string; label?: string }[]) labels[s.code] = s.label || s.code;
                setStatusLabels(labels);
            })
            .catch(() => { if (!cancelled) setStatusLabels(ACTION_RESULT_LABELS); });
        return () => { cancelled = true; };
    }, [singleMission]);

    // Allo lines cannot be split by mission, client or list.
    const scopedBeyondSdr = state.missionIds.length + state.clientIds.length + state.listIds.length > 0;

    const openFamily = (family: OutcomeKey) => {
        setJournalFamilies([family]);
        setState({ tab: "journal" });
    };

    const exportPdf = async () => {
        setExporting(true);
        // Opened synchronously so the browser allows the PDF preview after the fetch.
        const preview = window.open("about:blank", "_blank");
        try {
            const p = scopeParams(state);
            p.set("from", range.start);
            p.set("to", range.end);
            const res = await fetch(`/api/analytics/report/pdf?${p}`);
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error((j as { error?: string }).error || "Erreur lors de la génération");
            }
            if ((res.headers.get("content-type") || "").includes("application/json")) {
                const j = await res.json();
                if (j.success && j.url) {
                    if (preview) preview.location.href = j.url; else window.open(j.url, "_blank", "noopener,noreferrer");
                    return;
                }
            }
            const url = URL.createObjectURL(await res.blob());
            if (preview) {
                preview.location.href = url;
                window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            } else {
                const a = document.createElement("a");
                a.href = url;
                a.download = `statistiques-${range.start}-${range.end}.pdf`;
                a.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
            }
        } catch (err) {
            preview?.close();
            toast.error("Export impossible", err instanceof Error ? err.message : "Erreur lors de la génération du rapport");
        } finally {
            setExporting(false);
        }
    };

    const tabs = useMemo(
        () => [
            { id: "apercu", label: "Aperçu" },
            { id: "equipe", label: "Équipe", badge: overview ? overview.sdrs.filter((s) => s.current.calls > 0).length : undefined },
            { id: "cibles", label: "Missions et cibles" },
            { id: "journal", label: "Journal", badge: overview ? formatInt(overview.current.calls) : undefined },
            { id: "ia", label: "Synthèse IA", icon: <AiMark className="size-3.5" aria-hidden /> },
        ],
        [overview],
    );

    const label = formatRangeLabel(range.start, range.end);
    const prevLabel = overview ? `${formatDay(overview.range.prevStart)} – ${formatDay(overview.range.prevEnd, true)}` : null;

    return (
        <div className="pb-16">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink-3">Pilotage</p>
                    <h1 className="text-2xl font-bold tracking-tight text-ink">Statistiques</h1>
                    <p className="mt-1 text-[13px] font-medium text-ink-3">
                        <span className="font-bold text-ink-2">{label}</span>
                        {prevLabel && <> · comparé au {prevLabel}</>}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { void overviewQuery.refetch(); }} aria-label="Actualiser" title="Actualiser" className={ICON_BUTTON}>
                        <RefreshCw className={overviewQuery.isFetching ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
                    </button>
                    <button type="button" onClick={exportPdf} disabled={exporting} className={SECONDARY_BUTTON}>
                        {exporting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
                        Exporter en PDF
                    </button>
                </div>
            </div>

            <StatsToolbar state={state} onChange={setState} options={options.data} />

            <div className="mt-4">
                <Tabs tabs={tabs} activeTab={state.tab} onTabChange={(id) => setState({ tab: id as StatsTab })} />
            </div>

            <div className="mt-5" aria-live="polite">
                {overviewQuery.isError && !overview ? (
                    <div className="flex items-start gap-3 rounded-panel border border-danger-line bg-danger-soft p-4 text-danger-ink" role="alert">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <div className="text-[13px]">
                            <p className="font-bold">Impossible de charger les statistiques.</p>
                            <p className="mt-0.5">{overviewQuery.error instanceof Error ? overviewQuery.error.message : "Erreur inconnue."}</p>
                            <button type="button" onClick={() => { void overviewQuery.refetch(); }} className="mt-2 font-bold underline">Réessayer</button>
                        </div>
                    </div>
                ) : !overview ? (
                    <OverviewSkeleton />
                ) : (
                    <div className={overviewQuery.isFetching && overviewQuery.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
                        {state.tab === "apercu" && (
                            <OverviewTab
                                overview={overview}
                                telephony={telephony}
                                scopedBeyondSdr={scopedBeyondSdr}
                                statusLabels={statusLabels}
                                onOpenFamily={openFamily}
                                onTab={(tab) => setState({ tab })}
                            />
                        )}
                        {state.tab === "equipe" && <TeamTab overview={overview} telephony={telephony.current} scoped={scopedBeyondSdr} />}
                        {state.tab === "cibles" && <TargetsTab overview={overview} state={state} range={range} options={options.data} />}
                        {state.tab === "journal" && (
                            <JournalTab
                                overview={overview}
                                state={state}
                                range={range}
                                statusLabels={statusLabels}
                                families={journalFamilies}
                                onFamiliesChange={setJournalFamilies}
                            />
                        )}
                        {state.tab === "ia" && <AiTab state={state} range={range} calls={overview.current.calls} />}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function AnalyticsPage() {
    return (
        <Suspense fallback={<div className="pt-10"><OverviewSkeleton /></div>}>
            <StatsPage />
        </Suspense>
    );
}
