"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui";
import {
    Target,
    Search,
    RefreshCw,
    Phone,
    Mail,
    Linkedin,
    ChevronRight,
    X,
    Users,
    Calendar,
} from "lucide-react";
import Link from "next/link";
import { Card, Badge, LoadingState, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MISSION_STATUS_CONFIG, MISSION_STATUS_TABS } from "@/lib/constants/missionStatus";
import type { MissionStatusValue } from "@/lib/constants/missionStatus";

// ============================================
// TYPES
// ============================================

interface Mission {
    id: string;
    name: string;
    objective?: string;
    channel: "CALL" | "EMAIL" | "LINKEDIN";
    status: MissionStatusValue;
    isActive?: boolean;
    startDate?: string;
    endDate?: string;
    client?: {
        id: string;
        name: string;
    };
    _count: {
        sdrAssignments: number;
        campaigns: number;
        lists: number;
    };
}

const CHANNEL_CONFIG = {
    CALL: { icon: Phone, label: "Appel", className: "bg-amber-100 text-amber-700" },
    EMAIL: { icon: Mail, label: "Email", className: "bg-blue-100 text-blue-700" },
    LINKEDIN: { icon: Linkedin, label: "LinkedIn", className: "bg-primary-100 text-primary-700" },
};

export default function BDMissionsPage() {
    const { error: showError } = useToast();
    const [missions, setMissions] = useState<Mission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | MissionStatusValue>("all");

    // ============================================
    // FETCH MISSIONS (from BD portfolio clients)
    // ============================================

    const fetchMissions = async () => {
        setIsLoading(true);
        try {
            // First get BD's clients
            const clientsRes = await fetch("/api/bd/clients?limit=100");
            const clientsJson = await clientsRes.json();

            if (!clientsJson.success) {
                showError("Erreur", clientsJson.error);
                setIsLoading(false);
                return;
            }

            const clientIds = clientsJson.data.map((c: { id: string }) => c.id);

            if (clientIds.length === 0) {
                setMissions([]);
                setIsLoading(false);
                return;
            }

            // Then get missions for those clients
            const missionsRes = await fetch(`/api/missions?${clientIds.map((id: string) => `clientId=${id}`).join("&")}`);
            const missionsJson = await missionsRes.json();

            if (missionsJson.success) {
                setMissions(missionsJson.data);
            } else {
                showError("Erreur", missionsJson.error);
            }
        } catch (err) {
            console.error("Failed to fetch missions:", err);
            showError("Erreur", "Impossible de charger les missions");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchMissions();
    }, []);

    // ============================================
    // FILTER MISSIONS
    // ============================================

    const filteredMissions = missions.filter((mission) => {
        const matchesText =
            mission.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            mission.client?.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === "all" || mission.status === statusFilter;
        return matchesText && matchesStatus;
    });

    const stats = {
        total: missions.length,
        active: missions.filter(m => m.status === "ACTIVE").length,
    };

    if (isLoading) {
        return <LoadingState message="Chargement des missions..." />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                title="Missions"
                subtitle="Suivez les missions de vos clients"
                onRefresh={fetchMissions}
                isRefreshing={isLoading}
            />

            {/* Stats */}
            <div className="grid grid-cols-2 gap-5">
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <Target className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                            <p className="text-sm text-slate-500">Missions totales</p>
                        </div>
                    </div>
                </Card>
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                            <div className="w-3 h-3 rounded-full bg-green-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
                            <p className="text-sm text-slate-500">Missions actives</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Search */}
            <Card className="!p-4">
                <div className="relative mb-3">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher une mission..."
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
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                    {MISSION_STATUS_TABS.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setStatusFilter(tab.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${statusFilter === tab.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </Card>

            {/* Missions List */}
            {filteredMissions.length === 0 ? (
                <EmptyState
                    icon={Target}
                    title={searchQuery ? "Aucune mission trouvée" : "Aucune mission"}
                    description={searchQuery ? "Essayez une autre recherche" : "Les missions de vos clients apparaîtront ici"}
                />
            ) : (
                <div className="space-y-3">
                    {filteredMissions.map((mission) => {
                        const channel = CHANNEL_CONFIG[mission.channel];
                        const ChannelIcon = channel.icon;

                        return (
                            <Card
                                key={mission.id}
                                className="group hover:border-emerald-300 transition-all cursor-pointer"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-lg font-bold text-emerald-600 flex-shrink-0">
                                        {mission.client?.name?.[0] || "M"}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 flex-wrap mb-1">
                                            <h3 className="font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors">
                                                {mission.name}
                                            </h3>
                                            <Badge variant={mission.status === "ACTIVE" ? "success" : "default"}>
                                                {MISSION_STATUS_CONFIG[mission.status]?.label ?? mission.status}
                                            </Badge>
                                            <span className={cn("text-xs px-2 py-1 rounded-full flex items-center gap-1", channel.className)}>
                                                <ChannelIcon className="w-3 h-3" />
                                                {channel.label}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-500">
                                            {mission.client?.name}
                                            {mission.objective && ` · ${mission.objective}`}
                                        </p>

                                        <div className="flex items-center gap-6 mt-3">
                                            <div className="flex items-center gap-2 text-sm">
                                                <Users className="w-4 h-4 text-slate-400" />
                                                <span className="text-slate-600">
                                                    {mission._count.sdrAssignments} SDR{mission._count.sdrAssignments > 1 ? "s" : ""}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm">
                                                <Target className="w-4 h-4 text-slate-400" />
                                                <span className="text-slate-600">
                                                    {mission._count.campaigns} campagne{mission._count.campaigns > 1 ? "s" : ""}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm">
                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                <span className="text-slate-600">
                                                    {mission._count.lists} liste{mission._count.lists > 1 ? "s" : ""}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
