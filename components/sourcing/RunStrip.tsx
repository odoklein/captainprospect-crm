"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleStop, Loader2, XCircle } from "lucide-react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/utils";
import { SOURCE_BY_ID } from "@/lib/sourcing/catalog";
import type { SourceId } from "@/lib/sourcing/types";
import type { SourceRun } from "./useSourcing";

// One card per source: live counter + elapsed time while running, final
// count when done, the provider's message when it failed. A streamed Maps
// run also shows its tiles done / queued and the credits spent so far.

function useNow(active: boolean) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [active]);
    return now;
}

const fmt = (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const n = (x: number) => x.toLocaleString("fr-FR");

export function RunStrip({
    runs,
    onCancelGmaps,
}: {
    runs: Partial<Record<SourceId, SourceRun>>;
    onCancelGmaps: () => void;
}) {
    const entries = (Object.entries(runs) as [SourceId, SourceRun][]).filter(([, r]) => r);
    const running = entries.some(([, r]) => r.status === "running");
    const now = useNow(running);
    const warnings = entries.flatMap(([id, r]) => (r.warnings ?? []).map((w) => `${SOURCE_BY_ID[id].short} — ${w}`));

    if (entries.length === 0) return null;

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {entries.map(([id, r]) => {
                    const meta = SOURCE_BY_ID[id];
                    const elapsed = (r.finishedAt ?? now) - r.startedAt;
                    const streamed = id === "gmaps" && !!r.progress;
                    const canStop = id === "gmaps" && r.status === "running";
                    return (
                        <div
                            key={id}
                            className={cn(
                                "flex min-w-[220px] flex-col gap-2 rounded-panel border bg-surface py-2 pl-3 pr-3 shadow-2xs",
                                streamed && "flex-1 basis-[340px]",
                                r.status === "error" ? "border-danger-line" : "border-line",
                            )}
                        >
                            <div className="flex items-center gap-2.5">
                                {r.status === "running" && <Loader2 className="size-4 shrink-0 animate-spin text-accent" />}
                                {r.status === "done" && !r.stopped && !r.budgetHit && <CheckCircle2 className="size-4 shrink-0 text-success" />}
                                {r.status === "done" && (r.stopped || r.budgetHit) && <CircleStop className="size-4 shrink-0 text-warning" />}
                                {r.status === "error" && <XCircle className="size-4 shrink-0 text-danger" />}
                                <div className="min-w-0 flex-1 leading-tight">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-sm font-semibold text-ink">{meta.label}</span>
                                        {r.plan && r.plan.depth !== "standard" && (
                                            <span className="rounded bg-primary-50 px-1.5 text-2xs font-semibold text-primary-700">
                                                {r.plan.depth === "max" ? "Exhaustif" : "Approfondi"}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-ink-3 tabular-nums">
                                        {r.status === "error" ? (
                                            <span className="text-danger-ink">{r.error}</span>
                                        ) : (
                                            <>
                                                {n(r.found)} trouvée{r.found > 1 ? "s" : ""}
                                                {!streamed && id === "gmaps" && r.searches ? ` · ${r.searches} recherche${r.searches > 1 ? "s" : ""}` : ""}
                                                {r.credits ? ` · ${n(r.credits)} crédits` : ""}
                                                {" · "}
                                                {fmt(elapsed)}
                                            </>
                                        )}
                                    </div>
                                </div>
                                {canStop && (
                                    <button
                                        type="button"
                                        onClick={onCancelGmaps}
                                        className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-medium text-ink-3 hover:bg-surface-3 hover:text-ink"
                                        title={
                                            streamed
                                                ? "Arrête la recherche : plus aucun crédit n'est dépensé, les résultats déjà trouvés restent"
                                                : "Arrête le suivi dans le CRM (le run Apify continue de son côté)"
                                        }
                                    >
                                        <CircleStop className="size-3.5" /> Arrêter
                                    </button>
                                )}
                            </div>
                            {streamed && r.progress && (
                                <div className="space-y-1">
                                    <ProgressBar
                                        value={r.status === "running" ? r.progress.done : r.progress.total}
                                        max={Math.max(1, r.progress.total)}
                                        height="sm"
                                        variant={r.status === "running" ? "shimmer" : "default"}
                                        tone={r.status === "running" ? "accent" : r.stopped || r.budgetHit ? "warning" : "success"}
                                    />
                                    <div className="flex flex-wrap justify-between gap-x-3 text-2xs text-ink-4 tabular-nums">
                                        <span>
                                            {n(r.progress.done)} / {n(r.progress.total)} recherches
                                            {r.status === "running" && r.progress.total > (r.plan?.searches ?? 0) && " (carreaux pleins redécoupés)"}
                                        </span>
                                        {r.status !== "running" && r.stopped && <span className="text-warning-ink">Arrêtée, résultats conservés</span>}
                                        {r.status !== "running" && r.budgetHit && <span className="text-warning-ink">Plafond de crédits atteint</span>}
                                        {!!r.outside && <span>{n(r.outside)} hors zone écartées</span>}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {warnings.length > 0 && (
                <details className="rounded-panel border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning-ink">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium">
                        <AlertTriangle className="size-3.5" />
                        {warnings.length} recherche{warnings.length > 1 ? "s" : ""} sans résultat exploitable
                    </summary>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                        {warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}
