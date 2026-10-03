"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui";
import { Loader2, PhoneCall, Search, X, Building2, Clock, Filter, ChevronDown, RefreshCw, CalendarCheck2, Timer, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";

interface CallItem {
    id: string;
    createdAt: string;
    callbackDate?: string | null;
    result: string;
    note?: string | null;
    duration?: number | null;
    company?: {
        name: string;
        industry?: string | null;
        country?: string | null;
    } | null;
    contact?: {
        firstName?: string | null;
        lastName?: string | null;
        title?: string | null;
        email?: string | null;
        phone?: string | null;
        company?: {
            name: string;
            industry?: string | null;
            country?: string | null;
        } | null;
    } | null;
    campaign?: {
        name?: string | null;
        mission?: { name?: string | null } | null;
    } | null;
}

const RESULT_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    MEETING_BOOKED:      { label: "RDV pris",          color: "text-emerald-700", bg: "bg-emerald-50 border border-emerald-200", dot: "bg-emerald-500" },
    CALLBACK_REQUESTED:  { label: "Rappel demandé",     color: "text-sky-700",     bg: "bg-sky-50 border border-sky-200",         dot: "bg-sky-500" },
    INTERESTED:          { label: "Intéressé",          color: "text-primary-700",  bg: "bg-primary-50 border border-primary-200",   dot: "bg-primary-500" },
    NO_RESPONSE:         { label: "Pas de réponse",     color: "text-slate-600",   bg: "bg-slate-50 border border-slate-200",     dot: "bg-slate-400" },
    DISQUALIFIED:        { label: "Disqualifié",        color: "text-red-700",     bg: "bg-red-50 border border-red-200",         dot: "bg-red-400" },
    VOICEMAIL:           { label: "Messagerie",         color: "text-amber-700",   bg: "bg-amber-50 border border-amber-200",     dot: "bg-amber-400" },
    NOT_INTERESTED:      { label: "Non intéressé",      color: "text-slate-600",   bg: "bg-slate-50 border border-slate-200",     dot: "bg-slate-400" },
    MEETING_CANCELLED:   { label: "RDV annulé",         color: "text-red-700",     bg: "bg-red-50 border border-red-200",         dot: "bg-red-400" },
};

function getResultConfig(result: string) {
    return RESULT_CONFIG[result] ?? { label: result, color: "text-slate-600", bg: "bg-slate-50 border border-slate-200", dot: "bg-slate-400" };
}

