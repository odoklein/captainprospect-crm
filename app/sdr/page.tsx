"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { CompanyDrawer, ContactDrawer } from "@/components/drawers";
import { useSdrPace } from "@/components/sdr/SdrPaceProvider";
import { formatHours } from "@/lib/sdr-pace/pace";
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
    Flame,
    CheckCircle2,
    AlertCircle,
    HelpCircle,
    ChevronDown,
    BookOpen,
    Shield,
    Sparkles,
    Search,
    Filter,
    ArrowUpRight,
    RefreshCw,
    PhoneCall,
    Volume2,
    SlidersHorizontal
} from "lucide-react";
import { cn } from "@/lib/utils";

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

interface SDRCallbackItem {
    id: string;
    campaignId: string;
    channel: string;
    createdAt: string;
    callbackDate: string | null;
    note: string | null;
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        title: string | null;
        phone: string | null;
        email: string | null;
        company: { id: string; name: string } | null;
    } | null;
    company: {
        id: string;
        name: string;
        phone: string | null;
    } | null;
    mission: {
        id: string;
        name: string;
        client: { name: string };
    } | null;
    sdr?: { id: string; name: string | null };
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

// Help & Battlecards content for SDR
const BATTLECARDS = [
    {
        id: "gatekeeper",
        tag: "Standard & Secrétaire",
        title: "Passer le barrage",
        prompt: "« Bonjour, je suis en ligne avec M./Mme [Nom] sur son dossier [Sujet], pouvez-vous me basculer directement sur son poste ? »",
        tip: "Posture assurée, ton direct et fluide. Ne demandez jamais 'Est-ce qu'il est là ?', annoncez la mise en relation.",
    },
    {
        id: "no_time",
        tag: "Objection fréquente",
        title: "« Je n'ai pas le temps »",
        prompt: "« C'est précisément pour cela que je vous appelle : je prends 30 secondes pour voir si le sujet vous concerne, sinon nous n'irons pas plus loin. »",
        tip: "Désamorcez immédiatement l'urgence en fixant un cadre temporel minuscule (30 sec).",
    },
    {
        id: "provider",
        tag: "Objection fréquente",
        title: "« On a déjà un prestataire »",
        prompt: "« C'est une excellente chose. Notre but n'est pas de remplacer votre partenaire actuel, mais d'avoir un point de comparaison sur vos besoins de fin d'année. »",
        tip: "Validez leur choix d'abord. Transformez l'appel en démarche de veille/benchmark.",
    },
    {
        id: "qualification",
        tag: "Checklist RDV",
        title: "3 critères avant de valider le créneau",
        prompt: "1. Le contact est-il bien le décideur final ?\n2. Le besoin/projet est-il identifié dans les 3 prochains mois ?\n3. L'email et le numéro direct sont-ils vérifiés ?",
        tip: "Un RDV non qualifié est un RDV absent à 70%. Mieux vaut disqualifier tôt.",
    }
];

// ============================================
// MAIN COMPONENT
// ============================================

