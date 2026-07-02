"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Drawer } from "@/components/ui";
import Link from "next/link";
import { CompanyDrawer, ContactDrawer } from "@/components/drawers";
import {
    Phone,
    Calendar,
    Clock,
    Briefcase,
    Target,
    ChevronRight,
    TrendingUp,
    Zap,
    Users,
    Mail,
    Linkedin,
    Play,
    Loader2,
    Activity,
    User,
    Building2,
    Flame
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

// ============================================
// TYPES
// ============================================

interface SDRStats {
    actionsToday: number;
    meetingsBooked: number;
    callbacksPending: number;
    opportunitiesGenerated: number;
    weeklyProgress: number;
}

interface Mission {
    id: string;
    name: string;
    channel: "CALL" | "EMAIL" | "LINKEDIN";
    client: { name: string };
    progress: number;
    contactsRemaining: number;
    _count: {
        lists: number;
        campaigns: number;
    };
}

interface SDRActionItem {
    id: string;
    contactId: string | null;
    companyId: string | null;
    result: string;
    resultLabel: string;
    channel: string;
    campaignName?: string;
    contactName?: string;
    companyName?: string;
    note?: string;
    createdAt: string;
}

interface DrawerContact {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    linkedin: string | null;
    status: "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";
    companyId: string;
    companyName?: string;
    missionId?: string;
}

interface DrawerCompany {
    id: string;
    name: string;
    industry: string | null;
    country: string | null;
    website: string | null;
    size: string | null;
    status: "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";
    missionId?: string;
    contacts: Array<{
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        title: string | null;
        linkedin: string | null;
        status: "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";
        companyId: string;
    }>;
    _count: { contacts: number };
}

// ============================================
// CONSTANTS
// ============================================

const CHANNEL_ICONS = {
    CALL: Phone,
    EMAIL: Mail,
    LINKEDIN: Linkedin,
};

const DAILY_GOAL = 80;

// ============================================
// HELPER FOR GRAPHS
// ============================================
const DAYS = ["L", "M", "Me", "J", "V", "S", "D"];
function buildSparklineData(actions: number): { day: string; val: number }[] {
    const total = actions || 0;
    return DAYS.map((day, i) => {
        const progress = (i + 1) / 7;
        const cumul = Math.round(total * progress);
        const prev = i === 0 ? 0 : Math.round(total * (i / 7));
        return { day, val: Math.max(0, cumul - prev) };
    });
}

// ============================================
// SDR DASHBOARD PAGE
// ============================================

export default function SDRDashboardPage() {
    const { data: session } = useSession();
    const [stats, setStats] = useState<SDRStats | null>(null);
    const [missions, setMissions] = useState<Mission[]>([]);
    const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [actionsPeriod, setActionsPeriod] = useState<"today" | "all">("today");
    const [myActions, setMyActions] = useState<SDRActionItem[]>([]);
    const [actionsLoading, setActionsLoading] = useState(false);

    // Drawers
    const [drawerContactId, setDrawerContactId] = useState<string | null>(null);
    const [drawerCompanyId, setDrawerCompanyId] = useState<string | null>(null);
    const [drawerContact, setDrawerContact] = useState<DrawerContact | null>(null);
    const [drawerCompany, setDrawerCompany] = useState<DrawerCompany | null>(null);
    const [drawerLoading, setDrawerLoading] = useState(false);

    // Initial load animations
    const [heroCount, setHeroCount] = useState(0);
    const [heroAnimated, setHeroAnimated] = useState(false);

    // ============================================
    // FETCH DATA
    // ============================================

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const statsRes = await fetch("/api/sdr/stats");
                const statsJson = await statsRes.json();
                if (statsJson.success) {
                    setStats(statsJson.data);
                }

                const missionsRes = await fetch("/api/sdr/missions");
                const missionsJson = await missionsRes.json();
                if (missionsJson.success) {
                    setMissions(missionsJson.data);
                    const saved = localStorage.getItem("sdr_selected_mission");
                    if (saved && missionsJson.data.some((m: Mission) => m.id === saved)) {
                        setSelectedMissionId(saved);
                    } else if (missionsJson.data.length > 0) {
                        setSelectedMissionId(missionsJson.data[0].id);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch data:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    // Count-up animation for hero
    useEffect(() => {
        const target = stats?.actionsToday ?? 0;
        if (target === 0) {
            setHeroCount(0);
            setHeroAnimated(true);
            return;
        }
        setHeroAnimated(true);
        let current = 0;
        const step = Math.max(1, Math.ceil(target / 20));
        const interval = setInterval(() => {
            current += step;
            if (current >= target) {
                setHeroCount(target);
                clearInterval(interval);
            } else {
                setHeroCount(current);
            }
        }, 40);
        return () => clearInterval(interval);
    }, [stats?.actionsToday]);

    useEffect(() => {
        const handleMissionChange = (e: CustomEvent) => {
            setSelectedMissionId(e.detail);
        };
        window.addEventListener("sdr_mission_changed", handleMissionChange as EventListener);
        return () => {
            window.removeEventListener("sdr_mission_changed", handleMissionChange as EventListener);
        };
    }, []);

    useEffect(() => {
        const fetchMyActions = async () => {
            setActionsLoading(true);
            try {
                const res = await fetch(`/api/sdr/actions?period=${actionsPeriod}&limit=50`);
                const json = await res.json();
                if (json.success) {
                    setMyActions(json.data);
                }
            } catch (err) {
                console.error("Failed to fetch my actions:", err);
            } finally {
                setActionsLoading(false);
            }
        };
        fetchMyActions();
    }, [actionsPeriod]);

    // Drawers API calls
    useEffect(() => {
        if (!drawerContactId) {
            setDrawerContact(null);
            return;
        }
        setDrawerLoading(true);
        fetch(`/api/contacts/${drawerContactId}`)
            .then((res) => res.json())
            .then((json) => {
                if (json.success && json.data) {
                    const c = json.data;
                    setDrawerContact({
                        id: c.id,
                        firstName: c.firstName,
                        lastName: c.lastName,
                        email: c.email,
                        phone: c.phone,
                        title: c.title,
                        linkedin: c.linkedin,
                        status: c.status ?? "PARTIAL",
                        companyId: c.company?.id ?? "",
                        companyName: c.company?.name ?? undefined,
                        missionId: (c.company as { list?: { mission?: { id: string } } })?.list?.mission?.id,
                    });
                } else setDrawerContact(null);
            })
            .catch(() => setDrawerContact(null))
            .finally(() => setDrawerLoading(false));
    }, [drawerContactId]);

    useEffect(() => {
        if (!drawerCompanyId) {
            setDrawerCompany(null);
            return;
        }
        setDrawerLoading(true);
        fetch(`/api/companies/${drawerCompanyId}`)
            .then((res) => res.json())
            .then((json) => {
                if (json.success && json.data) {
                    const co = json.data;
                    setDrawerCompany({
                        id: co.id,
                        name: co.name,
                        industry: co.industry,
                        country: co.country,
                        website: co.website,
                        size: co.size,
                        status: co.status ?? "PARTIAL",
                        missionId: (co.list as { mission?: { id: string } })?.mission?.id,
                        contacts: (co.contacts ?? []).map((ct: any) => ({
                            id: ct.id,
                            firstName: ct.firstName,
                            lastName: ct.lastName,
                            email: ct.email,
                            phone: ct.phone,
                            title: ct.title,
                            linkedin: ct.linkedin,
                            status: (ct.status ?? "PARTIAL") as "INCOMPLETE" | "PARTIAL" | "ACTIONABLE",
                            companyId: ct.companyId,
                        })),
                        _count: { contacts: co._count?.contacts ?? co.contacts?.length ?? 0 },
                    });
                } else setDrawerCompany(null);
            })
            .catch(() => setDrawerCompany(null))
            .finally(() => setDrawerLoading(false));
    }, [drawerCompanyId]);

    const openFicheForAction = (item: SDRActionItem) => {
        if (item.contactId) {
            setDrawerCompanyId(null);
            setDrawerContactId(item.contactId);
        } else if (item.companyId) {
            setDrawerContactId(null);
            setDrawerCompanyId(item.companyId);
        }
    };

    const activeMission = missions.find(m => m.id === selectedMissionId);
    const ChannelIcon = activeMission ? CHANNEL_ICONS[activeMission.channel] : Phone;

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Bonjour";
        if (hour < 18) return "Bon après-midi";
        return "Bonsoir";
    };

    if (isLoading && !stats) {
        return (
            <div className="flex items-center justify-center py-32 bg-[#FAF9F6] min-h-screen">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 text-[#2B5F3E] animate-spin" />
                    <p className="text-[13px] text-[#8A8A83] font-medium">Chargement du dashboard...</p>
                </div>
            </div>
        );
    }

    const dailyProgressPct = stats ? Math.min((stats.actionsToday / DAILY_GOAL) * 100, 100) : 0;
    const sparkData = buildSparklineData(stats?.actionsToday ?? 0);

    return (
        <div className="min-h-full bg-[#FAF9F6] p-4 md:p-6" style={{ fontFamily: "var(--cp-font, 'DM Sans', 'Inter', system-ui, sans-serif)" }}>
            {/* Page Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-[22px] font-bold text-[#0E0F0C] tracking-tight">
                        {getGreeting()}, {session?.user?.name?.split(" ")[0] ?? "vous"} ! 👋
                    </h1>
                    <p className="text-[13px] text-[#8A8A83] mt-0.5">Voici votre journée en un coup d'œil</p>
                </div>
            </div>

            {/* ZONE 1 — KPIs */}
            <div className="flex flex-col lg:flex-row gap-4 mb-5">
                {/* Hero KPI - Actions Today */}
                <div className="flex-[2] bg-gradient-to-br from-[#1C3F2A] to-[#16301F] rounded-2xl p-6 relative overflow-hidden">
                    {/* Gradients */}
                    <div className="absolute top-0 right-0 w-48 h-48 bg-[#4E8B66]/15 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#7FB394]/10 rounded-full blur-2xl pointer-events-none" />

                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-[#4E8B66]/25 flex items-center justify-center">
                                    <Phone className="w-4 h-4 text-[#CFE0D5]" />
                                </div>
                                <span className="text-[#8A8A83] text-[13px] font-medium">Appels aujourd'hui</span>
                            </div>
                            {dailyProgressPct >= 100 && (
                                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#10B981]/15 text-[#10B981] text-[11px] font-semibold">
                                    <Flame className="w-3.5 h-3.5" />
                                    <span>Objectif atteint</span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-end gap-3 mt-4">
                            <span className={`text-[52px] font-extrabold text-white leading-none tracking-tight transition-all duration-700 ${heroAnimated ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
                                {heroCount}
                            </span>
                            <span className="text-[#87A491] text-[14px] font-medium mb-2">/ {DAILY_GOAL} obj. jour</span>
                        </div>

                        <div className="mt-5 mb-2">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[11px] text-[#87A491]">Progression vers l'objectif</span>
                                <span className="text-[11px] font-semibold text-[#CFE0D5]">{Math.round(dailyProgressPct)}%</span>
                            </div>
                            <div className="h-2 bg-[#12281A] rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-[#CFE0D5] to-[#FAF9F6] rounded-full transition-all duration-1000 ease-out"
                                    style={{ width: `${dailyProgressPct}%` }}
                                />
                            </div>
                        </div>

                        <div className="h-[48px] mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={sparkData}>
                                    <defs>
                                        <linearGradient id="db-spark-grad-2" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#CFE0D5" stopOpacity={0.3} />
                                            <stop offset="100%" stopColor="#CFE0D5" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <Area type="monotone" dataKey="val" stroke="#CFE0D5" strokeWidth={2} fill="url(#db-spark-grad-2)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Supporting KPIs */}
                <div className="flex-[1.2] flex flex-col gap-3">
                    <div className="flex-1 bg-white rounded-xl border border-[#E8E6DF] p-4 flex items-center justify-between hover:border-[#D5D2C9] transition-colors duration-150">
                        <div>
                            <div className="text-[11px] text-[#8A8A83] font-medium mb-0.5">RDV Pris</div>
                            <div className="text-[28px] font-bold text-[#0E0F0C] leading-none">{stats?.meetingsBooked ?? 0}</div>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-[#F0FDF4] flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-[#10B981]" />
                        </div>
                    </div>

                    <div className="flex-1 bg-white rounded-xl border border-[#E8E6DF] p-4 flex items-center justify-between hover:border-[#D5D2C9] transition-colors duration-150">
                        <div>
                            <div className="text-[11px] text-[#8A8A83] font-medium mb-0.5">Contacts Chauds</div>
                            <div className="text-[28px] font-bold text-[#0E0F0C] leading-none">{stats?.opportunitiesGenerated ?? 0}</div>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-[#E7EFE9] flex items-center justify-center">
                            <Briefcase className="w-5 h-5 text-[#2B5F3E]" />
                        </div>
                    </div>

                    <div className="flex-1 bg-white rounded-xl border border-[#E8E6DF] p-4 flex items-center justify-between hover:border-[#D5D2C9] transition-colors duration-150">
                        <div>
                            <div className="text-[11px] text-[#8A8A83] font-medium mb-0.5">Rappels Planifiés</div>
                            <div className="text-[28px] font-bold text-[#0E0F0C] leading-none">{stats?.callbacksPending ?? 0}</div>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-[#FFF7ED] flex items-center justify-center">
                            <Clock className="w-5 h-5 text-[#F59E0B]" />
                        </div>
                    </div>
                </div>
            </div>

            {/* ZONE 2 & 3 */}
            <div className="flex flex-col xl:flex-row gap-4">
                {/* ZONE 2 — Main Work Area (Missions & Recent Calls) */}
                <div className="flex-[3] flex flex-col gap-4">
                    {/* Active Mission */}
                    {activeMission ? (
                        <div className="bg-white rounded-xl border border-[#E8E6DF] overflow-hidden flex flex-col shadow-sm">
                            <div className="bg-gradient-to-r from-[#2B5F3E] to-[#224A31] p-5 text-white flex justify-between items-center relative overflow-hidden">
                                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                                <div className="absolute top-1/2 left-1/4 w-20 h-20 bg-black/5 rounded-full blur-xl pointer-events-none" />

                                <div className="relative z-10 flex items-center gap-2">
                                    <Target className="w-5 h-5" />
                                    <span className="font-semibold text-[15px]">Mission Active</span>
                                </div>
                                <div className="relative z-10 flex items-center gap-1.5 px-3 py-1 bg-white/20 rounded-full text-[11px] font-medium border border-white/30 backdrop-blur-md shadow-sm">
                                    <ChannelIcon className="w-3.5 h-3.5" />
                                    {activeMission.channel === "CALL" ? "Appel" : activeMission.channel === "EMAIL" ? "Email" : "LinkedIn"}
                                </div>
                            </div>

                            <div className="p-6 flex flex-col gap-5">
                                <div>
                                    <h3 className="text-[20px] font-bold text-[#0E0F0C] tracking-tight">{activeMission.name}</h3>
                                    <p className="text-[14px] text-[#8A8A83] flex items-center gap-1.5 mt-1">
                                        <Building2 className="w-3.5 h-3.5" />
                                        {activeMission.client.name}
                                    </p>
                                </div>

                                {/* Progress Indicator */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[12px] font-medium text-[#4A4B46]">Progression de la mission</span>
                                        <span className="text-[12px] font-bold text-[#2B5F3E]">{activeMission.progress || 0}%</span>
                                    </div>
                                    <div className="h-2.5 bg-[#F1EFE9] rounded-full overflow-hidden shadow-inner">
                                        <div
                                            className="h-full bg-gradient-to-r from-[#2B5F3E] to-[#4E8B66] rounded-full transition-all duration-700 ease-out"
                                            style={{ width: `${activeMission.progress || 0}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Key Mission Stats */}
                                <div className="flex items-center gap-8 py-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-[#F1EFE9] flex items-center justify-center">
                                            <Users className="w-4 h-4 text-[#8A8A83]" />
                                        </div>
                                        <div>
                                            <p className="text-[14px] font-semibold text-[#0E0F0C]">{activeMission.contactsRemaining || 0}</p>
                                            <p className="text-[11px] text-[#8A8A83]">Contacts rest</p>
                                        </div>
                                    </div>
                                    <div className="w-px h-8 bg-[#E8E6DF]" />
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-[#F1EFE9] flex items-center justify-center">
                                            <Target className="w-4 h-4 text-[#8A8A83]" />
                                        </div>
                                        <div>
                                            <p className="text-[14px] font-semibold text-[#0E0F0C]">{activeMission._count?.campaigns || 0}</p>
                                            <p className="text-[11px] text-[#8A8A83]">Campagnes</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Call to Action Button */}
                                <Link href="/sdr/action" className="block mt-2">
                                    <button className="w-full h-12 bg-gradient-to-r from-[#2B5F3E] to-[#224A31] text-white rounded-xl flex items-center justify-center gap-2 text-[14px] font-semibold hover:opacity-90 transition-opacity shadow-[0_4px_16px_rgba(43,95,62,0.3)]">
                                        <Play className="w-[18px] h-[18px] fill-current" />
                                        Lancer la session
                                    </button>
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-dashed border-[#D5D2C9] p-10 flex flex-col items-center justify-center text-center">
                            <Target className="w-12 h-12 text-[#E8E6DF] mb-4" />
                            <h3 className="text-[16px] font-bold text-[#0E0F0C]">Aucune mission assignée</h3>
                            <p className="text-[13px] text-[#8A8A83] mt-1.5 max-w-[280px]">
                                Vous n'avez pas de mission principale assignée. Contactez votre manager.
                            </p>
                        </div>
                    )}

                    {/* My actions list */}
                    <div className="bg-white rounded-xl border border-[#E8E6DF] flex flex-col flex-1 min-h-[320px]">
                        <div className="p-5 border-b border-[#E8E6DF] flex items-center justify-between">
                            <h3 className="text-[14px] font-semibold text-[#0E0F0C] flex items-center gap-2">
                                <Activity className="w-4 h-4 text-[#2B5F3E]" />
                                Historique des actions
                            </h3>
                            <div className="flex rounded-md border border-[#E8E6DF] p-0.5 bg-[#F1EFE9]">
                                <button
                                    onClick={() => setActionsPeriod("today")}
                                    className={cn(
                                        "px-2.5 py-1 text-[11px] font-medium rounded transition-colors",
                                        actionsPeriod === "today" ? "bg-white text-[#0E0F0C] shadow-sm" : "text-[#4A4B46] hover:text-[#0E0F0C]"
                                    )}
                                >
                                    Aujourd'hui
                                </button>
                                <button
                                    onClick={() => setActionsPeriod("all")}
                                    className={cn(
                                        "px-2.5 py-1 text-[11px] font-medium rounded transition-colors",
                                        actionsPeriod === "all" ? "bg-white text-[#0E0F0C] shadow-sm" : "text-[#4A4B46] hover:text-[#0E0F0C]"
                                    )}
                                >
                                    Tout
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3">
                            {actionsLoading ? (
                                <div className="flex items-center justify-center py-10">
                                    <Loader2 className="w-6 h-6 text-[#2B5F3E] animate-spin" />
                                </div>
                            ) : myActions.length === 0 ? (
                                <p className="text-[13px] text-[#8A8A83] text-center py-10">
                                    {actionsPeriod === "today" ? "Aucune action aujourd'hui." : "Aucune action enregistrée."}
                                </p>
                            ) : (
                                <ul className="space-y-1">
                                    {myActions.map((item) => {
                                        const name = item.contactName || item.companyName || "—";
                                        const hasFiche = !!(item.contactId || item.companyId);
                                        return (
                                            <li key={item.id}>
                                                <button
                                                    onClick={() => hasFiche && openFicheForAction(item)}
                                                    className={cn(
                                                        "w-full flex items-center gap-3 p-2.5 rounded-xl text-left border border-transparent transition-all group",
                                                        hasFiche ? "hover:bg-[#F9FAFB] hover:border-[#E8E6DF] cursor-pointer" : "cursor-default"
                                                    )}
                                                >
                                                    <div className="w-9 h-9 rounded-full bg-[#F1EFE9] border border-[#E8E6DF] flex items-center justify-center flex-shrink-0 group-hover:bg-white group-hover:shadow-sm transition-all">
                                                        {item.contactId ? (
                                                            <User className="w-4 h-4 text-[#8A8A83]" />
                                                        ) : (
                                                            <Building2 className="w-4 h-4 text-[#8A8A83]" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[13px] font-semibold text-[#0E0F0C] truncate">{name}</p>
                                                        <p className="text-[11px] text-[#8A8A83] truncate mt-0.5">
                                                            {item.resultLabel} {item.campaignName && <span className="opacity-70">• {item.campaignName}</span>}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <span className="text-[10px] font-medium text-[#4A4B46] bg-[#F1EFE9] px-2 py-1 rounded-md">
                                                            {new Date(item.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                                        </span>
                                                        {hasFiche && (
                                                            <ChevronRight className="w-4 h-4 text-[#C9C6BC] group-hover:text-[#2B5F3E] transition-colors" />
                                                        )}
                                                    </div>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>

                {/* ZONE 3 — Secondary Info (Tips, Weekly, Other Missions) */}
                <div className="flex-[2] flex flex-col gap-4">
                    {/* Weekly Progress */}
                    {stats && (
                        <div className="bg-white rounded-xl border border-[#E8E6DF] p-5">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-[14px] font-semibold text-[#0E0F0C]">Progression par rapport à last week</h3>
                                <div className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold",
                                    (stats.weeklyProgress ?? 0) >= 0 ? "bg-[#F0FDF4] text-[#10B981]" : "bg-[#FEF3C7] text-[#B45309]"
                                )}>
                                    <TrendingUp className={cn("w-3 h-3", (stats.weeklyProgress ?? 0) < 0 && "rotate-180")} />
                                    <span>{(stats.weeklyProgress ?? 0) >= 0 ? "Beau travail !" : "Rattrapons ça"}</span>
                                </div>
                            </div>

                            <div className="h-2 bg-[#F1EFE9] rounded-full overflow-hidden mb-3">
                                <div
                                    className={cn(
                                        "h-full rounded-full transition-all duration-700 ease-out",
                                        (stats.weeklyProgress ?? 0) >= 0 ? "bg-[#10B981]" : "bg-[#F59E0B]"
                                    )}
                                    style={{ width: `${Math.min(Math.max((stats.weeklyProgress ?? 0) + 50, 5), 100)}%` }}
                                />
                            </div>

                            <p className="text-[12px] text-[#4A4B46] leading-relaxed">
                                {(stats.weeklyProgress ?? 0) > 0
                                    ? "Vous avez fait plus d'actions cette semaine que la précédente. Continuez sur cette belle lancée !"
                                    : (stats.weeklyProgress ?? 0) === 0
                                        ? "Vous êtes exactement sur le même rythme que la semaine dernière."
                                        : "Léger ralentissement par rapport à la semaine passée. Rien d'inquiétant, à vous de jouer !"}
                            </p>
                        </div>
                    )}

                    {/* Quick Tips */}
                    <div className="bg-gradient-to-br from-[#FFF7ED] to-[#FFEDD5] rounded-xl border border-[#FED7AA] p-5 shadow-sm">
                        <div className="flex items-start gap-3.5">
                            <div className="w-10 h-10 flex-shrink-0 rounded-full bg-[#FFEDD5] border border-[#FDCB8C] flex items-center justify-center shadow-inner">
                                <Zap className="w-4.5 h-4.5 text-[#EA580C] ml-0.5" />
                            </div>
                            <div>
                                <h3 className="text-[14px] font-bold text-[#9A3412]">Astuce Pro</h3>
                                <p className="text-[12.5px] text-[#C2410C] mt-1.5 leading-relaxed font-medium">
                                    Utilisez les <strong>raccourcis clavier (1 à 6)</strong> lors de vos appels pour catégoriser plus vite. Appuyez sur <strong>Entrée</strong> pour envoyer instantanément.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Other Missions */}
                    {missions.length > 1 && (
                        <div className="bg-white rounded-xl border border-[#E8E6DF] p-5 mb-10 xl:mb-0">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-[14px] font-semibold text-[#0E0F0C]">Passer à une autre mission</h3>
                                <span className="text-[11px] font-semibold text-[#8A8A83] bg-[#F1EFE9] px-2.5 py-1 rounded-full uppercase tracking-wide">
                                    {missions.length} Missions
                                </span>
                            </div>

                            <div className="space-y-2">
                                {missions
                                    .filter(m => m.id !== selectedMissionId)
                                    .map((mission) => {
                                        const Icon = CHANNEL_ICONS[mission.channel] || Phone;
                                        return (
                                            <button
                                                key={mission.id}
                                                onClick={() => {
                                                    setSelectedMissionId(mission.id);
                                                    localStorage.setItem("sdr_selected_mission", mission.id);
                                                    window.dispatchEvent(new CustomEvent("sdr_mission_changed", { detail: mission.id }));
                                                }}
                                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#F1EFE9] transition-all border border-transparent hover:border-[#E8E6DF] text-left group"
                                            >
                                                <div className="w-9 h-9 rounded-full bg-white border border-[#E8E6DF] shadow-sm flex items-center justify-center flex-shrink-0">
                                                    <Icon className="w-4 h-4 text-[#8A8A83] group-hover:text-[#2B5F3E] transition-colors" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-bold text-[#0E0F0C] truncate group-hover:text-[#2B5F3E] transition-colors">{mission.name}</p>
                                                    <p className="text-[11px] text-[#8A8A83] truncate mt-0.5">{mission.client.name}</p>
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-[#C9C6BC] group-hover:text-[#2B5F3E] transition-colors flex-shrink-0" />
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Drawers */}
            {(drawerContactId || drawerCompanyId) && drawerLoading && (
                <Drawer
                    isOpen
                    onClose={() => {
                        setDrawerContactId(null);
                        setDrawerCompanyId(null);
                    }}
                    title="Chargement..."
                >
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-[#2B5F3E] animate-spin" />
                    </div>
                </Drawer>
            )}

            {drawerContactId && drawerContact && (
                <ContactDrawer
                    isOpen={!!drawerContactId}
                    onClose={() => { setDrawerContactId(null); setDrawerContact(null); }}
                    contact={drawerContact}
                    onUpdate={(updated) => setDrawerContact(updated)}
                    isManager={true}
                    companies={[]}
                />
            )}

            {drawerCompanyId && drawerCompany && (
                <CompanyDrawer
                    isOpen={!!drawerCompanyId}
                    onClose={() => { setDrawerCompanyId(null); setDrawerCompany(null); }}
                    company={drawerCompany}
                    onUpdate={(updated) => setDrawerCompany(updated)}
                    onContactClick={(contact) => {
                        setDrawerCompanyId(null);
                        setDrawerCompany(null);
                        setDrawerContactId(contact.id);
                    }}
                    isManager={true}
                />
            )}
        </div>
    );
}
