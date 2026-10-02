"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart3, Phone, CalendarCheck, TrendingUp, Sparkles, Building2, Users, Briefcase, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    BADGE, CARD, EmptyBlock, FOCUS, IconTile, ROW, SectionHeader, SegmentedControl, Shimmer, StatTile, formatInt,
} from "@/components/accueil/AccueilUI";

type BreakdownItem = {
    label: string;
    calls: number;
    rdv: number;
    rate: number;
};

export type BreakdownData = {
    totalCalls: number;
    totalRdv: number;
    byIndustry: BreakdownItem[];
    bySize: BreakdownItem[];
    byFunction: BreakdownItem[];
};

type Dimension = "byFunction" | "byIndustry" | "bySize";
export type BreakdownPeriod = "month" | "quarter" | "all";

const DIMENSIONS: { key: Dimension; label: string; icon: LucideIcon }[] = [
    { key: "byFunction", label: "Fonction", icon: Briefcase },
    { key: "byIndustry", label: "Secteur", icon: Building2 },
    { key: "bySize", label: "Taille d'entreprise", icon: Users },
];

const PERIODS: { value: BreakdownPeriod; label: string }[] = [
    { value: "month", label: "Ce mois" },
    { value: "quarter", label: "3 mois" },
    { value: "all", label: "Tout" },
];

/** Bar colours — emphasis form: RDV in emerald, the rest of the calls recede in slate. */
const RDV_FILL = "bg-emerald-500";
const CALLS_FILL = "bg-slate-300";

function getPeriodParams(period: BreakdownPeriod): Record<string, string> {
    const now = new Date();
    if (period === "all") return {};
    if (period === "month") {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return {
            startDate: start.toISOString().split("T")[0],
            endDate: end.toISOString().split("T")[0],
        };
    }
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return {
        startDate: start.toISOString().split("T")[0],
        endDate: now.toISOString().split("T")[0],
    };
}

function RateChip({ rate }: { rate: number }) {
    const tone = rate >= 15 ? BADGE.emerald : rate >= 8 ? BADGE.amber : BADGE.slate;
    return (
        <span className={cn("inline-flex text-[10px] font-extrabold px-2 py-0.5 rounded-full tabular-nums", tone)}>
            {rate.toLocaleString("fr-FR")} %
        </span>
    );
}

function SkeletonRows() {
    return (
        <div className="space-y-2" aria-hidden>
            {[85, 65, 50, 38, 25].map((w) => (
                <div key={w} className="flex items-center gap-3 px-3 py-2">
                    <Shimmer className="w-24 h-3 rounded-full" />
                    <div className="flex-1">
                        <Shimmer className="h-7 rounded-lg" style={{ width: `${w}%` }} />
                    </div>
                    <Shimmer className="w-16 h-6 rounded-lg" />
                </div>
            ))}
        </div>
    );
}

