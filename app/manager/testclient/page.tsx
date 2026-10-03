"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast, Badge, Tabs } from "@/components/ui";
import {
    Search,
    Plus,
    Building2,
    Target,
    Users,
    RefreshCw,
    Loader2,
    Mail,
    Phone,
    ArrowRight,
    X,
    Mic,
    ChevronDown,
    ChevronUp,
    Clock,
    Linkedin,
    Activity,
    TrendingUp,
    BarChart3,
    Calendar,
    ListChecks,
    ArrowUpRight,
    ChevronLeft,
    ChevronRight,
    FileText,
} from "lucide-react";
import Link from "next/link";
import { ClientOnboardingModal } from "@/components/manager/ClientOnboardingModal";
import { OnboardingReadinessGauge } from "@/components/common/OnboardingReadinessGauge";
import { CLIENTS_QUERY_KEY, LEEXI_RECAPS_QUERY_KEY } from "@/lib/query-keys";
import { MISSION_STATUS_CONFIG } from "@/lib/constants/missionStatus";
import type { MissionStatusValue } from "@/lib/constants/missionStatus";

// ============================================
// TYPES
// ============================================

interface OnboardingReadiness {
    calendarConnected: boolean;
    personaSet: boolean;
    missionCreated: boolean;
}

interface Client {
    id: string;
    name: string;
    industry?: string;
    email?: string;
    phone?: string;
    createdAt: string;
    _count: {
        missions: number;
        users: number;
    };
    readiness?: OnboardingReadiness;
}

interface Mission {
    id: string;
    name: string;
    objective?: string;
    channel: "CALL" | "EMAIL" | "LINKEDIN";
    channels?: ("CALL" | "EMAIL" | "LINKEDIN")[];
    status: MissionStatusValue;
    isActive?: boolean;
    startDate?: string;
    endDate?: string;
    clientId?: string;
    client?: {
        id: string;
        name: string;
    };
    sdrAssignments?: Array<{
        sdr: {
            id: string;
            name: string;
        };
    }>;
    _count: {
        sdrAssignments: number;
        campaigns: number;
        lists: number;
    };
    stats?: {
        totalActions: number;
        meetingsBooked: number;
        opportunities: number;
    };
}

interface LeexiRecapItem {
    id: string;
    title: string;
    date: string;
    duration: number;
    recapText: string;
    companyName: string;
}

interface LeexiMatchedGroup {
    clientId: string;
    clientName: string;
    recaps: LeexiRecapItem[];
}

interface LeexiRecapsData {
    matched: LeexiMatchedGroup[];
    unmatched: LeexiRecapItem[];
    totalRecaps: number;
    totalMatched: number;
}

// ============================================
// CHANNEL CONFIG
// ============================================

const CHANNEL_CONFIG = {
    CALL: {
        icon: Phone,
        label: "Appel",
        className: "mgr-channel-call",
        color: "bg-blue-600",
        bgLight: "bg-blue-50",
        textColor: "text-blue-600",
    },
    EMAIL: {
        icon: Mail,
        label: "Email",
        className: "mgr-channel-email",
        color: "bg-accent-600",
        bgLight: "bg-accent-50",
        textColor: "text-accent-600",
    },
    LINKEDIN: {
        icon: Linkedin,
        label: "LinkedIn",
        className: "mgr-channel-linkedin",
        color: "bg-sky-600",
        bgLight: "bg-sky-50",
        textColor: "text-sky-600",
    },
};

// ============================================
// FETCHERS
// ============================================

async function fetchClientsApi(): Promise<Client[]> {
    const res = await fetch("/api/clients");
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Impossible de charger les clients");
    return json.data;
}

