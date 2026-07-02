"use client";

import { useState, useEffect, useCallback } from "react";
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
    ArrowUpDown,
    ChevronLeft,
    ChevronRight,
    Download,
    Trash2,
    RotateCcw,
    MailOpen,
    MousePointerClick,
    Reply,
    AlertTriangle,
    Filter,
    X,
    CheckSquare,
    User,
} from "lucide-react";

// ============================================
// TYPES
// ============================================

interface FilterOption {
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
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        company: { id: string; name: string } | null;
    } | null;
    mission: {
        id: string;
        name: string;
        client: { id: string; name: string } | null;
    } | null;
    sentBy: { id: string; name: string | null; email: string } | null;
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
// STAT CARD
// ============================================

function StatCard({
    label,
    value,
    subValue,
    icon: Icon,
    color,
}: {
    label: string;
    value: string | number;
    subValue?: string;
    icon: React.ComponentType<{ className?: string }>;
    color: "indigo" | "emerald" | "blue" | "amber" | "red" | "violet";
}) {
    const colorMap = {
        indigo: { bg: "bg-[#E7EFE9]", icon: "bg-[#D9E5DD] text-[#2B5F3E]", value: "text-[#224A31]", border: "border-[#D9E5DD]" },
        emerald: { bg: "bg-emerald-50", icon: "bg-emerald-100 text-emerald-600", value: "text-emerald-700", border: "border-emerald-100" },
        blue: { bg: "bg-blue-50", icon: "bg-blue-100 text-blue-600", value: "text-blue-700", border: "border-blue-100" },
        amber: { bg: "bg-amber-50", icon: "bg-amber-100 text-amber-600", value: "text-amber-700", border: "border-amber-100" },
        red: { bg: "bg-red-50", icon: "bg-red-100 text-red-600", value: "text-red-700", border: "border-red-100" },
        violet: { bg: "bg-[#E7EFE9]", icon: "bg-[#D9E5DD] text-[#2B5F3E]", value: "text-[#224A31]", border: "border-violet-100" },
    };
    const c = colorMap[color];
    return (
        <div className={cn("relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 bg-white hover:shadow-lg hover:shadow-slate-200/50 hover:-translate-y-0.5", c.border)}>
            <div className="flex items-start justify-between">
                <div className="space-y-2">
                    <p className="text-[13px] font-medium text-slate-500 tracking-wide">{label}</p>
                    <div className="flex items-baseline gap-2">
                        <p className={cn("text-3xl font-extrabold tracking-tight", c.value)}>{value}</p>
                        {subValue && <span className="text-sm font-medium text-slate-400">{subValue}</span>}
                    </div>
                </div>
                <div className={cn("rounded-xl p-2.5", c.icon)}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
            <div className={cn("absolute bottom-0 left-0 right-0 h-1 opacity-60", c.bg)} />
        </div>
    );
}

// ============================================
// STATUS BADGE
// ============================================

