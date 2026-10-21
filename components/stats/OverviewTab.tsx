"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Info, Lightbulb, TrendingDown, TrendingUp,
} from "lucide-react";
import {
    Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CARD, Delta, EmptyBlock, FOCUS, HeroCard } from "@/components/accueil/AccueilUI";
import { OUTCOME_META, OUTCOME_ORDER, outcomeOf, prettyResult, type OutcomeKey } from "@/lib/manager-home/outcomes";
import {
    buildInsights, callsPerMeeting, conversionRate, pct, pointChange, reachRate, relativeChange,
} from "@/lib/stats/metrics";
import { formatDuration, formatInt, formatRate } from "@/lib/stats/format";
import type { Insight, SeriesPoint, StatsOverview, TelephonyResponse } from "@/lib/stats/types";
import type { StatsTab } from "@/lib/stats/period";
import { Panel } from "./shared";

type ChartMetric = "meetings" | "calls" | "joined";

const CHART_METRICS: Record<ChartMetric, { label: string; unit: string; color: string }> = {
    meetings: { label: "RDV", unit: "RDV", color: OUTCOME_META.meeting.color },
    calls: { label: "Appels", unit: "appels", color: "var(--brand-primary-600)" },
    joined: { label: "Joints", unit: "joints", color: "#0EA5E9" },
};

function familyCounts(byResult: Record<string, number>): Record<OutcomeKey, number> {
    const out = Object.fromEntries(OUTCOME_ORDER.map((k) => [k, 0])) as Record<OutcomeKey, number>;
    for (const [code, n] of Object.entries(byResult)) out[outcomeOf(code)] += n;
    return out;
}

// ── KPI strip ───────────────────────────────────────────────────────

const KPI_CARD = cn(CARD, "flex min-w-0 flex-col justify-between gap-3 p-5");
const KPI_LABEL = "block truncate text-[11px] font-bold uppercase tracking-wider text-ink-4";
const KPI_VALUE = "text-[28px] sm:text-[34px] font-black leading-none tracking-tight text-ink tabular-nums";

