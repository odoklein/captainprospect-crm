"use client";

import { useEffect, useState, useMemo } from "react";
import {
    PhoneCall,
    Search,
    X,
    Clock,
    CalendarDays,
    ChevronDown,
    RefreshCw,
    Mail,
    Phone,
    Briefcase,
    CheckCircle2,
    Activity,
    Target,
    TrendingUp,
    Sparkles,
} from "lucide-react";
import { useToast } from "@/components/ui";
import { ACTION_RESULT_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

import {
    type CallItem,
    type NormalizedCall,
    type StatusDef,
    type ResultCategoryDef,
    type ResultMeta,
    buildResultMeta,
    fmtDuration,
    fmtTime,
    dayKey,
    getInitials,
    avatarGradient,
    RESULT_META_FALLBACK,
    ResultBadge,
    MiniBar,
    CallCard,
    DayBlock,
} from "@/components/activity/CallActivity";

// ─── Mission Section ──────────────────────────────────────────────────────────
function MissionSection({ missionName, calls, defaultOpen, statusOrder, resultMeta, index }: {
    missionName: string; calls: NormalizedCall[]; defaultOpen: boolean;
    statusOrder: string[];
    resultMeta: Record<string, { label: string; color: string; bg: string; border: string }>;
    index: number;
}) {
    const [open, setOpen] = useState(defaultOpen);

    const byDay = useMemo(() => {
        const map: Record<string, NormalizedCall[]> = {};
        calls.forEach((c) => {
            const k = dayKey(c.createdAt);
            if (!map[k]) map[k] = [];
            map[k].push(c);
        });
        return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
    }, [calls]);

    const meetings = calls.filter((c) => c.result === "MEETING_BOOKED").length;
    const convRate = calls.length ? Math.round((meetings / calls.length) * 100) : 0;
    const campaigns = [...new Set(calls.map((c) => c.campaign.name))];

    const kpis = [
        { value: calls.length, label: "appels", from: "from-indigo-50", to: "to-violet-50", border: "border-indigo-100/60", text: "text-indigo-700" },
        { value: byDay.length,  label: "jours",  from: "from-sky-50",    to: "to-cyan-50",   border: "border-sky-100/60",    text: "text-sky-700"   },
        { value: meetings,      label: "RDV",    from: "from-emerald-50",to: "to-teal-50",   border: "border-emerald-100/60",text: "text-emerald-700"},
        { value: `${convRate}%`,label: "taux",   from: "from-violet-50", to: "to-purple-50", border: "border-violet-100/60", text: "text-violet-700" },
    ];

    return (
        <div
            className="premium-card overflow-hidden"
            style={{ animation: `dashFadeUp 0.4s ease both ${index * 80}ms` }}
        >
            {/* Mission header – mirrors BreakdownCharts header */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-4 border-b border-[#E8EBF0]">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm shadow-violet-500/20 flex-shrink-0">
                        <Target className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[#12122A] uppercase tracking-wider truncate">
                            {missionName}
                        </h3>
                        <p className="text-[11px] text-[#8B8DAF] mt-0.5 truncate">
                            {campaigns.join(" · ")}
                        </p>
                    </div>
                </div>

                {/* KPI chips – same gradient card style as BreakdownCharts */}
                <div className="flex items-center gap-2 flex-wrap">
                    {kpis.map(({ value, label, from, to, border, text }) => (
                        <div
                            key={label}
                            className={cn(
                                "rounded-lg bg-gradient-to-br border px-3 py-1.5 text-center",
                                from, to, border
                            )}
                        >
                            <p className={cn("text-sm font-black leading-none", text)}>{value}</p>
                            <p className="text-[9px] uppercase tracking-wider text-[#A0A3BD] mt-0.5">{label}</p>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => setOpen((o) => !o)}
                        className={cn(
                            "w-8 h-8 rounded-lg border flex items-center justify-center transition-all duration-200",
                            open
                                ? "bg-[#7C5CFC] border-[#7C5CFC] text-white shadow-sm shadow-violet-500/25"
                                : "bg-[#F4F5FA] border-[#E8EBF0] text-[#8B8DAF] hover:border-[#7C5CFC]/40"
                        )}
                    >
                        <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", open && "rotate-180")} />
                    </button>
                </div>
            </div>

            {/* Day sections */}
            {open && (
                <div className="px-5 py-4 space-y-2.5 bg-[#FAFBFE]">
                    {byDay.map(([dk, dayCalls], i) => (
                        <DayBlock
                            key={dk}
                            dateKey={dk}
                            calls={dayCalls}
                            statusOrder={statusOrder}
                            resultMeta={resultMeta}
                            defaultOpen={i === 0}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonMission() {
    return (
        <div className="premium-card overflow-hidden animate-pulse">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E8EBF0]">
                <div className="w-9 h-9 rounded-xl bg-[#E8EBF0]" />
                <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-40 rounded-full bg-[#E8EBF0]" />
                    <div className="h-2.5 w-24 rounded-full bg-[#EEF0F8]" />
                </div>
                <div className="flex gap-2">
                    {[1, 2, 3, 4].map((i) => <div key={i} className="w-14 h-10 rounded-lg bg-[#EEF0F8]" />)}
                </div>
            </div>
            <div className="px-5 py-4 space-y-2.5">
                {[1, 2].map((i) => (
                    <div key={i} className="rounded-xl border border-[#E8EBF0] p-3 space-y-2">
                        <div className="flex gap-3">
                            <div className="w-[52px] h-16 rounded-xl bg-[#E8EBF0]" />
                            <div className="flex-1 space-y-2 pt-1">
                                <div className="h-3 w-24 rounded-full bg-[#E8EBF0]" />
                                <div className="h-2 w-full rounded-full bg-[#EEF0F8]" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Normalize ────────────────────────────────────────────────────────────────
function normalizeCall(c: CallItem): NormalizedCall {
    const companyName = c.contact?.company?.name ?? c.company?.name ?? "—";
    return {
        ...c,
        contact: c.contact
            ? { ...c.contact, company: { name: companyName } }
            : { firstName: null, lastName: null, title: null, email: null, phone: null, company: { name: companyName } },
    } as NormalizedCall;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ClientPortalActivitePage() {
    const { error: showError } = useToast();
    const [calls, setCalls] = useState<CallItem[]>([]);
    const [statusConfig, setStatusConfig] = useState<{ statuses: StatusDef[]; categories: ResultCategoryDef[] } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [dateRange, setDateRange] = useState("30");

    const resultMeta = useMemo(() => {
        if (statusConfig?.statuses?.length && statusConfig?.categories?.length)
            return buildResultMeta(statusConfig.statuses, statusConfig.categories);
        return RESULT_META_FALLBACK;
    }, [statusConfig]);

    const statusOrder = useMemo(() => {
        if (statusConfig?.statuses?.length) return statusConfig.statuses.map((s) => s.code);
        return ["MEETING_BOOKED", "CALLBACK_REQUESTED", "INTERESTED", "NO_RESPONSE", "DISQUALIFIED"];
    }, [statusConfig]);

    useEffect(() => {
        fetch("/api/client/action-status-config")
            .then((r) => r.json())
            .then((json) => {
                if (json.success && json.data?.statuses)
                    setStatusConfig({ statuses: json.data.statuses, categories: json.data.categories ?? [] });
            })
            .catch(() => {});
    }, []);

    const fetchCalls = useMemo(() => async () => {
        setIsLoading(true);
        try {
            const d = new Date();
            d.setDate(d.getDate() - parseInt(dateRange, 10));
            const startDate = d.toISOString().split("T")[0];
            const end = new Date(); end.setHours(23, 59, 59, 999);
            const endDate = end.toISOString().split("T")[0];
            const res = await fetch(`/api/client/calls?startDate=${startDate}&endDate=${endDate}`);
            const json = await res.json();
            if (json.success && json.data?.items) setCalls(json.data.items);
            else showError("Erreur", json.error ?? "Impossible de charger l'activité");
        } catch {
            showError("Erreur", "Impossible de charger l'activité");
        } finally {
            setIsLoading(false);
        }
    }, [dateRange, showError]);

    useEffect(() => { fetchCalls(); }, [fetchCalls]);

    const dateThreshold = useMemo(() => {
        const d = new Date(); d.setDate(d.getDate() - parseInt(dateRange, 10)); return d;
    }, [dateRange]);

    const filtered = useMemo(() => {
        let arr = calls.filter((c) => new Date(c.createdAt) >= dateThreshold);
        if (search.trim()) {
            const q = search.toLowerCase();
            arr = arr.filter((c) =>
                [c.contact?.firstName, c.contact?.lastName, c.contact?.email, c.contact?.phone,
                 c.contact?.title, c.contact?.company?.name, c.company?.name,
                 c.campaign?.mission?.name, c.campaign?.name, c.note]
                    .filter(Boolean).join(" ").toLowerCase().includes(q)
            );
        }
        return arr;
    }, [calls, dateThreshold, search]);

    const normalizedFiltered = useMemo(() => filtered.map(normalizeCall), [filtered]);

    const byMission = useMemo(() => {
        const map: Record<string, NormalizedCall[]> = {};
        normalizedFiltered.forEach((c) => {
            const k = c.campaign?.mission?.name ?? "—";
            if (!map[k]) map[k] = [];
            map[k].push(c);
        });
        return Object.entries(map).sort(([, a], [, b]) => b.length - a.length);
    }, [normalizedFiltered]);

    const stats = useMemo(() => {
        const meetings = normalizedFiltered.filter((c) => c.result === "MEETING_BOOKED").length;
        const activeDays = new Set(normalizedFiltered.map((c) => dayKey(c.createdAt))).size;
        const missions = new Set(normalizedFiltered.map((c) => c.campaign?.mission?.name)).size;
        return {
            total: normalizedFiltered.length, meetings, activeDays, missions,
            convRate: normalizedFiltered.length ? Math.round((meetings / normalizedFiltered.length) * 100) : 0,
        };
    }, [normalizedFiltered]);

    const PERIODS = [
        { key: "7",  label: "7 jours" },
        { key: "30", label: "30 jours" },
        { key: "60", label: "60 jours" },
        { key: "90", label: "3 mois" },
    ];

    return (
        <div
            className="min-h-full bg-gradient-to-br from-[#F8F9FC] via-[#F4F6F9] to-[#ECEEF4] p-4 md:p-6 space-y-5"
            style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
            {/* ── Header ── mirrors BreakdownCharts header ── */}
            <div
                className="premium-card overflow-hidden"
                style={{ animation: "dashFadeUp 0.4s ease both" }}
            >
                <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-[#E8EBF0]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm shadow-violet-500/20">
                            <PhoneCall className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h1 className="text-sm font-semibold text-[#12122A] uppercase tracking-wider">
                                Activité de prospection
                            </h1>
                            <p className="text-[11px] text-[#8B8DAF] mt-0.5">
                                Jours travaillés, contacts appelés et résultats par mission
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Period selector – same as BreakdownCharts */}
                        <div className="flex items-center rounded-xl bg-[#F4F5FA] border border-[#E8EBF0] p-0.5 gap-0.5">
                            {PERIODS.map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setDateRange(key)}
                                    className={cn(
                                        "text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all duration-150 whitespace-nowrap",
                                        dateRange === key
                                            ? "bg-white text-[#7C5CFC] shadow-sm"
                                            : "text-[#8B8DAF] hover:text-[#4B4D7A]"
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => fetchCalls()}
                            disabled={isLoading}
                            className="w-8 h-8 rounded-lg border border-[#E8EBF0] bg-[#F4F5FA] flex items-center justify-center text-[#8B8DAF] hover:text-[#7C5CFC] hover:border-[#7C5CFC]/40 transition-all disabled:opacity-50"
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
                        </button>
                    </div>
                </div>

                {/* ── KPI row – same gradient card style as BreakdownCharts ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-5">
                    {[
                        {
                            icon: <Activity className="w-3.5 h-3.5" />,
                            value: stats.total,
                            label: "Appels passés",
                            sub: `sur ${dateRange} jours`,
                            bg: "from-indigo-50 to-violet-50",
                            border: "border-indigo-100/60",
                            text: "text-indigo-600",
                        },
                        {
                            icon: <CalendarDays className="w-3.5 h-3.5" />,
                            value: stats.activeDays,
                            label: "Jours travaillés",
                            sub: "jours d'activité",
                            bg: "from-sky-50 to-cyan-50",
                            border: "border-sky-100/60",
                            text: "text-sky-600",
                        },
                        {
                            icon: <CheckCircle2 className="w-3.5 h-3.5" />,
                            value: stats.meetings,
                            label: "RDV obtenus",
                            sub: `taux ${stats.convRate}%`,
                            bg: "from-emerald-50 to-teal-50",
                            border: "border-emerald-100/60",
                            text: "text-emerald-600",
                        },
                        {
                            icon: <TrendingUp className="w-3.5 h-3.5" />,
                            value: stats.missions,
                            label: "Missions actives",
                            sub: "sur la période",
                            bg: "from-violet-50 to-purple-50",
                            border: "border-violet-100/60",
                            text: "text-violet-600",
                        },
                    ].map(({ icon, value, label, sub, bg, border, text }, i) => (
                        <div
                            key={label}
                            className={cn(
                                "rounded-xl bg-gradient-to-br border p-3.5 flex flex-col gap-1.5",
                                bg, border
                            )}
                            style={{ animation: `dashFadeUp 0.35s ease both ${100 + i * 60}ms` }}
                        >
                            <div className={cn("flex items-center gap-1.5 font-semibold", text)}>
                                {icon}
                                <span className="text-[10.5px] uppercase tracking-wide">{label}</span>
                            </div>
                            <div className="text-[26px] font-black text-[#12122A] leading-none">
                                {isLoading
                                    ? <span className="inline-block w-10 h-6 rounded bg-white/60 animate-pulse" />
                                    : value}
                            </div>
                            <p className="text-[10.5px] text-[#A0A3BD]">{sub}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Search & active filters ── */}
            <div
                className="flex flex-wrap items-center gap-3"
                style={{ animation: "dashFadeUp 0.4s ease both 300ms" }}
            >
                <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0A3BD]" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher un contact, une entreprise, une mission…"
                        className="w-full h-10 pl-10 pr-9 rounded-xl border border-[#E8EBF0] bg-white text-sm text-[#12122A] focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/30 focus:border-[#7C5CFC]/50 shadow-sm placeholder:text-[#A0A3BD]"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A0A3BD] hover:text-[#7C5CFC] transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
                {!isLoading && (
                    <p className="text-[12px] font-semibold text-[#8B8DAF]">
                        {normalizedFiltered.length} appel{normalizedFiltered.length > 1 ? "s" : ""}
                        {search && <span className="text-[#7C5CFC]"> · filtrés</span>}
                    </p>
                )}
            </div>

            {/* ── Content ── */}
            {isLoading ? (
                <div className="space-y-4">
                    <SkeletonMission />
                    <SkeletonMission />
                </div>
            ) : byMission.length === 0 ? (
                <div
                    className="premium-card flex flex-col items-center justify-center py-20 px-6 text-center"
                    style={{ animation: "dashFadeUp 0.4s ease both 200ms" }}
                >
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#F4F5FA] to-[#E8EBF0] flex items-center justify-center mb-4">
                        <PhoneCall className="w-6 h-6 text-[#C0C3D8]" />
                    </div>
                    <p className="text-sm font-semibold text-[#8B8DAF]">Aucune activité trouvée</p>
                    <p className="text-xs text-[#A0A3BD] mt-1">Ajustez la période ou la recherche.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {byMission.map(([mission, mCalls], idx) => (
                        <MissionSection
                            key={mission}
                            missionName={mission}
                            calls={mCalls}
                            defaultOpen={idx === 0}
                            statusOrder={statusOrder}
                            resultMeta={resultMeta}
                            index={idx}
                        />
                    ))}
                </div>
            )}

            {/* ── Dashboard keyframes (injected once) ── */}
            <style>{`
                @keyframes dashFadeUp {
                    from { opacity: 0; transform: translateY(10px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
