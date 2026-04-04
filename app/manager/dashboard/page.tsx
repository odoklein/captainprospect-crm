"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Phone, RefreshCw, TrendingUp, ArrowUpRight, Flame, Trophy,
    Clock, ArrowRight, Loader2, Calendar, ChevronDown, Target,
    Zap, Activity, Users, Star, CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import {
    DateRangeFilter, getPresetRange, toISO,
    type DateRangeValue, type DateRangePreset,
} from "@/components/dashboard/DateRangeFilter";
import {
    AreaChart, Area, PieChart, Pie, Cell,
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { LiveTeamStrip } from "./LiveTeamStrip";
import { SmartAlerts } from "./SmartAlerts";
import { QuickActionsPanel } from "./QuickActionsPanel";

/* ─── Types ─── */
interface DashboardStats {
    period: string;
    totalActions: number;
    meetingsBooked: number;
    opportunities: number;
    activeMissions: number;
    conversionRate: number;
    resultBreakdown: {
        NO_RESPONSE: number; BAD_CONTACT: number; INTERESTED: number;
        CALLBACK_REQUESTED: number; MEETING_BOOKED: number; DISQUALIFIED: number;
    };
    leaderboard: { id: string; name: string; actions: number }[];
    rdvLeaderboard: { id: string; name: string; rdv: number; actions: number }[];
}
interface MissionSummaryItem {
    id: string; name: string; isActive: boolean;
    client: { id: string; name: string };
    sdrCount: number; actionsThisPeriod: number;
    meetingsThisPeriod: number; lastActionAt: string | null;
}
interface RecentActivityItem {
    id: string; user: string; userId: string; action: string; time: string;
    type: "call" | "meeting" | "schedule"; createdAt: string;
    result?: string; contactOrCompanyName?: string; campaignName?: string;
}

/* ─── Constants ─── */
const PRESET_LABELS: Record<DateRangePreset, string> = {
    last7: "7 derniers jours", last4weeks: "4 dernières semaines",
    lastMonth: "Mois dernier", last6months: "6 derniers mois",
    last12months: "12 derniers mois", monthToDate: "Mois en cours",
    quarterToDate: "Trimestre en cours", yearToDate: "Année en cours",
    allTime: "Tout",
};
const RDV_WEEKLY_GOAL = 30;
const PIE_LABELS: Record<string, string> = {
    MEETING_BOOKED: "RDV obtenu", CALLBACK_REQUESTED: "Rappel prévu",
    INTERESTED: "Intéressé", NO_RESPONSE: "Pas répondu",
    BAD_CONTACT: "Mauvais N.", DISQUALIFIED: "Hors cible",
};
const PIE_COLORS: Record<string, string> = {
    MEETING_BOOKED: "#7C5CFC", INTERESTED: "#A78BFA",
    CALLBACK_REQUESTED: "#F59E0B", NO_RESPONSE: "#E2E8F0",
    BAD_CONTACT: "#CBD5E1", DISQUALIFIED: "#94A3B8",
};
const DAYS = ["L", "M", "Me", "J", "V", "S", "D"];

/* ─── Helpers ─── */
function getInitials(name: string) {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}
function buildSparklineData(n: number) {
    return DAYS.map((day, i) => {
        const cumul = Math.round(n * ((i + 1) / 7));
        const prev = i === 0 ? 0 : Math.round(n * (i / 7));
        return { day, rdv: Math.max(0, cumul - prev) };
    });
}
function buildWeeklyGoalData(n: number) {
    return DAYS.map((jour, i) => ({
        jour,
        objectif: Math.round((RDV_WEEKLY_GOAL / 7) * (i + 1) * 10) / 10,
        cumul: Math.round(n * ((i + 1) / 7)),
    }));
}

/* ─── Animated Counter ─── */
function useCountUp(target: number, duration = 1000) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (target === 0) { setCount(0); return; }
        let current = 0;
        const step = Math.max(1, Math.ceil(target / (duration / 40)));
        const id = setInterval(() => {
            current += step;
            if (current >= target) { setCount(target); clearInterval(id); }
            else setCount(current);
        }, 40);
        return () => clearInterval(id);
    }, [target, duration]);
    return count;
}

