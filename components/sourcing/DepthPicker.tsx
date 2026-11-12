"use client";

import { useEffect, useState } from "react";
import { Layers, Loader2, Map as MapIcon, Radar } from "lucide-react";
import { SegmentedControl } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";
import type { SourcingDepth, SourcingPlan, SourcingQuery } from "@/lib/sourcing/types";

// ============================================
// How hard Google Maps digs: three depths, a credit ceiling, and the plan the
// server would run (zones → communes → map tiles) before anything is spent.
// ============================================

export const DEPTHS: { id: SourcingDepth; label: string; icon: typeof MapIcon; text: string }[] = [
    { id: "standard", label: "Rapide", icon: MapIcon, text: "Une recherche par zone, comme sur Google Maps. ~60 à 120 sociétés par zone." },
    { id: "deep", label: "Approfondi", icon: Layers, text: "La zone est découpée en communes puis en carreaux de carte ; un carreau plein est redécoupé." },
    { id: "max", label: "Exhaustif", icon: Radar, text: "Carreaux plus fins, plus de communes, redécoupe jusqu'à épuisement ou plafond atteint." },
];

export const BUDGETS = [300, 1500, 6000, 15000];
export const DEFAULT_BUDGET: Record<SourcingDepth, number | undefined> = { standard: undefined, deep: 1500, max: 6000 };

const fmt = (n: number) => n.toLocaleString("fr-FR");

/** Debounced POST /plan: the composer shows the real cut before the run. */
export function usePlan(query: SourcingQuery, enabled: boolean) {
    const [plan, setPlan] = useState<SourcingPlan | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const key = JSON.stringify([query.activities, query.locations, query.depth, query.creditBudget, query.perSearch]);

    useEffect(() => {
        if (!enabled || query.activities.length === 0 || query.locations.length === 0) {
            setPlan(null);
            setLoading(false);
            setError(null);
            return;
        }
        const ctrl = new AbortController();
        setLoading(true);
        setPlan(null);
        setError(null);
        const t = setTimeout(() => {
            fetch("/api/prospects/sourcing/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(query),
                signal: ctrl.signal,
            })
                .then(async (r) => {
                    const j = await r.json();
                    if (!r.ok || !j.success) throw new Error(j.error || "Estimation indisponible");
                    if (!ctrl.signal.aborted) setPlan(j.data);
                })
                .catch(() => {
                    if (!ctrl.signal.aborted) setError("Estimation indisponible. Réessayez en modifiant la zone.");
                })
                .finally(() => !ctrl.signal.aborted && setLoading(false));
        }, 450);
        return () => {
            clearTimeout(t);
            ctrl.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers the query fields the plan reads
    }, [key, enabled]);

    return { plan, loading, error };
}

export function DepthPicker({
    depth,
    budget,
    serper,
    onChange,
}: {
    depth: SourcingDepth;
    budget?: number;
    /** Deep modes need the Serper engine (viewport searches). */
    serper: boolean;
    onChange: (patch: Partial<SourcingQuery>) => void;
}) {
    const active = DEPTHS.find((d) => d.id === depth) ?? DEPTHS[0];
    return (
        <div className="space-y-3">
            <div role="radiogroup" aria-label="Profondeur" className="grid grid-cols-3 gap-1.5">
                {DEPTHS.map((d) => {
                    const on = d.id === depth;
                    const disabled = d.id !== "standard" && !serper;
                    return (
                        <button
                            key={d.id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={disabled}
                            onClick={() => onChange({ depth: d.id, creditBudget: DEFAULT_BUDGET[d.id] })}
                            className={cn(
                                "flex flex-col items-center gap-1 rounded-panel border px-2 py-2.5 text-xs font-semibold transition-[border-color,background-color]",
                                FOCUS_RING,
                                on ? "border-primary-300 bg-primary-50/70 text-primary-800 shadow-2xs" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                                disabled && "cursor-not-allowed opacity-50 hover:border-line",
                            )}
                        >
                            <d.icon className={cn("size-4", on ? "text-primary-600" : "text-ink-4")} />
                            {d.label}
                        </button>
                    );
                })}
            </div>
            <p className="text-xs leading-relaxed text-ink-3">
                {serper ? active.text : "Le découpage en carreaux demande le moteur Serper (SERPER_API_KEY)."}
            </p>
            {depth !== "standard" && serper && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-ink-2">Plafond de crédits</span>
                    <SegmentedControl
                        size="sm"
                        ariaLabel="Plafond de crédits Serper"
                        value={String(budget ?? DEFAULT_BUDGET[depth])}
                        onChange={(v) => onChange({ creditBudget: Number(v) })}
                        options={[...new Set([...BUDGETS, budget ?? DEFAULT_BUDGET[depth]!])].sort((a, b) => a - b).map((b) => ({ value: String(b), label: b >= 1000 ? `${b / 1000}k` : String(b) }))}
                    />
                </div>
            )}
        </div>
    );
}

/** Footer estimate: what the run will search and what it may cost. */
export function PlanSummary({ plan, loading }: { plan: SourcingPlan | null; loading: boolean }) {
    if (!plan) return loading ? <PlanLoading /> : null;
    const deep = plan.depth !== "standard";
    return (
        <div className={cn("mt-2 rounded-lg border border-line bg-surface px-3 py-2 transition-opacity", loading && "opacity-60")}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-ink-2">Google Maps</span>
                <span className="tabular-nums text-ink-3">
                    {plan.minCredits === plan.maxCredits ? fmt(plan.maxCredits) : `${fmt(plan.minCredits)} – ${fmt(plan.maxCredits)}`} crédits
                </span>
            </div>
            <ul className="mt-1.5 space-y-0.5">
                {plan.zones.slice(0, 5).map((z) => (
                    <li key={z.zone} className="flex items-baseline justify-between gap-2 text-2xs text-ink-3">
                        <span className="truncate">{z.zone}</span>
                        <span className="shrink-0 tabular-nums text-ink-4">
                            {deep
                                ? `${z.seeds > 1 ? `${fmt(z.seeds)} secteurs · ` : ""}${fmt(z.tiles)} carreau${z.tiles > 1 ? "x" : ""}`
                                : "1 recherche"}
                        </span>
                    </li>
                ))}
                {plan.zones.length > 5 && <li className="text-2xs text-ink-4">+ {plan.zones.length - 5} zones</li>}
            </ul>
            {plan.zones.some((z) => z.note) && (
                <p className="mt-1 text-2xs text-warning-ink">{plan.zones.find((z) => z.note)!.note}</p>
            )}
            {deep && plan.budget && plan.maxCredits >= plan.budget && (
                <p className="mt-1 text-2xs text-ink-4">
                    La recherche peut atteindre le plafond de {fmt(plan.budget)} crédits. Les zones et activités sont explorées à tour de rôle.
                </p>
            )}
        </div>
    );
}

function PlanLoading() {
    return (
        <div className="mt-2 flex items-center gap-1.5 text-2xs text-ink-4">
            <Loader2 className="size-3 animate-spin" /> Calcul du découpage…
        </div>
    );
}