function StatusBadge({ status }: { status?: string }) {
    const cfg: Record<string, { label: string; className: string }> = {
        SENT: { label: "Envoyé", className: "bg-blue-50 text-blue-700 border-blue-200" },
        DELIVERED: { label: "Délivré", className: "bg-[#E7EFE9] text-[#224A31] border-[#C4D6CB]" },
        OPENED: { label: "Ouvert", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
        CLICKED: { label: "Cliqué", className: "bg-cyan-50 text-cyan-700 border-cyan-200" },
        REPLIED: { label: "Répondu", className: "bg-[#E7EFE9] text-[#224A31] border-[#C4D6CB]" },
        BOUNCED: { label: "Rebond", className: "bg-amber-50 text-amber-700 border-amber-200" },
        FAILED: { label: "Échoué", className: "bg-red-50 text-red-700 border-red-200" },
    };
    const c = cfg[status || ""] || { label: status || "—", className: "bg-slate-50 text-slate-600 border-slate-200" };
    return (
        <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border", c.className)}>
            {c.label}
        </span>
    );
}

// ============================================
// MANAGER SENT EMAILS PAGE
// ============================================

export default function ManagerSentEmailsPage() {
    const [emails, setEmails] = useState<SentEmail[]>([]);
    const [missions, setMissions] = useState<FilterOption[]>([]);
    const [sdrs, setSdrs] = useState<FilterOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState<EmailStats | null>(null);
    const [isBatchLoading, setIsBatchLoading] = useState(false);
    const [batchMessage, setBatchMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Filters
    const [missionFilter, setMissionFilter] = useState("");
    const [sdrFilter, setSdrFilter] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [hasOpenedFilter, setHasOpenedFilter] = useState("");
    const [hasClickedFilter, setHasClickedFilter] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [showFilters, setShowFilters] = useState(false);

    // Sorting
    const [sortBy, setSortBy] = useState("sentAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Pagination
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });

    // Selection
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // Expand row
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => setSearchQuery(debouncedSearch), 400);
        return () => clearTimeout(t);
    }, [debouncedSearch]);

    // Load filter options
    useEffect(() => {
        fetch("/api/missions?limit=200")
            .then((r) => r.json())
            .then((j) => {
                if (j.success && Array.isArray(j.data)) {
                    setMissions(j.data.map((m: { id: string; name: string }) => ({ id: m.id, name: m.name })));
                }
            })
            .catch(console.error);

        fetch("/api/users?role=SDR&limit=200")
            .then((r) => r.json())
            .then((j) => {
                if (j.success && Array.isArray(j.data)) {
                    setSdrs(j.data.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name || u.id })));
                }
            })
            .catch(console.error);
    }, []);

    const fetchEmails = useCallback(async () => {
        setIsLoading(true);
        const params = new URLSearchParams();
        params.set("page", String(pagination.page));
        params.set("limit", String(pagination.limit));
        params.set("sortBy", sortBy);
        params.set("sortOrder", sortOrder);
        params.set("includeStats", "true");
        if (missionFilter) params.set("missionId", missionFilter);
        if (sdrFilter) params.set("sdrId", sdrFilter);
        if (searchQuery) params.set("search", searchQuery);
        if (statusFilter) params.set("status", statusFilter);
        if (hasOpenedFilter) params.set("hasOpened", hasOpenedFilter);
        if (hasClickedFilter) params.set("hasClicked", hasClickedFilter);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        try {
            const res = await fetch(`/api/manager/emails/sent?${params}`);
            const json = await res.json();
            if (json.success) {
                setEmails(json.data);
                if (json.pagination) setPagination((p) => ({ ...p, ...json.pagination }));
                if (json.stats) setStats(json.stats);
            }
        } catch (e) {
            console.error("Failed to fetch sent emails:", e);
        } finally {
            setIsLoading(false);
        }
    }, [pagination.page, pagination.limit, sortBy, sortOrder, missionFilter, sdrFilter, searchQuery, statusFilter, hasOpenedFilter, hasClickedFilter, dateFrom, dateTo]);

    useEffect(() => {
        fetchEmails();
    }, [fetchEmails]);

    const handleSort = (col: string) => {
        if (sortBy === col) setSortOrder((p) => (p === "asc" ? "desc" : "asc"));
        else { setSortBy(col); setSortOrder("desc"); }
        setPagination((p) => ({ ...p, page: 1 }));
    };

    const toggleSelect = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selected.size === emails.length) setSelected(new Set());
        else setSelected(new Set(emails.map((e) => e.id)));
    };

    const clearFilters = () => {
        setMissionFilter(""); setSdrFilter(""); setDebouncedSearch(""); setSearchQuery("");
        setStatusFilter(""); setHasOpenedFilter(""); setHasClickedFilter("");
        setDateFrom(""); setDateTo("");
        setPagination((p) => ({ ...p, page: 1 }));
    };

    const hasActiveFilters = missionFilter || sdrFilter || searchQuery || statusFilter || hasOpenedFilter || hasClickedFilter || dateFrom || dateTo;

    const handleBatchAction = async (action: "delete" | "resend") => {
        if (selected.size === 0) return;
        const label = action === "delete" ? "supprimer" : "renvoyer";
        if (!confirm(`Voulez-vous ${label} ${selected.size} email(s) sélectionné(s) ?`)) return;

        setIsBatchLoading(true);
        setBatchMessage(null);
        try {
            const res = await fetch("/api/manager/emails/sent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, emailIds: Array.from(selected) }),
            });
            const json = await res.json();
            if (json.success) {
                setBatchMessage({ type: "success", text: json.message });
                setSelected(new Set());
                fetchEmails();
            } else {
                setBatchMessage({ type: "error", text: json.error || "Erreur" });
            }
        } catch {
            setBatchMessage({ type: "error", text: "Erreur de connexion" });
        } finally {
            setIsBatchLoading(false);
            setTimeout(() => setBatchMessage(null), 4000);
        }
    };

    const handleExport = () => {
        const params = new URLSearchParams();
        if (missionFilter) params.set("missionId", missionFilter);
        if (sdrFilter) params.set("sdrId", sdrFilter);
        if (statusFilter) params.set("status", statusFilter);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        params.set("limit", "5000");
        window.open(`/api/manager/emails/sent?${params}&format=csv`, "_blank");
    };

    const formatDate = (d: string | null) => {
        if (!d) return "—";
        return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    const contactName = (e: SentEmail) => {
        if (!e.contact) return "—";
        return [e.contact.firstName, e.contact.lastName].filter(Boolean).join(" ") || e.contact.email || "—";
    };

    const SortHeader = ({ col, label }: { col: string; label: string }) => (
        <button
            onClick={() => handleSort(col)}
            className={cn("inline-flex items-center gap-1 text-left font-semibold text-xs uppercase tracking-wider", sortBy === col ? "text-[#2B5F3E]" : "text-slate-400 hover:text-slate-600")}
        >
            {label}
            <ArrowUpDown className="w-3 h-3" />
        </button>
    );

    return (
        <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Emails envoyés — Équipe</h1>
                    <p className="text-sm text-slate-500 mt-1">Suivi de tous les emails sortants de l&apos;équipe avec statistiques</p>
                </div>
                <button
                    onClick={handleExport}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all"
                >
                    <Download className="w-4 h-4" />
                    Exporter CSV
                </button>
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <StatCard label="Envoyés" value={stats.totalSent} icon={Mail} color="indigo" />
                    <StatCard label="Ouverts" value={stats.totalOpened} subValue={`${stats.openRate}%`} icon={MailOpen} color="emerald" />
                    <StatCard label="Cliqués" value={stats.totalClicked} subValue={`${stats.clickRate}%`} icon={MousePointerClick} color="blue" />
                    <StatCard label="Répondus" value={stats.totalReplied} subValue={`${stats.replyRate}%`} icon={Reply} color="violet" />
                    <StatCard label="Rebonds" value={stats.totalBounced} subValue={`${stats.bounceRate}%`} icon={AlertTriangle} color="amber" />
                    <StatCard label="Échoués" value={stats.totalFailed} icon={X} color="red" />
                </div>
            )}

            {/* Search & Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Rechercher contact, sujet, SDR..."
                            value={debouncedSearch}
                            onChange={(e) => setDebouncedSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2B5F3E]/20 focus:border-[#4E8B66] placeholder:text-slate-400 transition-all"
                        />
                    </div>

                    <div className="relative">
                        <select
                            value={missionFilter}
                            onChange={(e) => { setMissionFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                            className="appearance-none pl-4 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2B5F3E]/20 min-w-[180px] transition-all"
                        >
                            <option value="">Toutes les missions</option>
                            {missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        <Target className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>

                    <div className="relative">
                        <select
                            value={sdrFilter}
                            onChange={(e) => { setSdrFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                            className="appearance-none pl-4 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2B5F3E]/20 min-w-[160px] transition-all"
                        >
                            <option value="">Tous les SDRs</option>
                            {sdrs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>

                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn("inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium rounded-xl border transition-all", showFilters ? "bg-[#E7EFE9] text-[#224A31] border-[#C4D6CB]" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100")}
                    >
                        <Filter className="w-4 h-4" />
                        Filtres
                        {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-[#E7EFE9]0" />}
                    </button>

                    {hasActiveFilters && (
                        <button onClick={clearFilters} className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-all">
                            <X className="w-3.5 h-3.5" /> Réinitialiser
                        </button>
                    )}
                </div>

                {showFilters && (
                    <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
                        <div>
                            <label className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">Statut</label>
                            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="appearance-none px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2B5F3E]/20 min-w-[140px]">
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
                            <select value={hasOpenedFilter} onChange={(e) => { setHasOpenedFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="appearance-none px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2B5F3E]/20 min-w-[130px]">
                                <option value="">Tous</option>
                                <option value="true">Ouverts</option>
                                <option value="false">Non ouverts</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">Clic</label>
                            <select value={hasClickedFilter} onChange={(e) => { setHasClickedFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="appearance-none px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2B5F3E]/20 min-w-[130px]">
                                <option value="">Tous</option>
                                <option value="true">Avec clics</option>
                                <option value="false">Sans clic</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">Du</label>
                            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2B5F3E]/20" />
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">Au</label>
                            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2B5F3E]/20" />
                        </div>
                    </div>
                )}
            </div>

            {/* Batch message */}
            {batchMessage && (
                <div className={cn("flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium", batchMessage.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200")}>
                    {batchMessage.text}
                </div>
            )}

            {/* Batch Actions */}
            {selected.size > 0 && (
                <div className="flex items-center justify-between bg-[#E7EFE9] border border-[#C4D6CB] rounded-2xl px-5 py-3">
                    <div className="flex items-center gap-2.5">
                        <CheckSquare className="w-4 h-4 text-[#2B5F3E]" />
                        <span className="text-sm font-semibold text-[#16301F]">
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
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2B5F3E] bg-white border border-[#C4D6CB] rounded-lg hover:bg-[#E7EFE9] transition-all disabled:opacity-50"
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
                        <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-[#2B5F3E] border-t-transparent animate-spin" />
                    </div>
                    <p className="mt-4 text-sm text-slate-500 font-medium">Chargement des emails...</p>
                </div>
            ) : emails.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center mx-auto mb-5">
                        <Mail className="w-8 h-8 text-[#2B5F3E]" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">
                        {hasActiveFilters ? "Aucun résultat" : "Aucun email envoyé"}
                    </h3>
                    <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
                        {hasActiveFilters ? "Modifiez vos filtres pour trouver des résultats." : "Les emails envoyés par l'équipe apparaîtront ici."}
                    </p>
                    {hasActiveFilters && (
                        <button onClick={clearFilters} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#2B5F3E] bg-[#E7EFE9] rounded-xl hover:bg-[#D9E5DD] transition-all">
                            <RotateCcw className="w-4 h-4" />
                            Réinitialiser les filtres
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/80">
                                    <th className="py-3.5 px-4 w-10">
                                        <input type="checkbox" checked={selected.size === emails.length && emails.length > 0} onChange={toggleSelectAll} className="rounded-[4px] border-slate-300 text-[#2B5F3E] w-4 h-4" />
                                    </th>
                                    <th className="text-left py-3.5 px-4"><SortHeader col="subject" label="Contact / Sujet" /></th>
                                    <th className="text-left py-3.5 px-4"><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">SDR</span></th>
                                    <th className="text-left py-3.5 px-4"><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Mission</span></th>
                                    <th className="text-left py-3.5 px-4"><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Client</span></th>
                                    <th className="text-left py-3.5 px-4"><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Statut</span></th>
                                    <th className="text-left py-3.5 px-4"><SortHeader col="sentAt" label="Date" /></th>
                                    <th className="text-center py-3.5 px-4"><SortHeader col="openCount" label="Ouvert" /></th>
                                    <th className="text-center py-3.5 px-4"><SortHeader col="clickCount" label="Clic" /></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {emails.map((e) => (
                                    <>
                                        <tr
                                            key={e.id}
                                            className={cn("group transition-colors cursor-pointer", selected.has(e.id) ? "bg-[#E7EFE9]/40" : "hover:bg-slate-50/80")}
                                            onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                                        >
                                            <td className="py-3.5 px-4" onClick={(ev) => ev.stopPropagation()}>
                                                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} className="rounded-[4px] border-slate-300 text-[#2B5F3E] w-4 h-4" />
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="min-w-[200px]">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center shrink-0">
                                                            <span className="text-xs font-bold text-slate-500">
                                                                {(e.contact?.firstName?.[0] || e.contact?.email?.[0] || "?").toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-slate-900 text-[13px] truncate">{contactName(e)}</p>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                                                                <span className="text-xs text-slate-500 truncate">{e.contact?.company?.name || "—"}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-1.5 truncate max-w-[280px]" title={e.subject}>{e.subject || "Sans sujet"}</p>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                {e.sentBy ? (
                                                    <span className="text-xs text-slate-700 font-medium">{e.sentBy.name || e.sentBy.email}</span>
                                                ) : <span className="text-xs text-slate-400">—</span>}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                {e.mission ? (
                                                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                                                        <Target className="w-3 h-3 text-slate-400" />
                                                        <span className="truncate max-w-[110px]">{e.mission.name}</span>
                                                    </span>
                                                ) : <span className="text-xs text-slate-400">—</span>}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <span className="text-xs text-slate-600">{e.mission?.client?.name || "—"}</span>
                                            </td>
                                            <td className="py-3.5 px-4"><StatusBadge status={e.status} /></td>
                                            <td className="py-3.5 px-4 whitespace-nowrap">
                                                <span className="text-xs text-slate-500">{formatDate(e.sentAt)}</span>
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                {e.openCount > 0 ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title={e.firstOpenedAt ? `Premier: ${formatDate(e.firstOpenedAt)}` : undefined}>
                                                        <Eye className="w-3 h-3" />{e.openCount}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-50 text-slate-400 border border-slate-100">—</span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                {e.clickCount > 0 ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                                        <MousePointer className="w-3 h-3" />{e.clickCount}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-50 text-slate-400 border border-slate-100">—</span>
                                                )}
                                            </td>
                                        </tr>
                                        {/* Expanded row - email preview */}
                                        {expandedId === e.id && (
                                            <tr key={`${e.id}-expanded`} className="bg-slate-50/80">
                                                <td colSpan={9} className="px-8 py-4">
                                                    <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-2xl">
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <Send className="w-4 h-4 text-[#2B5F3E]" />
                                                            <span className="text-sm font-semibold text-slate-800">Aperçu de l&apos;email</span>
                                                            {e.template && (
                                                                <span className="ml-2 text-xs text-[#2B5F3E] bg-[#E7EFE9] px-2 py-0.5 rounded-full border border-[#D9E5DD]">
                                                                    Template : {e.template.name}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-500 mb-2"><strong>Objet :</strong> {e.subject || "Sans sujet"}</p>
                                                        <p className="text-xs text-slate-500 mb-2"><strong>Envoyé le :</strong> {formatDate(e.sentAt)}</p>
                                                        {e.openCount > 0 && e.firstOpenedAt && (
                                                            <p className="text-xs text-emerald-600 mb-2"><strong>Premier ouverture :</strong> {formatDate(e.firstOpenedAt)}</p>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </>
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
                                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#2B5F3E]/20"
                            >
                                <option value="10">10 / page</option>
                                <option value="25">25 / page</option>
                                <option value="50">50 / page</option>
                                <option value="100">100 / page</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))} disabled={pagination.page <= 1} className="p-2 rounded-lg text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                const start = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
                                const pageNum = start + i;
                                if (pageNum > pagination.totalPages) return null;
                                return (
                                    <button key={pageNum} onClick={() => setPagination((p) => ({ ...p, page: pageNum }))} className={cn("w-9 h-9 rounded-lg text-xs font-medium transition-all", pageNum === pagination.page ? "bg-[#2B5F3E] text-white shadow-sm shadow-indigo-200" : "text-slate-500 hover:bg-white hover:text-slate-700")}>
                                        {pageNum}
                                    </button>
                                );
                            })}
                            <button onClick={() => setPagination((p) => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))} disabled={pagination.page >= pagination.totalPages} className="p-2 rounded-lg text-slate-500 hover:bg-white hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