/** Pure view — BreakdownCharts below fetches and feeds it. */
export function BreakdownChartsView({
    data,
    isLoading,
    period,
    onPeriodChange,
}: {
    data: BreakdownData | null;
    isLoading: boolean;
    period: BreakdownPeriod;
    onPeriodChange: (p: BreakdownPeriod) => void;
}) {
    const [dimension, setDimension] = useState<Dimension>("byFunction");

    const items = data?.[dimension] ?? [];
    const maxCalls = Math.max(...items.map((i) => i.calls), 1);

    const globalRate =
        data && data.totalCalls > 0
            ? Math.round((data.totalRdv / data.totalCalls) * 1000) / 10
            : 0;

    const bestSegment = [...items]
        .filter((i) => i.calls >= 3)
        .sort((a, b) => b.rate - a.rate)[0];

    const placeholder = <Shimmer className="inline-block w-12 h-5 rounded-md align-middle" />;

    return (
        <section className={cn(CARD, "p-6 space-y-5 min-w-0")}>
            <SectionHeader
                icon={BarChart3}
                tone="violet"
                title="Analyse de la prospection"
                subtitle="Appels & RDV par segment"
                right={<SegmentedControl ariaLabel="Période de l'analyse" options={PERIODS} value={period} onChange={onPeriodChange} />}
            />

            {/* ── KPI summary row ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatTile label={<><Phone className="w-3 h-3" aria-hidden /> Appels passés</>}>
                    {data ? formatInt(data.totalCalls) : placeholder}
                </StatTile>
                <StatTile label={<><CalendarCheck className="w-3 h-3" aria-hidden /> RDV décrochés</>}>
                    {data ? <span className="text-emerald-600">{formatInt(data.totalRdv)}</span> : placeholder}
                </StatTile>
                <StatTile label={<><TrendingUp className="w-3 h-3" aria-hidden /> Taux de conversion</>}>
                    {data ? `${globalRate.toLocaleString("fr-FR")} %` : placeholder}
                </StatTile>
            </div>

            {/* ── Dimension pills (battlecard pills of the SDR page) ── */}
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Analyser par">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mr-1.5">Analyser par</span>
                {DIMENSIONS.map(({ key, label, icon: Icon }) => {
                    const active = dimension === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setDimension(key)}
                            className={cn(
                                "inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border text-xs font-bold shadow-2xs transition-colors",
                                FOCUS,
                                active
                                    ? "bg-zinc-950 text-white border-zinc-950"
                                    : "bg-slate-50 text-zinc-700 border-slate-200 hover:bg-slate-100",
                            )}
                        >
                            <Icon className={cn("w-3.5 h-3.5", active ? "text-emerald-400" : "text-zinc-400")} aria-hidden />
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* ── Chart ── */}
            {isLoading ? (
                <SkeletonRows />
            ) : items.length === 0 ? (
                <EmptyBlock
                    icon={BarChart3}
                    tone="slate"
                    title="Aucune donnée disponible"
                    hint="Les données de prospection apparaîtront ici une fois les appels enregistrés."
                />
            ) : (
                <div>
                    {/* Legend — two series, so it is always shown */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-2 px-3 text-[11px] font-semibold text-zinc-500">
                        <span className="flex items-center gap-1.5">
                            <span className={cn("w-3 h-2.5 rounded-[3px]", RDV_FILL)} aria-hidden />
                            RDV décrochés
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className={cn("w-3 h-2.5 rounded-[3px]", CALLS_FILL)} aria-hidden />
                            Appels sans RDV
                        </span>
                        <span className="flex items-center gap-1.5 sm:ml-auto">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden />
                            ≥ 15 %
                            <span className="w-2 h-2 rounded-full bg-amber-500 ml-2" aria-hidden />
                            ≥ 8 % de conversion
                        </span>
                    </div>

                    <ul className="space-y-0.5">
                        {items.map((item, idx) => {
                            const barW = (item.calls / maxCalls) * 100;
                            const rdvPct = item.calls > 0 ? (item.rdv / item.calls) * 100 : 0;
                            return (
                                <li
                                    key={item.label}
                                    className="group flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-slate-50 transition-colors"
                                >
                                    <div className="w-[132px] shrink-0 text-xs font-bold text-zinc-700 truncate" title={item.label}>
                                        {item.label}
                                    </div>

                                    {/* Track (8px radius) → bar of the same radius; a 2px gap separates the two segments. */}
                                    <div className="relative flex-1 h-7 rounded-lg bg-slate-100 overflow-hidden" role="img" aria-label={`${item.label} : ${item.calls} appels, ${item.rdv} RDV`}>
                                        <div
                                            className="h-full flex gap-[2px] rounded-lg overflow-hidden motion-safe:transition-[width] motion-safe:duration-700 ease-out"
                                            style={{ width: `${barW}%`, transitionDelay: `${idx * 45}ms` }}
                                        >
                                            {item.rdv > 0 && (
                                                <div
                                                    className={cn("h-full flex items-center justify-center shrink-0 min-w-[3px]", RDV_FILL)}
                                                    style={{ width: `${rdvPct}%` }}
                                                >
                                                    {rdvPct > 18 && barW > 20 && (
                                                        <span className="text-[10px] font-black text-white px-1 tabular-nums">{item.rdv}</span>
                                                    )}
                                                </div>
                                            )}
                                            <div className={cn("h-full flex-1", CALLS_FILL)} />
                                        </div>
                                        {barW > 30 && (
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-500 tabular-nums">
                                                {formatInt(item.calls)}
                                            </span>
                                        )}
                                    </div>

                                    <div className="w-[72px] shrink-0 flex flex-col items-end gap-0.5">
                                        <div className="flex items-center gap-1 text-[11px] font-black text-zinc-900 tabular-nums">
                                            <span>{formatInt(item.calls)}</span>
                                            <span className="text-zinc-300 font-normal">·</span>
                                            <span className="text-emerald-600">{item.rdv}</span>
                                        </div>
                                        <RateChip rate={item.rate} />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {/* ── Best segment insight ── */}
            {!isLoading && bestSegment && (
                <div className={cn("rounded-2xl border px-4 py-3.5 flex items-start gap-3", ROW.emerald)}>
                    <IconTile icon={Sparkles} tone="emerald" />
                    <div className="min-w-0">
                        <p className="text-sm font-extrabold text-emerald-900">
                            Meilleur segment : {bestSegment.label}
                        </p>
                        <p className="text-xs font-medium text-emerald-800/80 mt-0.5 leading-relaxed">
                            {bestSegment.rdv} RDV sur {formatInt(bestSegment.calls)} appels —{" "}
                            <span className="font-extrabold">{bestSegment.rate.toLocaleString("fr-FR")} % de conversion</span>
                        </p>
                    </div>
                </div>
            )}

            <p className="text-[11px] font-medium text-zinc-400 text-center">
                La barre <span className="font-bold text-emerald-600">verte</span> représente les RDV décrochés,{" "}
                la <span className="font-bold text-zinc-500">grise</span> les appels sans conversion.
            </p>
        </section>
    );
}

export function BreakdownCharts() {
    const [data, setData] = useState<BreakdownData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [period, setPeriod] = useState<BreakdownPeriod>("month");

    const fetchData = useCallback(async (p: BreakdownPeriod) => {
        setIsLoading(true);
        const params = new URLSearchParams(getPeriodParams(p));
        try {
            const res = await fetch(`/api/client/analytics/breakdown?${params}`);
            const json = await res.json();
            if (json.success) setData(json.data);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData(period);
    }, [fetchData, period]);

    return <BreakdownChartsView data={data} isLoading={isLoading} period={period} onPeriodChange={setPeriod} />;
}
