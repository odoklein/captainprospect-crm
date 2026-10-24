"use client";

// Manager home (app/manager/dashboard) — same content as before, drawn in the
// SDR "Accueil" language (components/accueil/AccueilUI.tsx). Pure view: the page
// owns fetching and filter state, so this renders from props alone.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import {
    Activity, ArrowUpRight, Bell, Calendar, CalendarCheck, ChevronDown, Flame, Loader2, Phone,
    Plus, RefreshCw, Star, Target, TrendingUp, Trophy, Users,
} from "lucide-react";
import {
    Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { DateRangeFilter, type DateRangeValue } from "@/components/dashboard/DateRangeFilter";
import { groupOutcomes } from "@/lib/manager-home/outcomes";
import { relativeChange } from "@/lib/manager-home/rules";
import type { ManagerHomePeriod } from "@/lib/manager-home/types";
import {
    BADGE, CARD, ChartTooltip, Delta, EmptyBlock, FOCUS, HeroCard, HeroPill, HeroTile, ICON_BUTTON, IconTile, Initials,
    KpiCard, PRIMARY_BUTTON, ProgressBar, ROW, SECONDARY_BUTTON, SectionHeader, SelectField, Shimmer, StatusPill, TextLink,
    formatInt, relativeTime, type AccueilTone,
} from "./AccueilUI";

// ─── Types (shapes of /api/stats and /api/stats/missions-summary) ───────────

export interface ManagerDashboardStats {
    totalActions: number;
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

    const meetings = stats?.meetingsBooked ?? 0;
    const actions = stats?.totalActions ?? 0;
    // Canonical: RDV / joints (see lib/stats/metrics), not RDV / every action.
    const conversion = stats?.conversionRate ?? 0;
    const reach = stats?.reachRate ?? null;
    const joinedCalls = stats?.joinedCalls ?? 0;
    const callsPerRdv = meetings > 0 ? Math.round(actions / meetings) : null;

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
    const missionLabel = missionFilter
        ? missions.find((m) => m.id === missionFilter)?.name ?? "Mission sélectionnée"
        : "Toutes les missions";

    return (
        <div className="w-full space-y-6 pb-12 antialiased text-zinc-900">
            {/* ═══ 1. Header ═══ */}
            <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pt-1">
                <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            aria-live="polite"
                            className={cn(
                                "inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-semibold border shadow-2xs whitespace-nowrap",
                                isFetching ? "bg-slate-50 text-zinc-600 border-slate-200" : "bg-emerald-50 text-emerald-700 border-emerald-200/80",
                            )}
                        >
                            {isFetching ? (
                                <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden />
                            ) : (
                                <span className="relative flex w-2 h-2" aria-hidden>
                                    <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
                                    <span className="relative w-2 h-2 rounded-full bg-emerald-500" />
                                </span>
                            )}
                            {isFetching ? "Actualisation…" : updatedLabel ? `En direct · ${updatedLabel}` : "En direct"}
                        </span>
                        <StatusPill tone="slate" icon={Calendar}>{periodLabel}</StatusPill>
                        <StatusPill tone={missionFilter ? "indigo" : "slate"} icon={Target}>
                            <span className="max-w-[220px] truncate">{missionLabel}</span>
                        </StatusPill>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900">
                        Bonjour, {firstName}
                    </h1>
                    <p className="text-xs sm:text-sm text-zinc-500 font-medium">
                        Tableau de bord de l&apos;équipe : RDV, résultats d&apos;appels et missions.
                    </p>
                </div>

                <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 flex-shrink-0">
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setDateFilterOpen((o) => !o)}
                            aria-expanded={dateFilterOpen}
                            aria-haspopup="dialog"
                            className={SECONDARY_BUTTON}
                        >
                            <Calendar className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
                            <span>{dateRange.preset ? periodLabel : "Plage personnalisée"}</span>
                            <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-400 transition-transform", dateFilterOpen && "rotate-180")} aria-hidden />
                        </button>
                        {dateFilterOpen && (
                            <>
                                <div className="fixed inset-0 z-40" aria-hidden onClick={() => setDateFilterOpen(false)} />
                                <div className="absolute left-0 xl:left-auto xl:right-0 top-full mt-2 z-50 max-w-[calc(100vw-2rem)]">
                                    <DateRangeFilter
                                        value={dateRange}
                                        onChange={onDateRangeChange}
                                        onClose={() => setDateFilterOpen(false)}
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
                    actions={actions}
                    joinedCalls={joinedCalls}
                    callsPerRdv={callsPerRdv}
                    conversion={conversion}
                    periodLabel={periodLabel}
                    delta={deltas.meetings}
                    previousMeetings={prev?.meetings ?? null}
                    rangeDays={rangeDays}
                    period={period}
                />
                <div className="xl:col-span-4 grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-4">
                    <KpiCard
                        label="Appels effectués"
                        value={<CountUp value={actions} />}
                        sub={<Delta value={deltas.actions} suffix="vs période préc." />}
                        visual={<IconTile icon={Phone} tone="emerald" size="lg" />}
                    />
                    <KpiCard
                        label="Leads chauds"
                        value={<CountUp value={hotLeads} />}
                        badge={{ text: "Qualifiés", tone: "indigo" }}
                        sub={<Delta value={deltas.hotLeads} suffix="vs période préc." />}
                        visual={<IconTile icon={Flame} tone="indigo" size="lg" />}
                    />
                    <KpiCard
                        label="Taux de conversion"
                        value={pct1(conversion)}
                        sub={
                            <span className="tabular-nums">
                                RDV / joints · {reach !== null ? `${pct1(reach)} de joints` : "pas encore de joints"}
                            </span>
                        }
                        visual={<IconTile icon={TrendingUp} tone="teal" size="lg" />}
                    />
                </div>
            </div>

            {/* ═══ 3. Workspace ═══ */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                <div className="xl:col-span-8 space-y-6 min-w-0">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <ResultsCard slices={outcomes.slices} total={outcomes.total} meetings={meetings} />
                        <FollowUpCard callbacks={callbackCount} interested={interestedCount} />
                    </div>
                    <MissionsCard missions={missionsNearGoal} />
                    <ProgressionCard period={period} meetings={meetings} previousMeetings={prev?.meetings ?? null} />
                </div>

                <div className="xl:col-span-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-1 gap-6 min-w-0">
                    <LeaderboardCard stats={stats} delta={deltas.meetings} />
                    <RecentRdvCard period={period} />
                </div>
            </div>
        </div>
    );
}

function CountUp({ value }: { value: number }) {
    const n = useCountUp(value);
    return <>{formatInt(n)}</>;
}

// ─── Hero: RDV décrochés ────────────────────────────────────────────────────

function RdvHero({ className, meetings, actions, joinedCalls, callsPerRdv, conversion, periodLabel, delta, previousMeetings, rangeDays, period }: {
    className?: string;
    meetings: number;
    actions: number;
    joinedCalls: number;
    callsPerRdv: number | null;
    conversion: number;
    periodLabel: string;
    delta: number | null;
    previousMeetings: number | null;
    rangeDays: number;
    period: ManagerHomePeriod | null;
}) {
    const count = useCountUp(meetings);
    const series = period?.series ?? [];
    const unit = period?.range.granularity === "week" ? "semaine" : "jour";
    const perDay = rangeDays > 0 ? Math.round((meetings / rangeDays) * 10) / 10 : 0;

    return (
        <HeroCard className={cn("flex flex-col justify-between gap-5", className)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <HeroPill icon={Trophy}>RDV décrochés</HeroPill>
                    <span className="inline-flex items-center h-7 px-2.5 rounded-full text-[11px] font-bold bg-accent/15 text-inverse-ink-2 border border-emerald-400/20 tabular-nums">
                        {pct1(Math.round(conversion * 10) / 10)} conv.
                    </span>
                </div>
                <span className="text-xs text-accent-300 font-semibold">{periodLabel}</span>
            </div>

            <div className="flex items-end justify-between gap-6">
                <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                        <span className="text-[56px] sm:text-[64px] font-black leading-[0.9] tracking-tighter text-white">
                            {formatInt(count)}
                        </span>
                        <span className="text-lg font-black text-inverse-ink-3">RDV</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Delta value={delta} onDark suffix="vs période préc." />
                        <span className="text-xs text-inverse-ink-2 font-medium">
                            {previousMeetings !== null
                                ? `contre ${formatInt(previousMeetings)} RDV sur la période précédente`
                                : "pas de période de comparaison"}
                        </span>
                    </div>
                </div>

                {/* Real RDV per day (or week) — replaces the evenly-spread fake sparkline. */}
                <div className="hidden sm:block w-[46%] max-w-[340px] min-w-[180px]">
                    <div className="h-[64px]" aria-label={`RDV par ${unit}`} role="img">
                        {series.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <BarChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
                                    <Tooltip
                                        cursor={{ fill: "rgba(255,255,255,0.06)" }}
                                        content={(p) => (
                                            <ChartTooltip active={p.active} payload={p.payload} label={p.label} />
                                        )}
                                    />
                                    <Bar dataKey="meetings" name="RDV" fill="#34D399" radius={[4, 4, 0, 0]} maxBarSize={18} minPointSize={2} isAnimationActive={false} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full rounded-xl bg-inverse-raised motion-safe:animate-pulse" />
                        )}
                    </div>
                    <div className="h-px bg-white/10" />
                    {series.length > 0 && (
                        <div className="mt-1 flex justify-between text-[10px] font-semibold text-inverse-ink-3">
                            <span className="capitalize">{series[0].label}</span>
                            <span>RDV / {unit}</span>
                            <span className="capitalize">{series[series.length - 1].label}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <HeroTile label="Période préc.">
                    {previousMeetings !== null ? formatInt(previousMeetings) : "—"}
                </HeroTile>
                <HeroTile label="Rythme">
                    <span className="text-accent-300">{perDay.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</span>
                    <span className="text-[10px] font-bold text-inverse-ink-3 ml-1">/ jour</span>
                </HeroTile>
                <HeroTile label="Rendement">
                    {callsPerRdv ? `1 RDV / ${formatInt(callsPerRdv)} appels` : "—"}
                </HeroTile>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] font-semibold text-inverse-ink-2 tabular-nums">
                <span>{formatInt(actions)} appels · {formatInt(joinedCalls)} joints</span>
                <span>RDV / joints : {pct1(conversion)}</span>
            </div>
        </HeroCard>
    );
}

// ─── Résultats des appels ───────────────────────────────────────────────────

function ResultsCard({ slices, total, meetings }: { slices: ReturnType<typeof groupOutcomes>["slices"]; total: number; meetings: number }) {
    return (
        <section className={cn(CARD, "p-6 space-y-4 @container min-w-0")}>
            <SectionHeader icon={Activity} tone="emerald" title="Résultats des appels" count={formatInt(total)} subtitle="Répartition des qualifications" />
            {slices.length === 0 ? (
                <EmptyBlock compact icon={Activity} tone="slate" title="Aucun résultat sur cette période" />
            ) : (
                <div className="flex flex-col @[22rem]:flex-row items-center gap-5">
                    <div className="relative flex-shrink-0 w-[132px] h-[132px]">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <PieChart>
                                <Pie
                                    data={slices}
                                    dataKey="count"
                                    nameKey="label"
                                    innerRadius={44}
                                    outerRadius={64}
                                    startAngle={90}
                                    endAngle={-270}
                                    stroke="#fff"
                                    strokeWidth={2}
                                    isAnimationActive={false}
                                >
                                    {slices.map((s) => <Cell key={s.key} fill={s.color} />)}
                                </Pie>
                                <Tooltip content={(p) => <ChartTooltip active={p.active} payload={p.payload} />} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-xl font-black text-zinc-900 leading-none">{formatInt(meetings)}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mt-0.5">RDV</span>
                        </div>
                    </div>
                    <ul className="flex-1 w-full min-w-0 space-y-1">
                        {slices.map((s) => (
                            <li key={s.key} className="flex items-center justify-between gap-2 h-7 px-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors">
                                <span className="flex items-center gap-2 min-w-0">
                                    <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: s.color }} aria-hidden />
                                    <span className="text-xs font-semibold text-zinc-600 truncate" title={s.label}>{s.label}</span>
                                </span>
                                <span className="flex items-baseline gap-2 flex-shrink-0 tabular-nums">
                                    <span className="text-xs font-black text-zinc-900">{formatInt(s.count)}</span>
                                    <span className="w-9 text-right text-[11px] font-bold text-zinc-400">{s.pct} %</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
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

// ─── Progression (cumul réel vs période précédente) ─────────────────────────

function ProgressionCard({ period, meetings, previousMeetings }: { period: ManagerHomePeriod | null; meetings: number; previousMeetings: number | null }) {
    const data = useMemo(() => {
        const series = period?.series ?? [];
        // Repère = the previous period's pace, projected on this period's buckets.
        const pace = previousMeetings !== null && series.length > 0 ? previousMeetings / series.length : null;
        return series.reduce<{ label: string; cumul: number; repere: number | null }[]>((acc, b, i) => [
            ...acc,
            {
                label: b.label,
                cumul: (acc[i - 1]?.cumul ?? 0) + b.meetings,
                repere: pace !== null ? Math.round(pace * (i + 1)) : null,
            },
        ], []);
    }, [period, previousMeetings]);

    return (
        <section className={cn(CARD, "p-6 space-y-3 min-w-0")}>
            <SectionHeader
                icon={TrendingUp}
                tone="teal"
                title="Progression"
                subtitle={previousMeetings !== null ? "Cumul des RDV vs rythme de la période précédente" : "Cumul des RDV sur la période"}
                right={
                    <span className="text-xs font-black text-zinc-900 tabular-nums whitespace-nowrap">
                        {formatInt(meetings)}
                        {previousMeetings !== null && (
                            <span className="text-zinc-400 font-bold"> / {formatInt(previousMeetings)} RDV préc.</span>
                        )}
                    </span>
                }
            />
            {data.length === 0 ? (
                <Shimmer className="h-[184px] rounded-2xl" />
            ) : (
                <>
                    <div className="h-[184px] -ml-2" role="img" aria-label="Cumul des RDV face à la période précédente">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                                <CartesianGrid vertical={false} stroke="var(--ds-line-subtle)" />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 10, fill: "var(--ds-ink-4)", fontWeight: 600 }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval="preserveStartEnd"
                                    minTickGap={24}
                                />
                                <YAxis
                                    width={32}
                                    allowDecimals={false}
                                    tick={{ fontSize: 10, fill: "var(--ds-ink-4)", fontWeight: 600 }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickCount={4}
                                />
                                <Tooltip
                                    cursor={{ stroke: "var(--ds-line)", strokeWidth: 1 }}
                                    content={(p) => <ChartTooltip active={p.active} payload={p.payload} label={p.label} />}
                                />
                                <Line type="monotone" dataKey="repere" name="Période précédente" stroke="var(--ds-line-strong)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                                <Line
                                    type="monotone"
                                    dataKey="cumul"
                                    name="Réalisé"
                                    stroke="#10B981"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    dot={false}
                                    activeDot={{ r: 4, fill: "#10B981", stroke: "#fff", strokeWidth: 2 }}
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] font-semibold text-zinc-500">
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-0.5 rounded-full bg-emerald-500" aria-hidden /> Réalisé
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 border-t-[1.5px] border-dashed border-slate-300" aria-hidden /> Période précédente
                        </span>
                    </div>
                </>
            )}
        </section>
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
                    <Shimmer className="h-4 w-96 max-w-full rounded-lg" />
                </div>
                <div className="flex gap-2">
                    <Shimmer className="h-9 w-36 rounded-xl" />
                    <Shimmer className="h-9 w-44 rounded-xl" />
                    <Shimmer className="h-11 w-40 rounded-2xl" />
                </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                <div className="xl:col-span-8 h-[300px] rounded-3xl bg-inverse/90 motion-safe:animate-pulse" />
                <div className="xl:col-span-4 grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-4">
                    {[0, 1, 2].map((i) => <Shimmer key={i} className="h-[92px] rounded-3xl" />)}
                </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-8 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Shimmer className="h-[260px] rounded-3xl" />
                        <Shimmer className="h-[260px] rounded-3xl" />
                    </div>
                    <Shimmer className="h-[300px] rounded-3xl" />
                    <Shimmer className="h-[280px] rounded-3xl" />
                </div>
                <div className="xl:col-span-4 space-y-6">
                    <Shimmer className="h-[440px] rounded-3xl" />
                    <Shimmer className="h-[360px] rounded-3xl" />
                </div>
            </div>
        </div>
    );
}
