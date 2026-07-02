"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui";
import {
    Mail,
    Loader2,
    Send,
    Search,
    Filter,
    X,
    Eye,
    MousePointer,
    ChevronLeft,
    ChevronRight,
    ArrowUpDown,
    MailOpen,
    MousePointerClick,
    Reply,
    Target,
    Download,
    RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReachInboxCampaignsPanel } from "@/components/email/ReachInboxCampaignsPanel";

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
    toAddresses: string[];
    sentAt: string | null;
    openCount: number;
    clickCount: number;
    firstOpenedAt: string | null;
    lastOpenedAt: string | null;
    status: string;
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        company: { id: string; name: string } | null;
    } | null;
    mission: { id: string; name: string } | null;
    template: { id: string; name: string } | null;
    sentBy: { id: string; name: string | null } | null;
}

interface EmailStats {
    totalSent: number;
    totalOpened: number;
    totalClicked: number;
    totalReplied: number;
    totalBounced: number;
    openRate: number;
    clickRate: number;
    replyRate: number;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
}

// ============================================
// HELPERS
// ============================================

function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }: { status: string }) {
    const cfg: Record<string, { label: string; className: string }> = {
        SENT: { label: "Envoyé", className: "bg-slate-100 text-slate-700 border-slate-200" },
        DELIVERED: { label: "Délivré", className: "bg-blue-50 text-blue-700 border-blue-200" },
        OPENED: { label: "Ouvert", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
        CLICKED: { label: "Cliqué", className: "bg-cyan-50 text-cyan-700 border-cyan-200" },
        REPLIED: { label: "Répondu", className: "bg-violet-50 text-violet-700 border-violet-200" },
        BOUNCED: { label: "Rebond", className: "bg-amber-50 text-amber-700 border-amber-200" },
        FAILED: { label: "Échoué", className: "bg-red-50 text-red-700 border-red-200" },
    };
    const c = cfg[status] || { label: status, className: "bg-slate-100 text-slate-700 border-slate-200" };
    return (
        <span className={cn("inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold border", c.className)}>
            {c.label}
        </span>
    );
}

// ============================================
// STAT CARD
// ============================================

function StatCard({ label, value, subValue, icon: Icon, color }: {
    label: string;
    value: string | number;
    subValue?: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
}) {
    const colorMap: Record<string, { bg: string; icon: string; value: string; border: string }> = {
        violet: { bg: "bg-violet-50", icon: "bg-violet-100 text-violet-600", value: "text-violet-700", border: "border-violet-100" },
        emerald: { bg: "bg-emerald-50", icon: "bg-emerald-100 text-emerald-600", value: "text-emerald-700", border: "border-emerald-100" },
        blue: { bg: "bg-blue-50", icon: "bg-blue-100 text-blue-600", value: "text-blue-700", border: "border-blue-100" },
        purple: { bg: "bg-purple-50", icon: "bg-purple-100 text-purple-600", value: "text-purple-700", border: "border-purple-100" },
    };
    const c = colorMap[color] || colorMap.violet;
    return (
        <div className={cn("relative overflow-hidden rounded-2xl border p-5 bg-white transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5", c.border)}>
            <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                    <p className="text-[12px] font-medium text-[#6B7194] tracking-wide">{label}</p>
                    <div className="flex items-baseline gap-2">
                        <p className={cn("text-2xl font-extrabold tracking-tight", c.value)}>{value}</p>
                        {subValue && <span className="text-sm font-medium text-[#A0A3BD]">{subValue}</span>}
                    </div>
                </div>
                <div className={cn("rounded-xl p-2.5", c.icon)}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
            <div className={cn("absolute bottom-0 left-0 right-0 h-1 opacity-50", c.bg)} />
        </div>
    );
}

// ============================================
// CLIENT PORTAL EMAIL PAGE
// ============================================

export default function ClientPortalEmailPage() {
    const toast = useToast();
    const [emails, setEmails] = useState<SentEmail[]>([]);
    const [missions, setMissions] = useState<MissionOption[]>([]);
    const [stats, setStats] = useState<EmailStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Filters
    const [missionFilter, setMissionFilter] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [hasOpenedFilter, setHasOpenedFilter] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [showFilters, setShowFilters] = useState(false);

    // Sorting
    const [sortBy, setSortBy] = useState("sentAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // Pagination
    const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0, hasMore: false });

    // Debounce
    useEffect(() => {
        const t = setTimeout(() => setSearchQuery(debouncedSearch), 400);
        return () => clearTimeout(t);
    }, [debouncedSearch]);

    // Fetch client missions for filter
    useEffect(() => {
        fetch("/api/client/missions?limit=200")
            .then((r) => r.json())
            .then((j) => {
                if (j.success && Array.isArray(j.data)) {
                    setMissions(j.data.map((m: { id: string; name: string }) => ({ id: m.id, name: m.name })));
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
        if (searchQuery) params.set("search", searchQuery);
        if (statusFilter) params.set("status", statusFilter);
        if (hasOpenedFilter) params.set("hasOpened", hasOpenedFilter);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        try {
            const res = await fetch(`/api/client/sent-emails?${params}`);
            const json = await res.json();
            if (json.success) {
                setEmails(json.data.emails || []);
                if (json.data.pagination) setPagination((p) => ({ ...p, ...json.data.pagination }));
                if (json.data.stats) setStats(json.data.stats);
            } else {
                setEmails([]);
                toast.error("Erreur", "Impossible de charger les emails envoyés");
            }
        } catch {
            setEmails([]);
            toast.error("Erreur", "Impossible de charger les emails envoyés");
        } finally {
            setIsLoading(false);
        }
    }, [pagination.page, pagination.limit, sortBy, sortOrder, missionFilter, searchQuery, statusFilter, hasOpenedFilter, dateFrom, dateTo, toast]);

    useEffect(() => {
        fetchEmails();
    }, [fetchEmails]);

    const clearFilters = () => {
        setMissionFilter(""); setDebouncedSearch(""); setSearchQuery("");
        setStatusFilter(""); setHasOpenedFilter("");
        setDateFrom(""); setDateTo("");
        setPagination((p) => ({ ...p, page: 1 }));
    };

    const hasActiveFilters = missionFilter || searchQuery || statusFilter || hasOpenedFilter || dateFrom || dateTo;

    const handleSort = (col: string) => {
        if (sortBy === col) setSortOrder((p) => (p === "asc" ? "desc" : "asc"));
        else { setSortBy(col); setSortOrder("desc"); }
        setPagination((p) => ({ ...p, page: 1 }));
    };

    const handleExport = () => {
        const params = new URLSearchParams();
        if (missionFilter) params.set("missionId", missionFilter);
        if (statusFilter) params.set("status", statusFilter);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        params.set("limit", "5000");
        window.open(`/api/client/sent-emails?${params}`, "_blank");
    };

    const SortHeader = ({ col, label }: { col: string; label: string }) => (
        <button
            onClick={() => handleSort(col)}
            className={cn("inline-flex items-center gap-1 text-left font-semibold text-[11px] uppercase tracking-wider", sortBy === col ? "text-[#7C5CFC]" : "text-[#6B7194] hover:text-[#12122A]")}
        >
            {label}
            <ArrowUpDown className="w-3 h-3" />
        </button>
    );

    return (
        <div className="min-h-full bg-[#FAF9F6] p-4 md:p-6 space-y-6" style={{ fontFamily: "var(--cp-font, 'DM Sans', 'Inter', system-ui, sans-serif)" }}>

            {/* Header */}
            <div className="flex items-start justify-between gap-4" style={{ animation: "dashFadeUp 0.4s ease both" }}>
                <div>
                    <h1 className="text-2xl md:text-[28px] font-bold text-[#12122A] tracking-tight leading-tight">
                        Mes <span className="gradient-text">emails envoyés</span>
                    </h1>
                    <p className="text-sm text-[#6B7194] mt-1.5 max-w-xl">
                        Retrouvez ici les emails envoyés en votre nom par l&apos;équipe, avec les statistiques d&apos;ouverture et de clics.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExport}
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#6B7194] bg-white border border-[#E8EBF0] rounded-xl hover:bg-[#F4F6F9] transition-all"
                    >
                        <Download className="w-4 h-4" />
                        Exporter
                    </button>
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#7C5CFC] to-[#A78BFA] flex items-center justify-center shadow-lg shadow-[#7C5CFC]/25 shrink-0">
                        <Mail className="w-6 h-6 text-white" />
                    </div>
                </div>
            </div>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" style={{ animation: "dashFadeUp 0.4s ease both", animationDelay: "40ms" }}>
                    <StatCard label="Emails envoyés" value={stats.totalSent} icon={Mail} color="violet" />
                    <StatCard label="Ouverts" value={stats.totalOpened} subValue={`${stats.openRate}%`} icon={MailOpen} color="emerald" />
                    <StatCard label="Cliqués" value={stats.totalClicked} subValue={`${stats.clickRate}%`} icon={MousePointerClick} color="blue" />
                    <StatCard label="Répondus" value={stats.totalReplied} subValue={`${stats.replyRate}%`} icon={Reply} color="purple" />
                </div>
            )}

            {/* Campagnes ReachInbox liées à ce client */}
            <div style={{ animation: "dashFadeUp 0.4s ease both", animationDelay: "60ms" }}>
                <ReachInboxCampaignsPanel variant="client" />
            </div>

            {/* Search & Filters */}
            <div className="premium-card p-4 space-y-3" style={{ animation: "dashFadeUp 0.4s ease both", animationDelay: "80ms" }}>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0A3BD]" />
                        <input
                            type="text"
                            placeholder="Rechercher par sujet, destinataire..."
                            value={debouncedSearch}
                            onChange={(e) => setDebouncedSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#F8F9FC] border border-[#E8EBF0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/20 focus:border-[#7C5CFC] placeholder:text-[#A0A3BD] transition-all"
                        />
                    </div>

                    {missions.length > 0 && (
                        <div className="relative">
                            <select
                                value={missionFilter}
                                onChange={(e) => { setMissionFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
                                className="appearance-none pl-4 pr-10 py-2.5 border border-[#E8EBF0] rounded-xl text-sm bg-[#F8F9FC] focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/20 min-w-[180px]"
                            >
                                <option value="">Toutes les missions</option>
                                {missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                            <Target className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0A3BD] pointer-events-none" />
                        </div>
                    )}

                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn("inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium rounded-xl border transition-all", showFilters ? "bg-[#7C5CFC]/10 text-[#7C5CFC] border-[#7C5CFC]/30" : "bg-[#F8F9FC] text-[#6B7194] border-[#E8EBF0] hover:bg-[#F4F6F9]")}
                    >
                        <Filter className="w-4 h-4" />
                        Filtres
                        {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-[#7C5CFC]" />}
                    </button>

                    {hasActiveFilters && (
                        <button onClick={clearFilters} className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-all">
                            <X className="w-3.5 h-3.5" /> Réinitialiser
                        </button>
                    )}
                </div>

                {showFilters && (
                    <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#E8EBF0]">
                        <div>
                            <label className="block text-[11px] font-medium text-[#A0A3BD] uppercase tracking-wider mb-1">Statut</label>
                            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="appearance-none px-3 py-2 border border-[#E8EBF0] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/20 min-w-[140px]">
                                <option value="">Tous</option>
                                <option value="SENT">Envoyé</option>
                                <option value="OPENED">Ouvert</option>
                                <option value="CLICKED">Cliqué</option>
                                <option value="REPLIED">Répondu</option>
                                <option value="BOUNCED">Rebond</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-[#A0A3BD] uppercase tracking-wider mb-1">Ouverture</label>
                            <select value={hasOpenedFilter} onChange={(e) => { setHasOpenedFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="appearance-none px-3 py-2 border border-[#E8EBF0] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/20 min-w-[130px]">
                                <option value="">Tous</option>
                                <option value="true">Ouverts</option>
                                <option value="false">Non ouverts</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-[#A0A3BD] uppercase tracking-wider mb-1">Du</label>
                            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="px-3 py-2 border border-[#E8EBF0] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/20" />
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-[#A0A3BD] uppercase tracking-wider mb-1">Au</label>
                            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} className="px-3 py-2 border border-[#E8EBF0] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/20" />
                        </div>
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="premium-card overflow-hidden" style={{ animation: "dashFadeUp 0.4s ease both", animationDelay: "120ms" }}>
                <div className="flex items-center gap-2.5 px-6 pt-5 pb-4 border-b border-[#E8EBF0]">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C5CFC] to-[#A78BFA] flex items-center justify-center shadow-sm shadow-[#7C5CFC]/20">
                        <Send className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-[#12122A] uppercase tracking-wider">Emails envoyés</h2>
                        <p className="text-[11px] text-[#6B7194] mt-0.5">{pagination.total} email{pagination.total > 1 ? "s" : ""} au total</p>
                    </div>
                </div>

                <div className="p-6">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 className="w-8 h-8 text-[#7C5CFC] animate-spin" />
                            <p className="text-xs text-[#6B7194]">Chargement des emails…</p>
                        </div>
                    ) : emails.length === 0 ? (
                        <div className="text-center py-14">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F4F6F9] to-[#E8EBF0] flex items-center justify-center mx-auto mb-4">
                                <Send className="w-7 h-7 text-[#A0A3BD]" />
                            </div>
                            <p className="text-sm font-semibold text-[#12122A]">
                                {hasActiveFilters ? "Aucun résultat" : "Aucun email envoyé"}
                            </p>
                            <p className="text-xs text-[#6B7194] mt-1 max-w-[280px] mx-auto">
                                {hasActiveFilters ? "Modifiez vos filtres." : "Les emails envoyés par l'équipe apparaîtront ici."}
                            </p>
                            {hasActiveFilters && (
                                <button onClick={clearFilters} className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#7C5CFC] bg-[#7C5CFC]/10 rounded-xl hover:bg-[#7C5CFC]/20 transition-all">
                                    <RotateCcw className="w-4 h-4" /> Réinitialiser
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto -mx-2 sm:mx-0 rounded-xl border border-[#E8EBF0] overflow-hidden">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gradient-to-r from-[#F8F9FC] to-[#F4F6F9]">
                                            <th className="text-left py-3.5 px-4"><SortHeader col="subject" label="Destinataire / Objet" /></th>
                                            <th className="text-left py-3.5 px-4"><span className="text-[11px] font-semibold text-[#6B7194] uppercase tracking-wider">Mission</span></th>
                                            <th className="text-left py-3.5 px-4"><SortHeader col="status" label="Statut" /></th>
                                            <th className="text-left py-3.5 px-4"><SortHeader col="sentAt" label="Date" /></th>
                                            <th className="text-center py-3.5 px-4"><SortHeader col="openCount" label="Ouv." /></th>
                                            <th className="text-center py-3.5 px-4"><SortHeader col="clickCount" label="Clic" /></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {emails.map((e, idx) => (
                                            <>
                                                <tr
                                                    key={e.id}
                                                    className={cn("border-b border-[#F0F1F5] last:border-0 transition-colors duration-150 cursor-pointer", idx % 2 === 0 ? "bg-white" : "bg-[#FAFBFC]/50", "hover:bg-[#7C5CFC]/5")}
                                                    onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                                                >
                                                    <td className="py-3.5 px-4">
                                                        <div>
                                                            <p className="text-sm font-semibold text-[#12122A] truncate max-w-[220px]">
                                                                {e.contact ? [e.contact.firstName, e.contact.lastName].filter(Boolean).join(" ") || e.contact.email || e.toAddresses[0] : e.toAddresses[0] || "—"}
                                                            </p>
                                                            {e.contact?.company && (
                                                                <p className="text-xs text-[#A0A3BD] truncate">{e.contact.company.name}</p>
                                                            )}
                                                            <p className="text-xs text-[#6B7194] truncate max-w-[240px] mt-0.5">{e.subject || "—"}</p>
                                                        </div>
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        {e.mission ? (
                                                            <span className="inline-flex items-center gap-1.5 text-xs text-[#6B7194] bg-[#F4F6F9] px-2.5 py-1 rounded-lg border border-[#E8EBF0]">
                                                                <Target className="w-3 h-3 text-[#A0A3BD]" />
                                                                <span className="truncate max-w-[120px]">{e.mission.name}</span>
                                                            </span>
                                                        ) : <span className="text-xs text-[#A0A3BD]">—</span>}
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        <StatusBadge status={e.status} />
                                                    </td>
                                                    <td className="py-3.5 px-4 whitespace-nowrap">
                                                        <span className="text-xs text-[#8B8DAF] font-medium">{formatDate(e.sentAt)}</span>
                                                    </td>
                                                    <td className="py-3.5 px-4 text-center">
                                                        {e.openCount > 0 ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title={e.firstOpenedAt ? `Premier: ${formatDate(e.firstOpenedAt)}` : undefined}>
                                                                <Eye className="w-3 h-3" />{e.openCount}
                                                            </span>
                                                        ) : <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#F4F6F9] text-[#A0A3BD] border border-[#E8EBF0]">—</span>}
                                                    </td>
                                                    <td className="py-3.5 px-4 text-center">
                                                        {e.clickCount > 0 ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                                                <MousePointer className="w-3 h-3" />{e.clickCount}
                                                            </span>
                                                        ) : <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#F4F6F9] text-[#A0A3BD] border border-[#E8EBF0]">—</span>}
                                                    </td>
                                                </tr>
                                                {expandedId === e.id && (
                                                    <tr key={`${e.id}-expanded`} className="bg-[#F8F9FC]">
                                                        <td colSpan={6} className="px-8 py-4">
                                                            <div className="bg-white border border-[#E8EBF0] rounded-xl p-4 max-w-2xl">
                                                                <div className="flex items-center gap-2 mb-3">
                                                                    <Send className="w-4 h-4 text-[#7C5CFC]" />
                                                                    <span className="text-sm font-semibold text-[#12122A]">Détails de l&apos;email</span>
                                                                    {e.template && (
                                                                        <span className="ml-2 text-xs text-[#7C5CFC] bg-[#7C5CFC]/10 px-2 py-0.5 rounded-full border border-[#7C5CFC]/20">
                                                                            {e.template.name}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-3 text-xs text-[#6B7194]">
                                                                    <div><strong>Objet :</strong> {e.subject || "Sans sujet"}</div>
                                                                    <div><strong>Envoyé le :</strong> {formatDate(e.sentAt)}</div>
                                                                    {e.sentBy && <div><strong>Envoyé par :</strong> {e.sentBy.name || "—"}</div>}
                                                                    {e.openCount > 0 && e.firstOpenedAt && (
                                                                        <div className="text-emerald-600"><strong>Premier ouverture :</strong> {formatDate(e.firstOpenedAt)}</div>
                                                                    )}
                                                                    {e.openCount > 1 && e.lastOpenedAt && (
                                                                        <div className="text-emerald-600"><strong>Dernière ouverture :</strong> {formatDate(e.lastOpenedAt)}</div>
                                                                    )}
                                                                </div>
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
                            <div className="flex items-center justify-between mt-4">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-[#6B7194]">
                                        {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} sur {pagination.total}
                                    </span>
                                    <select
                                        value={pagination.limit}
                                        onChange={(e) => setPagination((p) => ({ ...p, limit: parseInt(e.target.value), page: 1 }))}
                                        className="text-xs border border-[#E8EBF0] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#7C5CFC]/20"
                                    >
                                        <option value="10">10 / page</option>
                                        <option value="25">25 / page</option>
                                        <option value="50">50 / page</option>
                                        <option value="100">100 / page</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))} disabled={pagination.page <= 1} className="p-2 rounded-lg text-[#6B7194] hover:bg-[#F4F6F9] hover:text-[#12122A] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                        const start = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
                                        const pageNum = start + i;
                                        if (pageNum > pagination.totalPages) return null;
                                        return (
                                            <button key={pageNum} onClick={() => setPagination((p) => ({ ...p, page: pageNum }))} className={cn("w-9 h-9 rounded-lg text-xs font-medium transition-all", pageNum === pagination.page ? "bg-[#7C5CFC] text-white shadow-sm shadow-[#7C5CFC]/30" : "text-[#6B7194] hover:bg-[#F4F6F9]")}>
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                    <button onClick={() => setPagination((p) => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))} disabled={pagination.page >= pagination.totalPages} className="p-2 rounded-lg text-[#6B7194] hover:bg-[#F4F6F9] hover:text-[#12122A] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <style jsx global>{`
                @keyframes dashFadeUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: none; }
                }
            `}</style>
        </div>
    );
}