export default function SDRDashboardPage() {
    const { data: session } = useSession();
    const { pace, loading: paceLoading } = useSdrPace();

    // Core state
    const [stats, setStats] = useState<SDRStats | null>(null);
    const [missions, setMissions] = useState<Mission[]>([]);
    const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Callbacks & Reminders state
    const [callbacks, setCallbacks] = useState<SDRCallbackItem[]>([]);
    const [callbacksLoading, setCallbacksLoading] = useState(true);
    const [callbackTab, setCallbackTab] = useState<"all" | "today" | "overdue">("today");

    // Actions state
    const [actionsPeriod, setActionsPeriod] = useState<"today" | "all">("today");
    const [myActions, setMyActions] = useState<SDRActionItem[]>([]);
    const [actionsLoading, setActionsLoading] = useState(false);

    // Help & Battlecards active tab
    const [activeBattlecard, setActiveBattlecard] = useState<string>("gatekeeper");
    const [showShortcuts, setShowShortcuts] = useState(false);

    // Drawers state
    const [drawerContactId, setDrawerContactId] = useState<string | null>(null);
    const [drawerCompanyId, setDrawerCompanyId] = useState<string | null>(null);
    const [drawerContact, setDrawerContact] = useState<DrawerContact | null>(null);
    const [drawerCompany, setDrawerCompany] = useState<DrawerCompany | null>(null);
    const [drawerLoading, setDrawerLoading] = useState(false);

    // Hero counter animation
    const heroTarget = pace?.callsDone ?? stats?.actionsToday ?? 0;
    const [heroCount, setHeroCount] = useState(0);
    const heroShown = useRef(0);

    // ============================================
    // DATA FETCHING
    // ============================================

    useEffect(() => {
        const fetchInitialData = async () => {
            setIsLoading(true);
            try {
                const [statsRes, missionsRes] = await Promise.all([
                    fetch("/api/sdr/stats"),
                    fetch("/api/sdr/missions")
                ]);
                const [statsJson, missionsJson] = await Promise.all([
                    statsRes.json(),
                    missionsRes.json()
                ]);

                if (statsJson.success) setStats(statsJson.data);
                if (missionsJson.success && missionsJson.data) {
                    setMissions(missionsJson.data);
                    const saved = localStorage.getItem("sdr_selected_mission");
                    if (saved && missionsJson.data.some((m: Mission) => m.id === saved)) {
                        setSelectedMissionId(saved);
                    } else if (missionsJson.data.length > 0) {
                        setSelectedMissionId(missionsJson.data[0].id);
                    }
                }
            } catch (err) {
                console.error("Failed to load SDR dashboard data:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchInitialData();
    }, []);

    // Fetch Callbacks / Reminders
    const fetchCallbacks = async () => {
        setCallbacksLoading(true);
        try {
            const res = await fetch("/api/sdr/callbacks?limit=50");
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                setCallbacks(json.data);
            }
        } catch (err) {
            console.error("Failed to fetch SDR callbacks:", err);
        } finally {
            setCallbacksLoading(false);
        }
    };

    useEffect(() => {
        fetchCallbacks();
    }, []);

    // Fetch recent actions
    useEffect(() => {
        const fetchActions = async () => {
            setActionsLoading(true);
            try {
                const res = await fetch(`/api/sdr/actions?period=${actionsPeriod}&limit=30`);
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    setMyActions(json.data);
                }
            } catch (err) {
                console.error("Failed to fetch actions:", err);
            } finally {
                setActionsLoading(false);
            }
        };
        fetchActions();
    }, [actionsPeriod]);

    // Animate hero counter smoothly
    useEffect(() => {
        let current = heroShown.current;
        if (current === heroTarget) {
            setHeroCount(heroTarget);
            return;
        }
        const step = Math.max(1, Math.ceil(Math.abs(heroTarget - current) / 15));
        const interval = setInterval(() => {
            current = current < heroTarget
                ? Math.min(current + step, heroTarget)
                : Math.max(current - step, heroTarget);
            heroShown.current = current;
            setHeroCount(current);
            if (current === heroTarget) clearInterval(interval);
        }, 35);
        return () => clearInterval(interval);
    }, [heroTarget]);

    // Drawers logic
    useEffect(() => {
        if (!drawerContactId) {
            setDrawerContact(null);
            return;
        }
        setDrawerLoading(true);
        fetch(`/api/contacts/${drawerContactId}`)
            .then(res => res.json())
            .then(json => {
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
                }
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
            .then(res => res.json())
            .then(json => {
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
                }
            })
            .catch(() => setDrawerCompany(null))
            .finally(() => setDrawerLoading(false));
    }, [drawerCompanyId]);

    const openContactOrCompany = (contactId?: string | null, companyId?: string | null) => {
        if (contactId) {
            setDrawerCompanyId(null);
            setDrawerContactId(contactId);
        } else if (companyId) {
            setDrawerContactId(null);
            setDrawerCompanyId(companyId);
        }
    };

    // Filtered Callbacks
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const categorizedCallbacks = useMemo(() => {
        const overdue: SDRCallbackItem[] = [];
        const today: SDRCallbackItem[] = [];
        const upcoming: SDRCallbackItem[] = [];

        for (const cb of callbacks) {
            if (!cb.callbackDate) {
                today.push(cb);
                continue;
            }
            const cbDate = new Date(cb.callbackDate);
            const cbDayStr = cb.callbackDate.slice(0, 10);

            if (cbDate.getTime() < now.getTime() && cbDayStr < todayStr) {
                overdue.push(cb);
            } else if (cbDayStr === todayStr) {
                if (cbDate.getTime() < now.getTime()) {
                    overdue.push(cb); // past time today
                } else {
                    today.push(cb);
                }
            } else {
                upcoming.push(cb);
            }
        }

        return { overdue, today, upcoming };
    }, [callbacks, now, todayStr]);

    const displayedCallbacks = useMemo(() => {
        if (callbackTab === "overdue") return categorizedCallbacks.overdue;
        if (callbackTab === "today") return [...categorizedCallbacks.overdue, ...categorizedCallbacks.today];
        return callbacks;
    }, [callbackTab, categorizedCallbacks, callbacks]);

    const activeMission = missions.find(m => m.id === selectedMissionId) || missions[0];
    const ChannelIcon = activeMission ? CHANNEL_ICONS[activeMission.channel] || Phone : Phone;

    // Greeting helper
    const greeting = () => {
        const h = new Date().getHours();
        if (h < 12) return "Bonjour";
        if (h < 18) return "Bon après-midi";
        return "Bonsoir";
    };

    const sdrFirstName = session?.user?.name?.split(" ")[0] ?? "SDR";

    // Pacing calculations
    const dailyProgressPct = pace && pace.dayQuota > 0 ? Math.min((pace.callsDone / pace.dayQuota) * 100, 100) : 0;
    const isAhead = pace && pace.aheadBy > 0;
    const isBehind = pace && pace.delta > 0;

    return (
        <div className="min-h-screen bg-[#F8F9FA] text-zinc-900 antialiased selection:bg-zinc-200">
            {/* Main Outer Container with generous breathing room */}
            <div className="max-w-[1520px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* ============================================ */}
                {/* 1. TOP HEADER & STATUS BAR                   */}
                {/* ============================================ */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-zinc-200/60">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 border border-zinc-200/80">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                            </span>
                            {pace && (
                                <span className={cn(
                                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                    pace.status === "ON_TRACK" && "bg-emerald-50 text-emerald-700 border-emerald-200/80",
                                    pace.status === "BEHIND" && "bg-amber-50 text-amber-700 border-amber-200/80",
                                    pace.status === "LATE" && "bg-rose-50 text-rose-700 border-rose-200/80"
                                )}>
                                    <Activity className="w-3 h-3" />
                                    {isAhead && `Rythme : +${pace.aheadBy} d'avance`}
                                    {isBehind && `Rythme : -${pace.delta} de retard`}
                                    {!isAhead && !isBehind && "Pile dans le rythme"}
                                </span>
                            )}
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">
                            {greeting()}, {sdrFirstName}
                        </h1>
                        <p className="text-sm text-zinc-500 font-normal">
                            Votre espace de pilotage quotidien : gérez vos rappels, votre cadence et votre prospection active.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link href="/sdr/action">
                            <button className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition-all shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] active:scale-[0.98]">
                                <Play className="w-4 h-4 fill-current" />
                                <span>Lancer la prospection</span>
                            </button>
                        </Link>
                    </div>
                </div>

                {/* ============================================ */}
                {/* 2. KPI OVERVIEW ROW (Clean, Solid, Refined)  */}
                {/* ============================================ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* KPI 1: Calls Today */}
                    <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all hover:border-zinc-300">
                        <div className="flex items-center justify-between text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2">
                            <span>Appels Réalisés</span>
                            <div className="w-8 h-8 rounded-lg bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-700">
                                <Phone className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-semibold text-zinc-900 tracking-tight">
                                {heroCount}
                            </span>
                            {pace && (
                                <span className="text-xs text-zinc-500 font-medium">
                                    / {pace.dayQuota} obj.
                                </span>
                            )}
                        </div>
                        <div className="mt-3 space-y-1.5">
                            <div className="flex justify-between text-xs text-zinc-500 font-normal">
                                <span>Progression journalière</span>
                                <span className="font-semibold text-zinc-700">{Math.round(dailyProgressPct)}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-zinc-900 rounded-full transition-all duration-700"
                                    style={{ width: `${dailyProgressPct}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* KPI 2: Meetings Booked */}
                    <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all hover:border-zinc-300">
                        <div className="flex items-center justify-between text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2">
                            <span>Rendez-vous Pris</span>
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100/60 flex items-center justify-center text-emerald-600">
                                <Calendar className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-semibold text-zinc-900 tracking-tight">
                                {stats?.meetingsBooked ?? 0}
                            </span>
                            <span className="text-xs text-emerald-600 font-medium flex items-center gap-0.5">
                                <TrendingUp className="w-3 h-3" /> Confirmés
                            </span>
                        </div>
                        <p className="mt-3 text-xs text-zinc-500 leading-relaxed">
                            Rendez-vous qualifiés et validés dans le planning client.
                        </p>
                    </div>

                    {/* KPI 3: Callbacks / Reminders */}
                    <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all hover:border-zinc-300">
                        <div className="flex items-center justify-between text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2">
                            <span>Rappels En Attente</span>
                            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100/60 flex items-center justify-center text-amber-600">
                                <Clock className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-semibold text-zinc-900 tracking-tight">
                                {callbacks.length}
                            </span>
                            {categorizedCallbacks.overdue.length > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-semibold border border-rose-200/60">
                                    {categorizedCallbacks.overdue.length} urgent(s)
                                </span>
                            )}
                        </div>
                        <p className="mt-3 text-xs text-zinc-500 leading-relaxed">
                            {categorizedCallbacks.today.length} rappel(s) prévu(s) pour aujourd'hui.
                        </p>
                    </div>

                    {/* KPI 4: Qualified Leads */}
                    <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all hover:border-zinc-300">
                        <div className="flex items-center justify-between text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2">
                            <span>Contacts Chauds</span>
                            <div className="w-8 h-8 rounded-lg bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-700">
                                <Briefcase className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-semibold text-zinc-900 tracking-tight">
                                {stats?.opportunitiesGenerated ?? 0}
                            </span>
                            <span className="text-xs text-zinc-500 font-medium">identifiés</span>
                        </div>
                        <p className="mt-3 text-xs text-zinc-500 leading-relaxed">
                            Prospects ayant manifesté un intérêt ou projet à court terme.
                        </p>
                    </div>
                </div>

                {/* ============================================ */}
                {/* 3. CORE TWO-COLUMN WORKSPACE                 */}
                {/* ============================================ */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                    {/* LEFT / MAIN WORKSPACE COLUMN (7 of 12) */}
                    <div className="lg:col-span-7 space-y-6">

                        {/* --- ACTIVE MISSION CARD --- */}
                        {activeMission ? (
                            <div className="bg-white rounded-2xl p-6 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-800 border border-zinc-200">
                                                <ChannelIcon className="w-3 h-3 text-zinc-500" />
                                                {activeMission.channel === "CALL" ? "Campagne Téléphonique" : activeMission.channel}
                                            </span>
                                            <span className="text-xs text-zinc-400">•</span>
                                            <span className="text-xs font-medium text-zinc-500 flex items-center gap-1">
                                                <Building2 className="w-3.5 h-3.5" />
                                                Client : {activeMission.client?.name}
                                            </span>
                                        </div>
                                        <h2 className="text-xl font-semibold text-zinc-900 tracking-tight pt-1">
                                            {activeMission.name}
                                        </h2>
                                    </div>

                                    {/* Mission switch dropdown if more than 1 mission */}
                                    {missions.length > 1 && (
                                        <div className="relative">
                                            <select
                                                aria-label="Changer de mission active"
                                                value={selectedMissionId || ""}
                                                onChange={(e) => {
                                                    setSelectedMissionId(e.target.value);
                                                    localStorage.setItem("sdr_selected_mission", e.target.value);
                                                }}
                                                className="text-xs font-medium bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg px-3 py-1.5 text-zinc-700 pr-8 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-400"
                                            >
                                                {missions.map(m => (
                                                    <option key={m.id} value={m.id}>
                                                        {m.name} ({m.client.name})
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-2.5 pointer-events-none" />
                                        </div>
                                    )}
                                </div>

                                {/* Mission stats & progress */}
                                <div className="grid grid-cols-3 gap-4 pt-1">
                                    <div className="p-3.5 rounded-xl bg-zinc-50/70 border border-zinc-100">
                                        <span className="text-xs text-zinc-500 font-medium block">Contacts restants</span>
                                        <span className="text-lg font-semibold text-zinc-900 mt-0.5 block">
                                            {activeMission.contactsRemaining.toLocaleString("fr-FR")}
                                        </span>
                                    </div>
                                    <div className="p-3.5 rounded-xl bg-zinc-50/70 border border-zinc-100">
                                        <span className="text-xs text-zinc-500 font-medium block">Campagnes actives</span>
                                        <span className="text-lg font-semibold text-zinc-900 mt-0.5 block">
                                            {activeMission._count?.campaigns ?? 1}
                                        </span>
                                    </div>
                                    <div className="p-3.5 rounded-xl bg-zinc-50/70 border border-zinc-100">
                                        <span className="text-xs text-zinc-500 font-medium block">Avancement global</span>
                                        <span className="text-lg font-semibold text-zinc-900 mt-0.5 block">
                                            {activeMission.progress || 0}%
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-zinc-800 rounded-full transition-all duration-700"
                                            style={{ width: `${activeMission.progress || 0}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="pt-2 flex items-center justify-between">
                                    <span className="text-xs text-zinc-500">
                                        Prêt pour la session ? Accédez au terminal d'appel et qualifiez en temps réel.
                                    </span>
                                    <Link href="/sdr/action">
                                        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold transition-all">
                                            <Play className="w-3.5 h-3.5 fill-current" />
                                            Ouvrir la session d'appel
                                        </button>
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl p-8 border border-dashed border-zinc-300 text-center space-y-2">
                                <Target className="w-8 h-8 text-zinc-400 mx-auto" />
                                <h3 className="text-base font-semibold text-zinc-900">Aucune mission assignée</h3>
                                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                                    Vous n'avez pas de mission active dans votre planning. Contactez votre manager ou vérifiez vos affectations.
                                </p>
                            </div>
                        )}

                        {/* --- DEDICATED REMINDERS & CALLBACKS HUB (USER HIGHLIGHTED REQUIREMENT) --- */}
                        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
                            {/* Header & Tabs */}
                            <div className="p-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-base font-semibold text-zinc-900 tracking-tight">
                                            Rappels & Relances
                                        </h2>
                                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200/60">
                                            {callbacks.length}
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        Prospects ayant demandé à être recontactés à un horaire précis.
                                    </p>
                                </div>

                                <div className="flex items-center gap-1 p-1 bg-zinc-100/80 rounded-xl border border-zinc-200/60 text-xs">
                                    <button
                                        onClick={() => setCallbackTab("today")}
                                        className={cn(
                                            "px-3 py-1 rounded-lg font-medium transition-all",
                                            callbackTab === "today"
                                                ? "bg-white text-zinc-900 shadow-sm"
                                                : "text-zinc-600 hover:text-zinc-900"
                                        )}
                                    >
                                        Aujourd'hui ({categorizedCallbacks.today.length + categorizedCallbacks.overdue.length})
                                    </button>
                                    <button
                                        onClick={() => setCallbackTab("overdue")}
                                        className={cn(
                                            "px-3 py-1 rounded-lg font-medium transition-all",
                                            callbackTab === "overdue"
                                                ? "bg-white text-rose-700 shadow-sm font-semibold"
                                                : "text-zinc-600 hover:text-rose-600"
                                        )}
                                    >
                                        En retard ({categorizedCallbacks.overdue.length})
                                    </button>
                                    <button
                                        onClick={() => setCallbackTab("all")}
                                        className={cn(
                                            "px-3 py-1 rounded-lg font-medium transition-all",
                                            callbackTab === "all"
                                                ? "bg-white text-zinc-900 shadow-sm"
                                                : "text-zinc-600 hover:text-zinc-900"
                                        )}
                                    >
                                        Tous ({callbacks.length})
                                    </button>
                                </div>
                            </div>

                            {/* Callbacks Content List */}
                            <div className="divide-y divide-zinc-100 max-h-[460px] overflow-y-auto">
                                {callbacksLoading ? (
                                    <div className="flex items-center justify-center py-12 text-zinc-400">
                                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                        <span className="text-xs">Chargement de vos rappels...</span>
                                    </div>
                                ) : displayedCallbacks.length === 0 ? (
                                    <div className="py-12 px-6 text-center space-y-2">
                                        <div className="w-10 h-10 rounded-full bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-400 mx-auto">
                                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                        </div>
                                        <p className="text-sm font-medium text-zinc-700">
                                            {callbackTab === "overdue"
                                                ? "Aucun rappel en retard ! Vous êtes parfaitement à jour."
                                                : "Aucun rappel prévu pour le moment."}
                                        </p>
                                        <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                                            Les rappels que vous planifiez dans le terminal d'appel s'afficheront directement ici.
                                        </p>
                                    </div>
                                ) : (
                                    displayedCallbacks.map((cb) => {
                                        const contactName = cb.contact
                                            ? `${cb.contact.firstName || ""} ${cb.contact.lastName || ""}`.trim()
                                            : null;
                                        const companyName = cb.company?.name || cb.contact?.company?.name || "Entreprise sans nom";
                                        const displayName = contactName || companyName;
                                        const phoneNumber = cb.contact?.phone || cb.company?.phone;
                                        
                                        const isOverdue = cb.callbackDate && new Date(cb.callbackDate).getTime() < now.getTime();
                                        const callbackTimeStr = cb.callbackDate
                                            ? new Date(cb.callbackDate).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                                            : "Non planifié";
                                        const callbackDateStr = cb.callbackDate
                                            ? new Date(cb.callbackDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
                                            : "";

                                        return (
                                            <div
                                                key={cb.id}
                                                className="p-4 sm:px-5 hover:bg-zinc-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                                            >
                                                <div className="space-y-1 min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn(
                                                            "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border",
                                                            isOverdue
                                                                ? "bg-rose-50 text-rose-700 border-rose-200/80"
                                                                : "bg-zinc-100 text-zinc-700 border-zinc-200"
                                                        )}>
                                                            <Clock className="w-3 h-3" />
                                                            {callbackDateStr} à {callbackTimeStr}
                                                            {isOverdue && " · Dépassé"}
                                                        </span>
                                                        {cb.mission && (
                                                            <span className="text-[11px] text-zinc-400 truncate">
                                                                • {cb.mission.name}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-baseline gap-2 pt-0.5">
                                                        <button
                                                            onClick={() => openContactOrCompany(cb.contact?.id, cb.company?.id)}
                                                            className="text-sm font-semibold text-zinc-900 hover:text-zinc-600 transition-colors truncate text-left"
                                                        >
                                                            {displayName}
                                                        </button>
                                                        {contactName && companyName && (
                                                            <span className="text-xs text-zinc-500 truncate">
                                                                chez {companyName}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {cb.note && (
                                                        <p className="text-xs text-zinc-600 bg-zinc-50 p-2 rounded-lg border border-zinc-100 line-clamp-2 italic">
                                                            « {cb.note} »
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2 flex-shrink-0 pt-1 sm:pt-0">
                                                    {phoneNumber ? (
                                                        <a
                                                            href={`tel:${phoneNumber}`}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium transition-all shadow-xs"
                                                        >
                                                            <PhoneCall className="w-3.5 h-3.5" />
                                                            <span>Appeler ({phoneNumber})</span>
                                                        </a>
                                                    ) : (
                                                        <button
                                                            onClick={() => openContactOrCompany(cb.contact?.id, cb.company?.id)}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium transition-colors"
                                                        >
                                                            <span>Voir la fiche</span>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => openContactOrCompany(cb.contact?.id, cb.company?.id)}
                                                        className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors"
                                                        title="Détails"
                                                    >
                                                        <ChevronRight className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* --- RECENT ACTIVITY STREAM --- */}
                        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
                            <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-semibold text-zinc-900 tracking-tight">
                                        Historique récent des appels
                                    </h3>
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                                        {myActions.length}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1 p-1 bg-zinc-100/80 rounded-xl border border-zinc-200/60 text-xs">
                                    <button
                                        onClick={() => setActionsPeriod("today")}
                                        className={cn(
                                            "px-2.5 py-1 rounded-lg font-medium transition-all",
                                            actionsPeriod === "today"
                                                ? "bg-white text-zinc-900 shadow-sm"
                                                : "text-zinc-600 hover:text-zinc-900"
                                        )}
                                    >
                                        Aujourd'hui
                                    </button>
                                    <button
                                        onClick={() => setActionsPeriod("all")}
                                        className={cn(
                                            "px-2.5 py-1 rounded-lg font-medium transition-all",
                                            actionsPeriod === "all"
                                                ? "bg-white text-zinc-900 shadow-sm"
                                                : "text-zinc-600 hover:text-zinc-900"
                                        )}
                                    >
                                        Tout
                                    </button>
                                </div>
                            </div>

                            <div className="divide-y divide-zinc-100 max-h-[360px] overflow-y-auto">
                                {actionsLoading ? (
                                    <div className="flex items-center justify-center py-10 text-zinc-400">
                                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                        <span className="text-xs">Chargement de l'historique...</span>
                                    </div>
                                ) : myActions.length === 0 ? (
                                    <div className="py-10 text-center text-xs text-zinc-400">
                                        Aucune action enregistrée pour cette période.
                                    </div>
                                ) : (
                                    myActions.map((item) => {
                                        const name = item.contactName || item.companyName || "Contact sans nom";
                                        const time = new Date(item.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => openContactOrCompany(item.contactId, item.companyId)}
                                                className="p-3.5 sm:px-5 hover:bg-zinc-50/60 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-600 flex-shrink-0 group-hover:bg-zinc-200 transition-colors">
                                                        {item.contactId ? <User className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-semibold text-zinc-900 truncate">
                                                            {name}
                                                        </p>
                                                        <p className="text-[11px] text-zinc-500 truncate">
                                                            {item.resultLabel} {item.campaignName && `• ${item.campaignName}`}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <span className="text-[11px] text-zinc-400 font-mono">
                                                        {time}
                                                    </span>
                                                    <ChevronRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-600 transition-colors" />
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                    </div>

                    {/* RIGHT / SDR COPILOT & HELP COLUMN (5 of 12) */}
                    <div className="lg:col-span-5 space-y-6">

                        {/* --- CADENCE & RYTHME DU JOUR (Clean Minimalist Pace Widget) --- */}
                        {pace && (
                            <div className="bg-white rounded-2xl p-6 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700">
                                            <Activity className="w-3.5 h-3.5" />
                                        </div>
                                        <h3 className="text-sm font-semibold text-zinc-900">
                                            Rythme & Cadence du Jour
                                        </h3>
                                    </div>
                                    <span className="text-xs text-zinc-500 font-medium">
                                        Cible : {pace.callsPerHour} appels/h
                                    </span>
                                </div>

                                <div className="grid grid-cols-3 gap-3 pt-1">
                                    <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                                        <span className="text-[11px] text-zinc-500 block">Réalisés</span>
                                        <span className="text-lg font-bold text-zinc-900 block mt-0.5">
                                            {pace.callsDone}
                                            <span className="text-xs font-normal text-zinc-400"> / {pace.dayQuota}</span>
                                        </span>
                                    </div>
                                    <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                                        <span className="text-[11px] text-zinc-500 block">Attendu à ce stade</span>
                                        <span className="text-lg font-bold text-zinc-900 block mt-0.5">
                                            {pace.expected}
                                        </span>
                                    </div>
                                    <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                                        <span className="text-[11px] text-zinc-500 block">Écart</span>
                                        <span className={cn(
                                            "text-lg font-bold block mt-0.5",
                                            isAhead && "text-emerald-600",
                                            isBehind && "text-amber-600",
                                            !isAhead && !isBehind && "text-zinc-900"
                                        )}>
                                            {isAhead && `+${pace.aheadBy}`}
                                            {isBehind && `-${pace.delta}`}
                                            {!isAhead && !isBehind && "0"}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-1.5 pt-1">
                                    <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden relative">
                                        <div
                                            className={cn(
                                                "h-full rounded-full transition-all duration-700",
                                                pace.status === "ON_TRACK" ? "bg-emerald-600" : pace.status === "BEHIND" ? "bg-amber-500" : "bg-rose-500"
                                            )}
                                            style={{ width: `${dailyProgressPct}%` }}
                                        />
                                    </div>
                                    <p className="text-[11px] text-zinc-500 leading-tight">
                                        {formatHours(pace.effectiveHoursElapsed)} d&apos;appel effectif sur {formatHours(pace.effectiveHoursTarget)} prévues.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* --- SDR HELP & BATTLECARDS HUB (USER HIGHLIGHTED REQUIREMENT) --- */}
                        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden space-y-4 p-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700">
                                        <BookOpen className="w-3.5 h-3.5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-zinc-900">
                                            Aide & Fiches d'Objections
                                        </h3>
                                        <p className="text-[11px] text-zinc-500">
                                            Scripts rapides et parades en direct pendant vos appels.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Battlecards selector pills */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {BATTLECARDS.map((card) => (
                                    <button
                                        key={card.id}
                                        onClick={() => setActiveBattlecard(card.id)}
                                        className={cn(
                                            "text-xs px-3 py-1.5 rounded-lg font-medium transition-all border",
                                            activeBattlecard === card.id
                                                ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                                                : "bg-zinc-50 text-zinc-600 border-zinc-200/80 hover:bg-zinc-100"
                                        )}
                                    >
                                        {card.title}
                                    </button>
                                ))}
                            </div>

                            {/* Active Battlecard display */}
                            {(() => {
                                const card = BATTLECARDS.find(c => c.id === activeBattlecard) || BATTLECARDS[0];
                                return (
                                    <div className="rounded-xl p-4 bg-zinc-50 border border-zinc-200/80 space-y-3">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-semibold text-zinc-900">{card.title}</span>
                                            <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-600 bg-white px-2 py-0.5 rounded border border-zinc-200">
                                                {card.tag}
                                            </span>
                                        </div>

                                        <div className="bg-white p-3 rounded-lg border border-zinc-200/80 text-xs font-mono text-zinc-800 leading-relaxed whitespace-pre-line shadow-2xs">
                                            {card.prompt}
                                        </div>

                                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                                            💡 <strong>Conseil :</strong> {card.tip}
                                        </p>
                                    </div>
                                );
                            })()}

                            {/* Keyboard Shortcuts Helper Drawer Toggle */}
                            <div className="pt-2 border-t border-zinc-100">
                                <button
                                    onClick={() => setShowShortcuts(!showShortcuts)}
                                    className="w-full flex items-center justify-between text-xs text-zinc-600 hover:text-zinc-900 font-medium py-1"
                                >
                                    <span className="flex items-center gap-1.5">
                                        <Zap className="w-3.5 h-3.5 text-zinc-500" />
                                        Raccourcis clavier d'appel rapide
                                    </span>
                                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showShortcuts && "rotate-180")} />
                                </button>

                                {showShortcuts && (
                                    <div className="mt-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100 space-y-2 text-xs">
                                        <div className="grid grid-cols-2 gap-2 text-zinc-600">
                                            <div className="flex items-center gap-2">
                                                <kbd className="px-1.5 py-0.5 bg-white border border-zinc-300 rounded text-[10px] font-mono shadow-2xs">1</kbd>
                                                <span>Pas de réponse</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <kbd className="px-1.5 py-0.5 bg-white border border-zinc-300 rounded text-[10px] font-mono shadow-2xs">2</kbd>
                                                <span>Rappel planifié</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <kbd className="px-1.5 py-0.5 bg-white border border-zinc-300 rounded text-[10px] font-mono shadow-2xs">3</kbd>
                                                <span>Barrage secrétaire</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <kbd className="px-1.5 py-0.5 bg-white border border-zinc-300 rounded text-[10px] font-mono shadow-2xs">4</kbd>
                                                <span>RDV Décroché</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <kbd className="px-1.5 py-0.5 bg-white border border-zinc-300 rounded text-[10px] font-mono shadow-2xs">5</kbd>
                                                <span>Refus / Non intéressé</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <kbd className="px-1.5 py-0.5 bg-white border border-zinc-300 rounded text-[10px] font-mono shadow-2xs">Entrée</kbd>
                                                <span>Valider & Suivant</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* --- WEEKLY PERFORMANCE OVERVIEW --- */}
                        {stats && (
                            <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider">
                                        Tendance Hebdomadaire
                                    </h4>
                                    <span className={cn(
                                        "text-xs font-semibold px-2 py-0.5 rounded-full",
                                        (stats.weeklyProgress ?? 0) >= 0
                                            ? "bg-emerald-50 text-emerald-700"
                                            : "bg-amber-50 text-amber-700"
                                    )}>
                                        {(stats.weeklyProgress ?? 0) >= 0 ? "+ Forte cadence" : "Rythme stable"}
                                    </span>
                                </div>
                                <p className="text-xs text-zinc-500 leading-relaxed">
                                    {(stats.weeklyProgress ?? 0) >= 0
                                        ? "Votre volume d'appels et de qualifications progresse par rapport à la semaine dernière."
                                        : "Vous maintenez votre cadence habituelle de prospection."}
                                </p>
                            </div>
                        )}

                    </div>
                </div>

            </div>

            {/* ============================================ */}
            {/* 4. MODALS & DRAWERS                          */}
            {/* ============================================ */}
            {drawerContactId && drawerContact && (
                <ContactDrawer
                    isOpen={!!drawerContactId}
                    onClose={() => { setDrawerContactId(null); setDrawerContact(null); }}
                    contact={drawerContact}
                    onUpdate={(updated) => setDrawerContact(updated)}
                    isManager={false}
                    enableGooglePhoneLookup
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
                    isManager={false}
                    enableGooglePhoneLookup
                />
            )}
        </div>
    );
}
