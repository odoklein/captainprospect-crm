"use client";

/**
 * Draws one VisualSpec. Marks follow the dataviz spec: bars ≤ 24px with a 4px
 * rounded data end, 2px lines, a 2px surface gap between touching fills, areas
 * at 10 %, hairline solid grid, a legend for two or more series, values at the
 * tip only where there is room, text always in ink tokens (never the series
 * colour). Colours are the fixed `--viz-n` slots of `.cp-viz`.
 */

import { memo, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, Minus } from "lucide-react";
import { formatValue, type ValueFormat, type VisualRow, type VisualSpec } from "@/lib/assistant/visuals/spec";
import { cn } from "@/lib/utils";

const slot = (i: number) => `var(--viz-${(i % 8) + 1})`;
const AXIS_TICK = { fill: "var(--ds-ink-3)", fontSize: 11 };
const GRID = "var(--ds-line-subtle)";

/** "2026-10-01" → "1 oct." ; anything else as written. */
export function formatX(value: unknown): string {
    if (typeof value !== "string") return value === null || value === undefined ? "" : String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    }
    return value;
}

// -- Tooltip ------------------------------------------------------------------

interface TipProps {
    active?: boolean;
    payload?: Array<{ dataKey?: string | number; value?: unknown; name?: string }>;
    label?: unknown;
}

function SeriesTip({ active, payload, label, series }: TipProps & { series: Array<{ key: string; label: string; format?: ValueFormat }> }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="cp-viz-tip">
            <div className="mb-1 font-medium">{formatX(label)}</div>
            {payload.map((p, i) => {
                const index = series.findIndex((s) => s.key === p.dataKey);
                const s = series[index];
                return (
                    <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-[var(--ds-ink-2)]">
                            <span className="h-2 w-2 rounded-full" style={{ background: slot(index < 0 ? i : index) }} aria-hidden />
                            {s?.label ?? p.name}
                        </span>
                        <span className="font-semibold tabular-nums">{formatValue(p.value, s?.format ?? "number")}</span>
                    </div>
                );
            })}
        </div>
    );
}

function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
    if (items.length < 2) return null;
    return (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--ds-ink-2)]">
            {items.map((item) => (
                <li key={item.label} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
                    {item.label}
                </li>
            ))}
        </ul>
    );
}

// -- line / area / bar --------------------------------------------------------