/* ─── Progress Ring ─── */
function ProgressRing({ pct, size = 56, stroke = 5, color = "#7C5CFC" }: {
    pct: number; size?: number; stroke?: number; color?: string;
}) {
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    return (
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke="rgba(124,92,252,0.12)" strokeWidth={stroke} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={color} strokeWidth={stroke}
                strokeDasharray={circ} strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 1s ease-out" }} />
        </svg>
    );
}

/* ─── Stat Card (dark hero) ─── */
function HeroKpiCard({ label, value, sub, pct, icon: Icon, sparkData }: {
    label: string; value: number; sub: string; pct: number;
    icon: typeof Trophy; sparkData: { day: string; rdv: number }[];
}) {
    const count = useCountUp(value);
    return (
        <div className="flex-[2] relative overflow-hidden rounded-2xl p-6 flex flex-col gap-3"
            style={{ background: "linear-gradient(145deg, #16103A 0%, #1A1040 40%, #0D0A2E 100%)" }}>
            {/* Glow blobs */}
            <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full blur-3xl opacity-30"
                style={{ background: "radial-gradient(circle, #7C5CFC, transparent)" }} />
            <div className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full blur-3xl opacity-15"
                style={{ background: "radial-gradient(circle, #A78BFA, transparent)" }} />

            <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-violet-300" />
                    </div>
                    <span className="text-[13px] font-medium text-white/50">{label}</span>
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400">
                    <ArrowUpRight className="w-3 h-3" />
                    {pct.toFixed(1)}% conv.
                </div>
            </div>

            <div className="relative z-10 flex items-end gap-4">
                <div>
                    <div className="text-[56px] font-black text-white leading-none tracking-tighter">
                        {count}
                    </div>
                    <div className="text-[13px] text-white/30 mt-1">{sub}</div>
                </div>
                <div className="mb-2 flex flex-col items-center gap-0.5">
                    <ProgressRing pct={Math.min(100, (value / RDV_WEEKLY_GOAL) * 100)} size={52} stroke={5} />
                    <span className="text-[10px] text-white/40">{Math.round((value / RDV_WEEKLY_GOAL) * 100)}%</span>
                </div>
            </div>

            {/* Sparkline */}
            <div className="relative z-10 h-[42px] -mx-1 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData}>
                        <defs>
                            <linearGradient id="spark-hero" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#7C5CFC" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#7C5CFC" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="rdv" stroke="#7C5CFC" strokeWidth={2}
                            fill="url(#spark-hero)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Progress bar */}
            <div className="relative z-10">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-white/30">Objectif hebdomadaire</span>
                    <span className="text-[11px] font-bold text-violet-400">{Math.round((value / RDV_WEEKLY_GOAL) * 100)}%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000"
                        style={{
                            width: `${Math.min(100, (value / RDV_WEEKLY_GOAL) * 100)}%`,
                            background: "linear-gradient(90deg, #7C5CFC, #A78BFA)",
                        }} />
                </div>
            </div>
        </div>
    );
}