function formatDateTime(date: string) {
    const d = new Date(date);
    return d.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatDuration(seconds: number | null | undefined): string {
    if (typeof seconds !== "number" || seconds <= 0) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function averageDuration(calls: CallItem[]): string {
    const withDuration = calls.filter((c) => typeof c.duration === "number" && (c.duration ?? 0) > 0);
    if (withDuration.length === 0) return "—";
    const total = withDuration.reduce((sum, c) => sum + (c.duration ?? 0), 0);
    return formatDuration(Math.round(total / withDuration.length));
}

export default function ClientPortalCallsPage() {
    const { error: showError } = useToast();
    const [calls, setCalls] = useState<CallItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [resultFilter, setResultFilter] = useState<string>("all");
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            setIsLoading(true);
            try {
                const res = await fetch("/api/client/calls");
                const json = await res.json();
                if (json.success) {
                    const maybeItems = json?.data?.items;
                    const maybeData = json?.data;
                    if (Array.isArray(maybeItems)) {
                        setCalls(maybeItems);
                    } else if (Array.isArray(maybeData)) {
                        setCalls(maybeData);
                    } else {
                        setCalls([]);
                    }
                } else {
                    showError("Erreur", json.error || "Impossible de charger l'historique d'appels");
                }
            } catch {
                showError("Erreur", "Impossible de charger l'historique d'appels");
            } finally {
                setIsLoading(false);
            }
        })();
    }, [showError]);

    const filtered = calls.filter((c) => {
        if (resultFilter !== "all" && c.result !== resultFilter) return false;
        if (!search.trim()) return true;
        const haystack = [
            c.contact?.firstName,
            c.contact?.lastName,
            c.contact?.title,
            c.contact?.email,
            c.contact?.phone,
            c.company?.name || c.contact?.company?.name,
            c.campaign?.mission?.name,
            c.campaign?.name,
            c.note,
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(search.toLowerCase());
    });

    const uniqueResults = useMemo(() => Array.from(new Set(calls.map((c) => c.result))), [calls]);
    const totalCalls = calls.length;
    const displayedCalls = filtered.length;
    const meetingBookedCount = filtered.filter((c) => c.result === "MEETING_BOOKED").length;
    const callbackRequestedCount = filtered.filter((c) => c.result === "CALLBACK_REQUESTED").length;
    const avgDuration = averageDuration(filtered);

    return (
        <div className="min-h-full bg-surface-2 p-3 md:p-5 space-y-3">
            {/* Header */}
            <div className="bg-white border border-line rounded-2xl px-4 py-3 shadow-sm" style={{ animation: "callsFadeUp 0.35s ease both" }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-accent-600 flex items-center justify-center">
                            <PhoneCall className="w-[18px] h-[18px] text-white" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-lg font-bold text-ink tracking-tight">Historique des appels</h1>
                            <p className="text-xs text-ink-3 truncate">Vue compacte des appels, résultats et notes associées</p>
                        </div>
                    </div>
                    <div className="inline-flex items-center gap-2 text-xs text-ink-3 bg-surface-2 border border-line rounded-full px-3 py-1.5">
                        <ListFilter className="w-3.5 h-3.5" />
                        <span>{displayedCalls} affichés / {totalCalls}</span>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white border border-line rounded-2xl p-3 shadow-sm space-y-3" style={{ animation: "callsFadeUp 0.35s ease both", animationDelay: "50ms" }}>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher contact, entreprise, mission, note..."
                            className="w-full h-9 pl-9 pr-8 rounded-xl border border-line bg-white text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500/40"
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-3">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4" />
                        <select
                            value={resultFilter}
                            onChange={(e) => setResultFilter(e.target.value)}
                            className="h-9 pl-9 pr-8 rounded-xl border border-line bg-white text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary-500/25 appearance-none"
                        >
                            <option value="all">Tous les résultats</option>
                            {uniqueResults.map((r) => (
                                <option key={r} value={r}>{getResultConfig(r).label}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4 pointer-events-none" />
                    </div>
                    {(search || resultFilter !== "all") && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearch("");
                                setResultFilter("all");
                            }}
                            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-line text-xs font-medium text-ink-2 hover:bg-surface-2"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Réinitialiser
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                        <p className="text-[11px] text-ink-3">Appels visibles</p>
                        <p className="text-sm font-semibold text-ink mt-0.5">{displayedCalls}</p>
                    </div>
                    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                        <p className="text-[11px] text-ink-3">RDV pris</p>
                        <p className="text-sm font-semibold text-emerald-700 mt-0.5 inline-flex items-center gap-1">
                            <CalendarCheck2 className="w-3.5 h-3.5" />
                            {meetingBookedCount}
                        </p>
                    </div>
                    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                        <p className="text-[11px] text-ink-3">Rappels demandés</p>
                        <p className="text-sm font-semibold text-sky-700 mt-0.5">{callbackRequestedCount}</p>
                    </div>
                    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                        <p className="text-[11px] text-ink-3">Durée moyenne</p>
                        <p className="text-sm font-semibold text-ink mt-0.5 inline-flex items-center gap-1">
                            <Timer className="w-3.5 h-3.5 text-ink-3" />
                            {avgDuration}
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
                        <span className="text-sm text-ink-3">Chargement de l&apos;historique…</span>
                    </div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-line rounded-2xl py-16 px-6 text-center" style={{ animation: "callsFadeUp 0.35s ease both" }}>
                    <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center">
                        <PhoneCall className="w-6 h-6 text-ink-4" />
                    </div>
                    <p className="text-sm font-semibold text-ink">Aucun appel trouvé</p>
                    <p className="mt-1 text-xs text-ink-3">Ajustez vos filtres ou réessayez plus tard.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-line overflow-hidden shadow-sm" style={{ animation: "callsFadeUp 0.35s ease both", animationDelay: "80ms" }}>
                    {/* Table header */}
                    <div className="hidden md:grid grid-cols-[148px,1.1fr,1fr,132px,76px,28px] gap-3 px-4 py-2.5 border-b border-line-subtle bg-surface-2">
                        <span className="text-[11px] font-bold text-ink-4 uppercase tracking-wider">Date</span>
                        <span className="text-[11px] font-bold text-ink-4 uppercase tracking-wider">Contact / Entreprise</span>
                        <span className="text-[11px] font-bold text-ink-4 uppercase tracking-wider">Mission / Campagne</span>
                        <span className="text-[11px] font-bold text-ink-4 uppercase tracking-wider">Résultat</span>
                        <span className="text-[11px] font-bold text-ink-4 uppercase tracking-wider text-right">Durée</span>
                        <span />
                    </div>
                    <div className="divide-y divide-line-subtle">
                        {filtered.map((call, idx) => {
                            const contactName = [call.contact?.firstName, call.contact?.lastName].filter(Boolean).join(" ") || "Contact inconnu";
                            const companyName = call.contact?.company?.name || call.company?.name || "—";
                            const missionName = call.campaign?.mission?.name || "Mission inconnue";
                            const campaignName = call.campaign?.name || "Campagne inconnue";
                            const rc = getResultConfig(call.result);
                            const isExpanded = expandedId === call.id;
                            return (
                                <div
                                    key={call.id}
                                    className="transition-colors"
                                    style={{ animation: "callsFadeUp 0.3s ease both", animationDelay: `${80 + idx * 20}ms` }}
                                >
                                    <div
                                        className={cn(
                                            "px-4 py-2.5 hover:bg-surface-2 transition-colors",
                                            call.note ? "cursor-pointer" : "cursor-default",
                                            isExpanded && "bg-surface-2"
                                        )}
                                        onClick={() => {
                                            if (call.note) {
                                                setExpandedId(isExpanded ? null : call.id);
                                            }
                                        }}
                                    >
                                        {/* Mobile layout */}
                                        <div className="flex md:hidden items-start gap-3">
                                            <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", rc.dot)} />
                                            <div className="flex-1 min-w-0 space-y-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-sm font-semibold text-ink truncate">{contactName}</span>
                                                    <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0", rc.color, rc.bg)}>{rc.label}</span>
                                                </div>
                                                <p className="text-[11px] text-ink-3 truncate">{companyName} · {missionName}</p>
                                                <div className="flex items-center justify-between gap-2 text-[11px] text-ink-3">
                                                    <span>{formatDateTime(call.callbackDate || call.createdAt)}</span>
                                                    <span className="font-medium">{formatDuration(call.duration)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Desktop layout */}
                                        <div className="hidden md:grid grid-cols-[148px,1.1fr,1fr,132px,76px,28px] gap-3 items-center">
                                            <div className="flex items-center gap-1.5 text-xs text-ink-3">
                                                <Clock className="w-3.5 h-3.5 text-ink-4 shrink-0" />
                                                <span>{formatDateTime(call.callbackDate || call.createdAt)}</span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-ink truncate">{contactName}</p>
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <Building2 className="w-3 h-3 text-ink-4 shrink-0" />
                                                    <span className="text-[11px] text-ink-3 truncate">{companyName}</span>
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-ink truncate">{missionName}</p>
                                                <p className="text-[11px] text-ink-3 truncate">{campaignName}</p>
                                            </div>
                                            <div>
                                                <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full", rc.color, rc.bg)}>
                                                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", rc.dot)} />
                                                    {rc.label}
                                                </span>
                                            </div>
                                            <div className="text-right text-[11px] text-ink-3 font-medium">
                                                {formatDuration(call.duration)}
                                            </div>
                                            <div className="flex justify-end">
                                                {call.note && (
                                                    <ChevronDown className={cn("w-3.5 h-3.5 text-ink-4 transition-transform duration-200", isExpanded && "rotate-180")} />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Expanded note */}
                                    {isExpanded && call.note && (
                                        <div className="px-4 pb-3 -mt-0.5">
                                            <div className="ml-0 md:ml-[148px] md:pl-3 border-l-2 border-primary-500/20 pl-3">
                                                <p className="text-[12px] text-ink-2 italic leading-relaxed">« {call.note} »</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <style jsx global>{`
                @keyframes callsFadeUp {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: none; }
                }
            `}</style>
        </div>
    );
}
