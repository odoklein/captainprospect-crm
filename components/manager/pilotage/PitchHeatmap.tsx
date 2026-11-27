"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { HeatCell, Heatmap, HeatTone } from "@/lib/manager-pilotage/patterns";
import { hourLabel, num, pct, points } from "./format";

// « Où le pitch passe, où il casse ». Diverging scale on the data-viz palette
// (.cp-viz): blue above the team's positive share, orange where refusals
// dominate, grey near the average. Never red. Hatched: under 20 joints.

export type HeatMode = "sdr" | "mission";

const HATCH = "repeating-linear-gradient(45deg, var(--ds-line-strong) 0 1.5px, var(--ds-surface-2) 1.5px 6px)";

const TONE: Record<HeatTone, { bg: string; ink: string }> = {
    low: { bg: HATCH, ink: "var(--ds-ink-3)" },
    neutral: { bg: "var(--ds-surface-3)", ink: "var(--ds-ink-2)" },
    pos1: { bg: "var(--viz-seq-lo)", ink: "var(--ds-ink)" },
    pos2: { bg: "var(--viz-ord-2)", ink: "var(--ds-ink)" },
    pos3: { bg: "var(--viz-ord-5)", ink: "#ffffff" },
    neg1: { bg: "color-mix(in oklab, var(--viz-2) 26%, var(--ds-surface))", ink: "var(--ds-ink)" },
    neg2: { bg: "color-mix(in oklab, var(--viz-2) 58%, var(--ds-surface))", ink: "var(--ds-ink)" },
    neg3: { bg: "var(--viz-2)", ink: "var(--ds-ink)" },
};

const RAMP: HeatTone[] = ["neg3", "neg2", "neg1", "neutral", "pos1", "pos2", "pos3"];

interface Tip {
    row: string;
    cell: HeatCell;
    x: number;
    y: number;
}

