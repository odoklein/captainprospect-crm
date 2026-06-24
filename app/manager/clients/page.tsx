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
    Pause,
    PlayCircle,
    Ban,
} from "lucide-react";
import Link from "next/link";
import { ClientOnboardingModal } from "@/components/manager/ClientOnboardingModal";
import { ClientDrawer } from "@/components/drawers";
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

type ClientStatus = "ACTIVE" | "PAUSED" | "STOPPED";

interface Client {
    id: string;
    name: string;
    industry?: string;
    email?: string;
    phone?: string;
    status: ClientStatus;
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

const STATUS_CONFIG: Record<
    ClientStatus,
    { label: string; badge: string; dot: string; surface: string; rule: string; muted: boolean; icon: typeof PlayCircle }
> = {
    ACTIVE: {
        label: "Actif",
        badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
        dot: "bg-emerald-500",
        surface: "bg-white",
        rule: "bg-emerald-400",
        muted: false,
        icon: PlayCircle,
    },
    PAUSED: {
        label: "En pause",
        badge: "bg-amber-50 text-amber-700 border-amber-200",
        dot: "bg-amber-500",
        surface: "bg-amber-50/30",
        rule: "bg-amber-400",
        muted: false,
        icon: Pause,
    },
    STOPPED: {
        label: "Arrêté",
        badge: "bg-slate-100 text-slate-600 border-slate-200",
        dot: "bg-slate-400",
        surface: "bg-slate-50",
        rule: "bg-slate-300",
        muted: true,
        icon: Ban,
    },
};

function getActiveMission(missions: ClientMission[] | undefined): ClientMission | null {
    if (!missions || missions.length === 0) return null;
    return missions.find((m) => m.isActive && m.status === "ACTIVE") ?? missions[0];
}

function daysUntil(dateStr: string): number {
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function StatTile({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
            <p className={`text-2xl font-semibold tabular-nums ${alert && value > 0 ? "text-amber-600" : "text-slate-900"}`}>
                {value}
            </p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">{label}</p>
        </div>
    );
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
    const [statusFilter, setStatusFilter] = useState<ClientStatus | "ALL">("ALL");

    // Onboarding modal
    const [showOnboardingModal, setShowOnboardingModal] = useState(false);
    const [initialRecapText, setInitialRecapText] = useState<string | undefined>(undefined);

    // Drawer state
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [showDrawer, setShowDrawer] = useState(false);

    // Leexi UI state
    const [showLeexiSection, setShowLeexiSection] = useState(true);
    const [expandedRecapId, setExpandedRecapId] = useState<string | null>(null);

    // Status quick-action menu
    const [statusMenuClientId, setStatusMenuClientId] = useState<string | null>(null);
    const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

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

    const filteredClients = clients.filter(client => {
        const matchesSearch =
            client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            client.industry?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === "ALL" || (client.status || "ACTIVE") === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const statusCounts = clients.reduce(
        (acc, c) => {
            const s = c.status || "ACTIVE";
            acc[s] = (acc[s] || 0) + 1;
            return acc;
        },
        { ACTIVE: 0, PAUSED: 0, STOPPED: 0 } as Record<ClientStatus, number>
    );

    // ============================================
    // STATS
    // ============================================

    const totalClients = clients.length;
    const totalRdv = clients.reduce((acc, c) => acc + (c.insights?.production?.totalMeetings ?? 0), 0);
    const endingSoon = clients.filter((c) => {
        const m = getActiveMission(c.missions);
        if (!m) return false;
        const ended = !m.isActive || m.status !== "ACTIVE";
        const d = daysUntil(m.endDate);
        return !ended && d >= 0 && d <= 30;
    }).length;

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

    const handleStatusChange = async (clientId: string, status: ClientStatus) => {
        setStatusMenuClientId(null);
        setUpdatingStatusId(clientId);
        try {
            const res = await fetch(`/api/clients/${clientId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Mise à jour impossible");
            queryClient.setQueryData<Client[]>(CLIENTS_QUERY_KEY, (prev) =>
                prev ? prev.map((c) => (c.id === clientId ? { ...c, status } : c)) : prev
            );
        } catch (e) {
            showError(e instanceof Error ? e.message : "Mise à jour impossible");
        } finally {
            setUpdatingStatusId(null);
        }
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

            {/* Stats — calm, mission-aware */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile label="Clients" value={totalClients} />
                <StatTile label="Actifs" value={statusCounts.ACTIVE} />
                <StatTile label="RDV générés" value={totalRdv} />
                <StatTile label="Mission · fin ≤ 30j" value={endingSoon} alert />
            </div>

            {/* Status filter tabs */}
            <div className="flex items-center gap-1.5 border-b border-slate-200">
                {([
                    { key: "ALL", label: "Tous", count: totalClients },
                    { key: "ACTIVE", label: STATUS_CONFIG.ACTIVE.label, count: statusCounts.ACTIVE },
                    { key: "PAUSED", label: STATUS_CONFIG.PAUSED.label, count: statusCounts.PAUSED },
                    { key: "STOPPED", label: STATUS_CONFIG.STOPPED.label, count: statusCounts.STOPPED },
                ] as const).map((tab) => {
                    const isActive = statusFilter === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setStatusFilter(tab.key)}
                            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 ${
                                isActive
                                    ? "text-indigo-600 border-indigo-600"
                                    : "text-slate-500 border-transparent hover:text-slate-700"
                            }`}
                        >
                            {tab.label}
                            <span
                                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                                    isActive ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"
                                }`}
                            >
                                {tab.count}
                            </span>
                        </button>
                    );
                })}
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
                        {searchQuery || statusFilter !== "ALL" ? "Aucun résultat trouvé" : "Aucun client"}
                    </h3>
                    <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                        {searchQuery
                            ? "Essayez de modifier vos termes de recherche."
                            : statusFilter !== "ALL"
                            ? `Aucun client avec le statut "${STATUS_CONFIG[statusFilter].label}".`
                            : "Commencez par ajouter votre premier client."}
                    </p>
                    {!searchQuery && statusFilter === "ALL" && (
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-500">
                    {filteredClients.map((client) => {
                        const recapCount = getClientRecapCount(client.id);
                        const hasPortal = client._count.users > 0;
                        const production = client.insights?.production;
                        const status = client.status || "ACTIVE";
                        const statusInfo = STATUS_CONFIG[status];
                        const isMenuOpen = statusMenuClientId === client.id;

                        // Mission — the heart of the card
                        const mission = getActiveMission(client.missions);
                        const missionEnded = mission ? !mission.isActive || mission.status !== "ACTIVE" : false;
                        const missionDays = mission ? daysUntil(mission.endDate) : null;
                        const worked = production?.workedCallDays ?? 0;
                        const planned = production?.plannedMonthDays ?? null;
                        const progressPct = planned && planned > 0 ? Math.min(100, Math.round((worked / planned) * 100)) : 0;

                        return (
                            <div
                                key={client.id}
                                onClick={() => handleClientClick(client)}
                                className={`group relative flex flex-col rounded-xl border border-slate-200 ${statusInfo.surface} ${statusInfo.muted ? "opacity-75 hover:opacity-100" : ""} hover:border-indigo-300 hover:shadow-sm transition-colors cursor-pointer overflow-hidden`}
                            >
                                {/* status rule */}
                                <div className={`absolute inset-y-0 left-0 w-0.5 ${statusInfo.rule}`} />

                                <div className="flex flex-col gap-3.5 p-4">
                                    {/* Header */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-slate-500">
                                                {client.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-[15px] font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                                                    {client.name}
                                                </h3>
                                                <p className="text-xs text-slate-500 truncate">
                                                    {client.industry || "Secteur non spécifié"}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Status pill — clickable */}
                                        <div className="relative flex-shrink-0">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setStatusMenuClientId(isMenuOpen ? null : client.id);
                                                }}
                                                disabled={updatingStatusId === client.id}
                                                className={`flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${statusInfo.badge} hover:brightness-95 disabled:opacity-50`}
                                            >
                                                <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                                                {statusInfo.label}
                                                {updatingStatusId === client.id ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <ChevronDown className="w-3 h-3 opacity-60" />
                                                )}
                                            </button>

                                            {isMenuOpen && (
                                                <>
                                                    <div
                                                        className="fixed inset-0 z-40"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setStatusMenuClientId(null);
                                                        }}
                                                    />
                                                    <div
                                                        className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {(Object.keys(STATUS_CONFIG) as ClientStatus[]).map((key) => {
                                                            const opt = STATUS_CONFIG[key];
                                                            const OptIcon = opt.icon;
                                                            return (
                                                                <button
                                                                    key={key}
                                                                    onClick={() => handleStatusChange(client.id, key)}
                                                                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-slate-50 transition-colors ${key === status ? "text-slate-900 bg-slate-50" : "text-slate-600"}`}
                                                                >
                                                                    <OptIcon className="w-3.5 h-3.5 text-slate-400" />
                                                                    {opt.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Mission — hero */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-baseline justify-between">
                                            <span className="text-xs text-slate-500">Jours travaillés · ce mois</span>
                                            <span className="text-sm font-semibold text-slate-900 tabular-nums">
                                                {worked}
                                                <span className="font-normal text-slate-400"> / {planned ?? "—"}</span>
                                            </span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${progressPct}%` }} />
                                        </div>
                                        {/* Mission end — color only when it matters */}
                                        {mission ? (
                                            <p
                                                className={`text-xs font-medium ${
                                                    missionEnded
                                                        ? "text-red-500"
                                                        : missionDays !== null && missionDays <= 30
                                                        ? "text-amber-600"
                                                        : "text-slate-500"
                                                }`}
                                            >
                                                {missionEnded
                                                    ? `Mission terminée le ${new Date(mission.endDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}`
                                                    : missionDays !== null && missionDays <= 30
                                                    ? `Mission · fin dans ${missionDays}j`
                                                    : `Mission · fin le ${new Date(mission.endDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-slate-400">Aucune mission</p>
                                        )}
                                    </div>

                                    {/* Secondary stats — quiet inline */}
                                    <div className="flex items-center gap-4 text-xs text-slate-600">
                                        <span className="flex items-center gap-1.5">
                                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="font-semibold tabular-nums text-slate-900">{production?.totalCalls ?? 0}</span>
                                            <span className="text-slate-400">appels</span>
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <Target className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="font-semibold tabular-nums text-slate-900">{production?.totalMeetings ?? 0}</span>
                                            <span className="text-slate-400">RDV</span>
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <Users className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="font-semibold tabular-nums text-slate-900">{client._count.users}</span>
                                        </span>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="mt-auto flex items-center justify-between px-4 py-2.5 border-t border-slate-100">
                                    <div className="flex items-center gap-1.5">
                                        {hasPortal && (
                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Portail</span>
                                        )}
                                        {recapCount > 0 && (
                                            <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                                <Mic className="w-2.5 h-2.5" />
                                                {recapCount}
                                            </span>
                                        )}
                                    </div>
                                    <span className="flex items-center gap-1 text-xs font-medium text-slate-400 group-hover:text-indigo-600 transition-colors">
                                        Gérer <ArrowRight className="w-3.5 h-3.5" />
                                    </span>
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
