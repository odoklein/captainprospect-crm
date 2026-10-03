"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
    Send,
    Loader2,
    Mail,
    Building2,
    Target,
    Eye,
    MousePointer,
    Search,
    Calendar,
    ArrowUpDown,
    ChevronLeft,
    ChevronRight,
    Download,
    Trash2,
    RotateCcw,
    TrendingUp,
    MailOpen,
    MousePointerClick,
    Reply,
    AlertTriangle,
    Filter,
    X,
    CheckSquare,
    BarChart3,
} from "lucide-react";
import Link from "next/link";

// ============================================
// TYPES
// ============================================

interface MissionOption {
    id: string;
    name: string;
}

interface SentEmail {
    id: string;
    subject: string;
    status?: string;
    sentAt: string | null;
    openCount: number;
    clickCount: number;
    firstOpenedAt: string | null;
    lastOpenedAt: string | null;
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        company: { id: string; name: string };
    } | null;
    mission: { id: string; name: string } | null;
    template: { id: string; name: string } | null;
}

interface EmailStats {
    totalSent: number;
    totalOpened: number;
    totalClicked: number;
    totalBounced: number;
    totalReplied: number;
    totalFailed: number;
    openRate: number;
    clickRate: number;
    replyRate: number;
    bounceRate: number;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

// ============================================
// STAT CARD COMPONENT
// ============================================

function StatCard({
    label,
    value,
    subValue,
    icon: Icon,
    color,
    trend,
}: {
    label: string;
    value: string | number;
    subValue?: string;
    icon: React.ComponentType<{ className?: string }>;
    color: "indigo" | "emerald" | "blue" | "amber" | "red" | "violet";
    trend?: "up" | "down" | "neutral";
}) {
    const colorMap = {
        indigo: {
            bg: "bg-primary-50",
            icon: "bg-primary-100 text-primary-600",
            value: "text-primary-700",
            border: "border-primary-100",
        },
        emerald: {
            bg: "bg-emerald-50",
            icon: "bg-emerald-100 text-emerald-600",
            value: "text-emerald-700",
            border: "border-emerald-100",
        },
        blue: {
            bg: "bg-blue-50",
            icon: "bg-blue-100 text-blue-600",
            value: "text-blue-700",
            border: "border-blue-100",
        },
        amber: {
            bg: "bg-amber-50",
            icon: "bg-amber-100 text-amber-600",
            value: "text-amber-700",
            border: "border-amber-100",
        },
        red: {
            bg: "bg-red-50",
            icon: "bg-red-100 text-red-600",
            value: "text-red-700",
            border: "border-red-100",
        },
        violet: {
            bg: "bg-accent-50",
            icon: "bg-accent-100 text-accent-600",
            value: "text-accent-700",
            border: "border-accent-100",
        },
    };

    const c = colorMap[color];

    return (
        <div className={cn(
            "relative overflow-hidden rounded-2xl border p-5 transition-all duration-300",
            "bg-white hover:shadow-md",
            c.border
        )}>
            <div className="flex items-start justify-between">
                <div className="space-y-2">
                    <p className="text-[13px] font-medium text-slate-500 tracking-wide">{label}</p>
                    <div className="flex items-baseline gap-2">
                        <p className={cn("text-3xl font-extrabold tracking-tight", c.value)}>{value}</p>
                        {subValue && (
                            <span className="text-sm font-medium text-slate-400">{subValue}</span>
                        )}
                    </div>
                </div>
                <div className={cn("rounded-xl p-2.5", c.icon)}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
            {/* Decorative gradient line at bottom */}
            <div className={cn("absolute bottom-0 left-0 right-0 h-1 opacity-60", c.bg)} />
        </div>
    );
}

// ============================================
// STATUS BADGE
// ============================================

function StatusBadge({ status }: { status?: string }) {
    const statusConfig: Record<string, { label: string; className: string }> = {
        SENT: { label: "Envoyé", className: "bg-blue-50 text-blue-700 border-blue-200" },
        DELIVERED: { label: "Délivré", className: "bg-primary-50 text-primary-700 border-primary-200" },
        OPENED: { label: "Ouvert", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
        CLICKED: { label: "Cliqué", className: "bg-cyan-50 text-cyan-700 border-cyan-200" },
        REPLIED: { label: "Répondu", className: "bg-accent-50 text-accent-700 border-accent-200" },
        BOUNCED: { label: "Rebond", className: "bg-amber-50 text-amber-700 border-amber-200" },
        FAILED: { label: "Échoué", className: "bg-red-50 text-red-700 border-red-200" },
    };

    const config = statusConfig[status || ""] || {
        label: status || "—",
        className: "bg-slate-50 text-slate-600 border-slate-200",
    };

    return (
        <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
            config.className
        )}>
            {config.label}
        </span>
    );
}

