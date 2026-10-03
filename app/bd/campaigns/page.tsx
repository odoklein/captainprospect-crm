"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui";
import {
    FileText,
    Search,
    RefreshCw,
    ChevronRight,
    X,
    Target,
    Play,
    Pause,
} from "lucide-react";
import { Card, Badge, LoadingState, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

interface Campaign {
    id: string;
    name: string;
    icp: string;
    isActive: boolean;
    createdAt: string;
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
}

export default function BDCampaignsPage() {
    const { error: showError } = useToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // ============================================
    // FETCH CAMPAIGNS
    // ============================================

    const fetchCampaigns = async () => {
        setIsLoading(true);
        try {
            // Get BD's client IDs first
            const clientsRes = await fetch("/api/bd/clients?limit=100");
            const clientsJson = await clientsRes.json();

            if (!clientsJson.success) {
                setCampaigns([]);
                setIsLoading(false);
                return;
            }

            const clientIds = clientsJson.data.map((c: { id: string }) => c.id);

            if (clientIds.length === 0) {
                setCampaigns([]);
                setIsLoading(false);
                return;
            }

            // Fetch campaigns for those clients
            const res = await fetch("/api/campaigns");
            const json = await res.json();

            if (json.success) {
                // Filter campaigns by portfolio clients
                const filtered = json.data.filter((c: Campaign) =>
                    clientIds.includes(c.mission?.client?.id)
                );
                setCampaigns(filtered);
            } else {
                showError("Erreur", json.error);
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
    // FILTER
    // ============================================

    const filteredCampaigns = campaigns.filter(campaign =>
        campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        campaign.mission.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        campaign.icp.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const stats = {
        total: campaigns.length,
        active: campaigns.filter(c => c.isActive).length,
    };

    if (isLoading) {
        return <LoadingState message="Chargement des campagnes..." />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                title="Campagnes"
                subtitle="Campagnes de prospection de vos clients"
                onRefresh={fetchCampaigns}
                isRefreshing={isLoading}
            />

            {/* Stats */}
            <div className="grid grid-cols-2 gap-5">
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <FileText className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                            <p className="text-sm text-slate-500">Campagnes totales</p>
                        </div>
                    </div>
                </Card>
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                            <Play className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
                            <p className="text-sm text-slate-500">Campagnes actives</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Search */}
            <Card className="!p-4">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher une campagne..."
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
            </Card>

            {/* Campaigns List */}
            {filteredCampaigns.length === 0 ? (
                <EmptyState
                    icon={FileText}
                    title={searchQuery ? "Aucune campagne trouvée" : "Aucune campagne"}
                    description={searchQuery ? "Essayez une autre recherche" : "Les campagnes de vos clients apparaîtront ici"}
                />
            ) : (
                <div className="grid grid-cols-2 gap-5">
                    {filteredCampaigns.map((campaign) => (
                        <Card key={campaign.id} className="group hover:border-emerald-300 transition-all">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                                        <FileText className="w-6 h-6 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors">
                                            {campaign.name}
                                        </h3>
                                        <p className="text-sm text-slate-500">
                                            {campaign.mission.client.name} · {campaign.mission.name}
                                        </p>
                                    </div>
                                </div>
                                <Badge variant={campaign.isActive ? "success" : "default"}>
                                    {campaign.isActive ? "Active" : "Inactive"}
                                </Badge>
                            </div>

                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 mb-4">
                                <p className="text-sm text-slate-600 line-clamp-2">
                                    <span className="font-medium">ICP:</span> {campaign.icp}
                                </p>
                            </div>

                            <div className="flex items-center justify-between text-sm text-slate-500">
                                <div className="flex items-center gap-1.5">
                                    <Target className="w-4 h-4" />
                                    <span>{campaign._count.actions} actions</span>
                                </div>
                                <span>Créée le {new Date(campaign.createdAt).toLocaleDateString("fr-FR")}</span>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
