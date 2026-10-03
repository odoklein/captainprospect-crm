"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
    FileText,
    Target,
    Plus,
    Search,
    Play,
    Pause,
    RefreshCw,
    Loader2,
    ChevronRight,
    X,
} from "lucide-react";
import Link from "next/link";

// ============================================
// TYPES
// ============================================

interface Campaign {
    id: string;
    name: string;
    icp: string;
    pitch: string;
    isActive: boolean;
    mission: {
        id: string;
        name: string;
        client: {
            name: string;
        };
    };
    _count: {
        actions: number;
    };
    createdAt: string;
}

// ============================================
// CAMPAIGNS PAGE
// ============================================

export default function CampaignsPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    // ============================================
    // FETCH CAMPAIGNS
    // ============================================

    const fetchCampaigns = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/campaigns");
            const json = await res.json();

            if (json.success) {
                setCampaigns(json.data);
            } else {
                showError("Erreur", json.error || "Impossible de charger les campagnes");
            }
        } catch (err) {
            console.error("Failed to fetch campaigns:", err);
            showError("Erreur", "Impossible de charger les campagnes");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCampaigns();
    }, []);

    // ============================================
    // FILTER CAMPAIGNS
    // ============================================

    const filteredCampaigns = campaigns.filter((campaign) => {
        const matchesSearch =
            !searchQuery ||
            campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            campaign.mission.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            campaign.icp.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus =
            statusFilter === "all" ||
            (statusFilter === "active" && campaign.isActive) ||
            (statusFilter === "inactive" && !campaign.isActive);

        return matchesSearch && matchesStatus;
    });

    // ============================================
    // STATS
    // ============================================

    const stats = {
        total: campaigns.length,
        active: campaigns.filter((c) => c.isActive).length,
        totalActions: campaigns.reduce((acc, c) => acc + c._count.actions, 0),
    };

    if (isLoading && campaigns.length === 0) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                    <p className="text-sm text-slate-500">Chargement des campagnes...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Premium Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Campagnes</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Gérez vos campagnes de prospection
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchCampaigns}
                        className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 text-slate-500 ${isLoading ? "animate-spin" : ""}`} />
                    </button>
                    <Link
                        href="/manager/campaigns/new"
                        className="mgr-btn-primary flex items-center gap-2 h-10 px-5 text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Nouvelle campagne
                    </Link>
                </div>
            </div>

            {/* Premium Stats */}
            <div className="grid grid-cols-3 gap-5">
                <div className="mgr-stat-card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                            <FileText className="w-6 h-6 text-primary-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                            <p className="text-sm text-slate-500">Campagnes</p>
                        </div>
                    </div>
                </div>
                <div className="mgr-stat-card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <Play className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
                            <p className="text-sm text-slate-500">Actives</p>
                        </div>
                    </div>
                </div>
                <div className="mgr-stat-card">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                            <Target className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{stats.totalActions}</p>
                            <p className="text-sm text-slate-500">Actions</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Premium Filters */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher une campagne..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="mgr-search-input w-full h-11 pl-12 pr-10 text-sm text-slate-900"
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
                    className="h-11 px-4 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
                >
                    <option value="all">Tous les statuts</option>
                    <option value="active">Actives</option>
                    <option value="inactive">Inactives</option>
                </select>
            </div>

            {/* Campaigns Grid */}
            {filteredCampaigns.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                    <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-4">
                        <FileText className="w-8 h-8 text-primary-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                        {searchQuery || statusFilter !== "all"
                            ? "Aucune campagne trouvée"
                            : "Aucune campagne créée"}
                    </h3>
                    <p className="text-sm text-slate-500 mb-6">
                        {searchQuery || statusFilter !== "all"
                            ? "Essayez d'autres filtres"
                            : "Créez votre première campagne pour commencer"}
                    </p>
                    {!searchQuery && statusFilter === "all" && (
                        <Link
                            href="/manager/campaigns/new"
                            className="mgr-btn-primary inline-flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Créer une campagne
                        </Link>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-5">
                    {filteredCampaigns.map((campaign, index) => (
                        <div
                            key={campaign.id}
                            className="mgr-mission-card group cursor-pointer"
                            onClick={() => router.push(`/manager/campaigns/${campaign.id}`)}
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                                        <FileText className="w-6 h-6 text-primary-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-900 group-hover:text-primary-600 transition-colors">
                                            {campaign.name}
                                        </h3>
                                        <p className="text-sm text-slate-500">
                                            {campaign.mission.client.name} · {campaign.mission.name}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={campaign.isActive ? "mgr-badge-active" : "mgr-badge-paused"}>
                                        {campaign.isActive ? "Active" : "Inactive"}
                                    </span>
                                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
                                </div>
                            </div>

                            {/* ICP */}
                            <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <p className="text-sm text-slate-600 line-clamp-2">
                                    <span className="font-medium text-slate-700">ICP:</span> {campaign.icp}
                                </p>
                            </div>

                            {/* Stats */}
                            <div className="flex items-center gap-4 text-sm text-slate-600">
                                <div className="flex items-center gap-1.5">
                                    <Target className="w-4 h-4 text-slate-400" />
                                    <span className="font-medium">{campaign._count.actions}</span> actions
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
                                <span>Créée le {new Date(campaign.createdAt).toLocaleDateString("fr-FR")}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