export function PitchHeatmap({ data, mode, onMode, windowDays }: { data: Record<HeatMode, Heatmap>; mode: HeatMode; onMode: (m: HeatMode) => void; windowDays: number }) {
    const map = data[mode];
    const [tip, setTip] = useState<Tip | null>(null);

    const show = (row: string, cell: HeatCell, el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        setTip({ row, cell, x: r.left + r.width / 2, y: r.top });
    };

    return (
        <section aria-label="Où le pitch passe, où il casse" className="cp-viz flex flex-col gap-3 rounded-panel border border-line bg-surface px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-[72ch]">
                    <h2 className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink">Où le pitch passe, où il casse</h2>
                    <p className="mt-1 text-[12.5px] text-ink-3">
                        Personnes jointes par créneau, {windowDays} derniers jours ouvrés. Bleu : plus de RDV et d’intéressés que la moyenne de l’équipe. Orange : les refus
                        dominent. Hachuré : moins de 20 joints, pas de verdict. Le chiffre compte les RDV, à partir de 3.
                    </p>
                </div>
                <div role="group" aria-label="Lignes de la carte" className="inline-flex rounded-control border border-line bg-surface-2 p-[3px]">
                    {(
                        [
                            ["sdr", "Par SDR", "1"],
                            ["mission", "Par mission", "2"],
                        ] as const
                    ).map(([id, label, key]) => (
                        <button
                            key={id}
                            type="button"
                            aria-pressed={mode === id}
                            onClick={() => onMode(id)}
                            title={`${label} (${key})`}
                            className={cn(
                                "rounded-[9px] px-3 py-1 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                                mode === id ? "bg-primary text-primary-fg" : "text-ink-2 hover:text-ink",
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-2 text-[12.5px]">
                {map.best && (
                    <span className="rounded-md bg-info-soft px-2.5 py-1 text-info-ink">
                        <b>Meilleur créneau</b> · {hourLabel(map.best.hour)} ({points(map.best.delta)})
                    </span>
                )}
                {map.worst && (
                    <span className="rounded-md px-2.5 py-1 text-ink" style={{ background: "color-mix(in oklab, var(--viz-2) 18%, var(--ds-surface))" }}>
                        <b>Pire créneau</b> · {hourLabel(map.worst.hour)} ({points(map.worst.delta)})
                    </span>
                )}
                <span className="rounded-md bg-surface-2 px-2.5 py-1 text-ink-2">
                    Moyenne équipe · {pct(map.average)} de positif · {pct(map.refusalAverage)} de refus
                </span>
            </div>

            {map.rows.length ? (
                <div className="overflow-x-auto" onScroll={() => setTip(null)}>
                    <div className="grid min-w-[680px] gap-[3px]" style={{ gridTemplateColumns: `minmax(120px, 170px) repeat(${map.hours.length}, minmax(52px, 1fr))` }}>
                        <span />
                        {map.hours.map((h) => (
                            <span key={h} className="pb-1 text-center font-mono text-[11.5px] text-ink-3">
                                {hourLabel(h)}
                            </span>
                        ))}
                        {map.rows.map((row) => (
                            <Row key={row.id} label={row.label} cells={row.cells} onShow={show} onHide={() => setTip(null)} />
                        ))}
                    </div>
                </div>
            ) : (
                <p className="py-6 text-center text-[13px] text-ink-3">Aucun appel joint sur la fenêtre : la carte se remplira avec les premiers appels.</p>
            )}

            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[12px] text-ink-3">
                <span>Refus dominent</span>
                <span className="inline-flex gap-0.5" aria-hidden>
                    {RAMP.map((t) => (
                        <span key={t} className="h-2.5 w-[22px] rounded-sm" style={{ background: TONE[t].bg }} />
                    ))}
                </span>
                <span>Plus de positif que l’équipe</span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-3.5 rounded-sm border border-line" style={{ background: HATCH }} aria-hidden />
                    moins de 20 joints
                </span>
            </div>

            {tip && <CellTip tip={tip} average={map.average} />}
        </section>
    );
}

function Row({ label, cells, onShow, onHide }: { label: string; cells: HeatCell[]; onShow: (row: string, c: HeatCell, el: HTMLElement) => void; onHide: () => void }) {
    return (
        <>
            <span className="flex min-w-0 items-center pr-2 text-[13px] font-semibold text-ink">
                <span className="truncate" title={label}>
                    {label}
                </span>
            </span>
            {cells.map((c) => {
                const tone = TONE[c.tone];
                const style: CSSProperties = { background: tone.bg, color: tone.ink };
                return (
                    <span
                        key={c.hour}
                        tabIndex={0}
                        role="img"
                        aria-label={cellSummary(label, c)}
                        onMouseEnter={(e) => onShow(label, c, e.currentTarget)}
                        onMouseLeave={onHide}
                        onFocus={(e) => onShow(label, c, e.currentTarget)}
                        onBlur={onHide}
                        className="grid h-10 place-items-center rounded-md font-mono text-[12px] font-medium outline-offset-[-1px] hover:outline hover:outline-2 hover:outline-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                        style={style}
                    >
                        {c.label}
                    </span>
                );
            })}
        </>
    );
}

function cellSummary(row: string, c: HeatCell): string {
    return `${row}, ${hourLabel(c.hour)} : ${c.reached} joints, ${c.meetings} RDV, ${c.interested} intéressés, ${c.refusals} refus.`;
}

function CellTip({ tip, average }: { tip: Tip; average: number | null }) {
    const c = tip.cell;
    return (
        <div
            role="tooltip"
            className="cp-viz-tip pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full"
            style={{ left: tip.x, top: tip.y - 8 }}
        >
            <p className="font-semibold">
                {tip.row} · {hourLabel(c.hour)}–{hourLabel(c.hour + 1)}
            </p>
            <p className="tabular-nums text-ink-2">
                {num(c.reached)} joints · {num(c.meetings)} RDV · {num(c.interested)} intéressés · {num(c.refusals)} refus
            </p>
            <p className="text-ink-3">
                {c.delta === null
                    ? "Moins de 20 joints : pas de verdict."
                    : `Positif ${pct(c.share)} (équipe ${pct(average)}), ${points(c.delta)}`}
            </p>
        </div>
    );
}
