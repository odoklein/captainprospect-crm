"use client";

import { ArrowDownToLine, CheckCircle2, Layers } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { SourcingDepth, SourcingQuery } from "@/lib/sourcing/types";
import type { SourceRun } from "./useSourcing";
import { DEFAULT_BUDGET } from "./DepthPicker";

// ============================================
// After a Maps run: per zone, how many searches, how many places, and
// whether Maps ran dry or still had full tiles. "Creuser plus" re-runs Maps
// one depth further and folds the new places into the current results.
// ============================================

const NEXT: Record<SourcingDepth, SourcingDepth | null> = { standard: "deep", deep: "max", max: null };
const LABEL: Record<SourcingDepth, string> = { standard: "Rapide", deep: "Approfondi", max: "Exhaustif" };
const n = (x: number) => x.toLocaleString("fr-FR");

export function CoveragePanel({
    run,
    isRunning,
    onDigDeeper,
}: {
    run?: SourceRun;
    isRunning: boolean;
    onDigDeeper: (patch: Partial<SourcingQuery>) => void;
}) {
    if (!run || run.status !== "done" || !run.coverage?.length || !run.plan) return null;
    const depth = run.plan.depth;
    const coverage = run.coverage;
    const full = coverage.reduce((sum, z) => sum + z.saturated, 0);
    const max = Math.max(...coverage.map((z) => z.found), 1);
    const next = NEXT[depth];
    const moreToFind = full > 0 || run.budgetHit || run.stopped;
    const budget = run.plan.budget;

    return (
        <section className="rounded-card border border-line bg-surface shadow-card">
            <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-ink">Couverture Google Maps</h3>
                    <p className="text-xs text-ink-3">
                        {moreToFind ? (
                            <>
                                {full > 0 && (
                                    <>
                                        {n(full)} carreau{full > 1 ? "x" : ""} encore plein{full > 1 ? "s" : ""} : Maps en a d&apos;autres.{" "}
                                    </>
                                )}
                                {run.budgetHit && <>Plafond de {n(budget ?? 0)} crédits atteint avant la fin. </>}
                                {run.stopped && <>Recherche arrêtée avant la fin. </>}
                            </>
                        ) : (
                            <>Exploration terminée en mode {LABEL[depth]}. Les résultats Maps ne garantissent pas une couverture exhaustive.</>
                        )}
                    </p>
                </div>
                {moreToFind && (
                    <div className="flex flex-wrap gap-2">
                        {(run.budgetHit || run.stopped) && budget && (
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={isRunning}
                                onClick={() => onDigDeeper({ depth, creditBudget: Math.min(30000, budget * 2) })}
                                title="Relance la même profondeur avec un plafond doublé ; les sociétés déjà trouvées restent et ne sont pas dupliquées"
                            >
                                <ArrowDownToLine className="size-4" /> Plafond ×2
                            </Button>
                        )}
                        {next && (
                            <Button
                                variant="accent"
                                size="sm"
                                disabled={isRunning}
                                onClick={() => onDigDeeper({ depth: next, creditBudget: DEFAULT_BUDGET[next] })}
                                title="Relance Google Maps plus finement ; les nouvelles sociétés s'ajoutent aux résultats actuels"
                            >
                                <Layers className="size-4" /> Creuser plus · {LABEL[next]}
                            </Button>
                        )}
                    </div>
                )}
            </header>
            <ul className="divide-y divide-line-subtle">
                {coverage.map((z) => {
                    const dry = z.saturated === 0 && z.skipped === 0 && !run.stopped;
                    return (
                        <li key={z.zone} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
                            <span className="truncate text-sm font-medium text-ink">{z.zone}</span>
                            <div className="order-3 col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-3 sm:order-none sm:col-span-1">
                                <div className={cn("h-full rounded-full", dry ? "bg-success" : "bg-warning")} style={{ width: `${(z.found / max) * 100}%` }} />
                            </div>
                            <span className="flex items-center gap-2 text-xs tabular-nums text-ink-3">
                                <span className="font-semibold text-ink">{n(z.found)}</span>
                                <span className="text-ink-4">
                                    {n(z.searches)} rech.{z.splits ? ` · ${n(z.splits)} redécoupés` : ""}
                                </span>
                                {dry ? (
                                    <span className="inline-flex items-center gap-1 text-success-ink">
                                        <CheckCircle2 className="size-3.5" /> explorée
                                    </span>
                                ) : z.saturated > 0 ? (
                                    <span className="text-warning-ink">{n(z.saturated)} plein{z.saturated > 1 ? "s" : ""}</span>
                                ) : (
                                    <span className="text-warning-ink">incomplète</span>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