function RdvHero({ o }: { o: StatsOverview }) {
    const { current: c, previous: p, rdv } = o;
    const seg = [
        { key: "confirmed", n: rdv.confirmed, label: "confirmés", bar: "bg-emerald-400" },
        { key: "pending", n: rdv.pending, label: "en attente SAS", bar: "bg-amber-300" },
        { key: "rejected", n: rdv.rejected, label: "rejetés", bar: "bg-rose-400" },
    ];
    return (
        <HeroCard className="flex min-w-0 flex-col justify-between gap-4 p-5 sm:p-5">
            <div>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-inverse-ink-3">RDV obtenus</span>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[44px] font-black leading-none tracking-tight text-white tabular-nums">{formatInt(c.meetings)}</span>
                    <Delta onDark value={relativeChange(c.meetings, p.meetings)} suffix="vs période préc." />
                </div>
            </div>
            <div>
                {rdv.total > 0 ? (
                    <>
                        <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${rdv.confirmed} confirmés, ${rdv.pending} en attente, ${rdv.rejected} rejetés`}>
                            {seg.filter((s) => s.n > 0).map((s) => (
                                <div key={s.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", s.bar)} style={{ width: `${(s.n / rdv.total) * 100}%` }} />
                            ))}
                        </div>
                        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-semibold text-inverse-ink-2">
                            {seg.filter((s) => s.n > 0).map((s) => (
                                <span key={s.key} className="inline-flex items-center gap-1.5">
                                    <span className={cn("size-1.5 rounded-full", s.bar)} aria-hidden />
                                    {formatInt(s.n)} {s.label}
                                </span>
                            ))}
                        </p>
                    </>
                ) : (
                    <p className="text-[11px] font-semibold text-inverse-ink-3">Aucun RDV pris sur la période</p>
                )}
                <Link
                    href="/manager/rdv"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent-300 outline-none transition-colors hover:text-white focus-visible:underline"
                >
                    Bilan des RDV <ArrowRight className="size-3.5" aria-hidden />
                </Link>
            </div>
        </HeroCard>
    );
}

function KpiStrip({ o, telephony, scoped }: { o: StatsOverview; telephony: { current?: TelephonyResponse; previous?: TelephonyResponse }; scoped: boolean }) {
    const { current: c, previous: p } = o;
    const reach = reachRate(c);
    const conv = conversionRate(c);
    const every = callsPerMeeting(c);

    // Talk time: Allo is the source of truth (the CRM only has durations when the call
    // enrichment ran). Allo lines are per SDR, not per mission, so it only applies when
    // the scope is "everyone" or a set of SDRs.
    const alloOk = !scoped && telephony.current?.available;
    const talk = alloOk ? telephony.current!.totals.talkTimeSeconds : c.seconds;
    const talkPrev = alloOk ? telephony.previous?.totals.talkTimeSeconds ?? 0 : p.seconds;
    const talkKnown = talk > 0;

    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-[1.35fr_repeat(4,minmax(0,1fr))]">
            <div className="col-span-2 lg:col-span-1"><RdvHero o={o} /></div>

            <div className={KPI_CARD}>
                <div>
                    <span className={KPI_LABEL}>Appels passés</span>
                    <div className={cn(KPI_VALUE, "mt-2")}>{formatInt(c.calls)}</div>
                </div>
                <div className="space-y-0.5">
                    <Delta value={relativeChange(c.calls, p.calls)} suffix="vs préc." />
                    <p className="truncate text-[11px] font-semibold text-ink-3">{formatInt(c.prospects)} prospects distincts</p>
                </div>
            </div>

            <div className={KPI_CARD}>
                <div>
                    <span className={KPI_LABEL} title="Appels où quelqu'un a décroché et parlé (hors pas de réponse, barrage et mauvais numéro)">Joignabilité</span>
                    <div className={cn(KPI_VALUE, "mt-2")}>{formatRate(reach, 0)}</div>
                </div>
                <div className="space-y-0.5">
                    <Delta unit="pt" value={pointChange(reach, reachRate(p))} suffix="vs préc." />
                    <p className="truncate text-[11px] font-semibold text-ink-3">{formatInt(c.joined)} appels joints</p>
                </div>
            </div>

            <div className={KPI_CARD}>
                <div>
                    <span className={KPI_LABEL} title="RDV obtenus / appels joints">Transformation</span>
                    <div className={cn(KPI_VALUE, "mt-2")}>{formatRate(conv)}</div>
                </div>
                <div className="space-y-0.5">
                    <Delta unit="pt" value={pointChange(conv, conversionRate(p))} suffix="vs préc." />
                    <p className="truncate text-[11px] font-semibold text-ink-3">{every ? `1 RDV tous les ${formatInt(every)} appels` : "Aucun RDV"}</p>
                </div>
            </div>

            <div className={KPI_CARD}>
                <div>
                    <span className={KPI_LABEL}>Temps de parole</span>
                    <div className={cn(KPI_VALUE, "mt-2", !talkKnown && "text-ink-4")}>
                        {talkKnown ? formatDuration(talk) : "—"}
                    </div>
                </div>
                <div className="space-y-0.5">
                    {talkKnown ? <Delta value={relativeChange(talk, talkPrev)} suffix="vs préc." /> : <span className="text-[11px] font-semibold text-ink-4">Pas de base de comparaison</span>}
                    <p className="truncate text-[11px] font-semibold text-ink-3">
                        {scoped ? "Non ventilé par mission (lignes Allo)" : alloOk ? "Lignes Allo des SDR" : telephony.current === undefined ? "Chargement…" : "Durées enregistrées dans le CRM"}
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Activity chart ──────────────────────────────────────────────────

function ActivityChart({ o }: { o: StatsOverview }) {
    const [metric, setMetric] = useState<ChartMetric>("meetings");
    const m = CHART_METRICS[metric];
    const pick = (p: SeriesPoint | undefined) => (p ? p[metric] : null);

    const data = useMemo(
        () =>
            o.series.map((p, i) => ({
                label: p.label,
                value: p[metric],
                prev: pick(o.prevSeries[i]),
                prevLabel: o.prevSeries[i]?.label ?? null,
            })),
        [o, metric], // eslint-disable-line react-hooks/exhaustive-deps
    );
    const total = o.series.reduce((acc, p) => acc + p[metric], 0);
    const prevTotal = o.prevSeries.reduce((acc, p) => acc + p[metric], 0);
    const weekly = o.range.granularity === "week";

    return (
        <Panel
            title="Évolution"
            subtitle={`${formatInt(total)} ${m.unit} · ${weekly ? "par semaine" : "par jour"}, comparé aux ${formatInt(prevTotal)} de la période précédente`}
            right={
                <SegmentedControl
                    ariaLabel="Indicateur du graphique"
                    size="sm"
                    value={metric}
                    onChange={setMetric}
                    options={(Object.keys(CHART_METRICS) as ChartMetric[]).map((k) => ({ value: k, label: CHART_METRICS[k].label }))}
                />
            }
        >
            <div className="h-[290px] w-full" role="img" aria-label={`Courbe des ${m.unit} par ${weekly ? "semaine" : "jour"} avec la période précédente en pointillés`}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="22%">
                        <CartesianGrid stroke="var(--ds-line-subtle)" vertical={false} />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={18} tick={{ fontSize: 11, fill: "var(--ds-ink-4)", fontWeight: 600 }} dy={8} />
                        <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={44} tick={{ fontSize: 11, fill: "var(--ds-ink-4)", fontWeight: 600 }} />
                        <RechartsTooltip
                            cursor={{ fill: "color-mix(in oklab, var(--brand-primary) 6%, transparent)" }}
                            content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const row = payload[0].payload as (typeof data)[number];
                                return (
                                    <div className="min-w-[160px] rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-overlay">
                                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-4">{row.label}</p>
                                        <p className="flex items-center justify-between gap-3 py-0.5">
                                            <span className="flex items-center gap-1.5 font-semibold text-ink-2"><span className="size-2 rounded-sm" style={{ background: m.color }} aria-hidden />Période</span>
                                            <span className="font-black tabular-nums text-ink">{formatInt(row.value)}</span>
                                        </p>
                                        {row.prev !== null && (
                                            <p className="flex items-center justify-between gap-3 py-0.5">
                                                <span className="flex items-center gap-1.5 font-semibold text-ink-3"><span className="h-0 w-2 border-t-2 border-dashed border-ink-4" aria-hidden />{row.prevLabel}</span>
                                                <span className="font-bold tabular-nums text-ink-3">{formatInt(row.prev)}</span>
                                            </p>
                                        )}
                                    </div>
                                );
                            }}
                        />
                        <Bar dataKey="value" name={m.label} fill={m.color} radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                        <Line dataKey="prev" name="Période précédente" stroke="var(--ds-ink-4)" strokeWidth={1.75} strokeDasharray="4 4" dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} connectNulls />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-4 text-[11px] font-semibold text-ink-3">
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: m.color }} aria-hidden />Cette période</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-0 w-3.5 border-t-2 border-dashed border-ink-4" aria-hidden />Période précédente</span>
            </div>
        </Panel>
    );
}

// ── Insights ────────────────────────────────────────────────────────

const INSIGHT_STYLE: Record<Insight["tone"], { icon: typeof Info; tile: string }> = {
    success: { icon: TrendingUp, tile: "bg-success-soft text-success-ink border-success-line" },
    warning: { icon: AlertTriangle, tile: "bg-warning-soft text-warning-ink border-warning-line" },
    danger: { icon: TrendingDown, tile: "bg-danger-soft text-danger-ink border-danger-line" },
    info: { icon: Lightbulb, tile: "bg-info-soft text-info-ink border-info-line" },
};

function InsightsPanel({ insights, onTab }: { insights: Insight[]; onTab: (tab: StatsTab) => void }) {
    return (
        <Panel title="À retenir" subtitle="Ce que disent les chiffres de la période" className="h-full">
            {insights.length === 0 ? (
                <EmptyBlock compact icon={CheckCircle2} title="Rien d'anormal à signaler" hint="Aucun écart notable sur cette période, ou volume trop faible pour conclure." />
            ) : (
                <ul className="space-y-3">
                    {insights.map((i) => {
                        const s = INSIGHT_STYLE[i.tone];
                        const Icon = s.icon;
                        return (
                            <li key={i.id} className="flex gap-3">
                                <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border", s.tile)}>
                                    <Icon className="size-4" aria-hidden />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-[13px] font-extrabold leading-snug text-ink">{i.title}</p>
                                    <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{i.detail}</p>
                                    {i.tab && (
                                        <button
                                            type="button"
                                            onClick={() => onTab(i.tab!)}
                                            className={cn("mt-1 inline-flex items-center gap-1 rounded text-xs font-bold text-primary-700 hover:underline", FOCUS)}
                                        >
                                            Voir le détail <ArrowRight className="size-3" aria-hidden />
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Panel>
    );
}

// ── Funnel ──────────────────────────────────────────────────────────

function Funnel({ o }: { o: StatsOverview }) {
    const { current: c, previous: p } = o;
    const steps = [
        { key: "calls", label: "Appels", hint: "Appels passés", n: c.calls, prevN: p.calls, color: "var(--brand-primary-600)", from: null as null | "calls" },
        { key: "joined", label: "Joints", hint: "Quelqu'un a répondu", n: c.joined, prevN: p.joined, color: "#0EA5E9", from: "calls" as const },
        { key: "positive", label: "Intérêt", hint: "RDV + à rappeler / à suivre", n: c.meetings + c.hot, prevN: p.meetings + p.hot, color: OUTCOME_META.interested.color, from: "joined" as const },
        { key: "meetings", label: "RDV", hint: "RDV obtenus", n: c.meetings, prevN: p.meetings, color: OUTCOME_META.meeting.color, from: "positive" as const },
    ];
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    const max = Math.max(1, c.calls);

    return (
        <Panel title="Entonnoir" subtitle="De l'appel au RDV, avec le taux de passage à chaque étape" className="h-full">
            <ol className="space-y-4">
                {steps.map((s) => {
                    const prior = s.from ? byKey[s.from] : null;
                    const rate = prior ? pct(s.n, prior.n) : null;
                    const prevRate = prior ? pct(s.prevN, byKey[prior.key].prevN) : null;
                    const width = Math.max(s.n > 0 ? 1.5 : 0, (s.n / max) * 100);
                    return (
                        <li key={s.key}>
                            <div className="mb-1.5 flex items-baseline justify-between gap-3">
                                <div className="min-w-0">
                                    <span className="text-[13px] font-extrabold text-ink">{s.label}</span>
                                    <span className="ml-2 text-[11px] font-medium text-ink-4">{s.hint}</span>
                                </div>
                                <div className="flex shrink-0 items-baseline gap-3">
                                    {rate !== null && (
                                        <span className="flex items-baseline gap-1.5 text-[11px] font-semibold text-ink-3">
                                            <span className="font-extrabold text-ink-2 tabular-nums">{formatRate(rate)}</span> du palier précédent
                                            {prevRate !== null && <Delta unit="pt" value={pointChange(rate, prevRate)} />}
                                        </span>
                                    )}
                                    <span className="w-14 text-right text-base font-black tabular-nums text-ink">{formatInt(s.n)}</span>
                                </div>
                            </div>
                            <div className="h-3 w-full overflow-hidden rounded-full bg-surface-3">
                                <div className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700" style={{ width: `${width}%`, background: s.color }} />
                            </div>
                        </li>
                    );
                })}
            </ol>
            {c.meetings > 0 && (
                <p className="mt-5 rounded-panel border border-line bg-surface-2/60 px-4 py-3 text-xs leading-relaxed text-ink-3">
                    <span className="font-bold text-ink-2">Pour obtenir 1 RDV : </span>
                    {formatInt(Math.round(c.calls / c.meetings))} appels, dont {formatInt(Math.round(c.joined / c.meetings))} joints
                    {p.meetings > 0 && <> (période précédente : {formatInt(Math.round(p.calls / p.meetings))} appels).</>}
                </p>
            )}
        </Panel>
    );
}

// ── Outcome mix ─────────────────────────────────────────────────────

function Outcomes({ o, labels, onOpenFamily }: { o: StatsOverview; labels: Record<string, string>; onOpenFamily: (f: OutcomeKey) => void }) {
    const [showCodes, setShowCodes] = useState(false);
    const cur = useMemo(() => familyCounts(o.current.byResult), [o.current.byResult]);
    const prev = useMemo(() => familyCounts(o.previous.byResult), [o.previous.byResult]);
    const total = o.current.calls;
    const prevTotal = o.previous.calls;
    const rows = OUTCOME_ORDER.filter((k) => cur[k] > 0);
    const codes = Object.entries(o.current.byResult).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

    return (
        <Panel title="Résultats des appels" subtitle="Répartition par famille de résultat — cliquer pour voir les appels" className="h-full">
            <div className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label="Répartition des résultats d'appels">
                {rows.map((k) => (
                    <div key={k} className="h-full first:rounded-l-full last:rounded-r-full" title={`${OUTCOME_META[k].label} : ${cur[k]}`} style={{ width: `${(cur[k] / total) * 100}%`, background: OUTCOME_META[k].color, minWidth: 3 }} />
                ))}
            </div>

            <ul className="mt-4 divide-y divide-line-subtle">
                {rows.map((k) => {
                    const share = pct(cur[k], total);
                    const prevShare = pct(prev[k], prevTotal);
                    return (
                        <li key={k}>
                            <button
                                type="button"
                                onClick={() => onOpenFamily(k)}
                                className={cn("group flex w-full items-center gap-3 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-surface-2", FOCUS, "focus-visible:ring-offset-0")}
                            >
                                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: OUTCOME_META[k].color }} aria-hidden />
                                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-2 group-hover:text-ink">{OUTCOME_META[k].label}</span>
                                <span className="hidden sm:block"><Delta unit="pt" value={pointChange(share, prevShare)} /></span>
                                <span className="w-12 text-right text-[13px] font-black tabular-nums text-ink">{formatInt(cur[k])}</span>
                                <span className="w-12 text-right text-xs font-semibold tabular-nums text-ink-3">{formatRate(share, 0)}</span>
                                <ArrowRight className="size-3.5 shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                            </button>
                        </li>
                    );
                })}
            </ul>

            <button
                type="button"
                onClick={() => setShowCodes((v) => !v)}
                aria-expanded={showCodes}
                className={cn("mt-3 inline-flex items-center gap-1 rounded text-xs font-bold text-ink-3 transition-colors hover:text-ink", FOCUS)}
            >
                <ChevronDown className={cn("size-3.5 transition-transform", showCodes && "rotate-180")} aria-hidden />
                Détail par résultat ({codes.length})
            </button>
            {showCodes && (
                <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    {codes.map(([code, n]) => (
                        <li key={code} className="flex items-center justify-between gap-3 text-xs">
                            <span className="flex min-w-0 items-center gap-2 text-ink-2">
                                <span className="size-1.5 shrink-0 rounded-full" style={{ background: OUTCOME_META[outcomeOf(code)].color }} aria-hidden />
                                <span className="truncate">{prettyResult(code, labels)}</span>
                            </span>
                            <span className="font-bold tabular-nums text-ink">{formatInt(n)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}

// ── Tab ─────────────────────────────────────────────────────────────

export function OverviewTab({
    overview,
    telephony,
    scopedBeyondSdr,
    statusLabels,
    onOpenFamily,
    onTab,
}: {
    overview: StatsOverview;
    telephony: { current?: TelephonyResponse; previous?: TelephonyResponse };
    scopedBeyondSdr: boolean;
    statusLabels: Record<string, string>;
    onOpenFamily: (family: OutcomeKey) => void;
    onTab: (tab: StatsTab) => void;
}) {
    const insights = useMemo(() => buildInsights(overview), [overview]);

    if (overview.current.calls === 0) {
        return (
            <EmptyBlock
                icon={Info}
                tone="slate"
                title="Aucun appel sur cette période"
                hint={overview.previous.calls > 0
                    ? `La période précédente en comptait ${formatInt(overview.previous.calls)}. Élargissez les dates ou retirez un filtre.`
                    : "Élargissez les dates ou retirez un filtre pour voir de l'activité."}
            />
        );
    }

    return (
        <div className="space-y-4">
            <KpiStrip o={overview} telephony={telephony} scoped={scopedBeyondSdr} />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <ActivityChart o={overview} />
                <InsightsPanel insights={insights} onTab={onTab} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <Funnel o={overview} />
                <Outcomes o={overview} labels={statusLabels} onOpenFamily={onOpenFamily} />
            </div>
        </div>
    );
}