async function fetchMissionsApi(clientId?: string): Promise<Mission[]> {
    const params = new URLSearchParams();
    if (clientId) params.set("clientId", clientId);
    params.set("limit", "1000");
    const res = await fetch(`/api/missions?${params.toString()}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Impossible de charger les missions");
    return json.data;
}

async function fetchLeexiRecapsApi(): Promise<LeexiRecapsData | null> {
    const res = await fetch("/api/leexi/recaps");
    const json = await res.json();
    if (json.success) return json.data;
    if (res.status !== 503) throw new Error(json.error || "Erreur Leexi");
    return null;
}

// ============================================
// HELPER
// ============================================

function getDaysActive(startDate?: string): number | null {
    if (!startDate) return null;
    const diff = Date.now() - new Date(startDate).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// ============================================
// UNIFIED DASHBOARD PAGE
// ============================================

export default function UnifiedDashboardPage() {
    const queryClient = useQueryClient();
    const { error: showError } = useToast();

    // ─── UI STATE ───
    const [activeView, setActiveView] = useState<"clients" | "missions">("clients");
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [showOnboardingModal, setShowOnboardingModal] = useState(false);
    const [initialRecapText, setInitialRecapText] = useState<string | undefined>(undefined);
    const [showLeexiSection, setShowLeexiSection] = useState(true);
    const [expandedRecapId, setExpandedRecapId] = useState<string | null>(null);
    const [missionStatusFilter, setMissionStatusFilter] = useState<string>("all");

    // ─── DATA QUERIES ───
    const {
        data: clients = [],
        isLoading: isLoadingClients,
        isFetching: isFetchingClients,
        refetch: refetchClients,
        error: clientsError,
    } = useQuery({
        queryKey: CLIENTS_QUERY_KEY,
        queryFn: fetchClientsApi,
    });

    const {
        data: missions = [],
        isLoading: isLoadingMissions,
        isFetching: isFetchingMissions,
        refetch: refetchMissions,
        error: missionsError,
    } = useQuery({
        queryKey: ["missions", selectedClientId],
        queryFn: () => fetchMissionsApi(selectedClientId ?? undefined),
    });

    const {
        data: leexiData,
        isLoading: isLoadingLeexi,
        refetch: refetchLeexi,
        error: leexiErrorQuery,
    } = useQuery({
        queryKey: LEEXI_RECAPS_QUERY_KEY,
        queryFn: fetchLeexiRecapsApi,
        retry: false,
        staleTime: 2 * 60 * 1000,
    });
    const leexiError = leexiErrorQuery ? (leexiErrorQuery as Error).message : null;

    // ─── FILTER LOGIC ───
    const filteredClients = clients.filter(client =>
        client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.industry?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredMissions = missions.filter(mission => {
        const matchesSearch = mission.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            mission.client?.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = missionStatusFilter === "all" || mission.status === missionStatusFilter;
        return matchesSearch && matchesStatus;
    });

    // ─── STATS ───
    const totalClients = clients.length;
    const totalMissions = missions.length;
    const totalUsers = clients.reduce((acc, c) => acc + c._count.users, 0);
    const activeMissions = missions.filter(m => m.status === "ACTIVE").length;

    const getClientRecapCount = (clientId: string) => {
        if (!leexiData) return 0;
        const group = leexiData.matched.find((m) => m.clientId === clientId);
        return group?.recaps.length || 0;
    };

    // ─── HANDLERS ───
    const handleOnboardingSuccess = () => {
        queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: LEEXI_RECAPS_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: ["missions"] });
    };

    const handleCreateFromRecap = (recapTextContent: string) => {
        setInitialRecapText(recapTextContent);
        setShowOnboardingModal(true);
    };

    const handleClientSelect = (clientId: string) => {
        setSelectedClientId(clientId);
        setActiveView("missions");
        setSearchQuery("");
    };

    const handleBackToClients = () => {
        setSelectedClientId(null);
        setActiveView("clients");
        setSearchQuery("");
    };

    // ─── SELECTED CLIENT ───
    const selectedClient = selectedClientId ? clients.find(c => c.id === selectedClientId) : null;

    // ─── ERROR HANDLING ───
    if (clientsError) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <p className="text-sm text-red-600">{(clientsError as Error).message}</p>
                <button
                    onClick={() => refetchClients()}
                    className="mgr-btn-primary flex items-center gap-2"
                >
                    <RefreshCw className="w-4 h-4" />
                    Réessayer
                </button>
            </div>
        );
    }

    // ─── LOADING STATE ───
    if (isLoadingClients && clients.length === 0) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                    <p className="text-sm text-slate-500">Chargement...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ═══════════════════════════════════════════════════════════ */}
            {/* HERO HEADER — UNIFIED STATS */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-7 text-white">

                <div className="relative z-10">
                    <div className="flex items-start justify-between gap-4 mb-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center border border-white/10">
                                    <Building2 className="w-4 h-4 text-primary-300" />
                                </div>
                                <span className="text-xs font-medium text-primary-300 uppercase tracking-widest">
                                    Centre de pilotage
                                </span>
                            </div>
                            <h1 className="text-3xl font-bold tracking-tight">Clients & Missions</h1>
                            <p className="text-sm text-slate-400 mt-1">
                                {activeView === "clients" 
                                    ? "Portefeuille clients et leurs missions"
                                    : selectedClient 
                                        ? `Missions de ${selectedClient.name}`
                                        : "Toutes les missions actives"}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {activeView === "missions" && selectedClientId && (
                                <button
                                    onClick={handleBackToClients}
                                    className="flex items-center gap-2 h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 transition-all text-sm font-medium"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Retour clients
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    if (activeView === "clients") refetchClients();
                                    else refetchMissions();
                                }}
                                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 transition-all"
                            >
                                <RefreshCw className={`w-4 h-4 text-white/70 ${(activeView === "clients" ? isFetchingClients : isFetchingMissions) ? "animate-spin" : ""}`} />
                            </button>
                            {activeView === "clients" ? (
                                <>
                                    <Link
                                        href="/manager/playbook/import"
                                        className="flex items-center gap-2 h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 transition-all text-sm font-medium"
                                    >
                                        <FileText className="w-4 h-4" />
                                        Importer playbook
                                    </Link>
                                    <button
                                        onClick={() => setShowOnboardingModal(true)}
                                        className="flex items-center gap-2 h-10 px-5 rounded-xl bg-white text-slate-900 text-sm font-semibold hover:bg-primary-50 transition-all shadow-sm"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Nouveau client
                                    </button>
                                </>
                            ) : (
                                <Link
                                    href="/manager/missions/new"
                                    className="flex items-center gap-2 h-10 px-5 rounded-xl bg-white text-slate-900 text-sm font-semibold hover:bg-primary-50 transition-all shadow-sm"
                                >
                                    <Plus className="w-4 h-4" />
                                    Nouvelle mission
                                </Link>
                            )}
                        </div>
                    </div>

                    {/* UNIFIED STATS */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="flex items-center gap-3 bg-white/8 rounded-xl px-4 py-3 border border-white/10">
                            <div className="w-9 h-9 rounded-lg bg-primary-500/30 flex items-center justify-center shrink-0">
                                <Building2 className="w-4 h-4 text-primary-300" />
                            </div>
                            <div>
                                <p className="text-xl font-bold leading-tight">{totalClients}</p>
                                <p className="text-xs text-slate-400">Clients</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-white/8 rounded-xl px-4 py-3 border border-white/10">
                            <div className="w-9 h-9 rounded-lg bg-emerald-500/30 flex items-center justify-center shrink-0">
                                <Target className="w-4 h-4 text-emerald-300" />
                            </div>
                            <div>
                                <p className="text-xl font-bold leading-tight text-emerald-300">{totalMissions}</p>
                                <p className="text-xs text-slate-400">Missions</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-white/8 rounded-xl px-4 py-3 border border-white/10">
                            <div className="w-9 h-9 rounded-lg bg-amber-500/30 flex items-center justify-center shrink-0">
                                <Activity className="w-4 h-4 text-amber-300" />
                            </div>
                            <div>
                                <p className="text-xl font-bold leading-tight text-amber-300">{activeMissions}</p>
                                <p className="text-xs text-slate-400">Actives</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-white/8 rounded-xl px-4 py-3 border border-white/10">
                            <div className="w-9 h-9 rounded-lg bg-accent-500/30 flex items-center justify-center shrink-0">
                                <Users className="w-4 h-4 text-accent-300" />
                            </div>
                            <div>
                                <p className="text-xl font-bold leading-tight text-accent-300">{totalUsers}</p>
                                <p className="text-xs text-slate-400">Utilisateurs</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* SEARCH & FILTERS */}
            {/* ═══════════════════════════════════════════════════════════ */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center gap-3 shadow-sm">
                <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder={activeView === "clients" ? "Rechercher un client..." : "Rechercher une mission..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-10 pl-10 pr-9 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 placeholder:text-slate-400 transition-all"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-200 transition-colors">
                            <X className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                    )}
                </div>

                <div className="w-px h-8 bg-slate-200 hidden sm:block" />

                {/* View toggle */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                    <button
                        onClick={() => {
                            setActiveView("clients");
                            setSelectedClientId(null);
                            setSearchQuery("");
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeView === "clients"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                            }`}
                    >
                        <Building2 className="w-3 h-3 inline mr-1" />
                        Clients
                    </button>
                    <button
                        onClick={() => {
                            setActiveView("missions");
                            setSearchQuery("");
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeView === "missions"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                            }`}
                    >
                        <Target className="w-3 h-3 inline mr-1" />
                        Missions
                    </button>
                </div>

                {/* Mission status filter */}
                {activeView === "missions" && (
                    <>
                        <div className="w-px h-8 bg-slate-200 hidden sm:block" />
                        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                            {["all", "ACTIVE", "PAUSED", "COMPLETED"].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setMissionStatusFilter(status)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${missionStatusFilter === status
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                        }`}
                                >
                                    {status === "all" ? "Tous" : MISSION_STATUS_CONFIG[status as MissionStatusValue]?.label ?? status}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                <div className="text-xs text-slate-400 font-medium ml-auto hidden sm:block">
                    {activeView === "clients" 
                        ? `${filteredClients.length} / ${totalClients} client${totalClients !== 1 ? "s" : ""}`
                        : `${filteredMissions.length} / ${totalMissions} mission${totalMissions !== 1 ? "s" : ""}`
                    }
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* LEEXI SECTION (CLIENTS VIEW ONLY) */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {activeView === "clients" && leexiData && leexiData.totalRecaps > 0 && (
                <div className="bg-white border border-accent-200 rounded-2xl overflow-hidden">
                    <button
                        onClick={() => setShowLeexiSection(!showLeexiSection)}
                        className="w-full flex items-center justify-between px-6 py-4 hover:bg-accent-50/50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-accent-50 ring-1 ring-inset ring-accent-100 flex items-center justify-center">
                                <Mic className="w-5 h-5 text-accent-600" />
                            </div>
                            <div className="text-left">
                                <h3 className="text-sm font-semibold text-slate-900">Récapitulatifs Leexi</h3>
                                <p className="text-xs text-slate-500">
                                    {leexiData.totalMatched} associé{leexiData.totalMatched > 1 ? "s" : ""} · {leexiData.unmatched.length} non associé{leexiData.unmatched.length > 1 ? "s" : ""}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-accent-50 text-accent-700 border-accent-200 text-xs">
                                {leexiData.totalRecaps} recap{leexiData.totalRecaps > 1 ? "s" : ""}
                            </Badge>
                            {showLeexiSection ? (
                                <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                        </div>
                    </button>

                    {showLeexiSection && (
                        <div className="border-t border-accent-100 px-6 py-4 space-y-3 max-h-80 overflow-y-auto">
                            {leexiData.matched.map((group) => (
                                <div key={group.clientId} className="space-y-2">
                                    {group.recaps.map((recap) => (
                                        <div
                                            key={recap.id}
                                            className="p-3 bg-accent-50/50 border border-accent-100 rounded-xl"
                                        >
                                            <div
                                                className="flex items-center justify-between cursor-pointer"
                                                onClick={() => setExpandedRecapId(expandedRecapId === recap.id ? null : recap.id)}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Mic className="w-3.5 h-3.5 text-accent-500 flex-shrink-0" />
                                                    <span className="text-sm font-medium text-slate-900 truncate">{recap.title}</span>
                                                    <Badge variant="outline" className="text-[10px] bg-white border-accent-200 text-accent-600 flex-shrink-0">
                                                        {group.clientName}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(recap.date).toLocaleDateString("fr-FR")}
                                                    </span>
                                                    {expandedRecapId === recap.id ? (
                                                        <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                                    ) : (
                                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                                    )}
                                                </div>
                                            </div>
                                            {expandedRecapId === recap.id && (
                                                <p className="mt-2 text-xs text-slate-600 whitespace-pre-line border-t border-accent-100 pt-2">
                                                    {recap.recapText.slice(0, 800)}
                                                    {recap.recapText.length > 800 && "..."}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ))}

                            {leexiData.unmatched.length > 0 && (
                                <div className="pt-2 border-t border-accent-100">
                                    <p className="text-xs font-medium text-slate-500 mb-2">
                                        Non associés ({leexiData.unmatched.length})
                                    </p>
                                    {leexiData.unmatched.slice(0, 5).map((recap) => (
                                        <div
                                            key={recap.id}
                                            className="p-3 bg-slate-50 border border-slate-100 rounded-xl mb-2"
                                        >
                                            <div
                                                className="flex items-center justify-between cursor-pointer"
                                                onClick={() => setExpandedRecapId(expandedRecapId === recap.id ? null : recap.id)}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Mic className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                                    <span className="text-sm font-medium text-slate-700 truncate">{recap.title}</span>
                                                    {recap.companyName && (
                                                        <span className="text-[10px] text-slate-400">({recap.companyName})</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCreateFromRecap(recap.recapText);
                                                        }}
                                                        className="text-[10px] font-medium px-2 py-0.5 bg-primary-50 text-primary-600 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
                                                    >
                                                        Créer client
                                                    </button>
                                                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(recap.date).toLocaleDateString("fr-FR")}
                                                    </span>
                                                    {expandedRecapId === recap.id ? (
                                                        <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                                    ) : (
                                                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                                    )}
                                                </div>
                                            </div>
                                            {expandedRecapId === recap.id && (
                                                <div className="mt-2 border-t border-slate-100 pt-2 space-y-2">
                                                    <p className="text-xs text-slate-600 whitespace-pre-line">
                                                        {recap.recapText.slice(0, 800)}
                                                        {recap.recapText.length > 800 && "..."}
                                                    </p>
                                                    <button
                                                        onClick={() => handleCreateFromRecap(recap.recapText)}
                                                        className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                        Créer le client depuis cet appel
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* CLIENTS GRID */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {activeView === "clients" && (
                <>
                    {filteredClients.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                                <Building2 className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                {searchQuery ? "Aucun résultat trouvé" : "Aucun client"}
                            </h3>
                            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                                {searchQuery
                                    ? "Essayez de modifier vos termes de recherche."
                                    : "Commencez par ajouter votre premier client."}
                            </p>
                            {!searchQuery && (
                                <button
                                    onClick={() => setShowOnboardingModal(true)}
                                    className="mgr-btn-primary inline-flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Ajouter un client
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
                            {filteredClients.map((client, index) => {
                                const recapCount = getClientRecapCount(client.id);
                                const hasPortal = client._count.users > 0;
                                const recapPercent = Math.min(100, recapCount * 10);

                                return (
                                    <div
                                        key={client.id}
                                        onClick={() => handleClientSelect(client.id)}
                                        className="group bg-white rounded-2xl border border-slate-200 p-5 hover:border-primary-300 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col relative overflow-hidden"
                                        style={{ animationDelay: `${index * 50}ms` }}
                                    >
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center border border-primary-100/50 flex-shrink-0">
                                                    <Building2 className="w-5 h-5 text-primary-600" />
                                                </div>
                                                <div>
                                                    <h3 className="text-base font-semibold text-slate-900 group-hover:text-primary-600 transition-colors">
                                                        {client.name}
                                                    </h3>
                                                    <p className="text-xs text-slate-500 font-medium">
                                                        {client.industry || "Secteur non spécifié"}
                                                    </p>
                                                </div>
                                            </div>
                                            {hasPortal ? (
                                                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-none px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                                                    Portail
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-slate-400 border-slate-200 text-[10px] font-medium px-2.5 py-0.5 tracking-wide uppercase">
                                                    Sans accès
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 mb-5 p-3 rounded-xl bg-slate-50/80 border border-slate-100/50">
                                            <div className="flex flex-col">
                                                <span className="text-2xl font-bold text-slate-800">{client._count.missions}</span>
                                                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mt-0.5 flex items-center gap-1.5">
                                                    <Target className="w-3.5 h-3.5 text-emerald-500" /> Missions
                                                </span>
                                            </div>
                                            <div className="flex flex-col border-l border-slate-200/60 pl-3">
                                                <span className="text-2xl font-bold text-slate-800">{client._count.users}</span>
                                                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mt-0.5 flex items-center gap-1.5">
                                                    <Users className="w-3.5 h-3.5 text-amber-500" /> Interlocuteurs
                                                </span>
                                            </div>
                                        </div>

                                        {(client.readiness || recapCount > 0) && (
                                            <div className="mb-5 space-y-4">
                                                {client.readiness && (
                                                    <OnboardingReadinessGauge
                                                        readiness={client.readiness}
                                                        size="md"
                                                        showLabels={true}
                                                    />
                                                )}
                                                {recapCount > 0 && (
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                                                <Mic className="w-3.5 h-3.5 text-accent-500" /> Récaps Leexi
                                                            </span>
                                                            <span className="text-[11px] font-medium text-accent-600 bg-accent-50 px-2.5 py-0.5 rounded-full border border-accent-100">
                                                                {recapCount}
                                                            </span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-accent-500 rounded-full"
                                                                style={{ width: `${recapPercent}%`, transition: "width 1s ease-in-out" }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-medium">
                                            <span className="flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5" /> Créé le {new Date(client.createdAt).toLocaleDateString("fr-FR")}
                                            </span>
                                            <span className="text-primary-600 font-semibold opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all flex items-center gap-1">
                                                Voir missions <ArrowRight className="w-3.5 h-3.5" />
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* MISSIONS GRID */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {activeView === "missions" && (
                <>
                    {isLoadingMissions ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                        </div>
                    ) : filteredMissions.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 border-dashed">
                            <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center mx-auto mb-5 border border-slate-200">
                                <Target className="w-9 h-9 text-slate-300" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-1">
                                {searchQuery ? "Aucune mission trouvée" : selectedClient ? `Aucune mission pour ${selectedClient.name}` : "Aucune mission créée"}
                            </h3>
                            <p className="text-sm text-slate-500 mb-6">
                                {searchQuery
                                    ? "Modifiez vos filtres pour voir plus de résultats"
                                    : "Créez votre première mission pour commencer"}
                            </p>
                            {!searchQuery && (
                                <Link href="/manager/missions/new" className="mgr-btn-primary inline-flex items-center gap-2">
                                    <Plus className="w-4 h-4" />
                                    Créer une mission
                                </Link>
                            )}
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {filteredMissions.map((mission, index) => {
                                const channelsList = mission.channels?.length ? mission.channels : [mission.channel];
                                const channel = CHANNEL_CONFIG[mission.channel];
                                const ChannelIcon = channel.icon;
                                const daysActive = getDaysActive(mission.startDate);
                                const memberCount = mission._count.sdrAssignments;
                                const listCount = mission._count.lists;
                                const campaignCount = mission._count.campaigns;

                                return (
                                    <Link
                                        key={mission.id}
                                        href={`/manager/missions/${mission.id}`}
                                        className="group relative bg-white border border-slate-200 rounded-2xl overflow-hidden cursor-pointer hover:border-primary-300 hover:shadow-md transition-all duration-200"
                                        style={{ animationDelay: `${index * 40}ms` }}
                                    >
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl transition-all duration-300 ${mission.status === "ACTIVE" ? "bg-emerald-500" : mission.status === "PAUSED" ? "bg-amber-400" : "bg-slate-300"}`} />

                                        <div className="flex items-center gap-5 px-6 py-5 pl-7">
                                            <div className={`relative w-14 h-14 rounded-2xl ${channel.color} flex items-center justify-center text-xl font-bold text-white flex-shrink-0`}>
                                                {mission.client?.name?.[0] || "M"}
                                                <div className={`absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full ${channel.bgLight} border-2 border-white flex items-center justify-center shadow-sm`}>
                                                    <ChannelIcon className={`w-3 h-3 ${channel.textColor}`} />
                                                </div>
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                                                    <h3 className="font-bold text-slate-900 group-hover:text-primary-700 transition-colors text-base truncate">
                                                        {mission.name}
                                                    </h3>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${mission.status === "ACTIVE"
                                                        ? "bg-emerald-100 text-emerald-700"
                                                        : mission.status === "PAUSED"
                                                            ? "bg-amber-100 text-amber-700"
                                                            : "bg-slate-100 text-slate-600"
                                                        }`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${mission.status === "ACTIVE" ? "bg-emerald-500" : mission.status === "PAUSED" ? "bg-amber-500" : "bg-slate-400"}`} />
                                                        {MISSION_STATUS_CONFIG[mission.status]?.label ?? mission.status}
                                                    </span>
                                                </div>

                                                <p className="text-sm text-slate-500 truncate mb-3">
                                                    {mission.client?.name}
                                                    {mission.objective && (
                                                        <span className="text-slate-400"> · {mission.objective}</span>
                                                    )}
                                                </p>

                                                <div className="flex items-center flex-wrap gap-x-5 gap-y-1">
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                        <Target className="w-3.5 h-3.5 text-slate-400" />
                                                        <span>{campaignCount} campagne{campaignCount !== 1 ? "s" : ""}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                        <ListChecks className="w-3.5 h-3.5 text-slate-400" />
                                                        <span>{listCount} liste{listCount !== 1 ? "s" : ""}</span>
                                                    </div>
                                                    {daysActive !== null && (
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                            <Activity className="w-3.5 h-3.5 text-slate-400" />
                                                            <span>{daysActive}j actif</span>
                                                        </div>
                                                    )}
                                                    {mission.startDate && (
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                            <span>
                                                                {new Date(mission.startDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                                                                {mission.endDate
                                                                    ? ` → ${new Date(mission.endDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}`
                                                                    : " → en cours"}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-5 flex-shrink-0">
                                                <div className="hidden md:flex flex-col items-end gap-1">
                                                    {mission.sdrAssignments && mission.sdrAssignments.length > 0 ? (
                                                        <>
                                                            <div className="flex -space-x-2">
                                                                {mission.sdrAssignments.slice(0, 4).map((a, i) => (
                                                                    <div
                                                                        key={a.sdr.id}
                                                                        className="w-7 h-7 rounded-full bg-primary-600 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white"
                                                                        style={{ zIndex: 10 - i }}
                                                                        title={a.sdr.name}
                                                                    >
                                                                        {a.sdr.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                                                                    </div>
                                                                ))}
                                                                {mission.sdrAssignments.length > 4 && (
                                                                    <div className="w-7 h-7 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-semibold text-slate-600 shadow-sm z-0">
                                                                        +{mission.sdrAssignments.length - 4}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                {memberCount} membre{memberCount !== 1 ? "s" : ""}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <div className="flex items-center gap-1 text-xs text-slate-300">
                                                            <Users className="w-3.5 h-3.5" />
                                                            <span className="italic">Aucun</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="hidden lg:flex items-center gap-1.5 flex-wrap">
                                                    {channelsList.length === 1 ? (
                                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${channel.bgLight} ${channel.textColor} border border-current/10`}>
                                                            <ChannelIcon className="w-3.5 h-3.5" />
                                                            {channel.label}
                                                        </div>
                                                    ) : (
                                                        channelsList.map((ch) => {
                                                            const cfg = CHANNEL_CONFIG[ch];
                                                            const Icon = cfg?.icon ?? ChannelIcon;
                                                            return (
                                                                <div key={ch} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold ${cfg?.bgLight ?? channel.bgLight} ${cfg?.textColor ?? channel.textColor} border border-current/10`}>
                                                                    <Icon className="w-3 h-3" />
                                                                    {cfg?.label ?? ch}
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>

                                                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-50 group-hover:bg-primary-600 border border-slate-100 group-hover:border-primary-600 transition-all duration-300 shadow-sm">
                                                    <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors duration-300" />
                                                </div>
                                            </div>
                                        </div>

                                        {mission.status === "ACTIVE" && (
                                            <div className="px-7 pb-3">
                                                <div className="h-0.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-primary-500 transition-all duration-700"
                                                        style={{ width: `${Math.min(100, ((listCount + campaignCount) / Math.max(1, listCount + campaignCount + 2)) * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* Client Onboarding Modal */}
            <ClientOnboardingModal
                isOpen={showOnboardingModal}
                onClose={() => {
                    setShowOnboardingModal(false);
                    setInitialRecapText(undefined);
                }}
                onSuccess={handleOnboardingSuccess}
                initialRecapText={initialRecapText}
            />
        </div>
    );
}
