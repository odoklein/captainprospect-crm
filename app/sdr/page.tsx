"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ContactDrawer } from "@/components/drawers";
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
    ChevronDown,
    BookOpen,
    Sparkles,
    PhoneCall,
    Copy,
    Check,
    Bell,
    X
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

// ============================================
// CONSTANTS & HELPERS
// ============================================

const CHANNEL_ICONS = {
    CALL: Phone,
    EMAIL: Mail,
    LINKEDIN: Linkedin,
};

const BATTLECARDS = [
    {
        id: "gatekeeper",
        badge: "Standard",
        title: "Passer le standard",
        color: "text-indigo-600 bg-indigo-50 border-indigo-200/80",
        prompt: "« Bonjour, je suis en ligne avec M./Mme [Nom] sur son dossier [Sujet], pouvez-vous me basculer directement sur son poste ? »",
        tip: "Ton direct et posé. Ne demandez pas 'Est-ce qu'il est disponible ?', annoncez la mise en relation avec confiance.",
    },
    {
        id: "no_time",
        badge: "Objection",
        title: "« Pas le temps »",
        color: "text-amber-700 bg-amber-50 border-amber-200/80",
        prompt: "« C'est précisément pour cela que je vous appelle : je prends 30 secondes chrono pour voir si le sujet vous concerne, sinon nous clôturons. »",
        tip: "Désamorcez le stress en fixant un micro-cadre temporel (30 sec). Vous reprenez la maîtrise.",
    },
    {
        id: "provider",
        badge: "Objection",
        title: "« Déjà un prestataire »",
        color: "text-sky-700 bg-sky-50 border-sky-200/80",
        prompt: "« C'est une excellente chose. Notre but n'est pas de remplacer votre partenaire actuel, mais d'avoir un point de comparaison sur vos besoins de fin d'année. »",
        tip: "Validez leur choix d'abord. Transformez l'échange en veille et benchmark non agressif.",
    },
    {
        id: "qualification",
        badge: "Checklist",
        title: "Validation du RDV",
        color: "text-emerald-700 bg-emerald-50 border-emerald-200/80",
        prompt: "1. Le contact est-il le vrai décisionnaire final ?\n2. Le besoin ou projet est-il prévu dans les 3 prochains mois ?\n3. L'email direct et le mobile sont-ils vérifiés à 100% ?",
        tip: "Un rendez-vous non qualifié est un rdv absent dans 70% des cas. Mieux vaut disqualifier tôt.",
    }
];

function getWeekDays() {
    const today = new Date();
    const currentDay = today.getDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);

    const labels = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
    return labels.map((label, index) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + index);
        const isToday = d.toDateString() === today.toDateString();
        return {
            label,
            dayNumber: d.getDate(),
            isToday,
            dateStr: d.toISOString().slice(0, 10)
        };
    });
}

function CircularProgress({ percent, color = "#10B981", size = 48, strokeWidth = 4.5 }: { percent: number; color?: string; size?: number; strokeWidth?: number }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

    return (
        <div className="relative inline-flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="#E2E8F0"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <span className="absolute text-[11px] font-black text-zinc-800">
                {Math.round(percent)}%
            </span>
        </div>
    );
}

// Mini Coming Soon Pop-up for Company Action Requests
function CompanyComingSoonModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 text-center space-y-4 animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-slate-100 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-sm">
                    <Sparkles className="w-6 h-6 text-amber-500 fill-amber-100" />
                </div>
                <div className="space-y-1.5">
                    <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 uppercase tracking-wider">
                        Bientôt disponible
                    </span>
                    <h3 className="text-base font-extrabold text-zinc-900 pt-1">
                        Fiche Entreprise en Action Unifiée
                    </h3>
                    <p className="text-xs text-zinc-600 leading-relaxed font-medium">
                        Cette fonctionnalité sera disponible dès la semaine prochaine en version stable.
                    </p>
                </div>
                <div className="pt-2">
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold transition-all shadow-sm active:scale-[0.98]"
                    >
                        Compris
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================
// MAIN SDR DASHBOARD COMPONENT
// ============================================

