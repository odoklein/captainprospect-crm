"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast, Badge } from "@/components/ui";
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
    FileText,
    ShieldCheck,
    ShieldAlert,
    Mic,
    ChevronDown,
    ChevronUp,
    Clock,
    CalendarDays,
} from "lucide-react";
import Link from "next/link";
import { ClientOnboardingModal } from "@/components/manager/ClientOnboardingModal";
import { ClientDrawer } from "@/components/drawers";
import { OnboardingReadinessGauge } from "@/components/common/OnboardingReadinessGauge";
import { CLIENTS_QUERY_KEY, LEEXI_RECAPS_QUERY_KEY } from "@/lib/query-keys";

// ============================================
// TYPES
// ============================================

interface OnboardingReadiness {
    calendarConnected: boolean;
    personaSet: boolean;
    missionCreated: boolean;
}

interface ClientMission {
    id: string;
    name: string;
    endDate: string;
    isActive: boolean;
    status: string;
}

interface Client {
    id: string;
    name: string;
    industry?: string;
    email?: string;
    phone?: string;
    createdAt: string;
    missions: ClientMission[];
    _count: {
        missions: number;
        users: number;
    };
    readiness?: OnboardingReadiness;
    insights?: {
        production?: {
            firstCallAt: string | null;
            plannedMonthDays: number | null;
            plannedWeekDays: number | null;
            workedCallDays: number;
            executedDays: number;
            totalWorkedCallDays: number;
            totalCalls: number;
            totalMeetings: number;
        } | null;
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
// FETCHERS
// ============================================

async function fetchClientsApi(): Promise<Client[]> {
    const res = await fetch("/api/clients");
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Impossible de charger les clients");
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
// CLIENTS PAGE
// ============================================

export default function ClientsPage() {
    const queryClient = useQueryClient();
    const { error: showError } = useToast();
    const [searchQuery, setSearchQuery] = useState("");

    // Onboarding modal
    const [showOnboardingModal, setShowOnboardingModal] = useState(false);
    const [initialRecapText, setInitialRecapText] = useState<string | undefined>(undefined);

    // Drawer state
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [showDrawer, setShowDrawer] = useState(false);

    // Leexi UI state
    const [showLeexiSection, setShowLeexiSection] = useState(true);
    const [expandedRecapId, setExpandedRecapId] = useState<string | null>(null);

    // React Query: clients list
    const {
        data: clients = [],
        isLoading,
        isFetching,
        refetch: refetchClients,
        error: clientsError,
    } = useQuery({
        queryKey: CLIENTS_QUERY_KEY,
        queryFn: fetchClientsApi,
    });

    // React Query: Leexi recaps (non-blocking, don't throw to UI)
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

    // ============================================
    // FILTER CLIENTS
    // ============================================

    const filteredClients = clients.filter(client =>
        client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.industry?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // ============================================
    // STATS
    // ============================================

    const totalClients = clients.length;
    const totalMissions = clients.reduce((acc, c) => acc + c._count.missions, 0);
    const totalUsers = clients.reduce((acc, c) => acc + c._count.users, 0);

    const getClientRecapCount = (clientId: string) => {
        if (!leexiData) return 0;
        const group = leexiData.matched.find((m) => m.clientId === clientId);
        return group?.recaps.length || 0;
    };

    // ============================================
    // HANDLE ONBOARDING SUCCESS
    // ============================================

    const handleOnboardingSuccess = () => {
        queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: LEEXI_RECAPS_QUERY_KEY });
    };

    const handleCreateFromRecap = (recapTextContent: string) => {
        setInitialRecapText(recapTextContent);
        setShowOnboardingModal(true);
    };

    const handleClientClick = (client: Client) => {
        setSelectedClient(client);
        setShowDrawer(true);
    };

    const handleClientUpdate = (updatedClient: Client) => {
        queryClient.setQueryData<Client[]>(CLIENTS_QUERY_KEY, (prev) =>
            prev ? prev.map((c) => (c.id === updatedClient.id ? { ...c, ...updatedClient } : c)) : prev
        );
        setSelectedClient((prev) => (prev ? { ...prev, ...updatedClient } : null));
    };

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

    if (isLoading && clients.length === 0) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    <p className="text-sm text-slate-500">Chargement des clients...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Premium Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Gérez votre portefeuille de clients et leurs activités
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => refetchClients()}
                        className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 text-slate-500 ${isFetching ? "animate-spin" : ""}`} />
                    </button>
                    <Link
                        href="/manager/playbook/import"
                        className="flex items-center gap-2 h-10 px-5 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        <FileText className="w-4 h-4" />
                        Importer un playbook
                    </Link>
                    <button
                        onClick={() => setShowOnboardingModal(true)}
                        className="mgr-btn-primary flex items-center gap-2 h-10 px-5 text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Nouveau client
                    </button>
                </div>
            </div>

            {/* Premium Stats */}
            <div className="grid grid-cols-3 gap-5">
                <div className="mgr-stat-card bg-gradient-to-br from-indigo-50 to-white">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center">
                            <Building2 className="w-7 h-7 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-slate-900">{totalClients}</p>
                            <p className="text-sm font-medium text-slate-500">Clients totaux</p>
                        </div>
                    </div>
                </div>
                <div className="mgr-stat-card bg-gradient-to-br from-emerald-50 to-white">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                            <Target className="w-7 h-7 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-slate-900">{totalMissions}</p>
                            <p className="text-sm font-medium text-slate-500">Missions totales</p>
                        </div>
                    </div>
                </div>
                <div className="mgr-stat-card bg-gradient-to-br from-amber-50 to-white">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
                            <Users className="w-7 h-7 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-slate-900">{totalUsers}</p>
                            <p className="text-sm font-medium text-slate-500">Utilisateurs connectés</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Premium Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Rechercher par nom, secteur..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="mgr-search-input w-full h-12 pl-12 pr-4 text-sm text-slate-900"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full transition-colors"
                    >
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                )}
            </div>

            {/* Leexi Recaps Section */}
            {leexiData && leexiData.totalRecaps > 0 && (
                <div className="bg-white border border-violet-200 rounded-2xl overflow-hidden">
                    <button
                        onClick={() => setShowLeexiSection(!showLeexiSection)}
                        className="w-full flex items-center justify-between px-6 py-4 hover:bg-violet-50/50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
                                <Mic className="w-5 h-5 text-violet-600" />
                            </div>
                            <div className="text-left">
                                <h3 className="text-sm font-semibold text-slate-900">
                                    Récapitulatifs Leexi
                                </h3>
                                <p className="text-xs text-slate-500">
                                    {leexiData.totalMatched} associé{leexiData.totalMatched > 1 ? "s" : ""} · {leexiData.unmatched.length} non associé{leexiData.unmatched.length > 1 ? "s" : ""}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 text-xs">
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
                        <div className="border-t border-violet-100 px-6 py-4 space-y-3 max-h-80 overflow-y-auto">
                            {leexiData.matched.map((group) => (
                                <div key={group.clientId} className="space-y-2">
                                    {group.recaps.map((recap) => (
                                        <div
                                            key={recap.id}
                                            className="p-3 bg-violet-50/50 border border-violet-100 rounded-xl"
                                        >
                                            <div
                                                className="flex items-center justify-between cursor-pointer"
                                                onClick={() => setExpandedRecapId(expandedRecapId === recap.id ? null : recap.id)}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Mic className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                                                    <span className="text-sm font-medium text-slate-900 truncate">
                                                        {recap.title}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] bg-white border-violet-200 text-violet-600 flex-shrink-0">
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
                                                <p className="mt-2 text-xs text-slate-600 whitespace-pre-line border-t border-violet-100 pt-2">
                                                    {recap.recapText.slice(0, 800)}
                                                    {recap.recapText.length > 800 && "..."}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ))}

                            {leexiData.unmatched.length > 0 && (
                                <div className="pt-2 border-t border-violet-100">
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
                                                    <span className="text-sm font-medium text-slate-700 truncate">
                                                        {recap.title}
                                                    </span>
                                                    {recap.companyName && (
                                                        <span className="text-[10px] text-slate-400">
                                                            ({recap.companyName})
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCreateFromRecap(recap.recapText);
                                                        }}
                                                        className="text-[10px] font-medium px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors"
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
                                                        className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
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

            {isLoadingLeexi && !leexiData && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement des récapitulatifs Leexi...
                </div>
            )}

            {leexiError && (
                <div className="text-xs text-red-500 flex items-center gap-1">
                    Leexi: {leexiError}
                </div>
            )}

            {/* Clients Grid */}
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
                        const production = client.insights?.production;

                        return (
                            <div
                                key={client.id}
                                onClick={() => handleClientClick(client)}
                                className="group bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-100/50 transition-all duration-300 cursor-pointer flex flex-col relative overflow-hidden"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <div className="absolute top-0 left-0 w-1 bg-indigo-500 h-0 group-hover:h-full transition-all duration-300"></div>

                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 flex items-center justify-center border border-indigo-100/50 flex-shrink-0 group-hover:scale-105 transition-transform">
                                            <Building2 className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
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
                                        <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mt-0.5 flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-emerald-500" /> Missions</span>
                                    </div>
                                    <div className="flex flex-col border-l border-slate-200/60 pl-3">
                                        <span className="text-2xl font-bold text-slate-800">{client._count.users}</span>
                                        <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mt-0.5 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-amber-500" /> Interlocuteurs</span>
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
                                                    <Mic className="w-3.5 h-3.5 text-violet-500" /> Récaps Leexi
                                                </span>
                                                <span className="text-[11px] font-medium text-violet-600 bg-violet-50 px-2.5 py-0.5 rounded-full border border-violet-100">
                                                    {recapCount}
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-violet-400 to-indigo-500 rounded-full"
                                                    style={{ width: `${recapPercent}%`, transition: "width 1s ease-in-out" }}
                                                />
                                            </div>
                                        </div>
                                )}
                                    </div>
                                )}

                                <div className="mt-auto pt-4 border-t border-slate-100 space-y-1.5">
                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Jours travaillÃ©s</span>
                                            <div className="mt-1 flex items-baseline gap-1.5">
                                                <span className="text-lg font-bold text-slate-900">{production?.workedCallDays ?? 0}</span>
                                                <span className="text-[11px] text-slate-500">/ {production?.plannedMonthDays ?? "â€”"}</span>
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Appels / RDV</span>
                                            <div className="mt-1 flex items-baseline gap-1.5">
                                                <span className="text-lg font-bold text-slate-900">{production?.totalCalls ?? 0}</span>
                                                <span className="text-[11px] text-slate-500">/ {production?.totalMeetings ?? 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600">
                                        <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span>
                                            Premier appel :{" "}
                                            {production?.firstCallAt
                                                ? new Date(production.firstCallAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
                                                : "Aucun appel"}
                                        </span>
                                    </div>
                                    {(() => {
                                        const activeMission = client.missions?.find((m) => m.isActive && m.status === "ACTIVE");
                                        const latestMission = client.missions?.[0];
                                        const displayMission = activeMission ?? latestMission;
                                        if (!displayMission) return null;
                                        const ended = !displayMission.isActive || displayMission.status !== "ACTIVE";
                                        const endDate = new Date(displayMission.endDate);
                                        return (
                                            <div className={`flex items-center gap-1.5 text-xs font-medium ${ended ? "text-red-400" : "text-emerald-600"}`}>
                                                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                                                <span>
                                                    {ended ? "Mission terminée le " : "Fin de mission : "}
                                                    {endDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                                                </span>
                                            </div>
                                        );
                                    })()}
                                    <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                                        <span className="flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5" /> Créé le {new Date(client.createdAt).toLocaleDateString("fr-FR")}
                                        </span>
                                        <span className="text-indigo-600 font-semibold opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all flex items-center gap-1">
                                            Gérer <ArrowRight className="w-3.5 h-3.5" />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Client Drawer */}
            <ClientDrawer
                isOpen={showDrawer}
                onClose={() => setShowDrawer(false)}
                client={selectedClient}
                onUpdate={handleClientUpdate}
                onDelete={() => {
                    setSelectedClient(null);
                    setShowDrawer(false);
                    queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
                    queryClient.invalidateQueries({ queryKey: LEEXI_RECAPS_QUERY_KEY });
                }}
            />

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
