"use client";

import { useMemo } from "react";
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
} from "recharts";
import type { ReportData } from "@/lib/reporting/types";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";

function formatDelta(d: number): string {
    const sign = d >= 0 ? "+" : "";
    return `${sign}${d}%`;
}

interface ReportLayoutProps {
    data: ReportData;
    /** Print mode: no max-width, tighter spacing, hide non-essential UI */
    printMode?: boolean;
    className?: string;
}

export function ReportLayout({ data: d, printMode, className }: ReportLayoutProps) {
    const chartData = useMemo(
        () =>
            d.meetingsByPeriod.slice(0, 12).map((p) => ({
                name: p.label,
                count: p.count,
            })),
        [d.meetingsByPeriod]
    );
    const cardDeltas = d.deltas ?? [null, null, null, null];

    return (
        <article
            className={cn(
                "bg-white text-ink antialiased",
                !printMode && "max-w-3xl mx-auto rounded-2xl border border-line shadow-sm overflow-hidden",
                className
            )}
        >
            <div className={cn("px-10", printMode ? "py-8" : "py-12")}>
                {/* Hero */}
                <section className={cn(printMode ? "mb-10" : "mb-14")}>
                    <p className="text-xs font-medium tracking-widest text-ink-3 uppercase mb-2">
                        {d.periodLabel.toUpperCase()}
                    </p>
                    <h1 className="text-2xl md:text-3xl font-bold text-ink tracking-tight mb-1">
                        {d.missionLabel}
                    </h1>
                    <p className="text-sm text-ink-3 mb-8">
                        {d.clientName} · Généré le {d.generatedDate}
                    </p>
                    <div className="relative rounded-2xl bg-inverse px-8 py-10">
                        <div className="relative text-center">
                            <p className="text-5xl md:text-6xl font-bold text-white tabular-nums">
                                {d.meetingsBooked}
                            </p>
                            <p className="text-lg font-medium text-white/80 mt-1">RDV planifiés</p>
                            {d.meetingsDelta != null && (
                                <p className="text-sm mt-2 text-success font-medium">
                                    {formatDelta(d.meetingsDelta)} vs période précédente
                                </p>
                            )}
                        </div>
                    </div>
                </section>

                {/* KPI Grid */}
                <section className={cn(printMode ? "mb-10" : "mb-14")}>
                    <h2 className="text-xs font-semibold tracking-widest text-ink-3 uppercase mb-6">
                        Performance
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: "Contacts", value: d.contactsReached, delta: cardDeltas[0] },
                            { label: "Qualifiés", value: d.qualifiedLeads, delta: cardDeltas[1] },
                            { label: "RDV", value: d.meetingsBooked, delta: cardDeltas[2] },
                            {
                                label: "Conversion",
                                value: `${d.conversionRate}%`,
                                delta: cardDeltas[3],
                            },
                        ].map(({ label, value, delta }) => (
                            <div
                                key={label}
                                className="rounded-xl border border-line bg-white p-5 shadow-sm"
                            >
                                <p className="text-2xl font-bold text-ink tabular-nums">
                                    {value}
                                </p>
                                <p className="text-xs text-ink-3 mt-1">{label}</p>
                                {delta != null && (
                                    <p
                                        className={cn(
                                            "text-xs mt-2 font-medium",
                                            delta >= 0 ? "text-success" : "text-ink-3"
                                        )}
                                    >
                                        {formatDelta(delta)}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Funnel */}
                <section className={cn(printMode ? "mb-10" : "mb-14")}>
                    <h2 className="text-xs font-semibold tracking-widest text-ink-3 uppercase mb-6">
                        Parcours
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-lg bg-surface-3 px-4 py-2">
                            <span className="font-semibold text-ink tabular-nums">
                                {d.contactsReached}
                            </span>{" "}
                            <span className="text-ink-3 text-sm">Contacts</span>
                        </div>
                        <span className="text-ink-4">→</span>
                        <div className="rounded-lg bg-surface-3 px-4 py-2">
                            <span className="font-semibold text-ink tabular-nums">
                                {d.qualifiedLeads}
                            </span>{" "}
                            <span className="text-ink-3 text-sm">Qualifiés</span>
                        </div>
                        <span className="text-ink-4">→</span>
                        <div className="rounded-lg bg-surface-3 px-4 py-2">
                            <span className="font-semibold text-ink tabular-nums">
                                {d.meetingsBooked}
                            </span>{" "}
                            <span className="text-ink-3 text-sm">RDV</span>
                        </div>
                        <span className="text-ink-4">→</span>
                        <div className="rounded-lg bg-surface-3 px-4 py-2">
                            <span className="font-semibold text-ink tabular-nums">
                                {d.opportunities}
                            </span>{" "}
                            <span className="text-ink-3 text-sm">Opportunités</span>
                        </div>
                    </div>
                </section>

                {/* Trend */}
                <section className={cn(printMode ? "mb-10" : "mb-14")}>
                    <h2 className="text-xs font-semibold tracking-widest text-ink-3 uppercase mb-6">
                        Tendance des RDV
                    </h2>
                    <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
                        {chartData.length === 0 ? (
                            <p className="text-sm text-ink-3">Aucun RDV sur la période.</p>
                        ) : (
                            <>
                                <div className="h-[200px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="reportLineGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#7C5CFC" stopOpacity={0.2} />
                                                    <stop offset="100%" stopColor="#7C5CFC" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#E8EBF0" vertical={false} />
                                            <XAxis
                                                dataKey="name"
                                                tick={{ fontSize: 11, fill: "#8B8BA7" }}
                                                axisLine={{ stroke: "#E8EBF0" }}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                tick={{ fontSize: 11, fill: "#8B8BA7" }}
                                                axisLine={false}
                                                tickLine={false}
                                                allowDecimals={false}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    borderRadius: "8px",
                                                    border: "1px solid #E8EBF0",
                                                    fontSize: "12px",
                                                }}
                                                formatter={(value: number) => [value, "RDV"]}
                                                labelFormatter={(label) => `Période ${label}`}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="count"
                                                stroke="#7C5CFC"
                                                strokeWidth={1.5}
                                                fill="url(#reportLineGrad)"
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </>
                        )}
                    </div>
                </section>

                {/* Missions */}
                <section className={cn(printMode ? "mb-8" : "mb-12")}>
                    <h2 className="text-xs font-semibold tracking-widest text-ink-3 uppercase mb-6">
                        Missions
                    </h2>
                    <div className="space-y-3">
                        {d.missions.map((m) => (
                            <div
                                key={m.id}
                                className="rounded-xl border border-line bg-surface-3/50 px-5 py-4"
                            >
                                <div className="flex items-center justify-between">
                                    <p className="font-medium text-ink">{m.name}</p>
                                    <span
                                        className={cn(
                                            "text-xs font-medium",
                                            m.isActive ? "text-success" : "text-ink-3"
                                        )}
                                    >
                                        {m.isActive ? "Actif" : "Inactif"}
                                    </span>
                                </div>
                                <p className="text-xs text-ink-3 mt-1">
                                    {m.sdrCount} SDR · {m.startDate} – {m.endDate}
                                </p>
                                {m.objective && (
                                    <p className="text-xs text-ink-3 mt-2 line-clamp-2">
                                        {m.objective.slice(0, 120)}
                                        {m.objective.length > 120 ? "…" : ""}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Footer */}
                <footer className="pt-8 border-t border-line">
                    <p className="text-xs text-ink-3">{brand.name} · Rapport d&apos;activité</p>
                </footer>
            </div>
        </article>
    );
}
