"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui";
import {
    Search,
    Plus,
    Building2,
    Target,
    Users,
    RefreshCw,
    Loader2,
    ArrowRight,
    X,
    Clock,
    CheckCircle2,
    AlertCircle,
    Filter,
} from "lucide-react";
import Link from "next/link";
import { Card, Button, Badge, LoadingState, EmptyState, PageHeader } from "@/components/ui";
import { OnboardingReadinessGauge } from "@/components/common/OnboardingReadinessGauge";

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
    onboarding?: {
        status: string;
        targetLaunchDate?: string;
    };
    _count: {
        missions: number;
        users: number;
    };
    readiness?: OnboardingReadiness;
}

const ONBOARDING_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    DRAFT: { label: "Brouillon", color: "bg-slate-100 text-slate-600", icon: <Clock className="w-3 h-3" /> },
    IN_PROGRESS: { label: "En cours", color: "bg-blue-100 text-blue-600", icon: <Clock className="w-3 h-3" /> },
    READY_FOR_REVIEW: { label: "En attente", color: "bg-amber-100 text-amber-600", icon: <AlertCircle className="w-3 h-3" /> },
    APPROVED: { label: "Approuvé", color: "bg-emerald-100 text-emerald-600", icon: <CheckCircle2 className="w-3 h-3" /> },
    ACTIVE: { label: "Actif", color: "bg-green-100 text-green-600", icon: <CheckCircle2 className="w-3 h-3" /> },
};

const STATUS_OPTIONS = [
    { value: "all", label: "Tous les statuts" },
    { value: "DRAFT", label: "Brouillon" },
    { value: "IN_PROGRESS", label: "En cours" },
    { value: "READY_FOR_REVIEW", label: "En attente de validation" },
    { value: "APPROVED", label: "Approuvé" },
    { value: "ACTIVE", label: "Actif" },
];

export default function BDClientsPage() {
    const { error: showError } = useToast();
    const [clients, setClients] = useState<Client[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    // ============================================
    // FETCH CLIENTS
    // ============================================

    const fetchClients = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchQuery) params.set("search", searchQuery);
            if (statusFilter !== "all") params.set("status", statusFilter);

            const res = await fetch(`/api/bd/clients?${params.toString()}`);
            const json = await res.json();

            if (json.success) {
                setClients(json.data);
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            console.error("Failed to fetch clients:", err);
            showError("Erreur", "Impossible de charger les clients");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchClients();
    }, [statusFilter]);

    // ============================================
    // FILTERED CLIENTS
    // ============================================

    const filteredClients = clients.filter(client =>
        client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.industry?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // ============================================
    // STATS
    // ============================================

    const stats = {
        total: clients.length,
        active: clients.filter(c => c.onboarding?.status === "ACTIVE" || c.onboarding?.status === "APPROVED").length,
        pending: clients.filter(c => ["DRAFT", "IN_PROGRESS", "READY_FOR_REVIEW"].includes(c.onboarding?.status || "")).length,
    };

    if (isLoading && clients.length === 0) {
        return <LoadingState message="Chargement du portfolio..." />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                title="Mon Portfolio"
                subtitle="Gérez vos clients et suivez leur onboarding"
                onRefresh={fetchClients}
                isRefreshing={isLoading}
                actions={
                    <Link href="/bd/clients/new">
                        <Button variant="primary" className="gap-2">
                            <Plus className="w-4 h-4" />
                            Nouveau client
                        </Button>
                    </Link>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-3 gap-5">
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                            <p className="text-sm text-slate-500">Clients totaux</p>
                        </div>
                    </div>
                </Card>
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                            <CheckCircle2 className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
                            <p className="text-sm text-slate-500">Clients actifs</p>
                        </div>
                    </div>
                </Card>
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                            <Clock className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                            <p className="text-sm text-slate-500">En onboarding</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Filters */}
            <Card className="!p-4">
                <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Rechercher un client..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-11 pl-12 pr-10 text-sm text-slate-900 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full transition-colors"
                            >
                                <X className="w-4 h-4 text-slate-400" />
                            </button>
                        )}
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="h-11 px-4 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    >
                        {STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            </Card>

            {/* Clients Grid */}
            {filteredClients.length === 0 ? (
                <EmptyState
                    icon={Building2}
                    title={searchQuery || statusFilter !== "all" ? "Aucun client trouvé" : "Aucun client dans le portfolio"}
                    description={searchQuery || statusFilter !== "all" 
                        ? "Essayez de modifier vos filtres" 
                        : "Commencez par onboarder votre premier client"}
                    action={
                        !searchQuery && statusFilter === "all" && (
                            <Link href="/bd/clients/new">
                                <Button variant="primary" className="gap-2">
                                    <Plus className="w-4 h-4" />
                                    Nouveau client
                                </Button>
                            </Link>
                        )
                    }
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredClients.map((client, index) => {
                        const status = client.onboarding?.status || "DRAFT";
                        const statusConfig = ONBOARDING_STATUS_CONFIG[status] || ONBOARDING_STATUS_CONFIG.DRAFT;

                        return (
                            <Link
                                key={client.id}
                                href={`/bd/clients/${client.id}`}
                                className="group block"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <Card className="h-full hover:border-emerald-300 hover:shadow-lg transition-all">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center text-xl font-bold text-emerald-600">
                                            {client.name[0]}
                                        </div>
                                        <ArrowRight className="w-5 h-5 text-slate-300 -rotate-45 group-hover:rotate-0 group-hover:text-emerald-500 transition-all duration-300" />
                                    </div>

                                    <div className="mb-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                                                {client.name}
                                            </h3>
                                        </div>
                                        <p className="text-sm text-slate-500 font-medium">
                                            {client.industry || "Secteur non spécifié"}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 mb-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                                            {statusConfig.icon}
                                            {statusConfig.label}
                                        </span>
                                    </div>

                                    {client.readiness && (
                                        <div className="mb-4 pt-3 border-t border-slate-100">
                                            <OnboardingReadinessGauge
                                                readiness={client.readiness}
                                                size="sm"
                                                showLabels={true}
                                            />
                                        </div>
                                    )}

                                    <div className="flex items-center gap-6 pt-4 border-t border-slate-100">
                                        <div>
                                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Missions</p>
                                            <p className="text-lg font-bold text-slate-900">{client._count.missions}</p>
                                        </div>
                                        <div className="w-px h-8 bg-slate-200" />
                                        <div>
                                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Utilisateurs</p>
                                            <p className="text-lg font-bold text-slate-900">{client._count.users}</p>
                                        </div>
                                    </div>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
