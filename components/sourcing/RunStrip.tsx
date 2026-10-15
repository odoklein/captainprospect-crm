"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOURCE_BY_ID } from "@/lib/sourcing/catalog";
import type { SourceId } from "@/lib/sourcing/types";
import type { SourceRun } from "./useSourcing";

// One pill per source: live counter + elapsed time while running, final
// count when done, the provider's message when it failed.

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
                    return (
                        <div
                            key={id}
                            className={cn(
                                "flex items-center gap-2.5 rounded-panel border bg-surface py-2 pl-3 pr-3.5 shadow-2xs",
                                r.status === "error" ? "border-danger-line" : "border-line",
                            )}
                        >
                            {r.status === "running" && <Loader2 className="size-4 animate-spin text-accent" />}
                            {r.status === "done" && <CheckCircle2 className="size-4 text-success" />}
                            {r.status === "error" && <XCircle className="size-4 text-danger" />}
                            <div className="leading-tight">
                                <div className="text-sm font-semibold text-ink">{meta.label}</div>
                                <div className="text-xs text-ink-3 tabular-nums">
                                    {r.status === "error" ? (
                                        <span className="text-danger-ink">{r.error}</span>
                                    ) : (
                                        <>
                                            {r.found.toLocaleString("fr-FR")} trouvée{r.found > 1 ? "s" : ""}
                                            {id === "gmaps" && r.searches ? ` · ${r.searches} recherche${r.searches > 1 ? "s" : ""}` : ""}
                                            {" · "}
                                            {fmt(elapsed)}
                                        </>
                                    )}
                                </div>
                            </div>
                            {id === "gmaps" && r.status === "running" && (
                                <button
                                    type="button"
                                    onClick={onCancelGmaps}
                                    className="ml-1 rounded-md px-1.5 py-0.5 text-2xs font-medium text-ink-4 hover:bg-surface-3 hover:text-ink-2"
                                    title="Arrête le suivi dans le CRM (le run Apify continue de son côté)"
                                >
                                    Arrêter
                                </button>
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
                        {warnings.map((w) => (
                            <li key={w}>{w}</li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}
