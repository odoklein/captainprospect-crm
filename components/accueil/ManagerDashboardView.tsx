"use client";

// Manager home (app/manager/dashboard) — same content as before, drawn in the
// SDR "Accueil" language (components/accueil/AccueilUI.tsx). Pure view: the page
// owns fetching and filter state, so this renders from props alone.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import {
    Activity, ArrowUpRight, Bell, Calendar, CalendarCheck, ChevronDown, Flame, Loader2,
    Plus, RefreshCw, Star, Target, TrendingUp, Trophy, Users,
} from "lucide-react";
import {
    Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { DateRangeFilter, type DateRangeValue } from "@/components/dashboard/DateRangeFilter";
import { ACTION_RESULT_LABELS } from "@/lib/types";
import { groupOutcomes, outcomeOf, prettyResult } from "@/lib/manager-home/outcomes";
import { relativeChange } from "@/lib/manager-home/rules";
import type { ManagerHomePeriod } from "@/lib/manager-home/types";
import {
    BADGE, CARD, ChartTooltip, Delta, EmptyBlock, FOCUS, HeroCard, ICON_BUTTON, Initials,
    PRIMARY_BUTTON, ProgressBar, ROW, SECONDARY_BUTTON, SectionHeader, SelectField, Shimmer, TextLink,
    formatInt, relativeTime, type AccueilTone,
} from "./AccueilUI";

// ─── Types (shapes of /api/stats and /api/stats/missions-summary) ───────────

export interface ManagerDashboardStats {
    totalActions: number;
    totalCalls?: number;
    joinedCalls?: number;
    meetingsBooked: number;
    conversionRate: number;
    reachRate?: number | null;
    rdvPer100Calls?: number | null;
    resultBreakdown: Record<string, number>;
    leaderboard: { id: string; name: string; calls: number; connectedCalls: number; actions: number }[];
    rdvLeaderboard: { id: string; name: string; rdv: number; actions: number }[];
}

export interface MissionSummaryItem {
    id: string;
    name: string;
    isActive: boolean;
    client: { id: string; name: string };
    sdrCount: number;
    actionsThisPeriod: number;
    meetingsThisPeriod: number;
    lastActionAt: string | null;
}

// No numeric RDV objective exists in the schema, so the home compares real data
// (current period vs the period before, missions vs each other) instead of
// inventing a goal. Add a goal field to Mission before showing one.

export interface ManagerDashboardViewProps {
    firstName: string;
    stats: ManagerDashboardStats | null;
    missions: MissionSummaryItem[];
    period: ManagerHomePeriod | null;
    isLoading: boolean;
    isFetching: boolean;
    updatedAt: number;
    onRefresh: () => void;
    periodLabel: string;
    rangeDays: number;
    dateRange: DateRangeValue;
    onDateRangeChange: (v: DateRangeValue) => void;
    missionFilter: string;
    onMissionFilterChange: (id: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion(): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const mq = window.matchMedia(REDUCED_MOTION);
            mq.addEventListener("change", onChange);
            return () => mq.removeEventListener("change", onChange);
        },
        () => window.matchMedia(REDUCED_MOTION).matches,
        () => false,
    );
}

/** Counts from the value on screen to the new one (never back from 0 on refetch). */
function useCountUp(target: number): number {
    const reduced = usePrefersReducedMotion();
    const [shown, setShown] = useState(0);
    const current = useRef(0);
    useEffect(() => {
        if (reduced || current.current === target) return;
        const step = Math.max(1, Math.ceil(Math.abs(target - current.current) / 18));
        const id = setInterval(() => {
            const c = current.current;
            current.current = c < target ? Math.min(c + step, target) : Math.max(c - step, target);
            setShown(current.current);
            if (current.current === target) clearInterval(id);
        }, 30);
        return () => clearInterval(id);
    }, [target, reduced]);
    return reduced ? target : shown;
}

