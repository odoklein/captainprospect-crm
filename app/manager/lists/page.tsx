"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Badge, Button, Select, ConfirmModal, ContextMenu, useContextMenu, useToast } from "@/components/ui";
import {
    List,
    Building2,
    Users,
    Activity,
    Plus,
    Upload,
    Search,
    Filter,
    MoreVertical,
    Eye,
    Trash2,
    RefreshCw,
    Download,
    Database, // newly added for search tab
    Edit,
    Archive,
    ArchiveRestore,
    AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { ListingSearchTab } from "@/components/listing/ListingSearchTab";
import type { ListingResult } from "@/components/listing/ListingSearchTab";
import { ImportToListModal } from "@/components/listing/ImportToListModal";
import { ListHealthDashboard } from "@/components/lists/ListHealthDashboard";
import {
    ProspectionHealthBadge,
    ActivityScoreBar,
    VelocityTrendBadge,
} from "@/components/lists/ProspectionHealthBadge";
import type { ListHealthSummary } from "@/lib/types/health";

// Coverage near 100% = list nearing exhaustion (rose), low = lots of work still (emerald)
function getCoverageColor(rate: number): string {
    if (rate >= 70) return "text-rose-600";
    if (rate >= 50) return "text-amber-600";
    return "text-emerald-600";
}

// ============================================
// TYPES
// ============================================

interface ListData {
    id: string;
    name: string;
    type: "SUZALI" | "CLIENT" | "MIXED";
    source?: string;
    createdAt: string;
    isArchived?: boolean;
    archivedAt?: string | null;
    mission?: {
        id: string;
        name: string;
    };
    _count: {
        companies: number;
    };
    stats?: {
        companyCount: number;
        contactCount: number;
        completeness: {
            INCOMPLETE: number;
            PARTIAL: number;
            ACTIONABLE: number;
        };
    };
}


// ============================================
// TYPE STYLES
// ============================================

const TYPE_STYLES = {
    SUZALI: { label: "Suzali", color: "bg-primary-50 text-primary-700 border-primary-200" },
    CLIENT: { label: "Client", color: "bg-amber-50 text-amber-700 border-amber-200" },
    MIXED: { label: "Mixte", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
};

// ============================================
// LISTS PAGE
// ============================================

const LISTS_QUERY_KEY = ["manager", "lists"] as const;

async function fetchListsApi(): Promise<ListData[]> {
    const pageSize = 200;
    let page = 1;
    let hasMore = true;
    const allLists: ListData[] = [];

    while (hasMore) {
        const res = await fetch(`/api/lists?page=${page}&limit=${pageSize}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Impossible de charger les listes");

        const batch = Array.isArray(json.data) ? (json.data as ListData[]) : [];
        allLists.push(...batch);

        hasMore = Boolean(json.pagination?.hasMore);
        page += 1;

        // Defensive guard in case pagination metadata is missing
        if (!json.pagination && batch.length < pageSize) {
            hasMore = false;
        }
    }

    return allLists;
}

async function fetchHealthByListIds(listIds: string[]): Promise<Map<string, ListHealthSummary>> {
    if (listIds.length === 0) return new Map();
    const params = new URLSearchParams();
    listIds.forEach((id) => params.append("listIds[]", id));
    const res = await fetch(`/api/lists/health?${params.toString()}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Impossible de charger la santé des listes");
    const map = new Map<string, ListHealthSummary>();
    for (const item of (json.data as ListHealthSummary[])) {
        map.set(item.listId, item);
    }
    return map;
}

export default function ListsPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { success, error: showError } = useToast();
    const { data: lists = [], isLoading, isFetching, refetch } = useQuery({
        queryKey: LISTS_QUERY_KEY,
        queryFn: fetchListsApi,
    });
    const [searchQuery, setSearchQuery] = useState("");
    const [sizeFilter, setSizeFilter] = useState<string>("all");
    const [qualityFilter, setQualityFilter] = useState<string>("all");
    const [showArchived, setShowArchived] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletingList, setDeletingList] = useState<ListData | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const { position, contextData, handleContextMenu, close: closeMenu } = useContextMenu();

    // ============================================
    // TABS (Lists vs Search)
    // ============================================
    const [activeTab, setActiveTab] = useState<"lists" | "search" | "health">("lists");
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [resultsToImport, setResultsToImport] = useState<ListingResult[]>([]);
    const visibleListIds = lists.filter((l) => !l.isArchived).map((l) => l.id);
    const { data: healthByListId = new Map<string, ListHealthSummary>() } = useQuery({
        queryKey: ["manager", "lists-health", visibleListIds],
        queryFn: () => fetchHealthByListIds(visibleListIds),
        enabled: (activeTab === "lists" || activeTab === "health") && visibleListIds.length > 0,
        staleTime: 2 * 60 * 1000,
    });

    const handleImportRequest = (results: ListingResult[]) => {
        setResultsToImport(results);
        setImportModalOpen(true);
    };

    const handleImportComplete = () => {
        setImportModalOpen(false);
        setResultsToImport([]);
        setActiveTab("lists");
        queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
    };


    // ============================================
    // DELETE LIST
    // ============================================

    const handleDeleteList = async () => {
        if (!deletingList) return;

        setIsDeleting(true);
        try {
            const res = await fetch(`/api/lists/${deletingList.id}`, {
                method: "DELETE",
            });
            const json = await res.json();

            if (json.success) {
                success("Liste supprimée", `${deletingList.name} a été supprimée`);
                queryClient.invalidateQueries({ queryKey: LISTS_QUERY_KEY });
            } else {
                showError("Erreur", json.error || "Impossible de supprimer");
            }
        } catch (err) {
            showError("Erreur", "Impossible de supprimer la liste");
        } finally {
            setIsDeleting(false);
            setShowDeleteModal(false);
            setDeletingList(null);
        }
    };

    // ============================================
    // CONTEXT MENU ITEMS
    // ============================================

    const handleArchiveToggle = async (list: ListData) => {
        const newArchivedState = !list.isArchived;
        
        // Optimistic update
        queryClient.setQueryData<ListData[]>(LISTS_QUERY_KEY, (old) => {
            if (!old) return old;
            return old.map((l) =>
                l.id === list.id
                    ? { ...l, isArchived: newArchivedState, archivedAt: newArchivedState ? new Date().toISOString() : null }
                    : l
            );
        });

        try {
            const res = await fetch(`/api/lists/${list.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isArchived: newArchivedState }),
            });
            const json = await res.json();

            if (json.success) {
                success(
                    newArchivedState ? "Liste archivée" : "Liste désarchivée",
                    `${list.name} a été ${newArchivedState ? "archivée" : "désarchivée"}`
                );
            } else {
                // Rollback on error
                queryClient.setQueryData<ListData[]>(LISTS_QUERY_KEY, (old) => {
                    if (!old) return old;
                    return old.map((l) =>
                        l.id === list.id ? { ...l, isArchived: list.isArchived, archivedAt: list.archivedAt } : l
                    );
                });
                showError("Erreur", json.error || "Impossible de modifier la liste");
            }
        } catch (err) {
            // Rollback on error
            queryClient.setQueryData<ListData[]>(LISTS_QUERY_KEY, (old) => {
                if (!old) return old;
                return old.map((l) =>
                    l.id === list.id ? { ...l, isArchived: list.isArchived, archivedAt: list.archivedAt } : l
                );
            });
            showError("Erreur", "Impossible de modifier la liste");
        }
    };

    const getContextMenuItems = (list: ListData) => [
        {
            label: "Voir les détails",
            icon: <Eye className="w-4 h-4" />,
            onClick: () => router.push(`/manager/lists/${list.id}`),
        },
        {
            label: "Modifier",
            icon: <Edit className="w-4 h-4" />,
            onClick: () => router.push(`/manager/lists/${list.id}/edit`),
        },
        {
            label: "Exporter CSV",
            icon: <Download className="w-4 h-4" />,
            onClick: () => window.open(`/api/lists/${list.id}/export`, "_blank"),
        },
        {
            label: list.isArchived ? "Désarchiver" : "Archiver",
            icon: list.isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />,
            onClick: () => handleArchiveToggle(list),
            variant: "default" as const,
            divider: true,
        },
        {
            label: "Supprimer",
            icon: <Trash2 className="w-4 h-4" />,
            onClick: () => {
                setDeletingList(list);
                setShowDeleteModal(true);
            },
            variant: "danger" as const,
        },
    ];

    // ============================================
    // FILTER LISTS
    // ============================================

    const filteredLists = lists.filter(list => {
        const matchesSearch = !searchQuery ||
            list.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            list.mission?.name.toLowerCase().includes(searchQuery.toLowerCase());

        // Size filter based on contact count
        const contactCount = list.stats?.contactCount || 0;
        let matchesSize = true;
        if (sizeFilter === "small") matchesSize = contactCount < 50;
        else if (sizeFilter === "medium") matchesSize = contactCount >= 50 && contactCount < 200;
        else if (sizeFilter === "large") matchesSize = contactCount >= 200;

        // Quality filter based on actionable %
        const totalContacts = list.stats?.contactCount || 0;
        const actionablePercent = totalContacts > 0
            ? Math.round(((list.stats?.completeness?.ACTIONABLE || 0) / totalContacts) * 100)
            : 0;
        let matchesQuality = true;
        if (qualityFilter === "low") matchesQuality = actionablePercent < 50;
        else if (qualityFilter === "medium") matchesQuality = actionablePercent >= 50 && actionablePercent < 80;
        else if (qualityFilter === "high") matchesQuality = actionablePercent >= 80;

        // Archived: when ON show only archived, when OFF show only non-archived
        const matchesArchived = showArchived ? !!list.isArchived : !list.isArchived;

        return matchesSearch && matchesSize && matchesQuality && matchesArchived;
    });

    // ============================================
    // STATS
    // ============================================

    const stats = useMemo(() => {
        const visibleLists = lists.filter((l) => !l.isArchived);
        const total = visibleLists.length;
        const companies = visibleLists.reduce((acc, l) => acc + (l._count?.companies || 0), 0);
        const contacts = visibleLists.reduce((acc, l) => acc + (l.stats?.contactCount || 0), 0);
        let atRisk = 0;
        let stalled = 0;
        for (const health of healthByListId.values()) {
            if (health.status === "AT_RISK") atRisk++;
            else if (health.status === "STALLED") stalled++;
        }
        return { total, companies, contacts, atRisk, stalled, toWatch: atRisk + stalled };
    }, [lists, healthByListId]);

    return (
        <div className="space-y-6">
            {/* Premium Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Listes & Prospection</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Gérez vos listes de sociétés et recherchez de nouveaux leads
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 shadow-inner mr-2">
                        <button
                            onClick={() => setActiveTab("lists")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === "lists"
                                ? "bg-white text-primary-700 shadow border-b border-primary-100"
                                : "text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            <List className={`w-4 h-4 ${activeTab === "lists" ? "text-primary-500" : "text-slate-400"}`} />
                            Mes Listes
                        </button>
                        <button
                            onClick={() => setActiveTab("search")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === "search"
                                ? "bg-white text-primary-700 shadow border-b border-primary-100"
                                : "text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            <Database className={`w-4 h-4 ${activeTab === "search" ? "text-primary-500" : "text-slate-400"}`} />
                            Recherche de Leads
                        </button>
                        <button
                            onClick={() => setActiveTab("health")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${activeTab === "health"
                                ? "bg-white text-primary-700 shadow border-b border-primary-100"
                                : "text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            <Activity className={`w-4 h-4 ${activeTab === "health" ? "text-primary-500" : "text-slate-400"}`} />
                            Santé Prospection
                        </button>
                    </div>

                    {activeTab === "lists" && (
                        <>
                            <button
                                onClick={() => refetch()}
                                className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors tooltip-trigger"
                                title="Rafraîchir les listes"
                            >
                                <RefreshCw className={`w-4 h-4 text-slate-500 ${isFetching ? "animate-spin" : ""}`} />
                            </button>
                            <Link
                                href="/manager/lists/import"
                                className="flex items-center gap-2 h-10 px-5 text-sm font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-primary-600 rounded-lg transition-colors shadow-sm"
                            >
                                <Upload className="w-4 h-4" />
                                Importer CSV
                            </Link>
                        </>
                    )}
                </div>
            </div>

            {activeTab === "lists" ? (
                <>
                    {/* Premium Stats Cards */}
                    {isLoading ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                            <div className="mgr-stat-card animate-pulse"><div className="h-16 bg-slate-100 rounded-xl" /></div>
                            <div className="mgr-stat-card animate-pulse"><div className="h-16 bg-slate-100 rounded-xl" /></div>
                            <div className="mgr-stat-card animate-pulse"><div className="h-16 bg-slate-100 rounded-xl" /></div>
                            <div className="mgr-stat-card animate-pulse"><div className="h-16 bg-slate-100 rounded-xl" /></div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                            <div className="mgr-stat-card">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                                        <List className="w-6 h-6 text-primary-600" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                                        <p className="text-sm font-medium text-slate-500">Listes actives</p>
                                    </div>
                                </div>
                            </div>
                            <div className="mgr-stat-card">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                                        <Building2 className="w-6 h-6 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-slate-900">{stats.companies}</p>
                                        <p className="text-sm font-medium text-slate-500">Sociétés couvertes</p>
                                    </div>
                                </div>
                            </div>
                            <div className="mgr-stat-card">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                                        <Users className="w-6 h-6 text-amber-600" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-slate-900">{stats.contacts}</p>
                                        <p className="text-sm font-medium text-slate-500">Contacts individuels</p>
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    if (stats.toWatch > 0) setActiveTab("health");
                                }}
                                className={`mgr-stat-card text-left transition-shadow ${
                                    stats.toWatch > 0 ? "cursor-pointer hover:shadow-md" : "cursor-default"
                                }`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                        stats.toWatch > 0 ? "bg-rose-100" : "bg-slate-100"
                                    }`}>
                                        <AlertTriangle className={`w-6 h-6 ${
                                            stats.toWatch > 0 ? "text-rose-600" : "text-slate-400"
                                        }`} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-2xl font-bold text-slate-900">{stats.toWatch}</p>
                                        <p className="text-sm font-medium text-slate-500 truncate">
                                            À surveiller
                                            {stats.toWatch > 0 && (
                                                <span className="ml-1 text-[11px] text-slate-400 font-normal">
                                                    · {stats.atRisk} à risque
                                                    {stats.stalled > 0 && <>, {stats.stalled} stagnantes</>}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        </div>
                    )}

                    {/* Compact Filter Bar */}
                    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2">
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Rechercher..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-8 pl-9 pr-8 text-xs font-medium text-slate-900 bg-slate-50 border border-transparent focus:bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500/10 rounded-md transition-all"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-200 rounded transition-colors"
                                >
                                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>

                        <div className="h-5 w-px bg-slate-200" />

                        {/* Size filter */}
                        <div className="flex items-center gap-1">
                            {[
                                { value: "all", label: "Toutes tailles" },
                                { value: "small", label: "< 50" },
                                { value: "medium", label: "50–200" },
                                { value: "large", label: "200+" },
                            ].map((s) => (
                                <button
                                    key={s.value}
                                    onClick={() => setSizeFilter(s.value)}
                                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                                        sizeFilter === s.value
                                            ? "bg-primary-50 text-primary-700 border border-primary-200"
                                            : "text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent"
                                    }`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>

                        <div className="h-5 w-px bg-slate-200" />

                        {/* Quality filter — based on actionable % */}
                        <div className="flex items-center gap-1">
                            {[
                                { value: "all", label: "Qualité" },
                                { value: "low", label: "< 50%" },
                                { value: "medium", label: "50–80%" },
                                { value: "high", label: "80%+" },
                            ].map((q) => (
                                <button
                                    key={q.value}
                                    onClick={() => setQualityFilter(q.value)}
                                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                                        qualityFilter === q.value
                                            ? "bg-primary-50 text-primary-700 border border-primary-200"
                                            : "text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent"
                                    }`}
                                    title={
                                        q.value === "all"
                                            ? "Toutes les listes"
                                            : `Contacts ACTIONABLE ${q.label}`
                                    }
                                >
                                    {q.label}
                                </button>
                            ))}
                        </div>

                        <div className="h-5 w-px bg-slate-200" />

                        {/* Archive toggle — shows ONLY archived when active */}
                        <button
                            onClick={() => setShowArchived(p => !p)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                                showArchived
                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent"
                            }`}
                        >
                            <Archive className="w-3.5 h-3.5" />
                            Archivées
                        </button>

                        {/* Spacer */}
                        <div className="flex-1" />

                        {/* Result count */}
                        <span className="text-xs font-medium text-slate-400">
                            {filteredLists.length} liste{filteredLists.length !== 1 ? "s" : ""}
                        </span>

                        {(searchQuery || sizeFilter !== "all" || qualityFilter !== "all" || showArchived) && (
                            <button
                                onClick={() => { setSearchQuery(""); setSizeFilter("all"); setQualityFilter("all"); setShowArchived(false); }}
                                className="text-xs font-medium text-slate-400 hover:text-rose-500 transition-colors"
                            >
                                Réinitialiser
                            </button>
                        )}
                    </div>

                    {/* Table View */}
                    {isLoading && lists.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                            <div className="divide-y divide-slate-100">
                                {[1, 2, 3, 4, 5, 6].map(i => (
                                    <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex-shrink-0" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-3.5 bg-slate-100 rounded w-1/3" />
                                            <div className="h-2.5 bg-slate-100 rounded w-1/5" />
                                        </div>
                                        <div className="h-3 bg-slate-100 rounded w-12" />
                                        <div className="h-3 bg-slate-100 rounded w-16" />
                                        <div className="h-3 bg-slate-100 rounded w-10" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : filteredLists.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                            <div className="w-14 h-14 rounded-xl bg-primary-50 border border-primary-100/50 flex items-center justify-center mx-auto mb-4">
                                <List className="w-7 h-7 text-primary-400" />
                            </div>
                            <h3 className="text-base font-bold text-slate-900 mb-1">
                                {searchQuery || sizeFilter !== "all" || qualityFilter !== "all" || showArchived
                                    ? "Aucune liste ne correspond"
                                    : "Aucune liste de contacts"}
                            </h3>
                            <p className="text-xs text-slate-500 mb-6 max-w-sm mx-auto">
                                {searchQuery || sizeFilter !== "all" || qualityFilter !== "all"
                                    ? "Modifiez vos filtres."
                                    : "Importez une base de données ou créez une nouvelle liste."}
                            </p>
                            {!searchQuery && sizeFilter === "all" && qualityFilter === "all" && !showArchived && (
                                <Link href="/manager/lists/import" className="inline-flex items-center gap-2 h-9 px-5 text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-primary-600 rounded-lg transition-colors shadow-sm">
                                    <Upload className="w-3.5 h-3.5" />
                                    Importer un CSV
                                </Link>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                            {/* Table header */}
                            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_70px_65px_65px_190px_90px_36px] gap-3 px-5 py-2.5 bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                <span>Nom</span>
                                <span>Mission</span>
                                <span className="text-center">Type</span>
                                <span className="text-center">Sociétés</span>
                                <span className="text-center">Contacts</span>
                                <span className="text-center">Santé &amp; activité</span>
                                <span className="text-center">Source</span>
                                <span></span>
                            </div>
                            {/* Table rows */}
                            <div className="divide-y divide-slate-100">
                                {filteredLists.map((list) => {
                                    const totalContacts = list.stats?.contactCount || 0;
                                    const actionablePercent = totalContacts > 0
                                        ? Math.round(((list.stats?.completeness?.ACTIONABLE || 0) / totalContacts) * 100)
                                        : 0;

                                    const health = healthByListId.get(list.id);

                                    return (
                                        <div
                                            key={list.id}
                                            onClick={() => router.push(`/manager/lists/${list.id}`)}
                                            onContextMenu={(e) => handleContextMenu(e, list)}
                                            className={`group grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_70px_65px_65px_190px_90px_36px] gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-primary-50/40 ${list.isArchived ? "opacity-60" : ""}`}
                                        >
                                            {/* Name + badges */}
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0 group-hover:border-primary-200 transition-colors">
                                                    <List className="w-4 h-4 text-slate-400 group-hover:text-primary-500 transition-colors" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-sm font-semibold text-slate-900 group-hover:text-primary-600 transition-colors truncate">{list.name}</span>
                                                        {list.isArchived && (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 flex-shrink-0">
                                                                Archivée
                                                            </span>
                                                        )}
                                                    </div>
                                                    {totalContacts > 0 && (
                                                        <p className="text-[10px] font-medium text-slate-400 mt-0.5 truncate">
                                                            {actionablePercent}% actionnable
                                                            {health && health.actions7d > 0 && (
                                                                <> · {health.actions7d} action{health.actions7d > 1 ? "s" : ""} 7j</>
                                                            )}
                                                            {health && health.daysSinceLastAction !== null && health.daysSinceLastAction >= 7 && (
                                                                <span className="text-amber-600"> · {health.daysSinceLastAction}j sans action</span>
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Mission */}
                                            <div className="flex items-center min-w-0">
                                                <span className="text-xs font-medium text-slate-500 truncate">
                                                    {list.mission?.name || "—"}
                                                </span>
                                            </div>

                                            {/* Type */}
                                            <div className="flex items-center justify-center">
                                                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${TYPE_STYLES[list.type].color}`}>
                                                    {TYPE_STYLES[list.type].label}
                                                </span>
                                            </div>

                                            {/* Companies */}
                                            <div className="flex items-center justify-center">
                                                <span className="text-sm font-semibold text-slate-700">{list._count?.companies || 0}</span>
                                            </div>

                                            {/* Contacts */}
                                            <div className="flex items-center justify-center">
                                                <span className="text-sm font-semibold text-slate-700">{totalContacts}</span>
                                            </div>

                                            {/* Health + activity mini-dashboard */}
                                            <div
                                                className="flex items-center min-w-0"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {!health ? (
                                                    <div className="w-full flex items-center justify-center">
                                                        <span className="text-[11px] text-slate-400">—</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col gap-1 w-full min-w-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <ProspectionHealthBadge
                                                                status={health.status}
                                                                statusLabel={health.statusLabel}
                                                                compact
                                                            />
                                                            <VelocityTrendBadge
                                                                trend={health.velocity.trend}
                                                                explanation={health.velocity.trendExplanation}
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="flex-1 min-w-0">
                                                                <ActivityScoreBar
                                                                    score={health.activityScore}
                                                                    size="sm"
                                                                    explanation={`Score composite 0–100`}
                                                                />
                                                            </div>
                                                            {health.coverageRate !== null && (
                                                                <span
                                                                    className={`text-[10px] font-bold tabular-nums flex-shrink-0 ${getCoverageColor(health.coverageRate)}`}
                                                                    title={`Couverture: ${health.coverageRate.toFixed(1)}%`}
                                                                >
                                                                    {Math.round(health.coverageRate)}%
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Source */}
                                            <div className="flex items-center justify-center">
                                                <span className="text-[11px] font-medium text-slate-400 truncate">{list.source || "—"}</span>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center justify-center">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleContextMenu(e, list);
                                                    }}
                                                    className="p-1 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <MoreVertical className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            ) : activeTab === "search" ? (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm min-h-[600px] flex flex-col">
                    <ListingSearchTab onImport={handleImportRequest} />
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm p-5">
                    <ListHealthDashboard />
                </div>
            )}

            <ImportToListModal
                isOpen={importModalOpen}
                onClose={() => {
                    setImportModalOpen(false);
                    setResultsToImport([]);
                }}
                results={resultsToImport}
                onImportComplete={handleImportComplete}
            />

            {/* Context Menu */}
            <ContextMenu
                items={contextData ? getContextMenuItems(contextData) : []}
                position={position}
                onClose={closeMenu}
            />

            {/* Delete Confirmation */}
            <ConfirmModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setDeletingList(null);
                }}
                onConfirm={handleDeleteList}
                title="Supprimer la liste ?"
                message={`Êtes-vous sûr de vouloir supprimer "${deletingList?.name}" ? Cette action supprimera également toutes les sociétés et contacts associés.`}
                confirmText="Supprimer"
                variant="danger"
                isLoading={isDeleting}
            />

        </div>
    );
}
