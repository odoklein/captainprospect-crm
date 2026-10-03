"use client";

import { useState, useEffect } from "react";
import { Card, Badge, Button, Select } from "@/components/ui";
import {
    List,
    Building2,
    Users,
    Search,
    Filter,
    Target,
    ChevronRight,
    Loader2,
    Phone,
    Mail,
    Linkedin,
    RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ============================================
// TYPES
// ============================================

interface ListData {
    id: string;
    name: string;
    type: "SUZALI" | "CLIENT" | "MIXED";
    source: string | null;
    mission: {
        id: string;
        name: string;
        channel: "CALL" | "EMAIL" | "LINKEDIN";
        client: { name: string };
    };
    companiesCount: number;
    contactsCount: number;
    contactedCount: number;
    progress: number;
    completeness: {
        actionable: number;
        partial: number;
        incomplete: number;
    };
    createdAt: string;
}

interface Mission {
    id: string;
    name: string;
}

// ============================================
// TYPE STYLES
// ============================================

const TYPE_STYLES = {
    SUZALI: { label: "Suzali", color: "bg-primary-50 text-primary-600" },
    CLIENT: { label: "Client", color: "bg-amber-50 text-amber-600" },
    MIXED: { label: "Mixte", color: "bg-cyan-50 text-cyan-600" },
};

const CHANNEL_ICONS = {
    CALL: Phone,
    EMAIL: Mail,
    LINKEDIN: Linkedin,
};

// ============================================
// SDR LISTS PAGE
// ============================================

export default function SDRListsPage() {
    const [lists, setLists] = useState<ListData[]>([]);
    const [missions, setMissions] = useState<Mission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [missionFilter, setMissionFilter] = useState<string>("all");
    const [selectedListId, setSelectedListId] = useState<string | null>(null);

    // ============================================
    // FETCH DATA
    // ============================================

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Fetch missions
            const missionsRes = await fetch("/api/sdr/missions");
            const missionsJson = await missionsRes.json();
            if (missionsJson.success) {
                setMissions(missionsJson.data);
            }

            // Fetch lists
            const params = new URLSearchParams();
            if (missionFilter !== "all") {
                params.set("missionId", missionFilter);
            }

            const listsRes = await fetch(`/api/sdr/lists?${params.toString()}`);
            const listsJson = await listsRes.json();
            if (listsJson.success) {
                setLists(listsJson.data);
            }

            // Get selected list from localStorage
            const savedList = localStorage.getItem("sdr_selected_list");
            if (savedList) {
                setSelectedListId(savedList);
            }
        } catch (err) {
            console.error("Failed to fetch data:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [missionFilter]);

    // ============================================
    // FILTER LISTS
    // ============================================

    const filteredLists = lists.filter(list => {
        const matchesSearch = !searchQuery ||
            list.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            list.mission.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            list.mission.client.name.toLowerCase().includes(searchQuery.toLowerCase());

        return matchesSearch;
    });

    // ============================================
    // SELECT LIST
    // ============================================

    const handleSelectList = (listId: string) => {
        setSelectedListId(listId);
        localStorage.setItem("sdr_selected_list", listId);
        window.dispatchEvent(new CustomEvent("sdr_list_changed", { detail: listId }));
    };

    // ============================================
    // STATS
    // ============================================

    const stats = {
        total: lists.length,
        contacts: lists.reduce((acc, l) => acc + l.contactsCount, 0),
        contacted: lists.reduce((acc, l) => acc + l.contactedCount, 0),
    };

    // ============================================
    // LOADING STATE
    // ============================================

    if (isLoading && lists.length === 0) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-4" />
                    <p className="text-slate-500">Chargement des listes...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Mes Listes</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Parcourez les listes de contacts de vos missions
                    </p>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchData}
                    className="gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                <Card className="!p-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                            <List className="w-4 h-4 text-primary-500" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-slate-900">{stats.total}</p>
                            <p className="text-[10px] text-slate-500">Listes</p>
                        </div>
                    </div>
                </Card>
                <Card className="!p-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                            <Users className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-slate-900">{stats.contacts}</p>
                            <p className="text-[10px] text-slate-500">Contacts</p>
                        </div>
                    </div>
                </Card>
                <Card className="!p-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                            <Phone className="w-4 h-4 text-amber-500" />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-slate-900">{stats.contacted}</p>
                            <p className="text-[10px] text-slate-500">Contactés</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Filters */}
            <Card className="!p-3">
                <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Rechercher..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
                        />
                    </div>
                    <Select
                        options={[
                            { value: "all", label: "Toutes missions" },
                            ...missions.map(m => ({ value: m.id, label: m.name })),
                        ]}
                        value={missionFilter}
                        onChange={setMissionFilter}
                        className="w-40"
                    />
                </div>
            </Card>

            {/* Lists */}
            {filteredLists.length === 0 ? (
                <Card className="text-center py-12">
                    <List className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-700">
                        {searchQuery || missionFilter !== "all"
                            ? "Aucune liste trouvée"
                            : "Aucune liste disponible"}
                    </h3>
                    <p className="text-slate-500 mt-1">
                        {searchQuery || missionFilter !== "all"
                            ? "Essayez d'autres filtres"
                            : "Attendez que votre manager vous assigne des missions"}
                    </p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filteredLists.map((list) => {
                        const ChannelIcon = CHANNEL_ICONS[list.mission.channel];
                        const isSelected = selectedListId === list.id;
                        const totalCompleteness = list.completeness.actionable + list.completeness.partial + list.completeness.incomplete;

                        return (
                            <Card
                                key={list.id}
                                className={cn(
                                    "!p-4 cursor-pointer transition-all",
                                    isSelected
                                        ? "border-primary-500 bg-primary-50/50"
                                        : "hover:border-slate-300"
                                )}
                                onClick={() => handleSelectList(list.id)}
                            >
                                <div className="flex items-start gap-3">
                                    {/* Icon */}
                                    <div className={cn(
                                        "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                                        isSelected
                                            ? "bg-primary-500 text-white"
                                            : "bg-slate-100 text-slate-500"
                                    )}>
                                        <ChannelIcon className="w-5 h-5" />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-semibold text-slate-900 truncate">{list.name}</h3>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${TYPE_STYLES[list.type].color}`}>
                                                {TYPE_STYLES[list.type].label}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                                            {list.mission.name} · {list.mission.client.name}
                                        </p>

                                        {/* Stats Row */}
                                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
                                            <span className="flex items-center gap-1">
                                                <Building2 className="w-3 h-3 text-slate-400" />
                                                {list.companiesCount} sociétés
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Users className="w-3 h-3 text-slate-400" />
                                                {list.contactsCount} contacts
                                            </span>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="mt-3 space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-slate-500">Progression</span>
                                                <span className="font-medium text-primary-600">{list.progress}%</span>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary-500 rounded-full transition-all"
                                                    style={{ width: `${list.progress}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Completeness indicators */}
                                        {totalCompleteness > 0 && (
                                            <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                    {list.completeness.actionable}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                    {list.completeness.partial}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                    {list.completeness.incomplete}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Selection indicator */}
                                    {isSelected && (
                                        <div className="w-2 h-2 rounded-full bg-primary-500 mt-2" />
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* CTA */}
            {selectedListId && (
                <Link href="/sdr/action" className="block">
                    <Button variant="primary" size="lg" className="w-full gap-2">
                        <Target className="w-5 h-5" />
                        Travailler sur cette liste
                    </Button>
                </Link>
            )}
        </div>
    );
}