function SeriesChart({ spec, height }: { spec: VisualSpec; height: number }) {
    const series = spec.series ?? [];
    const rows = spec.rows ?? [];
    const xKey = spec.x_key ?? "x";
    const horizontal = spec.kind === "bar" && !!spec.horizontal;
    const yFormat = series[0]?.format ?? spec.format ?? "number";
    const dense = rows.length > 12;
    // A value at the bar tip only when it fits: one series, few bars.
    const labelled = spec.kind === "bar" && series.length === 1 && rows.length <= 10;

    const common = { data: rows, margin: { top: 8, right: horizontal ? 36 : 8, bottom: 0, left: 0 } };
    const xAxis = horizontal ? (
        <XAxis type="number" tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={(v) => formatValue(v, yFormat, true)} />
    ) : (
        <XAxis dataKey={xKey} tickLine={false} axisLine={{ stroke: GRID }} tick={AXIS_TICK} tickFormatter={formatX} interval={dense ? "preserveStartEnd" : 0} minTickGap={24} />
    );
    const yAxis = horizontal ? (
        <YAxis type="category" dataKey={xKey} tickLine={false} axisLine={false} tick={AXIS_TICK} width={116} tickFormatter={(v) => String(v).slice(0, 22)} interval={0} />
    ) : (
        <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={44} tickFormatter={(v) => formatValue(v, yFormat, true)} />
    );
    const grid = <CartesianGrid stroke={GRID} vertical={false} horizontal={!horizontal} />;
    const tooltip = <Tooltip content={(p) => <SeriesTip {...(p as unknown as TipProps)} series={series} />} cursor={{ stroke: "var(--ds-line-strong)", strokeWidth: 1 }} isAnimationActive={false} />;

    return (
        <div>
            <Legend items={series.map((s, i) => ({ label: s.label, color: slot(i) }))} />
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    {spec.kind === "line" ? (
                        <LineChart {...common}>
                            {grid}
                            {xAxis}
                            {yAxis}
                            {tooltip}
                            {series.map((s, i) => (
                                <Line
                                    key={s.key}
                                    dataKey={s.key}
                                    stroke={slot(i)}
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    isAnimationActive={false}
                                    connectNulls
                                    dot={(p: { cx?: number; cy?: number; index?: number }) =>
                                        p.index === rows.length - 1 && p.cx !== undefined ? (
                                            <circle key={`end-${s.key}`} cx={p.cx} cy={p.cy} r={4} fill={slot(i)} stroke="var(--ds-surface)" strokeWidth={2} />
                                        ) : (
                                            <g key={`none-${s.key}-${p.index}`} />
                                        )
                                    }
                                    activeDot={{ r: 4, fill: slot(i), stroke: "var(--ds-surface)", strokeWidth: 2 }}
                                />
                            ))}
                        </LineChart>
                    ) : spec.kind === "area" ? (
                        <AreaChart {...common}>
                            {grid}
                            {xAxis}
                            {yAxis}
                            {tooltip}
                            {series.map((s, i) => (
                                <Area
                                    key={s.key}
                                    dataKey={s.key}
                                    stroke={slot(i)}
                                    strokeWidth={2}
                                    fill={slot(i)}
                                    fillOpacity={0.1}
                                    stackId={spec.stacked ? "s" : undefined}
                                    isAnimationActive={false}
                                    connectNulls
                                    dot={false}
                                    activeDot={{ r: 4, fill: slot(i), stroke: "var(--ds-surface)", strokeWidth: 2 }}
                                />
                            ))}
                        </AreaChart>
                    ) : (
                        <BarChart {...common} layout={horizontal ? "vertical" : "horizontal"} barCategoryGap={dense ? "20%" : "30%"}>
                            {grid}
                            {xAxis}
                            {yAxis}
                            {tooltip}
                            {series.map((s, i) => {
                                const last = i === series.length - 1;
                                const radius: [number, number, number, number] | number = spec.stacked && !last ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
                                return (
                                    <Bar
                                        key={s.key}
                                        dataKey={s.key}
                                        fill={slot(i)}
                                        stackId={spec.stacked ? "s" : undefined}
                                        stroke={spec.stacked ? "var(--ds-surface)" : undefined}
                                        strokeWidth={spec.stacked ? 2 : 0}
                                        maxBarSize={24}
                                        radius={radius}
                                        isAnimationActive={false}
                                    >
                                        {labelled && (
                                            <LabelList
                                                dataKey={s.key}
                                                position={horizontal ? "right" : "top"}
                                                fill="var(--ds-ink-2)"
                                                fontSize={11}
                                                formatter={(v: unknown) => formatValue(v, s.format ?? yFormat, true)}
                                            />
                                        )}
                                    </Bar>
                                );
                            })}
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
        </div>
    );
}

// -- donut --------------------------------------------------------------------

function Donut({ spec, height }: { spec: VisualSpec; height: number }) {
    const items = spec.items ?? [];
    const format = spec.format ?? "number";
    const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
    return (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="relative shrink-0" style={{ height: Math.min(height, 220), width: Math.min(height, 220) }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={items} dataKey="value" nameKey="label" innerRadius="64%" outerRadius="94%" paddingAngle={2} stroke="var(--ds-surface)" strokeWidth={2} isAnimationActive={false}>
                            {items.map((item, i) => (
                                <Cell key={item.label} fill={slot(i)} />
                            ))}
                        </Pie>
                        <Tooltip
                            isAnimationActive={false}
                            content={(p) => {
                                const point = (p as unknown as TipProps).payload?.[0] as { name?: string; value?: number } | undefined;
                                if (!(p as unknown as TipProps).active || !point) return null;
                                return (
                                    <div className="cp-viz-tip">
                                        <div className="font-medium">{point.name}</div>
                                        <div className="tabular-nums text-[var(--ds-ink-2)]">
                                            {formatValue(point.value, format)} · {total > 0 ? Math.round(((point.value ?? 0) / total) * 1000) / 10 : 0} %
                                        </div>
                                    </div>
                                );
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[20px] font-semibold tabular-nums text-[var(--ds-ink)]">{formatValue(total, format, true)}</span>
                    <span className="text-[11px] text-[var(--ds-ink-3)]">Total</span>
                </div>
            </div>
            <ul className="min-w-[200px] flex-1 space-y-1.5 text-[13px]">
                {items.map((item, i) => (
                    <li key={item.label} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: slot(i) }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-[var(--ds-ink-2)]">{item.label}</span>
                        <span className="font-medium tabular-nums text-[var(--ds-ink)]">{formatValue(item.value, format)}</span>
                        <span className="w-12 text-right text-[12px] tabular-nums text-[var(--ds-ink-3)]">{total > 0 ? `${Math.round((item.value / total) * 1000) / 10} %` : "—"}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// -- funnel / leaderboard (HTML bars) -----------------------------------------

function Funnel({ spec }: { spec: VisualSpec }) {
    const items = spec.items ?? [];
    const format = spec.format ?? "number";
    const top = Math.max(...items.map((i) => i.value), 1);
    return (
        <ol className="space-y-1.5">
            {items.map((item, i) => {
                const previous = i > 0 ? items[i - 1].value : null;
                const step = previous && previous > 0 ? Math.round((item.value / previous) * 1000) / 10 : null;
                return (
                    <li key={item.label} className="grid grid-cols-[minmax(90px,150px)_1fr_auto] items-center gap-3 text-[13px]">
                        <span className="truncate text-[var(--ds-ink-2)]">{item.label}</span>
                        <span className="block h-6 rounded-[4px] bg-[var(--ds-surface-3)]">
                            <span
                                className="block h-full rounded-[4px]"
                                style={{ width: `${Math.max(1.5, (item.value / top) * 100)}%`, background: `var(--viz-ord-${Math.min(5, i + 1)})` }}
                            />
                        </span>
                        <span className="flex min-w-[96px] items-baseline justify-end gap-2 tabular-nums">
                            <span className="font-semibold text-[var(--ds-ink)]">{formatValue(item.value, format)}</span>
                            <span className="w-12 text-right text-[11.5px] text-[var(--ds-ink-3)]">{step === null ? "" : `${step} %`}</span>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

function Leaderboard({ spec }: { spec: VisualSpec }) {
    const items = spec.items ?? [];
    const format = spec.format ?? "number";
    const top = Math.max(...items.map((i) => i.value), 1);
    return (
        <ol className="space-y-2">
            {items.map((item, i) => (
                <li key={item.label} className="grid grid-cols-[22px_minmax(90px,170px)_1fr_auto] items-center gap-3 text-[13px]">
                    <span className="text-right text-[12px] tabular-nums text-[var(--ds-ink-4)]">{i + 1}</span>
                    <span className="min-w-0">
                        <span className="block truncate text-[var(--ds-ink)]">{item.label}</span>
                        {item.detail && <span className="block truncate text-[11.5px] text-[var(--ds-ink-3)]">{item.detail}</span>}
                    </span>
                    <span className="block h-2 rounded-full bg-[var(--ds-surface-3)]">
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (Math.max(0, item.value) / top) * 100)}%`, background: "var(--viz-1)" }} />
                    </span>
                    <span className="min-w-[56px] text-right font-semibold tabular-nums text-[var(--ds-ink)]">{formatValue(item.value, format)}</span>
                </li>
            ))}
        </ol>
    );
}

// -- heatmap ------------------------------------------------------------------

function Heatmap({ spec }: { spec: VisualSpec }) {
    const cells = spec.cells ?? [];
    const format = spec.format ?? "number";
    const rowLabels = [...new Set(cells.map((c) => c.row))];
    const colLabels = [...new Set(cells.map((c) => c.col))];
    const byKey = new Map(cells.map((c) => [`${c.row}\u0000${c.col}`, c.value]));
    const max = Math.max(...cells.map((c) => c.value), 1);
    return (
        <div className="overflow-x-auto">
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: `56px repeat(${colLabels.length}, minmax(26px, 1fr))` }}>
                <span />
                {colLabels.map((col) => (
                    <span key={col} className="truncate text-center text-[10.5px] text-[var(--ds-ink-3)]">
                        {col}
                    </span>
                ))}
                {rowLabels.map((row) => (
                    <HeatRow key={row} row={row} cols={colLabels} byKey={byKey} max={max} format={format} />
                ))}
            </div>
            <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-[var(--ds-ink-3)]">
                moins
                <span className="h-2 w-24 rounded-full" style={{ background: "linear-gradient(90deg, var(--viz-seq-lo), var(--viz-seq-hi))" }} aria-hidden />
                plus
            </div>
        </div>
    );
}

function HeatRow({ row, cols, byKey, max, format }: { row: string; cols: string[]; byKey: Map<string, number>; max: number; format: ValueFormat }) {
    return (
        <>
            <span className="flex items-center text-[11.5px] text-[var(--ds-ink-3)]">{row}</span>
            {cols.map((col) => {
                const value = byKey.get(`${row}\u0000${col}`);
                const t = value === undefined ? 0 : value / max;
                return (
                    <span
                        key={col}
                        title={`${row} · ${col} : ${formatValue(value, format)}`}
                        className={cn("flex h-7 items-center justify-center rounded-[3px] text-[10px] tabular-nums", t > 0.55 ? "text-white" : "text-[var(--ds-ink-2)]")}
                        style={{ background: value === undefined ? "var(--ds-surface-3)" : `color-mix(in oklab, var(--viz-seq-hi) ${Math.round(t * 100)}%, var(--viz-seq-lo))` }}
                    >
                        {value !== undefined && cols.length <= 14 ? formatValue(value, format, true) : ""}
                    </span>
                );
            })}
        </>
    );
}

// -- kpi_row ------------------------------------------------------------------

function KpiRow({ spec }: { spec: VisualSpec }) {
    const tiles = spec.tiles ?? [];
    return (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${tiles.length > 4 ? 120 : 150}px, 1fr))` }}>
            {tiles.map((tile) => {
                const delta = tile.delta_pct;
                const up = typeof delta === "number" && delta > 0.05;
                const down = typeof delta === "number" && delta < -0.05;
                return (
                    <div key={tile.label} className="rounded-lg border border-[var(--ds-line-subtle)] bg-[var(--ds-surface)] px-3.5 py-3">
                        <div className="truncate text-[12px] text-[var(--ds-ink-3)]">{tile.label}</div>
                        <div className="mt-1 text-[24px] font-semibold leading-none tabular-nums text-[var(--ds-ink)]">{formatValue(tile.value, tile.format ?? spec.format ?? "number", true)}</div>
                        {typeof delta === "number" && (
                            <div className={cn("mt-2 inline-flex items-center gap-1 text-[12px] font-medium tabular-nums", up && "text-[var(--ds-success-ink)]", down && "text-[var(--ds-danger-ink)]", !up && !down && "text-[var(--ds-ink-3)]")}>
                                {up ? <ArrowUpRight className="h-3.5 w-3.5" aria-label="en hausse" /> : down ? <ArrowDownRight className="h-3.5 w-3.5" aria-label="en baisse" /> : <Minus className="h-3.5 w-3.5" aria-label="stable" />}
                                {`${delta > 0 ? "+" : ""}${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(delta)} %`}
                            </div>
                        )}
                        {tile.hint && <div className="mt-1 text-[11.5px] text-[var(--ds-ink-3)]">{tile.hint}</div>}
                    </div>
                );
            })}
        </div>
    );
}

// -- table --------------------------------------------------------------------

function DataGrid({ spec, maxHeight }: { spec: VisualSpec; maxHeight: number }) {
    const columns = spec.columns ?? [];
    const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
    const rows = useMemo(() => {
        const base = spec.rows ?? [];
        if (!sort) return base;
        return [...base].sort((a: VisualRow, b: VisualRow) => {
            const x = a[sort.key];
            const y = b[sort.key];
            if (x === y) return 0;
            if (x === null || x === undefined) return 1;
            if (y === null || y === undefined) return -1;
            return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr")) * sort.dir;
        });
    }, [spec.rows, sort]);
    const numeric = (key: string) => (spec.rows ?? []).every((r) => r[key] === null || r[key] === undefined || typeof r[key] === "number");

    return (
        <div className="overflow-auto rounded-lg border border-[var(--ds-line-subtle)]" style={{ maxHeight }}>
            <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 bg-[var(--ds-surface)]">
                    <tr>
                        {columns.map((c) => {
                            const active = sort?.key === c.key;
                            return (
                                <th key={c.key} scope="col" aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : "none"} className={cn("border-b border-[var(--ds-line)] px-3 py-2 text-[12px] font-medium text-[var(--ds-ink-3)]", numeric(c.key) ? "text-right" : "text-left")}>
                                    <button type="button" onClick={() => setSort(active && sort!.dir === -1 ? null : { key: c.key, dir: active ? -1 : 1 })} className="inline-flex items-center gap-1 hover:text-[var(--ds-ink)]">
                                        {c.label}
                                        {active && (sort!.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                                    </button>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} className="border-b border-[var(--ds-line-subtle)] last:border-0">
                            {columns.map((c) => (
                                <td key={c.key} className={cn("px-3 py-1.5", numeric(c.key) ? "text-right font-medium tabular-nums text-[var(--ds-ink)]" : "text-left text-[var(--ds-ink-2)]")}>
                                    {formatValue(row[c.key], c.format ?? (typeof row[c.key] === "number" ? "number" : "text"))}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// -- entry --------------------------------------------------------------------

function VisualViewBase({ spec, large = false }: { spec: VisualSpec; large?: boolean }) {
    const height = large ? 420 : 240;
    switch (spec.kind) {
        case "kpi_row":
            return <KpiRow spec={spec} />;
        case "line":
        case "area":
        case "bar":
            return <SeriesChart spec={spec} height={spec.kind === "bar" && spec.horizontal ? Math.max(height, (spec.rows?.length ?? 0) * 34 + 24) : height} />;
        case "donut":
            return <Donut spec={spec} height={height} />;
        case "funnel":
            return <Funnel spec={spec} />;
        case "leaderboard":
            return <Leaderboard spec={spec} />;
        case "heatmap":
            return <Heatmap spec={spec} />;
        case "table":
            return <DataGrid spec={spec} maxHeight={large ? 560 : 300} />;
    }
}

export const VisualView = memo(VisualViewBase);