export default function SDRDashboardPage() {
    const { data: session } = useSession();
    const { pace } = useSdrPace();

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

    // Help & Battlecards state
    const [activeBattlecard, setActiveBattlecard] = useState<string>("gatekeeper");
    const [copiedScript, setCopiedScript] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);

    // Coming soon pop-up for company navigation
    const [companyModalOpen, setCompanyModalOpen] = useState(false);

    // Drawer state (for contacts only)
    const [drawerContactId, setDrawerContactId] = useState<string | null>(null);
    const [drawerContact, setDrawerContact] = useState<DrawerContact | null>(null);
    const [drawerLoading, setDrawerLoading] = useState(false);

    // Hero counter animation
    const heroTarget = pace?.callsDone ?? stats?.actionsToday ?? 0;
    const [heroCount, setHeroCount] = useState(0);
    const heroShown = useRef(0);

    const weekDays = useMemo(() => getWeekDays(), []);

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

    // Fetch Callbacks
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
                const res = await fetch(`/api/sdr/actions?period=${actionsPeriod}&limit=35`);
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
        const step = Math.max(1, Math.ceil(Math.abs(heroTarget - current) / 12));
        const interval = setInterval(() => {
            current = current < heroTarget
                ? Math.min(current + step, heroTarget)
                : Math.max(current - step, heroTarget);
            heroShown.current = current;
            setHeroCount(current);
            if (current === heroTarget) clearInterval(interval);
        }, 30);
        return () => clearInterval(interval);
    }, [heroTarget]);

    // Drawer logic (Contact only)
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

    // Intercept Company navigation: show coming soon modal
    const handleEntityClick = (contactId?: string | null, companyId?: string | null) => {
        if (contactId) {
            setDrawerContactId(contactId);
        } else if (companyId) {
            setCompanyModalOpen(true);
        }
    };

    const handleCompanyClick = () => {
        setCompanyModalOpen(true);
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
                    overdue.push(cb);
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
    const sdrFirstName = session?.user?.name?.split(" ")[0] ?? "SDR";

    // Pacing calculations
    const dailyProgressPct = pace && pace.dayQuota > 0 ? Math.min((pace.callsDone / pace.dayQuota) * 100, 100) : 0;
    const isAhead = pace && pace.aheadBy > 0;
    const isBehind = pace && pace.delta > 0;
    const roundedRate = pace ? Math.round(pace.callsPerHour) : 12;

    const copyScriptToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 2000);
    };

    return (
        <div className="w-full space-y-6 pb-12 antialiased">

            {/* ============================================ */}
            {/* 1. SEAMLESS TOP BAR: OPEN GREETING & CALENDAR*/}
            {/* ============================================ */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Session Active
                        </span>
                        {pace && (
                            <span className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shadow-2xs",
                                pace.status === "ON_TRACK" && "bg-emerald-50 text-emerald-700 border-emerald-200/80",
                                pace.status === "BEHIND" && "bg-amber-50 text-amber-700 border-amber-200/80",
                                pace.status === "LATE" && "bg-rose-50 text-rose-700 border-rose-200/80"
                            )}>
                                <Activity className="w-3.5 h-3.5" />
                                {isAhead && `Rythme : +${pace.aheadBy} appels d'avance`}
                                {isBehind && `Rythme : -${pace.delta} appels de retard`}
                                {!isAhead && !isBehind && "Dans le rythme"}
                            </span>
                        )}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900">
                        Bonjour, {sdrFirstName} ! 👋
                    </h1>
                    <p className="text-xs sm:text-sm text-zinc-500 font-medium">
                        Votre espace de phoning : avancez sur vos rappels, qualifiez vos prospects et suivez votre cadence.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Weekly day pills (Fluento inspired) */}
                    <div className="hidden sm:flex items-center p-1 bg-white rounded-2xl border border-slate-200 shadow-2xs gap-1">
                        {weekDays.map((wd) => (
                            <div
                                key={wd.label}
                                className={cn(
                                    "flex flex-col items-center justify-center w-10 h-11 rounded-xl transition-all",
                                    wd.isToday
                                        ? "bg-zinc-950 text-white font-bold shadow-xs"
                                        : "text-zinc-600 hover:bg-slate-50 font-medium"
                                )}
                            >
                                <span className="text-[9px] uppercase tracking-wider opacity-80">{wd.label}</span>
                                <span className="text-xs font-bold mt-0.5">{wd.dayNumber}</span>
                            </div>
                        ))}
                    </div>

                    {/* Launch action CTA button */}
                    <Link href="/sdr/action">
                        <button className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-black tracking-tight shadow-md hover:shadow-lg transition-all active:scale-[0.98]">
                            <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                            <span>Démarrer les appels</span>
                        </button>
                    </Link>
                </div>
            </div>

            {/* ============================================ */}
            {/* 2. VIBRANT TACTILE KPI CARDS (Noviq/Fluento) */}
            {/* ============================================ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Calls Today */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex items-center justify-between hover:border-slate-300 transition-all">
                    <div className="space-y-1">
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                            Appels du jour
                        </span>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-3xl font-black text-zinc-900 tracking-tight">
                                {heroCount}
                            </span>
                            {pace && (
                                <span className="text-xs font-bold text-zinc-400">
                                    / {pace.dayQuota}
                                </span>
                            )}
                        </div>
                        <span className="text-[11px] font-bold text-emerald-600 block">
                            {roundedRate} appels/h prévus
                        </span>
                    </div>
                    <CircularProgress percent={dailyProgressPct} color="#10B981" size={52} strokeWidth={4.5} />
                </div>

                {/* Meetings Booked */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex items-center justify-between hover:border-slate-300 transition-all">
                    <div className="space-y-1">
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                            RDV Décrochés
                        </span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-zinc-900 tracking-tight">
                                {stats?.meetingsBooked ?? 0}
                            </span>
                            <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                                Validés
                            </span>
                        </div>
                        <span className="text-[11px] font-semibold text-zinc-500 block">
                            Directement dans l'agenda
                        </span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-[0_4px_14px_rgba(16,185,129,0.35)]">
                        <Calendar className="w-6 h-6 stroke-[2.2]" />
                    </div>
                </div>

                {/* Callbacks Due */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex items-center justify-between hover:border-slate-300 transition-all">
                    <div className="space-y-1">
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                            Rappels à Traiter
                        </span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-zinc-900 tracking-tight">
                                {callbacks.length}
                            </span>
                            {categorizedCallbacks.overdue.length > 0 && (
                                <span className="text-[10px] font-extrabold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full">
                                    {categorizedCallbacks.overdue.length} urgent(s)
                                </span>
                            )}
                        </div>
                        <span className="text-[11px] font-bold text-amber-700 block">
                            {categorizedCallbacks.today.length} prévu(s) aujourd'hui
                        </span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-[0_4px_14px_rgba(245,158,11,0.35)]">
                        <Clock className="w-6 h-6 stroke-[2.2]" />
                    </div>
                </div>

                {/* Qualified Leads */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex items-center justify-between hover:border-slate-300 transition-all">
                    <div className="space-y-1">
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                            Contacts Chauds
                        </span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-zinc-900 tracking-tight">
                                {stats?.opportunitiesGenerated ?? 0}
                            </span>
                            <span className="text-[10px] font-extrabold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-full">
                                Qualifiés
                            </span>
                        </div>
                        <span className="text-[11px] font-semibold text-zinc-500 block">
                            Intérêt & projet confirmés
                        </span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-[0_4px_14px_rgba(79,70,229,0.35)]">
                        <Briefcase className="w-6 h-6 stroke-[2.2]" />
                    </div>
                </div>
            </div>

            {/* ============================================ */}
            {/* 3. DUAL WORKSPACE: 8 COLS / 4 COLS (BREATHING ROOM) */}
            {/* ============================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                {/* LEFT COLUMN: ACTIVE MISSION, REMINDERS & ACTIVITY (8 of 12) */}
                <div className="lg:col-span-8 space-y-6">

                    {/* ACTIVE MISSION CARD (NevBank Forest Green Style) */}
                    {activeMission ? (
                        <div className="rounded-3xl bg-[#0B3524] text-white p-6 sm:p-7 shadow-[0_4px_16px_rgba(11,53,36,0.22)] relative overflow-hidden space-y-5 border border-emerald-900/60">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-800/90 text-emerald-200 border border-emerald-700/60 flex items-center gap-1.5 shadow-2xs">
                                        <ChannelIcon className="w-3.5 h-3.5 text-emerald-300" />
                                        {activeMission.channel === "CALL" ? "Campagne Téléphonique" : activeMission.channel}
                                    </span>
                                    <span className="text-xs text-emerald-400 font-semibold">
                                        Client : {activeMission.client?.name}
                                    </span>
                                </div>

                                {missions.length > 1 && (
                                    <div className="relative">
                                        <select
                                            aria-label="Changer de mission active"
                                            value={selectedMissionId || ""}
                                            onChange={(e) => {
                                                setSelectedMissionId(e.target.value);
                                                localStorage.setItem("sdr_selected_mission", e.target.value);
                                            }}
                                            className="text-xs font-semibold bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-700/80 rounded-xl px-3 py-1.5 text-emerald-100 pr-7 appearance-none cursor-pointer focus:outline-none"
                                        >
                                            {missions.map(m => (
                                                <option key={m.id} value={m.id} className="bg-zinc-900 text-white">
                                                    {m.name} ({m.client.name})
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="w-3.5 h-3.5 text-emerald-400 absolute right-2.5 top-2.5 pointer-events-none" />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-1">
                                <h2 className="text-2xl font-black tracking-tight text-white">
                                    {activeMission.name}
                                </h2>
                                <p className="text-xs text-emerald-200/80 font-medium">
                                    {activeMission.contactsRemaining.toLocaleString("fr-FR")} fiches à prospecter dans cette mission.
                                </p>
                            </div>

                            <div className="grid grid-cols-3 gap-3 pt-1">
                                <div className="p-3.5 rounded-2xl bg-emerald-950/70 border border-emerald-800/60">
                                    <span className="text-[11px] text-emerald-300 font-bold block">Fiches restantes</span>
                                    <span className="text-lg font-black text-white mt-0.5 block">
                                        {activeMission.contactsRemaining.toLocaleString("fr-FR")}
                                    </span>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-emerald-950/70 border border-emerald-800/60">
                                    <span className="text-[11px] text-emerald-300 font-bold block">Campagnes</span>
                                    <span className="text-lg font-black text-white mt-0.5 block">
                                        {activeMission._count?.campaigns ?? 1}
                                    </span>
                                </div>
                                <div className="p-3.5 rounded-2xl bg-emerald-950/70 border border-emerald-800/60">
                                    <span className="text-[11px] text-emerald-300 font-bold block">Progression</span>
                                    <span className="text-lg font-black text-emerald-400 mt-0.5 block">
                                        {activeMission.progress || 0}%
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <div className="h-2 w-full bg-emerald-950/80 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 rounded-full transition-all duration-700"
                                        style={{ width: `${activeMission.progress || 0}%` }}
                                    />
                                </div>
                            </div>

                            <div className="pt-2 flex items-center justify-between border-t border-emerald-800/50">
                                <span className="text-xs text-emerald-200 font-medium">
                                    Raccourcis clavier actifs (touches 1 à 5 pour qualifier)
                                </span>
                                <Link href="/sdr/action">
                                    <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-950 text-xs font-black tracking-tight shadow-md transition-all active:scale-[0.98]">
                                        <Play className="w-3.5 h-3.5 fill-current text-emerald-600" />
                                        <span>Ouvrir la session d'appel</span>
                                    </button>
                                </Link>
                            </div>
                        </div>
                    ) : null}

                    {/* REMINDERS & CALLBACKS HUB (Noviq Alert Cards Style) */}
                    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden space-y-4 p-6 sm:p-7">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                                        <Bell className="w-4 h-4" />
                                    </div>
                                    <h2 className="text-base font-extrabold text-zinc-900 tracking-tight">
                                        Rappels & Relances SDR
                                    </h2>
                                    <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-slate-100 text-zinc-800">
                                        {callbacks.length}
                                    </span>
                                </div>
                                <p className="text-xs text-zinc-500 mt-1 font-medium">
                                    Prospects ayant demandé à être rappelés avec engagement d'horaire.
                                </p>
                            </div>

                            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
                                <button
                                    onClick={() => setCallbackTab("today")}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg transition-all",
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
                                        "px-3 py-1.5 rounded-lg transition-all",
                                        callbackTab === "overdue"
                                            ? "bg-rose-600 text-white shadow-sm"
                                            : "text-rose-600 hover:text-rose-700"
                                    )}
                                >
                                    En retard ({categorizedCallbacks.overdue.length})
                                </button>
                                <button
                                    onClick={() => setCallbackTab("all")}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg transition-all",
                                        callbackTab === "all"
                                            ? "bg-white text-zinc-900 shadow-sm"
                                            : "text-zinc-600 hover:text-zinc-900"
                                    )}
                                >
                                    Tous ({callbacks.length})
                                </button>
                            </div>
                        </div>

                        {/* Callbacks List */}
                        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                            {callbacksLoading ? (
                                <div className="flex items-center justify-center py-12 text-zinc-400">
                                    <Loader2 className="w-5 h-5 animate-spin mr-2 text-zinc-600" />
                                    <span className="text-xs font-semibold">Chargement des rappels en temps réel...</span>
                                </div>
                            ) : displayedCallbacks.length === 0 ? (
                                <div className="py-12 px-6 text-center space-y-2 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                                    <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-2xs">
                                        <CheckCircle2 className="w-6 h-6" />
                                    </div>
                                    <p className="text-sm font-bold text-zinc-800">
                                        {callbackTab === "overdue"
                                            ? "Aucun rappel en retard ! Vous êtes parfaitement à jour."
                                            : "Aucun rappel planifié pour le moment."}
                                    </p>
                                    <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                                        Dès qu'un prospect demande à être rappelé pendant un appel, la fiche s'ajoute automatiquement ici.
                                    </p>
                                </div>
                            ) : (
                                displayedCallbacks.map((cb) => {
                                    const contactName = cb.contact
                                        ? `${cb.contact.firstName || ""} ${cb.contact.lastName || ""}`.trim()
                                        : null;
                                    const companyName = cb.company?.name || cb.contact?.company?.name || "Entreprise";
                                    const phoneNumber = cb.contact?.phone || cb.company?.phone;

                                    const isOverdue = cb.callbackDate && new Date(cb.callbackDate).getTime() < now.getTime();
                                    const callbackTimeStr = cb.callbackDate
                                        ? new Date(cb.callbackDate).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                                        : "Horaire non précisé";
                                    const callbackDateStr = cb.callbackDate
                                        ? new Date(cb.callbackDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
                                        : "";

                                    return (
                                        <div
                                            key={cb.id}
                                            className={cn(
                                                "p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs",
                                                isOverdue
                                                    ? "bg-[#FEF2F2] border-rose-200 hover:border-rose-300"
                                                    : "bg-white border-slate-200 hover:border-slate-300"
                                            )}
                                        >
                                            <div className="space-y-1.5 min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full",
                                                        isOverdue
                                                            ? "bg-rose-600 text-white"
                                                            : "bg-amber-100 text-amber-900 border border-amber-300/60"
                                                    )}>
                                                        <Clock className="w-3 h-3" />
                                                        {callbackDateStr} à {callbackTimeStr}
                                                        {isOverdue && " · DÉPASSÉ"}
                                                    </span>
                                                    {cb.mission && (
                                                        <span className="text-xs font-semibold text-zinc-500 truncate">
                                                            • {cb.mission.name}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-baseline gap-2">
                                                    {contactName ? (
                                                        <button
                                                            onClick={() => handleEntityClick(cb.contact?.id, null)}
                                                            className="text-sm font-extrabold text-zinc-900 hover:text-indigo-600 transition-colors truncate text-left"
                                                        >
                                                            {contactName}
                                                        </button>
                                                    ) : null}
                                                    {companyName && (
                                                        <button
                                                            onClick={handleCompanyClick}
                                                            className="text-xs text-zinc-500 hover:text-indigo-600 font-semibold truncate transition-colors"
                                                            title="Ouvrir la fiche entreprise"
                                                        >
                                                            {contactName ? `chez ${companyName}` : companyName}
                                                        </button>
                                                    )}
                                                </div>

                                                {cb.note && (
                                                    <p className="text-xs text-zinc-600 bg-white/80 p-2.5 rounded-xl border border-slate-200/80 italic font-medium leading-relaxed">
                                                        « {cb.note} »
                                                    </p>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2 flex-shrink-0 pt-1 sm:pt-0">
                                                {phoneNumber ? (
                                                    <a
                                                        href={`tel:${phoneNumber}`}
                                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold shadow-xs transition-all active:scale-[0.98]"
                                                    >
                                                        <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                                                        <span>Appeler ({phoneNumber})</span>
                                                    </a>
                                                ) : null}

                                                {cb.contact?.id ? (
                                                    <button
                                                        onClick={() => handleEntityClick(cb.contact?.id, null)}
                                                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-zinc-800 text-xs font-bold transition-colors"
                                                    >
                                                        <span>Voir fiche</span>
                                                        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={handleCompanyClick}
                                                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-zinc-800 text-xs font-bold transition-colors"
                                                    >
                                                        <span>Voir fiche</span>
                                                        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* RECENT ACTIONS STREAM (Finexy Style) */}
                    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden space-y-3 p-6 sm:p-7">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                                    <Activity className="w-4 h-4" />
                                </div>
                                <h3 className="text-base font-extrabold text-zinc-900 tracking-tight">
                                    Historique des qualifications d'appels
                                </h3>
                                <span className="text-xs font-black px-2 py-0.5 rounded-full bg-slate-100 text-zinc-700">
                                    {myActions.length}
                                </span>
                            </div>

                            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
                                <button
                                    onClick={() => setActionsPeriod("today")}
                                    className={cn(
                                        "px-2.5 py-1 rounded-lg transition-all",
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
                                        "px-2.5 py-1 rounded-lg transition-all",
                                        actionsPeriod === "all"
                                            ? "bg-white text-zinc-900 shadow-sm"
                                            : "text-zinc-600 hover:text-zinc-900"
                                    )}
                                >
                                    Tout
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                            {actionsLoading ? (
                                <div className="flex items-center justify-center py-10 text-zinc-400">
                                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                    <span className="text-xs font-semibold">Chargement de l'activité...</span>
                                </div>
                            ) : myActions.length === 0 ? (
                                <div className="py-10 text-center text-xs font-semibold text-zinc-400">
                                    Aucune action enregistrée pour le moment.
                                </div>
                            ) : (
                                myActions.map((item) => {
                                    const name = item.contactName || item.companyName || "Contact";
                                    const time = new Date(item.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

                                    const isSuccess = ["MEETING_BOOKED", "QUALIFIE"].includes(item.result);
                                    const isCallback = ["RAPPEL", "CALLBACK_REQUESTED", "RELANCE"].includes(item.result);
                                    const isUnreachable = ["NO_RESPONSE", "NRP", "FAUX_NUMERO"].includes(item.result);

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => item.contactId ? handleEntityClick(item.contactId, null) : handleCompanyClick()}
                                            className="p-3.5 rounded-2xl bg-slate-50/70 hover:bg-slate-100/90 border border-slate-200/80 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-zinc-700 flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                                                    {item.contactId ? <User className="w-4 h-4 text-indigo-600" /> : <Building2 className="w-4 h-4 text-emerald-600" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-zinc-900 truncate">
                                                        {name}
                                                    </p>
                                                    <p className="text-[11px] text-zinc-500 truncate font-semibold">
                                                        {item.campaignName || "Campagne en cours"}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2.5 flex-shrink-0">
                                                <span className={cn(
                                                    "text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider",
                                                    isSuccess && "bg-emerald-100 text-emerald-800 border border-emerald-300",
                                                    isCallback && "bg-amber-100 text-amber-800 border border-amber-300",
                                                    isUnreachable && "bg-slate-200 text-slate-700",
                                                    !isSuccess && !isCallback && !isUnreachable && "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                                )}>
                                                    {item.resultLabel}
                                                </span>
                                                <span className="text-[11px] font-bold text-zinc-400 font-mono">
                                                    {time}
                                                </span>
                                                <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-600 transition-colors" />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN: CADENCE & BATTLECARDS COPILOT (4 of 12) */}
                <div className="lg:col-span-4 space-y-6">

                    {/* CADENCE & RYTHME DU JOUR WIDGET */}
                    {pace && (
                        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-teal-500 text-white flex items-center justify-center shadow-xs">
                                        <TrendingUp className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-zinc-900 tracking-tight">
                                            Cadence & Rythme du Jour
                                        </h3>
                                        <p className="text-[11px] text-zinc-500 font-semibold">
                                            Objectif : {roundedRate} appels/h
                                        </p>
                                    </div>
                                </div>

                                <span className={cn(
                                    "text-[11px] font-extrabold px-3 py-1 rounded-full",
                                    pace.status === "ON_TRACK" && "bg-emerald-100 text-emerald-800",
                                    pace.status === "BEHIND" && "bg-amber-100 text-amber-800",
                                    pace.status === "LATE" && "bg-rose-100 text-rose-800"
                                )}>
                                    {pace.status === "ON_TRACK" ? "Dans le rythme" : pace.status === "BEHIND" ? "À accélérer" : "En retard"}
                                </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2.5">
                                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                                    <span className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wider">Réalisés</span>
                                    <span className="text-lg font-black text-zinc-900 block mt-0.5">
                                        {pace.callsDone}
                                        <span className="text-xs font-semibold text-zinc-400"> / {pace.dayQuota}</span>
                                    </span>
                                </div>
                                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                                    <span className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wider">Attendu</span>
                                    <span className="text-lg font-black text-zinc-900 block mt-0.5">
                                        {pace.expected}
                                    </span>
                                </div>
                                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                                    <span className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wider">Écart</span>
                                    <span className={cn(
                                        "text-lg font-black block mt-0.5",
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
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all duration-700",
                                            pace.status === "ON_TRACK" ? "bg-emerald-500" : pace.status === "BEHIND" ? "bg-amber-500" : "bg-rose-500"
                                        )}
                                        style={{ width: `${dailyProgressPct}%` }}
                                    />
                                </div>
                                <p className="text-[11px] text-zinc-500 font-medium">
                                    {formatHours(pace.effectiveHoursElapsed)} d'appel effectif sur {formatHours(pace.effectiveHoursTarget)} prévues.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* SDR COPILOT & BATTLECARDS */}
                    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden space-y-4 p-6">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-xs">
                                    <Sparkles className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-zinc-900 tracking-tight">
                                        Aide Commerciale & Battlecards
                                    </h3>
                                    <p className="text-[11px] text-zinc-500 font-medium">
                                        Parades en direct pour débloquer les objections.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Battlecard pills */}
                        <div className="flex flex-wrap gap-1.5">
                            {BATTLECARDS.map((card) => (
                                <button
                                    key={card.id}
                                    onClick={() => setActiveBattlecard(card.id)}
                                    className={cn(
                                        "text-xs px-3 py-1.5 rounded-xl font-bold transition-all border shadow-2xs",
                                        activeBattlecard === card.id
                                            ? "bg-zinc-950 text-white border-zinc-950"
                                            : "bg-slate-50 text-zinc-700 border-slate-200 hover:bg-slate-100"
                                    )}
                                >
                                    {card.title}
                                </button>
                            ))}
                        </div>

                        {/* Battlecard Box */}
                        {(() => {
                            const card = BATTLECARDS.find(c => c.id === activeBattlecard) || BATTLECARDS[0];
                            return (
                                <div className="rounded-2xl p-4 bg-slate-50 border border-slate-200 space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-extrabold text-zinc-900">{card.title}</span>
                                        <span className={cn("text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full border", card.color)}>
                                            {card.badge}
                                        </span>
                                    </div>

                                    <div className="relative bg-white p-3 rounded-xl border border-slate-200 text-xs font-mono text-zinc-800 leading-relaxed whitespace-pre-line shadow-2xs">
                                        {card.prompt}
                                        <button
                                            onClick={() => copyScriptToClipboard(card.prompt)}
                                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-zinc-600 transition-colors"
                                            title="Copier le script"
                                        >
                                            {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>

                                    <p className="text-[11px] text-zinc-600 font-medium leading-relaxed">
                                        💡 <strong>Conseil :</strong> {card.tip}
                                    </p>
                                </div>
                            );
                        })()}

                        {/* Keyboard Shortcuts Helper */}
                        <div className="pt-2 border-t border-slate-100">
                            <button
                                onClick={() => setShowShortcuts(!showShortcuts)}
                                className="w-full flex items-center justify-between text-xs text-zinc-700 hover:text-zinc-950 font-bold py-1"
                            >
                                <span className="flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-amber-500 fill-current" />
                                    Raccourcis clavier (1 clic pour qualifier)
                                </span>
                                <ChevronDown className={cn("w-4 h-4 transition-transform text-zinc-400", showShortcuts && "rotate-180")} />
                            </button>

                            {showShortcuts && (
                                <div className="mt-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                                    <div className="grid grid-cols-2 gap-2 text-zinc-700 font-medium">
                                        <div className="flex items-center gap-2">
                                            <kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded-md text-[11px] font-bold shadow-2xs">1</kbd>
                                            <span>Pas de réponse</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded-md text-[11px] font-bold shadow-2xs">2</kbd>
                                            <span>Rappel planifié</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded-md text-[11px] font-bold shadow-2xs">3</kbd>
                                            <span>Barrage standard</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded-md text-[11px] font-bold shadow-2xs">4</kbd>
                                            <span>RDV Décroché</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded-md text-[11px] font-bold shadow-2xs">5</kbd>
                                            <span>Refus / Hors cible</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <kbd className="px-2 py-0.5 bg-zinc-950 text-white border border-zinc-950 rounded-md text-[11px] font-bold shadow-2xs">Entrée</kbd>
                                            <span>Suivant</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* ============================================ */}
            {/* 4. MODALS & POP-UPS                          */}
            {/* ============================================ */}

            {/* Coming Soon Pop-up for Company Action */}
            <CompanyComingSoonModal
                isOpen={companyModalOpen}
                onClose={() => setCompanyModalOpen(false)}
            />

            {/* Contact Drawer (for contact details) */}
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
        </div>
    );
}