function pct1(n: number): string {
    return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function ManagerDashboardView(props: ManagerDashboardViewProps) {
    const {
        firstName, stats, missions, period, isLoading, isFetching, updatedAt, onRefresh,
        periodLabel, rangeDays, dateRange, onDateRangeChange, missionFilter, onMissionFilterChange,
    } = props;

    const [dateFilterOpen, setDateFilterOpen] = useState(false);
    const dateTrigger = useRef<HTMLButtonElement>(null);
    const closeDateFilter = () => {
        setDateFilterOpen(false);
        dateTrigger.current?.focus();
    };

    const meetings = stats?.meetingsBooked ?? 0;
    const actions = stats?.totalActions ?? 0;
    // Canonical: RDV / joints (see lib/stats/metrics), not RDV / every action.
    const conversion = stats?.conversionRate ?? 0;
    const reach = stats?.reachRate ?? null;
    const joinedCalls = stats?.joinedCalls ?? 0;
    const totalCalls = stats?.totalCalls;
    const callsPerRdv = meetings > 0 && totalCalls != null ? Math.round(totalCalls / meetings) : null;

    // Comparison: both sides from /api/manager/home/period so they share one definition.
    const cur = period?.current;
    const prev = period?.previous;
    const deltas = {
        meetings: cur && prev ? relativeChange(cur.meetings, prev.meetings) : null,
        actions: cur && prev ? relativeChange(cur.actions, prev.actions) : null,
        hotLeads: cur && prev ? relativeChange(cur.hotLeads, prev.hotLeads) : null,
    };

    const outcomes = useMemo(() => groupOutcomes(stats?.resultBreakdown ?? {}), [stats?.resultBreakdown]);
    // Families, not single codes: teams log RAPPEL / RELANCE / PROJET_A_SUIVRE far more than
    // CALLBACK_REQUESTED / INTERESTED, which alone read 0 on real data.
    const familyCount = (key: "interested" | "callback") => outcomes.slices.find((s) => s.key === key)?.count ?? 0;
    const callbackCount = familyCount("callback");
    const interestedCount = familyCount("interested");
    const hotLeads = callbackCount + interestedCount;
    const missionsNearGoal = useMemo(
        () => missions
            .filter((m) => m.isActive && m.meetingsThisPeriod > 0)
            .sort((a, b) => b.meetingsThisPeriod - a.meetingsThisPeriod)
            .slice(0, 5),
        [missions],
    );

    if (isLoading && !stats) return <ManagerDashboardSkeleton />;

    const updatedLabel = updatedAt
        ? new Date(updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
        : null;
    return (
        <div className="w-full space-y-6 pb-12 antialiased text-zinc-900">
            {/* ═══ 1. Header ═══ */}
            <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pt-1">
                <div className="space-y-1.5 min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">Bonjour, {firstName}</h1>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-ink-3">
                        <span>Tableau de bord de l’équipe</span>
                        <span aria-live="polite" className="inline-flex items-center gap-1.5">
                            {isFetching
                                ? <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden />
                                : <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />}
                            {isFetching ? "Actualisation…" : updatedLabel ? `Mis à jour à ${updatedLabel}` : "En attente de données"}
                        </span>
                    </div>
                </div>

                <div className="relative flex flex-wrap items-center gap-2">
                    <div>
                        <button
                            type="button"
                            ref={dateTrigger}
                            onClick={() => setDateFilterOpen((o) => !o)}
                            aria-expanded={dateFilterOpen}
                            aria-haspopup="dialog"
                            className={SECONDARY_BUTTON}
                        >
                            <Calendar className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
                            <span>{periodLabel}</span>
                            <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-400 transition-transform", dateFilterOpen && "rotate-180")} aria-hidden />
                        </button>
                        {dateFilterOpen && (
                            <>
                                <div className="fixed inset-0 z-40" aria-hidden onClick={closeDateFilter} />
                                <div role="dialog" aria-label="Choisir une période"
                                    onKeyDown={(e) => { if (e.key === "Escape") closeDateFilter(); }}
                                    className="absolute left-0 xl:left-auto xl:right-0 top-full mt-2 z-50 w-[780px] max-w-full">
                                    <DateRangeFilter
                                        value={dateRange}
                                        onChange={(value) => {
                                            onDateRangeChange(value);
                                            if (value.preset) closeDateFilter();
                                        }}
                                        onClose={closeDateFilter}
                                        isOpen
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    <SelectField
                        ariaLabel="Filtrer par mission"
                        value={missionFilter}
                        onChange={onMissionFilterChange}
                        className="w-[180px]"
                    >
                        <option value="">Toutes les missions</option>
                        {missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </SelectField>

                    <button type="button" onClick={onRefresh} disabled={isFetching} className={ICON_BUTTON} aria-label="Actualiser" title="Actualiser">
                        <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "motion-safe:animate-spin")} aria-hidden />
                    </button>

                    <Link href="/manager/missions/new" className={PRIMARY_BUTTON}>
                        <Plus className="w-4 h-4 text-emerald-400 stroke-[2.6]" aria-hidden />
                        <span>Nouvelle mission</span>
                    </Link>
                </div>
            </header>

            {/* ═══ 2. Hero + KPIs ═══ */}
            <div className={cn("grid grid-cols-1 xl:grid-cols-12 gap-4 transition-opacity duration-200", isFetching && "opacity-80")}>
                <RdvHero
                    className="xl:col-span-8"
                    meetings={meetings}
                    callsPerRdv={callsPerRdv}
                    periodLabel={periodLabel}
                    delta={deltas.meetings}
                    previousMeetings={prev?.meetings ?? null}
                    rangeDays={rangeDays}
                    period={period}
                />
                <dl className={cn(CARD, "xl:col-span-4 grid min-w-0 divide-y divide-line-subtle overflow-hidden sm:grid-cols-3 sm:divide-x sm:divide-y-0 xl:grid-cols-1 xl:divide-x-0 xl:divide-y")}>
                    <DashboardMetric label="Actions CRM" icon={Activity} value={<CountUp value={actions} />}>
                        <Delta value={deltas.actions} suffix="vs période préc." />
                    </DashboardMetric>
                    <DashboardMetric label="Leads chauds" icon={Flame} value={<CountUp value={hotLeads} />}>
                        <Delta value={deltas.hotLeads} suffix="vs période préc." />
                    </DashboardMetric>
                    <DashboardMetric label="Taux de conversion" icon={TrendingUp} value={joinedCalls > 0 ? pct1(conversion) : "—"}>
                        {formatInt(joinedCalls)} appels joints{reach !== null && ` · ${pct1(reach)} des appels`}
                    </DashboardMetric>
                </dl>
            </div>

            {/* ═══ 3. Workspace ═══ */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                <div className="xl:col-span-8 space-y-6 min-w-0">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <ResultsCard slices={outcomes.slices} total={outcomes.total} breakdown={stats?.resultBreakdown ?? {}} />
                        <FollowUpCard callbacks={callbackCount} interested={interestedCount} />
                    </div>
                    <MissionsCard missions={missionsNearGoal} />
                </div>

                <div className="xl:col-span-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-1 gap-6 min-w-0">
                    <LeaderboardCard stats={stats} delta={deltas.meetings} />
                    <RecentRdvCard period={period} />
                </div>
            </div>
        </div>
    );
}

function DashboardMetric({ label, icon: Icon, value, children }: {
    label: string;
    icon: typeof Activity;
    value: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="min-w-0 px-5 py-4">
            <dt className="flex items-center gap-2 text-xs font-semibold text-ink-2">
                <Icon className="size-3.5 shrink-0 text-ink-3" aria-hidden />{label}
            </dt>
            <dd className="mt-1.5 text-3xl font-semibold leading-none tracking-tight text-ink tabular-nums">{value}</dd>
            <dd className="mt-1.5 text-xs text-ink-3">{children}</dd>
        </div>
    );
}

function CountUp({ value }: { value: number }) {
    const n = useCountUp(value);
    return <>{formatInt(n)}</>;
}

// ─── Hero: RDV décrochés ────────────────────────────────────────────────────

function RdvHero({ className, meetings, callsPerRdv, periodLabel, delta, previousMeetings, rangeDays, period }: {
    className?: string;
    meetings: number;
    callsPerRdv: number | null;
    periodLabel: string;
    delta: number | null;
    previousMeetings: number | null;
    rangeDays: number;
    period: ManagerHomePeriod | null;
}) {
    const [cumulative, setCumulative] = useState(false);
    const unit = period?.range.granularity === "week" ? "semaine" : "jour";
    const data = useMemo(() => {
        const series = period?.series ?? [];
        let running = 0;
        const points = [];
        for (const [index, bucket] of series.entries()) {
            running += bucket.meetings;
            points.push({
                ...bucket,
                cumul: running,
                pace: previousMeetings === null ? null : Math.round(previousMeetings * (index + 1) / series.length),
            });
        }
        return points;
    }, [period, previousMeetings]);

    return (
        <HeroCard className={cn("flex min-w-0 flex-col gap-5", className)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                        <CalendarCheck className="size-4 text-accent-300" aria-hidden /> RDV décrochés
                    </h2>
                    <p className="mt-1 text-xs text-inverse-ink-2">{periodLabel}</p>
                </div>
                <div role="group" aria-label="Affichage des RDV" className="inline-flex rounded-lg border border-inverse-line bg-inverse-raised p-0.5">
                    {[false, true].map((mode) => (
                        <button key={String(mode)} type="button" aria-pressed={cumulative === mode} onClick={() => setCumulative(mode)}
                            className={cn("rounded-md px-3 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-emerald-300",
                                cumulative === mode ? "bg-white text-zinc-900" : "text-inverse-ink-2 hover:text-white")}>
                            {mode ? "Cumul" : `Par ${unit}`}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid flex-1 items-center gap-4 sm:grid-cols-[minmax(8rem,1fr)_minmax(0,2fr)]">
                <div>
                    <p className="text-6xl font-semibold leading-none tracking-tighter text-white tabular-nums">{formatInt(meetings)}</p>
                    <div className="mt-2"><Delta value={delta} onDark suffix="vs période préc." /></div>
                </div>
                <div className="min-w-0">
                    {data.length ? (
                        <>
                            <div className="h-36" role="region" aria-label={cumulative ? "RDV cumulés" : `RDV par ${unit}`}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                    <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.12)" />
                                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--ds-inverse-ink-2)" }} axisLine={false} tickLine={false} minTickGap={18} interval="preserveStartEnd" />
                                        <YAxis allowDecimals={false} width={32} tickCount={3} tick={{ fontSize: 10, fill: "var(--ds-inverse-ink-2)" }} axisLine={false} tickLine={false} />
                                        <Tooltip cursor={{ fill: "rgba(255,255,255,0.06)", stroke: "rgba(255,255,255,0.18)" }} content={(p) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} />} />
                                        {cumulative && previousMeetings !== null && (
                                            <Line dataKey="pace" name="Rythme précédent" stroke="#a1a1aa" strokeDasharray="4 4" dot={data.length === 1} isAnimationActive={false} />
                                        )}
                                        {cumulative
                                            ? <Line dataKey="cumul" name="RDV cumulés" stroke="#6ee7b7" strokeWidth={3} dot={data.length === 1} isAnimationActive={false} />
                                            : <Bar dataKey="meetings" name="RDV" fill="#6ee7b7" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />}
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                            {cumulative && previousMeetings !== null && (
                                <p className="flex items-center justify-end gap-2 text-[11px] text-inverse-ink-2">
                                    <span className="w-4 border-t border-dashed" aria-hidden /> Rythme moyen de la période précédente
                                </p>
                            )}
                        </>
                    ) : <p className="grid h-36 place-items-center text-sm text-inverse-ink-2">Évolution indisponible</p>}
                </div>
            </div>
            <dl className="grid grid-cols-3 gap-3 border-t border-inverse-line pt-4">
                {[
                    ["Période préc.", previousMeetings === null ? "—" : formatInt(previousMeetings)],
                    ["RDV / jour", rangeDays > 0 ? (meetings / rangeDays).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—"],
                    ["Appels / RDV", callsPerRdv === null ? "—" : formatInt(callsPerRdv)],
                ].map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-xs text-inverse-ink-2">{label}</dt>
                        <dd className="mt-1 text-lg font-semibold leading-tight text-white tabular-nums">{value}</dd>
                    </div>
                ))}
            </dl>
        </HeroCard>
    );
}

function ResultsCard({ slices, total, breakdown }: {
    slices: ReturnType<typeof groupOutcomes>["slices"];
    total: number;
    breakdown: Record<string, number>;
}) {
    const codes = Object.entries(breakdown).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    return (
        <section className={cn(CARD, "p-5 sm:p-6 space-y-4 min-w-0")}>
            <SectionHeader icon={Activity} tone="emerald" title="Qualifications" count={formatInt(total)} subtitle="Répartition des résultats par famille" />
            {slices.length === 0 ? (
                <EmptyBlock compact icon={Activity} tone="slate" title="Aucun résultat sur cette période" />
            ) : (
                <>
                    <div aria-hidden className="flex h-3 overflow-hidden rounded-full">
                        {slices.map((s) => <span key={s.key} style={{ width: `${s.count / total * 100}%`, backgroundColor: s.color }} />)}
                    </div>
                    <ul className="divide-y divide-line-subtle">
                        {slices.map((s) => (
                            <li key={s.key}>
                                <details className="group">
                                    <summary className={cn("flex cursor-pointer list-none items-center gap-2 rounded-lg py-2.5 text-xs hover:bg-surface-2 [&::-webkit-details-marker]:hidden", FOCUS)}>
                                        <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
                                        <span className="flex-1 font-medium text-ink-2">{s.label}</span>
                                        <strong className="text-ink tabular-nums">{formatInt(s.count)}</strong>
                                        <span className="w-10 text-right text-ink-3 tabular-nums">{s.pct} %</span>
                                        <ChevronDown aria-hidden className="size-3.5 text-ink-3 group-open:rotate-180" />
                                    </summary>
                                    <ul className="mb-2 space-y-1 rounded-lg bg-surface-2 px-3 py-2">
                                        {codes.filter(([code]) => outcomeOf(code) === s.key).map(([code, n]) => (
                                            <li key={code} className="flex justify-between gap-3 text-xs text-ink-2">
                                                <span className="min-w-0 break-words">{prettyResult(code, ACTION_RESULT_LABELS)}</span>
                                                <span className="tabular-nums">{formatInt(n)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}

// ─── Leads à relancer ───────────────────────────────────────────────────────

function FollowUpTile({ tone, icon: Icon, value, title, hint }: { tone: AccueilTone; icon: typeof Star; value: number; title: string; hint: string }) {
    return (
        <div className={cn("flex items-center gap-4 p-4 rounded-2xl border transition-colors min-h-[84px]", ROW[tone])}>
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0", BADGE[tone])}>
                <Icon className="w-5 h-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-2xl font-black text-zinc-900 tracking-tight leading-none">{formatInt(value)}</span>
                    <span className="text-sm font-extrabold text-zinc-800 truncate">{title}</span>
                </div>
                <p className="text-[11px] font-semibold text-zinc-500 truncate mt-1">{hint}</p>
            </div>
        </div>
    );
}

function FollowUpCard({ callbacks, interested }: { callbacks: number; interested: number }) {
    return (
        <section className={cn(CARD, "p-6 flex flex-col gap-4 min-w-0")}>
            <SectionHeader
                icon={Bell}
                tone="amber"
                title="Leads à relancer"
                subtitle={`${formatInt(callbacks)} en attente · à recontacter en priorité`}
            />
            <div className="flex-1 grid grid-rows-2 gap-3">
                <FollowUpTile tone="amber" icon={Bell} value={callbacks} title="rappels planifiés" hint="À contacter en priorité" />
                <FollowUpTile tone="indigo" icon={Star} value={interested} title="contacts intéressés" hint="Haute probabilité de conversion" />
            </div>
            <Link href="/manager/prospection" className={cn(SECONDARY_BUTTON, "w-full justify-between h-10")}>
                <span>Voir la file de prospection</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" aria-hidden />
            </Link>
        </section>
    );
}

// ─── Missions qui produisent des RDV ────────────────────────────────────────

function MissionsCard({ missions }: { missions: MissionSummaryItem[] }) {
    return (
        <section className={cn(CARD, "p-6 space-y-3 min-w-0")}>
            <SectionHeader
                icon={Target}
                tone="emerald"
                title="Missions qui produisent des RDV"
                subtitle="Missions actives classées par RDV sur la période"
                right={<TextLink href="/manager/clients">Voir toutes</TextLink>}
            />
            {missions.length === 0 ? (
                <EmptyBlock compact icon={Target} tone="slate" title="Aucune mission active avec des RDV" hint="Les missions apparaissent ici dès leur premier RDV sur la période." />
            ) : (
                <ul className="divide-y divide-slate-100">
                    {missions.map((m) => {
                        // Bar relative to the best mission: a ranking, not an invented target.
                        const best = missions[0]?.meetingsThisPeriod || 1;
                        const pct = Math.min(100, Math.round((m.meetingsThisPeriod / best) * 100));
                        const tone: AccueilTone = pct >= 80 ? "emerald" : pct >= 50 ? "amber" : "slate";
                        return (
                            <li key={m.id}>
                                <Link
                                    href={`/manager/clients?client=${m.client.id}&mission=${m.id}`}
                                    className={cn("group block py-3 px-3 -mx-3 rounded-2xl hover:bg-slate-50 transition-colors", FOCUS)}
                                >
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {pct >= 80 && (
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" aria-hidden />
                                            )}
                                            <span className="text-sm font-extrabold text-zinc-900 truncate group-hover:text-emerald-700 transition-colors">{m.name}</span>
                                            <span className="hidden sm:inline text-xs font-semibold text-zinc-400 truncate">· {m.client.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className="text-sm font-black text-zinc-900 tabular-nums">
                                                {formatInt(m.meetingsThisPeriod)}
                                                <span className="text-[10px] font-bold text-zinc-400 ml-0.5">RDV</span>
                                            </span>
                                            <span className={cn("text-[10px] font-extrabold px-2 py-0.5 rounded-full tabular-nums", BADGE[tone])}>{pct} %</span>
                                        </div>
                                    </div>
                                    <ProgressBar percent={pct} tone={tone} label={`${m.name} : ${pct} % du meilleur résultat`} />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

// ─── Leaderboard RDV ────────────────────────────────────────────────────────

// Top-3 rank colours (gold, silver, bronze) — flat text, no medal emoji.
const RANK_TEXT = ["text-amber-600", "text-slate-500", "text-orange-700"];

function LeaderboardCard({ stats, delta }: { stats: ManagerDashboardStats | null; delta: number | null }) {
    const rows = stats?.rdvLeaderboard ?? [];
    const max = rows[0]?.rdv || 1;
    const status: { text: string; tone: AccueilTone } = delta === null
        ? { text: "Vs période préc.", tone: "slate" }
        : delta >= 0
            ? { text: `+${pct1(delta)}`, tone: "emerald" }
            : { text: pct1(delta), tone: "amber" };

    return (
        <section className={cn(CARD, "p-6 space-y-3 min-w-0")}>
            <SectionHeader
                size="sm"
                icon={Trophy}
                tone="amber"
                title="Leaderboard RDV"
                subtitle="Sur la période"
                right={
                    <span className={cn("inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap", BADGE[status.tone])}>
                        <Target className="w-3 h-3" aria-hidden />
                        {status.text}
                    </span>
                }
            />
            {rows.length === 0 ? (
                <EmptyBlock compact icon={Users} tone="slate" title="Pas encore de RDV sur cette période" />
            ) : (
                <ol className="space-y-1.5">
                    {rows.map((person, i) => {
                        const first = i === 0;
                        const calls = stats?.leaderboard.find((e) => e.id === person.id);
                        return (
                            <li
                                key={person.id}
                                className={cn(
                                    "flex items-center gap-3 p-2.5 rounded-2xl border transition-colors",
                                    first ? "bg-emerald-50/70 border-emerald-200/80" : "border-transparent hover:bg-slate-50 hover:border-slate-200",
                                )}
                            >
                                <span className={cn("w-6 text-center text-sm font-black flex-shrink-0 tabular-nums", RANK_TEXT[i] ?? "text-zinc-400")} aria-label={`Rang ${i + 1}`}>
                                    {i + 1}
                                </span>
                                <Initials name={person.name} strong={first} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={cn("text-[13px] font-extrabold truncate", first ? "text-emerald-900" : "text-zinc-800")}>{person.name}</span>
                                        <span className="text-sm font-black text-zinc-900 flex-shrink-0 tabular-nums">
                                            {person.rdv}
                                            <span className="text-[10px] font-bold text-zinc-400 ml-0.5">RDV</span>
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1 mt-1">
                                        <MiniTag tone="indigo">Appels {formatInt(calls?.calls ?? 0)}</MiniTag>
                                        <MiniTag tone="emerald">Connectés {formatInt(calls?.connectedCalls ?? 0)}</MiniTag>
                                        <MiniTag tone="slate">Actions CRM {formatInt(person.actions)}</MiniTag>
                                    </div>
                                    <ProgressBar
                                        className="h-1.5 mt-2 bg-white/80"
                                        percent={(person.rdv / max) * 100}
                                        fillClassName={first ? "bg-emerald-500" : "bg-slate-300"}
                                        label={`${person.name} : ${person.rdv} RDV`}
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}

function MiniTag({ tone, children }: { tone: AccueilTone; children: ReactNode }) {
    return (
        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums whitespace-nowrap", BADGE[tone])}>
            {children}
        </span>
    );
}

// ─── Activité récente (RDV) ─────────────────────────────────────────────────

const SAS_STATUS: Record<"PENDING" | "CONFIRMED" | "CANCELLED", { label: string; tone: AccueilTone }> = {
    PENDING: { label: "À valider", tone: "amber" },
    CONFIRMED: { label: "Validé", tone: "emerald" },
    CANCELLED: { label: "Annulé", tone: "rose" },
};

function RecentRdvCard({ period, className }: { period: ManagerHomePeriod | null; className?: string }) {
    const items = period?.recentMeetings ?? [];
    return (
        <section className={cn(CARD, "p-6 space-y-3 min-w-0", className)}>
            <SectionHeader
                size="sm"
                icon={CalendarCheck}
                tone="emerald"
                title="Activité récente"
                count={period ? items.length : undefined}
                subtitle="Derniers RDV décrochés"
                right={<TextLink href="/manager/rdv">SAS RDV</TextLink>}
            />
            {!period ? (
                <div className="space-y-2">
                    {[0, 1, 2].map((i) => <Shimmer key={i} className="h-14" />)}
                </div>
            ) : items.length === 0 ? (
                <EmptyBlock compact icon={CalendarCheck} tone="slate" title="Aucun RDV sur cette période" />
            ) : (
                <ul className="space-y-1 max-h-[300px] overflow-y-auto overscroll-contain pr-1 -mr-1 [scrollbar-width:thin] [scrollbar-color:var(--ds-line)_transparent]">
                    {items.map((item) => {
                        const status = SAS_STATUS[item.confirmationStatus] ?? SAS_STATUS.PENDING;
                        const who = item.contactName ?? item.companyName;
                        return (
                            <li key={item.id} className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-slate-50 transition-colors">
                                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5", BADGE.emerald)}>
                                    <CalendarCheck className="w-4 h-4" aria-hidden />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-zinc-600 leading-relaxed">
                                        <span className="font-extrabold text-zinc-900">{item.sdrName}</span>
                                        {" "}a décroché un RDV
                                        {who && <> avec <span className="font-extrabold text-emerald-700">{who}</span></>}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-1 min-w-0">
                                        <span className={cn("text-[10px] font-extrabold px-1.5 py-0.5 rounded-md flex-shrink-0", BADGE[status.tone])}>{status.label}</span>
                                        <span className="text-[11px] font-semibold text-zinc-400 truncate">
                                            {relativeTime(item.createdAt)}
                                            {item.missionName && ` · ${item.missionName}`}
                                        </span>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

export function ManagerDashboardSkeleton() {
    return (
        <div className="w-full space-y-6 pb-12" aria-busy="true" aria-label="Chargement du tableau de bord">
            <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pt-1">
                <div className="space-y-2.5">
                    <div className="flex gap-2">
                        <Shimmer className="h-7 w-36 rounded-full" />
                        <Shimmer className="h-7 w-32 rounded-full" />
                    </div>
                    <Shimmer className="h-9 w-72 rounded-xl" />
                    <Shimmer className="h-4 w-64 max-w-full rounded-lg" />
                </div>
                <div className="flex flex-wrap gap-2">
                    <Shimmer className="h-9 w-36 rounded-xl" />
                    <Shimmer className="h-9 w-44 rounded-xl" />
                    <Shimmer className="h-11 w-40 rounded-2xl" />
                </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                <div className="xl:col-span-8 h-[300px] rounded-3xl bg-inverse/90 motion-safe:animate-pulse" />
                <div className={cn(CARD, "xl:col-span-4 grid sm:grid-cols-3 xl:grid-cols-1 overflow-hidden")}>
                    {[0, 1, 2].map((i) => <Shimmer key={i} className="h-[100px] rounded-none" />)}
                </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-8 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Shimmer className="h-[260px] rounded-3xl" />
                        <Shimmer className="h-[260px] rounded-3xl" />
                    </div>
                    <Shimmer className="h-[300px] rounded-3xl" />
                </div>
                <div className="xl:col-span-4 space-y-6">
                    <Shimmer className="h-[440px] rounded-3xl" />
                    <Shimmer className="h-[360px] rounded-3xl" />
                </div>
            </div>
        </div>
    );
}