/* ─── Mini KPI card ─── */
function MiniKpi({ label, value, suffix, icon: Icon, bgColor, iconColor, trend }: {
    label: string; value: number; suffix?: string;
    icon: typeof Phone; bgColor: string; iconColor: string; trend?: "up" | "down";
}) {
    const count = useCountUp(value);
    return (
        <div className="flex-1 bg-white rounded-2xl border border-slate-100 p-4 flex items-center justify-between group hover:shadow-md hover:border-violet-100 transition-all duration-200">
            <div>
                <div className="text-[11px] text-slate-400 font-medium mb-1 uppercase tracking-wider">{label}</div>
                <div className="flex items-end gap-1">
                    <span className="text-[28px] font-black text-slate-800 leading-none">{count}</span>
                    {suffix && <span className="text-[16px] text-slate-400 mb-0.5">{suffix}</span>}
                </div>
                {trend && (
                    <div className={cn("flex items-center gap-0.5 text-[10px] font-semibold mt-1",
                        trend === "up" ? "text-emerald-500" : "text-red-400"
                    )}>
                        {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : <TrendingUp className="w-3 h-3 rotate-180" />}
                        vs période précédente
                    </div>
                )}
            </div>
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110", bgColor)}>
                <Icon className={cn("w-5 h-5", iconColor)} />
            </div>
        </div>
    );
}

/* ─── Custom Tooltip ─── */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-xl text-[12px] min-w-[120px]">
            <p className="text-slate-500 mb-2 font-medium">{label}</p>
            {payload.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                    <span className="text-slate-600">{p.name}:</span>
                    <span className="font-bold text-slate-800">{p.value}</span>
                </div>
            ))}
        </div>
    );
}

/* ════════════════════════════════════════════════════════
   DASHBOARD DATA FETCH
════════════════════════════════════════════════════════ */
interface DashboardData {
    stats: DashboardStats | null;
    missions: MissionSummaryItem[];
    recentActivity: RecentActivityItem[];
}
async function fetchDashboardData(
    start: string,
    end: string,
    missionId: string
): Promise<DashboardData> {
    const statsUrl = `/api/stats?startDate=${start}&endDate=${end}${missionId ? `&missionId=${missionId}` : ""}`;
    const [statsRes, missionsRes, recentRes] = await Promise.all([
        fetch(statsUrl),
        fetch(`/api/stats/missions-summary?startDate=${start}&endDate=${end}&limit=10`),
        fetch("/api/actions/recent?limit=20"),
    ]);
    const [statsJson, missionsJson, recentJson] = await Promise.all([
        statsRes.json(), missionsRes.json(), recentRes.json(),
    ]);
    return {
        stats: statsJson.success ? statsJson.data : null,
        missions: missionsJson.success ? missionsJson.data?.missions ?? [] : [],
        recentActivity: recentJson.success ? recentJson.data ?? [] : [],
    };
}