// ============================================
// SDR MISSION EMAILS SENT PAGE
// ============================================

export default function SDRMissionEmailsSentPage() {
    const [emails, setEmails] = useState<SentEmail[]>([]);
    const [missions, setMissions] = useState<MissionOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState<EmailStats | null>(null);
    const [isBatchLoading, setIsBatchLoading] = useState(false);
    const [batchMessage, setBatchMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Filters
    const [missionFilter, setMissionFilter] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [hasOpenedFilter, setHasOpenedFilter] = useState<string>("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    // Sorting
    const [sortBy, setSortBy] = useState("sentAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Pagination
    const [pagination, setPagination] = useState<Pagination>({
        page: 1, limit: 25, total: 0, totalPages: 0,
    });

    // Selection
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showFilters, setShowFilters] = useState(false);

    // Fetch missions
    useEffect(() => {
        fetch("/api/sdr/missions")
            .then((res) => res.json())
            .then((json) => {
                if (json.success && Array.isArray(json.data)) {
                    setMissions(json.data.map((m: { id: string; name: string }) => ({ id: m.id, name: m.name })));
                }
            })
            .catch((e) => console.error("Failed to fetch missions:", e));
    }, []);

    // Fetch emails
    const fetchEmails = useCallback(async () => {
        setIsLoading(true);
        const params = new URLSearchParams();
        params.set("page", String(pagination.page));
        params.set("limit", String(pagination.limit));
        params.set("sortBy", sortBy);
        params.set("sortOrder", sortOrder);
        params.set("includeStats", "true");

        if (missionFilter) params.set("missionId", missionFilter);
        if (searchQuery) params.set("search", searchQuery);
        if (statusFilter) params.set("status", statusFilter);
        if (hasOpenedFilter) params.set("hasOpened", hasOpenedFilter);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        try {
            const res = await fetch(`/api/sdr/emails/sent?${params}`);
            const json = await res.json();
            if (json.success) {
                setEmails(json.data);
                if (json.pagination) {
                    setPagination((prev) => ({ ...prev, ...json.pagination }));
                }
                if (json.stats) {
                    setStats(json.stats);
                }
            }
        } catch (e) {
            console.error("Failed to fetch sent emails:", e);
        } finally {
            setIsLoading(false);
        }
    }, [pagination.page, pagination.limit, sortBy, sortOrder, missionFilter, searchQuery, statusFilter, hasOpenedFilter, dateFrom, dateTo]);

    useEffect(() => {
        fetchEmails();
    }, [fetchEmails]);

    // Debounced search
    const [debouncedSearch, setDebouncedSearch] = useState("");
    useEffect(() => {
        const timer = setTimeout(() => setSearchQuery(debouncedSearch), 400);
        return () => clearTimeout(timer);
    }, [debouncedSearch]);

    // Helpers
    const formatDate = (d: string | null) => {
        if (!d) return "—";
        return new Date(d).toLocaleDateString("fr-FR", {
            day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    };

    const contactName = (e: SentEmail) => {
        if (!e.contact) return "—";
        const first = e.contact.firstName ?? "";
        const last = e.contact.lastName ?? "";
        return [first, last].filter(Boolean).join(" ") || e.contact.email || "—";
    };

    const companyName = (e: SentEmail) => e.contact?.company?.name ?? "—";

    const handleSort = (col: string) => {
        if (sortBy === col) {
            setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortBy(col);
            setSortOrder("desc");
        }
        setPagination((prev) => ({ ...prev, page: 1 }));
    };

    const toggleSelect = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selected.size === emails.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(emails.map((e) => e.id)));
        }
    };

    const clearFilters = () => {
        setMissionFilter("");
        setDebouncedSearch("");
        setSearchQuery("");
        setStatusFilter("");
        setHasOpenedFilter("");
        setDateFrom("");
        setDateTo("");
        setPagination((prev) => ({ ...prev, page: 1 }));
    };

    const hasActiveFilters = missionFilter || searchQuery || statusFilter || hasOpenedFilter || dateFrom || dateTo;

    const handleBatchAction = async (action: "delete" | "resend") => {
        if (selected.size === 0) return;
        const label = action === "delete" ? "supprimer" : "renvoyer";
        if (!confirm(`Voulez-vous ${label} ${selected.size} email(s) sélectionné(s) ?`)) return;

        setIsBatchLoading(true);
        setBatchMessage(null);
        try {
            const res = await fetch("/api/sdr/emails/sent/batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, emailIds: Array.from(selected) }),
            });
            const json = await res.json();
            if (json.success) {
                setBatchMessage({ type: "success", text: json.message || `${json.data?.affected || 0} email(s) traité(s)` });
                setSelected(new Set());
                fetchEmails();
            } else {
                setBatchMessage({ type: "error", text: json.error || "Erreur lors de l'opération" });
            }
        } catch {
            setBatchMessage({ type: "error", text: "Erreur de connexion" });
        } finally {
            setIsBatchLoading(false);
            setTimeout(() => setBatchMessage(null), 4000);
        }
    };

    const handleExport = async () => {
        const params = new URLSearchParams();
        if (missionFilter) params.set("missionId", missionFilter);
        if (statusFilter) params.set("status", statusFilter);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        window.open(`/api/sdr/emails/sent/export?${params}`, "_blank");
    };

    const SortHeader = ({ col, label }: { col: string; label: string }) => (
        <button
            onClick={() => handleSort(col)}
            className={cn(
                "inline-flex items-center gap-1 text-left font-semibold text-xs uppercase tracking-wider",
                sortBy === col ? "text-primary-600" : "text-slate-400 hover:text-slate-600"
            )}
        >
            {label}
            <ArrowUpDown className="w-3 h-3" />
        </button>
    );

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Page Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                        Emails envoyés
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Suivi et analyse de vos emails sortants avec statistiques en temps réel
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExport}
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all"
                    >
                        <Download className="w-4 h-4" />
                        Exporter
                    </button>
                    <Link
                        href="/sdr/action"
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-500 shadow-sm transition-colors"
                    >
                        <Send className="w-4 h-4" />
                        Nouvelle action
                    </Link>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <StatCard
                        label="Envoyés"
                        value={stats.totalSent}
                        icon={Mail}
                        color="indigo"
                    />
                    <StatCard
                        label="Ouverts"
                        value={stats.totalOpened}
                        subValue={`${stats.openRate}%`}
                        icon={MailOpen}
                        color="emerald"
                    />
                    <StatCard
                        label="Cliqués"
                        value={stats.totalClicked}
                        subValue={`${stats.clickRate}%`}
                        icon={MousePointerClick}
                        color="blue"
                    />
                    <StatCard
                        label="Répondus"
                        value={stats.totalReplied}
                        subValue={`${stats.replyRate}%`}
                        icon={Reply}
                        color="violet"
                    />
                    <StatCard
                        label="Rebonds"
                        value={stats.totalBounced}
                        subValue={`${stats.bounceRate}%`}
                        icon={AlertTriangle}
                        color="amber"
                    />
                    <StatCard
                        label="Échoués"
                        value={stats.totalFailed}
                        icon={X}
                        color="red"
                    />
                </div>
            )}

            {/* Search & Filters Bar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Rechercher par contact, sujet, société..."
                            value={debouncedSearch}
                            onChange={(e) => setDebouncedSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 placeholder:text-slate-400 transition-all"
                        />
                    </div>

                    {/* Mission Filter */}
                    <div className="relative">
                        <select
                            value={missionFilter}
                            onChange={(e) => { setMissionFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                            className="appearance-none pl-4 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 min-w-[180px] transition-all"
                        >
                            <option value="">Toutes les missions</option>
                            {missions.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                        <Target className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>

                    {/* Toggle filters */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn(
                            "inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium rounded-xl border transition-all",
                            showFilters
                                ? "bg-primary-50 text-primary-700 border-primary-200"
                                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        )}
                    >
                        <Filter className="w-4 h-4" />
                        Filtres
                        {hasActiveFilters && (
                            <span className="w-2 h-2 rounded-full bg-primary-500" />
                        )}
                    </button>

                    {/* Clear filters */}
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        >
                            <X className="w-3.5 h-3.5" />
                            Réinitialiser
                        </button>
                    )}
                </div>

                {/* Expanded Filters */}
                {showFilters && (
                    <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 animate-fade-in">
                        <div>
                            <label className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">Statut</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                                className="appearance-none px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 min-w-[140px]"
                            >
                                <option value="">Tous</option>
                                <option value="SENT">Envoyé</option>
                                <option value="DELIVERED">Délivré</option>
                                <option value="OPENED">Ouvert</option>
                                <option value="CLICKED">Cliqué</option>
                                <option value="REPLIED">Répondu</option>
                                <option value="BOUNCED">Rebond</option>
                                <option value="FAILED">Échoué</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">Ouverture</label>
                            <select
                                value={hasOpenedFilter}
                                onChange={(e) => { setHasOpenedFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                                className="appearance-none px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 min-w-[140px]"
                            >
                                <option value="">Tous</option>
                                <option value="true">Ouverts</option>
                                <option value="false">Non ouverts</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">Du</label>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => { setDateFrom(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">Au</label>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => { setDateTo(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Batch Actions */}
            {batchMessage && (
                <div className={cn("flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium", batchMessage.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200")}>
                    {batchMessage.text}
                </div>
            )}

            {/* Batch Actions */}
            {selected.size > 0 && (
                <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-2xl px-5 py-3 animate-fade-in">
                    <div className="flex items-center gap-2.5">
                        <CheckSquare className="w-4.5 h-4.5 text-primary-600" />
                        <span className="text-sm font-semibold text-primary-900">
                            {selected.size} email{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handleBatchAction("delete")}
                            disabled={isBatchLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-all disabled:opacity-50"
                        >
                            {isBatchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            Supprimer
                        </button>
                        <button
                            onClick={() => handleBatchAction("resend")}
                            disabled={isBatchLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 bg-white border border-primary-200 rounded-lg hover:bg-primary-50 transition-all disabled:opacity-50"
                        >
                            {isBatchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                            Renvoyer
                        </button>
                        <button onClick={() => setSelected(new Set())} className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-white rounded-lg transition-all">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Main Content */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full border-2 border-slate-200" />
                        <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
                    </div>
                    <p className="mt-4 text-sm text-slate-500 font-medium">Chargement des emails...</p>
                </div>
            ) : emails.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-5">
                        <Mail className="w-8 h-8 text-primary-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">
                        {hasActiveFilters ? "Aucun résultat" : "Aucun email envoyé"}
                    </h3>
                    <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
                        {hasActiveFilters
                            ? "Essayez de modifier vos filtres pour trouver des résultats."
                            : "Les emails envoyés depuis vos missions apparaîtront ici avec les statistiques d'ouverture et de clics."}
                    </p>
                    {hasActiveFilters ? (
                        <button
                            onClick={clearFilters}
                            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-primary-600 bg-primary-50 rounded-xl hover:bg-primary-100 transition-all"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Réinitialiser les filtres
                        </button>
                    ) : (
                        <Link
                            href="/sdr/action"
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-500 shadow-sm transition-colors"
                        >
                            <Send className="w-4 h-4" />
                            Commencer une mission
                        </Link>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/80">
                                    <th className="py-3.5 px-4 w-10">
                                        <input
                                            type="checkbox"
                                            checked={selected.size === emails.length && emails.length > 0}
                                            onChange={toggleSelectAll}
                                            className="rounded-[4px] border-slate-300 text-primary-600 focus:ring-primary-500/20 w-4 h-4"
                                        />
                                    </th>
                                    <th className="text-left py-3.5 px-4">
                                        <SortHeader col="subject" label="Contact / Sujet" />
                                    </th>
                                    <th className="text-left py-3.5 px-4">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Mission</span>
                                    </th>
                                    <th className="text-left py-3.5 px-4">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Statut</span>
                                    </th>
                                    <th className="text-left py-3.5 px-4">
                                        <SortHeader col="sentAt" label="Date" />
                                    </th>
                                    <th className="text-center py-3.5 px-4">
                                        <SortHeader col="openCount" label="Ouvert" />
                                    </th>
                                    <th className="text-center py-3.5 px-4">
                                        <SortHeader col="clickCount" label="Clic" />
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {emails.map((e, idx) => (
                                    <tr
                                        key={e.id}
                                        className={cn(
                                            "group transition-colors",
                                            selected.has(e.id)
                                                ? "bg-primary-50/40"
                                                : "hover:bg-slate-50/80"
                                        )}
                                        style={{ animationDelay: `${idx * 20}ms` }}
                                    >
                                        <td className="py-3.5 px-4">
                                            <input
                                                type="checkbox"
                                                checked={selected.has(e.id)}
                                                onChange={() => toggleSelect(e.id)}
                                                className="rounded-[4px] border-slate-300 text-primary-600 focus:ring-primary-500/20 w-4 h-4"
                                            />
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <div className="min-w-[200px]">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                                        <span className="text-xs font-bold text-slate-500">
                                                            {(e.contact?.firstName?.[0] || e.contact?.email?.[0] || "?").toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-slate-900 text-[13px] truncate">
                                                            {contactName(e)}
                                                        </p>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                                                            <span className="text-xs text-slate-500 truncate">{companyName(e)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-slate-400 mt-1.5 truncate max-w-[280px]" title={e.subject}>
                                                    {e.subject || "Sans sujet"}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-4">
                                            {e.mission ? (
                                                <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                                                    <Target className="w-3 h-3 text-slate-400" />
                                                    <span className="truncate max-w-[120px]">{e.mission.name}</span>
                                                </span>
                                            ) : (
                                                <span className="text-xs text-slate-400">—</span>
                                            )}
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <StatusBadge status={e.status} />
                                        </td>
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            <span className="text-xs text-slate-500">{formatDate(e.sentAt)}</span>
                                        </td>
                                        <td className="py-3.5 px-4 text-center">
                                            {e.openCount > 0 ? (
                                                <span
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                    title={e.firstOpenedAt ? `Premier: ${formatDate(e.firstOpenedAt)}` : undefined}
                                                >
                                                    <Eye className="w-3 h-3" />
                                                    {e.openCount}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-50 text-slate-400 border border-slate-100">
                                                    —
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3.5 px-4 text-center">
                                            {e.clickCount > 0 ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                                    <MousePointer className="w-3 h-3" />
                                                    {e.clickCount}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-50 text-slate-400 border border-slate-100">
                                                    —
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50/50">
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500">
                                {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} sur {pagination.total}
                            </span>
                            <select
                                value={pagination.limit}
                                onChange={(e) => setPagination((p) => ({ ...p, limit: parseInt(e.target.value), page: 1 }))}
                                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                            >
                                <option value="10">10 / page</option>
                                <option value="25">25 / page</option>
                                <option value="50">50 / page</option>
                                <option value="100">100 / page</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                                disabled={pagination.page <= 1}
                                className="p-2 rounded-lg text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                const start = Math.max(1, Math.min(
                                    pagination.page - 2,
                                    pagination.totalPages - 4
                                ));
                                const pageNum = start + i;
                                if (pageNum > pagination.totalPages) return null;
                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => setPagination((p) => ({ ...p, page: pageNum }))}
                                        className={cn(
                                            "w-9 h-9 rounded-lg text-xs font-medium transition-all",
                                            pageNum === pagination.page
                                                ? "bg-primary-600 text-white shadow-sm"
                                                : "text-slate-500 hover:bg-white hover:text-slate-700"
                                        )}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                            <button
                                onClick={() => setPagination((p) => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                                disabled={pagination.page >= pagination.totalPages}
                                className="p-2 rounded-lg text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