/* ════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════ */
export default function ManagerDashboard() {
    const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
        const { start, end } = getPresetRange("lastMonth");
        return { preset: "lastMonth", startDate: toISO(start), endDate: toISO(end) };
    });
    const [dateFilterOpen, setDateFilterOpen] = useState(false);
    const dateFilterRef = useRef<HTMLDivElement>(null);
    const [missionFilter, setMissionFilter] = useState("");

    const start = dateRange.startDate && dateRange.endDate
        ? dateRange.startDate
        : toISO(getPresetRange((dateRange.preset as DateRangePreset) || "lastMonth").start);
    const end = dateRange.startDate && dateRange.endDate
        ? dateRange.endDate
        : toISO(getPresetRange((dateRange.preset as DateRangePreset) || "lastMonth").end);

    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: ["manager", "dashboard", start, end, missionFilter],
        queryFn: () => fetchDashboardData(start, end, missionFilter),
        refetchInterval: 60_000,
    });
    const stats = data?.stats ?? null;
    const missions = data?.missions ?? [];
    const recentActivity = data?.recentActivity ?? [];

    const rdvGoalPct = stats ? Math.min((stats.meetingsBooked / RDV_WEEKLY_GOAL) * 100, 100) : 0;
    const hotLeads = stats ? (stats.resultBreakdown.INTERESTED + stats.resultBreakdown.CALLBACK_REQUESTED) : 0;
    const callbackCount = stats?.resultBreakdown?.CALLBACK_REQUESTED ?? 0;

    const rdvActivity = useMemo(() => recentActivity.filter((a) => a.type === "meeting" || a.result === "MEETING_BOOKED"), [recentActivity]);
    const missionsNearGoal = useMemo(() => missions.filter((m) => m.isActive && m.meetingsThisPeriod > 0).sort((a, b) => b.meetingsThisPeriod - a.meetingsThisPeriod).slice(0, 5), [missions]);
    const totalResults = useMemo(() => stats?.resultBreakdown ? Object.values(stats.resultBreakdown).reduce((a, b) => a + b, 0) : 0, [stats]);
    const callResultsPieData = useMemo(() => stats?.resultBreakdown ? Object.entries(stats.resultBreakdown).filter(([, v]) => v > 0).map(([key, value]) => ({ name: PIE_LABELS[key] ?? key, value, color: PIE_COLORS[key] ?? "#94A3B8", pct: totalResults > 0 ? Math.round((value / totalResults) * 100) : 0 })) : [], [stats, totalResults]);
    const sparklineData = useMemo(() => buildSparklineData(stats?.meetingsBooked ?? 0), [stats?.meetingsBooked]);
    const weeklyGoalData = useMemo(() => buildWeeklyGoalData(stats?.meetingsBooked ?? 0), [stats?.meetingsBooked]);

    if (isLoading && !stats) {
        return (
            <div className="flex items-center justify-center py-40" style={{ background: "#F4F6FA" }}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center">
                        <Loader2 className="w-7 h-7 text-violet-600 animate-spin" />
                    </div>
                    <p className="text-[13px] text-slate-400 font-medium">Chargement du tableau de bord...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full p-5 lg:p-6" style={{ background: "linear-gradient(160deg, #F4F6FA 0%, #EEF2FF 100%)", fontFamily: "'Inter', system-ui, sans-serif" }}>

            {/* ── Page Header ── */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                            <Activity className="w-4 h-4 text-white" />
                        </div>
                        <h1 className="text-[22px] font-black text-slate-900 tracking-tight">Tableau de bord</h1>
                    </div>
                    <p className="text-[12px] text-slate-400 ml-10">
                        <span className="font-medium text-slate-500">
                            {dateRange.preset ? PRESET_LABELS[dateRange.preset] : dateRange.startDate && dateRange.endDate
                                ? `Du ${new Date(dateRange.startDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} au ${new Date(dateRange.endDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`
                                : "Période"}
                        </span>
                        {" · "}{missionFilter ? "Mission sélectionnée" : "Toutes les missions"}
                    </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Date filter */}
                    <div className="relative" ref={dateFilterRef}>
                        <button onClick={() => setDateFilterOpen((o) => !o)}
                            className="flex items-center gap-2 px-3.5 py-2 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:border-violet-300 hover:shadow-sm transition-all duration-150 shadow-sm">
                            <Calendar className="w-3.5 h-3.5 text-violet-500" />
                            <span>{dateRange.preset ? PRESET_LABELS[dateRange.preset] : "Plage"}</span>
                            <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform", dateFilterOpen && "rotate-180")} />
                        </button>
                        {dateFilterOpen && (
                            <>
                                <div className="fixed inset-0 z-40" aria-hidden onClick={() => setDateFilterOpen(false)} />
                                <div className="absolute right-0 top-full mt-2 z-50 max-w-[calc(100vw-2rem)]">
                                    <DateRangeFilter value={dateRange} onChange={(v) => setDateRange(v)} onClose={() => setDateFilterOpen(false)} isOpen />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Mission filter */}
                    <select value={missionFilter} onChange={(e) => setMissionFilter(e.target.value)}
                        className="px-3.5 py-2 text-[12px] font-medium text-slate-700 bg-white border border-slate-200 rounded-xl min-w-[160px] focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 shadow-sm">
                        <option value="">Toutes les missions</option>
                        {missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>

                    {/* Refresh */}
                    <button onClick={() => refetch()} disabled={isFetching}
                        className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-violet-600 hover:border-violet-300 hover:shadow-sm transition-all duration-150 shadow-sm disabled:opacity-50">
                        <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
                    </button>

                    {/* New mission CTA */}
                    <Link href="/manager/missions/new"
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold text-white shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-[1.02] transition-all duration-150"
                        style={{ background: "linear-gradient(135deg, #7C5CFC 0%, #5C3DFA 100%)" }}>
                        <span className="text-lg leading-none">+</span>
                        <span>Nouvelle mission</span>
                    </Link>
                </div>
            </div>

            {/* ── Live Team Strip ── */}
            <LiveTeamStrip />

            {/* ── Smart Alerts ── */}
            <SmartAlerts />

            {/* ══ ROW 1 — Hero KPIs ══ */}
            <div className="flex flex-col lg:flex-row gap-4 mb-4">
                <HeroKpiCard
                    label="RDV décrochés"
                    value={stats?.meetingsBooked ?? 0}
                    sub={`sur ${RDV_WEEKLY_GOAL} hebdomadaire`}
                    pct={stats?.conversionRate ?? 0}
                    icon={Trophy}
                    sparkData={sparklineData}
                />
                <div className="flex-[1.2] flex flex-col gap-3">
                    <MiniKpi label="Appels effectués" value={stats?.totalActions ?? 0} icon={Phone} bgColor="bg-violet-50" iconColor="text-violet-600" trend="up" />
                    <MiniKpi label="Leads chauds 🔥" value={hotLeads} icon={Flame} bgColor="bg-amber-50" iconColor="text-amber-500" />
                    <MiniKpi label="Taux de conversion" value={Math.round((stats?.conversionRate ?? 0) * 10) / 10} suffix="%" icon={TrendingUp} bgColor="bg-emerald-50" iconColor="text-emerald-500" trend="up" />
                </div>
            </div>

            {/* ══ ROW 2 — Charts + Insights ══ */}
            <div className="flex flex-col xl:flex-row gap-4 mb-4">

                {/* LEFT COL (60%) */}
                <div className="flex-[3] flex flex-col gap-4">

                    {/* Charts row */}
                    <div className="flex flex-col lg:flex-row gap-4">

                        {/* Résultats appels — donut */}
                        <div className="flex-1 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-[14px] font-bold text-slate-800">Résultats des appels</h3>
                                <span className="text-[11px] font-semibold text-slate-400">{totalResults} total</span>
                            </div>
                            {callResultsPieData.length > 0 ? (
                                <div className="flex items-center gap-5">
                                    {/* Donut */}
                                    <div className="relative flex-shrink-0" style={{ width: 120, height: 120 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie data={callResultsPieData} cx="50%" cy="50%"
                                                    innerRadius={36} outerRadius={54}
                                                    dataKey="value" strokeWidth={2} stroke="#fff">
                                                    {callResultsPieData.map((entry, i) => (
                                                        <Cell key={i} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                        {/* Center label */}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-[16px] font-black text-slate-800">{stats?.meetingsBooked ?? 0}</span>
                                            <span className="text-[9px] text-slate-400 font-medium">RDV</span>
                                        </div>
                                    </div>
                                    {/* Legend */}
                                    <div className="flex-1 space-y-2 min-w-0">
                                        {callResultsPieData.map((item, i) => (
                                            <div key={i} className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
                                                    <span className="text-[11px] text-slate-500 truncate">{item.name}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                                                    <span className="text-[11px] font-bold text-slate-700">{item.value}</span>
                                                    <span className="text-[10px] text-slate-300 w-7 text-right">{item.pct}%</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="py-8 text-center">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-2">
                                        <Activity className="w-6 h-6 text-slate-300" />
                                    </div>
                                    <p className="text-[13px] text-slate-400">Aucun résultat sur cette période</p>
                                </div>
                            )}
                        </div>

                        {/* Leads à relancer */}
                        <div className="flex-1 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[14px] font-bold text-slate-800">Leads à relancer</h3>
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-100 text-violet-600">
                                    {callbackCount} en attente
                                </span>
                            </div>

                            <div className="space-y-3">
                                {/* Callbacks */}
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
                                    <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                                        <Clock className="w-4 h-4 text-amber-600" />
                                    </div>
                                    <div>
                                        <p className="text-[12px] font-bold text-slate-800">{callbackCount} rappels planifiés</p>
                                        <p className="text-[11px] text-slate-400">À contacter en priorité</p>
                                    </div>
                                </div>
                                {/* Interested */}
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-50 border border-violet-100">
                                    <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                                        <Star className="w-4 h-4 text-violet-600" />
                                    </div>
                                    <div>
                                        <p className="text-[12px] font-bold text-slate-800">{stats?.resultBreakdown?.INTERESTED ?? 0} contacts intéressés</p>
                                        <p className="text-[11px] text-slate-400">Haute probabilité de conversion</p>
                                    </div>
                                </div>
                            </div>

                            <Link href="/manager/prospection"
                                className="mt-4 flex items-center gap-1.5 text-[12px] font-bold text-violet-600 hover:text-violet-800 transition-colors">
                                Voir la file de prospection <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                    </div>

                    {/* Missions near goal */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2">
                                <Target className="w-4 h-4 text-violet-500" />
                                <h3 className="text-[14px] font-bold text-slate-800">Missions proches de l'objectif</h3>
                            </div>
                            <Link href="/manager/missions" className="text-[12px] font-bold text-violet-600 hover:text-violet-800 transition-colors">
                                Voir toutes →
                            </Link>
                        </div>
                        {missionsNearGoal.length === 0 ? (
                            <p className="text-[13px] text-slate-400 py-4 text-center">Aucune mission active avec des RDV</p>
                        ) : (
                            <div className="space-y-4">
                                {missionsNearGoal.map((m) => {
                                    const goal = 20;
                                    const pct = Math.min(100, Math.round((m.meetingsThisPeriod / goal) * 100));
                                    const isHot = pct >= 80;
                                    return (
                                        <Link key={m.id} href={`/manager/missions/${m.id}`} className="block group">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    {isHot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                                                    <span className="text-[13px] font-semibold text-slate-700 group-hover:text-violet-600 transition-colors">{m.name}</span>
                                                    <span className="text-[10px] text-slate-400">· {m.client.name}</span>
                                                </div>
                                                <span className="text-[12px] font-bold text-slate-600">{m.meetingsThisPeriod}<span className="font-normal text-slate-300">/{goal}</span></span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-700"
                                                    style={{
                                                        width: `${pct}%`,
                                                        background: isHot
                                                            ? "linear-gradient(90deg, #7C5CFC, #A78BFA)"
                                                            : pct >= 60 ? "#F59E0B" : "#CBD5E1",
                                                    }} />
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COL (40%) */}
                <div className="flex-[2] flex flex-col gap-4">

                    {/* Leaderboard RDV */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2">
                                <Trophy className="w-4 h-4 text-amber-500" />
                                <h3 className="text-[14px] font-bold text-slate-800">Leaderboard RDV</h3>
                            </div>
                            <div className={cn(
                                "flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full",
                                rdvGoalPct >= 100 ? "bg-emerald-50 text-emerald-600"
                                    : rdvGoalPct >= 80 ? "bg-emerald-50 text-emerald-600"
                                        : "bg-amber-50 text-amber-600"
                            )}>
                                <Zap className="w-3 h-3" />
                                {rdvGoalPct >= 100 ? "Objectif atteint 🎉"
                                    : rdvGoalPct >= 80 ? "En avance 🔥"
                                        : `${Math.round(100 - rdvGoalPct)}% restant`}
                            </div>
                        </div>

                        {stats?.rdvLeaderboard?.length ? (
                            <div className="space-y-1.5">
                                {stats.rdvLeaderboard.map((person, i) => {
                                    const isFirst = i === 0;
                                    const maxRdv = stats.rdvLeaderboard[0]?.rdv || 1;
                                    const barPct = Math.round((person.rdv / maxRdv) * 100);
                                    return (
                                        <div key={person.id}
                                            className={cn(
                                                "flex items-center gap-3 p-2.5 rounded-xl transition-all duration-150",
                                                isFirst
                                                    ? "bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-100"
                                                    : "hover:bg-slate-50"
                                            )}>
                                            {/* Rank */}
                                            <span className={cn("w-5 text-[12px] font-black text-center flex-shrink-0",
                                                i === 0 ? "text-amber-400" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-600" : "text-slate-300"
                                            )}>
                                                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                                            </span>
                                            {/* Avatar */}
                                            <div className={cn(
                                                "w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black text-white flex-shrink-0",
                                                isFirst
                                                    ? "bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-300"
                                                    : "bg-slate-200 text-slate-600"
                                            )}>
                                                {getInitials(person.name)}
                                            </div>
                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className={cn("text-[12px] font-bold truncate",
                                                        isFirst ? "text-violet-700" : "text-slate-700"
                                                    )}>{person.name}</span>
                                                    <span className="text-[13px] font-black text-slate-800 flex-shrink-0 ml-2">{person.rdv}<span className="text-[10px] font-normal text-slate-400 ml-0.5">RDV</span></span>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full transition-all duration-700"
                                                        style={{
                                                            width: `${barPct}%`,
                                                            background: isFirst ? "linear-gradient(90deg,#7C5CFC,#A78BFA)" : "#CBD5E1"
                                                        }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="py-6 text-center">
                                <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                <p className="text-[13px] text-slate-400">Pas encore de RDV sur cette période</p>
                            </div>
                        )}
                    </div>

                    {/* Weekly goal chart */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-[14px] font-bold text-slate-800">Progression hebdo</h3>
                            <span className="text-[11px] font-semibold text-slate-400">
                                {stats?.meetingsBooked ?? 0} / {RDV_WEEKLY_GOAL} RDV
                            </span>
                        </div>
                        <div className="h-[100px] mt-3">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={weeklyGoalData}>
                                    <XAxis dataKey="jour" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                                    <YAxis hide domain={[0, Math.max(35, (stats?.meetingsBooked ?? 0) + 5)]} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Line type="monotone" dataKey="objectif" stroke="#E2E8F0" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="Objectif" />
                                    <Line type="monotone" dataKey="cumul" stroke="#7C5CFC" strokeWidth={2.5} dot={false} name="Réalisé" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Recent RDV activity */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <div className="flex items-center gap-2 mb-4">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <h3 className="text-[14px] font-bold text-slate-800">Activité récente</h3>
                        </div>
                        {rdvActivity.length === 0 ? (
                            <p className="text-[13px] text-slate-400 py-3 text-center">Aucun RDV sur cette période</p>
                        ) : (
                            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1"
                                style={{ scrollbarWidth: "thin", scrollbarColor: "#E2E8F0 transparent" }}>
                                {rdvActivity.slice(0, 10).map((item, idx) => (
                                    <div key={item.id} className="flex items-start gap-3"
                                        style={{ opacity: 0, animation: `fadeInUp 0.3s ease ${idx * 0.05}s forwards` }}>
                                        <div className="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] text-slate-600 leading-relaxed">
                                                <span className="font-bold text-slate-800">{item.user}</span>
                                                {" "}a décroché un RDV{item.contactOrCompanyName && (
                                                    <> avec <span className="font-bold text-violet-600">{item.contactOrCompanyName}</span></>
                                                )}
                                            </p>
                                            <span className="text-[10px] text-slate-300">{item.time}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Quick Actions Panel ── */}
            <QuickActionsPanel />

            <style>{`
                @keyframes fadeInUp {
                    from { opacity:0; transform:translateY(6px); }
                    to   { opacity:1; transform:translateY(0); }
                }
            `}</style>
        </div>
    );
}
