"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Card, Badge, Button, DataTable, useToast, TableSkeleton, EmptyState } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";

const UnifiedActionDrawer = dynamic(
    () => import("@/components/drawers/UnifiedActionDrawer").then((m) => ({ default: m.UnifiedActionDrawer })),
    { ssr: false }
);
import {
    DateRangeFilter,
    getPresetRange,
    toISO,
    type DateRangeValue,
    type DateRangePreset,
} from "@/components/dashboard/DateRangeFilter";
import {
    History,
    Filter,
    RefreshCw,
    Loader2,
    User,
    Building2,
    Phone,
    Mail,
    Linkedin,
    Eye,
    Calendar,
    Clock,
    ChevronDown,
} from "lucide-react";
import { formatCallbackDateTime } from "@/lib/utils/parseDateFromNote";
import { ACTION_RESULT_LABELS, CHANNEL_LABELS } from "@/lib/types";
import type { ActionResult, Channel } from "@/lib/types";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

interface Mission {
    id: string;
    name: string;
    client?: { name: string };
}

interface HistoryAction {
    id: string;
    contactId: string | null;
    companyId: string | null;
    result: string;
    resultLabel: string;
    channel: string;
    campaignName?: string;
    missionId?: string;
    missionName?: string;
    contactName?: string;
    companyName?: string;
    note?: string;
    createdAt: string;
    callbackDate: string | null;
    duration: number | null;
}

// ============================================
// HELPERS
// ============================================

function formatActionDateTime(iso: string): string {
    return new Date(iso).toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
        hour12: false,
    });
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins} min ${secs}s` : `${mins} min`;
}

const RESULT_BADGE_COLORS: Record<string, string> = {
    NO_RESPONSE: "bg-slate-100 text-slate-700 border-slate-200",
    BAD_CONTACT: "bg-red-50 text-red-700 border-red-200",
    INTERESTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    CALLBACK_REQUESTED: "bg-amber-50 text-amber-700 border-amber-200",
    MEETING_BOOKED: "bg-indigo-50 text-indigo-700 border-indigo-200",
    MEETING_CANCELLED: "bg-red-50 text-red-600 border-red-200",
    DISQUALIFIED: "bg-slate-50 text-slate-600 border-slate-200",
    ENVOIE_MAIL: "bg-blue-50 text-blue-700 border-blue-200",
};

const CHANNEL_ICONS = {
    CALL: Phone,
    EMAIL: Mail,
    LINKEDIN: Linkedin,
};

const PRESET_LABELS: Record<DateRangePreset, string> = {
    last7: "7 derniers jours",
    last4weeks: "4 dernières semaines",
    lastMonth: "Mois dernier",
    last6months: "6 derniers mois",
    last12months: "12 derniers mois",
    monthToDate: "Mois en cours",
    quarterToDate: "Trimestre en cours",
    yearToDate: "Année en cours",
    allTime: "Tout",
};

// ============================================
// SDR HISTORY PAGE
// ============================================

export default function SDRHistoryPage() {
    const { error: showError } = useToast();
    const [actions, setActions] = useState<HistoryAction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [missions, setMissions] = useState<Mission[]>([]);

    const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
        const { start, end } = getPresetRange("last12months");
        return { preset: "last12months", startDate: toISO(start), endDate: toISO(end) };
    });
    const [dateFilterOpen, setDateFilterOpen] = useState(false);
    const dateFilterRef = useRef<HTMLDivElement>(null);
    const [selectedMissionId, setSelectedMissionId] = useState<string>("");
    const [selectedResult, setSelectedResult] = useState<string>("");
    const [selectedChannel, setSelectedChannel] = useState<string>("");
    const [unifiedDrawerOpen, setUnifiedDrawerOpen] = useState(false);
    const [unifiedDrawerContactId, setUnifiedDrawerContactId] = useState<string | null>(null);
    const [unifiedDrawerCompanyId, setUnifiedDrawerCompanyId] = useState<string>("");
    const [unifiedDrawerMissionId, setUnifiedDrawerMissionId] = useState<string | undefined>();
    const [unifiedDrawerMissionName, setUnifiedDrawerMissionName] = useState<string | undefined>();

    const fetchAbortRef = useRef<AbortController | null>(null);
    const fetchHistory = useCallback(async () => {
        fetchAbortRef.current?.abort();
        const controller = new AbortController();
        fetchAbortRef.current = controller;
        const signal = controller.signal;
        try {
            setIsLoading(true);
            setFetchError(null);
            let start = dateRange.startDate;
            let end = dateRange.endDate;
            if (!start || !end) {
                const r = getPresetRange((dateRange.preset as DateRangePreset) || "last12months");
                start = toISO(r.start);
                end = toISO(r.end);
            }
            const params = new URLSearchParams();
            params.set("period", "all");
            params.set("limit", "300");
            if (start) params.set("dateFrom", new Date(start).toISOString());
            if (end) params.set("dateTo", new Date(end + "T23:59:59.999").toISOString());
            if (selectedMissionId) params.set("missionId", selectedMissionId);
            if (selectedResult) params.set("result", selectedResult);
            if (selectedChannel) params.set("channel", selectedChannel);
            const res = await fetch(`/api/sdr/actions?${params.toString()}`, { signal });
            const json = await res.json();
            if (signal.aborted) return;
            if (json.success) {
                setActions(json.data);
            } else {
                setFetchError(json.error || "Impossible de charger l'historique");
                showError(json.error || "Impossible de charger l'historique");
            }
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            console.error("Failed to fetch history:", err);
            setFetchError("Impossible de charger l'historique");
            showError("Impossible de charger l'historique");
        } finally {
            if (!signal.aborted) setIsLoading(false);
            if (fetchAbortRef.current === controller) fetchAbortRef.current = null;
        }
    }, [dateRange, selectedMissionId, selectedResult, selectedChannel, showError]);

    useEffect(() => {
        fetch("/api/sdr/missions")
            .then((res) => res.json())
            .then((json) => {
                if (json.success && Array.isArray(json.data)) setMissions(json.data);
            })
            .catch(() => { });
    }, []);

    useEffect(() => {
        fetchHistory();
        return () => fetchAbortRef.current?.abort();
    }, [fetchHistory]);

    const openDrawer = (row: HistoryAction) => {
        if (!row.companyId) return;
        setUnifiedDrawerContactId(row.contactId);
        setUnifiedDrawerCompanyId(row.companyId);
        setUnifiedDrawerMissionId(row.missionId);
        setUnifiedDrawerMissionName(row.missionName);
        setUnifiedDrawerOpen(true);
    };

    const closeUnifiedDrawer = () => {
        setUnifiedDrawerOpen(false);
        setUnifiedDrawerContactId(null);
        setUnifiedDrawerCompanyId("");
        setUnifiedDrawerMissionId(undefined);
        setUnifiedDrawerMissionName(undefined);
    };

    const tableColumns: Column<HistoryAction>[] = [
        {
            key: "createdAt",
            header: "Date / Heure",
            render: (_, row) => (
                <span className="text-sm text-slate-700 font-medium whitespace-nowrap">
                    {formatActionDateTime(row.createdAt)}
                </span>
            ),
        },
        {
            key: "contact",
            header: "Contact / Société",
            render: (_, row) => {
                const name = row.contactName || row.companyName || "—";
                return (
                    <div className="flex items-center gap-3">
                        <div
                            className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border",
                                row.contactId ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-slate-50 border-slate-200 text-slate-500"
                            )}
                        >
                            {row.contactId ? <User className="w-4.5 h-4.5" /> : <Building2 className="w-4.5 h-4.5" />}
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate max-w-[200px]">{name}</p>
                            {row.companyName && row.contactName && (
                                <p className="text-xs text-slate-500 truncate max-w-[180px]">{row.companyName}</p>
                            )}
                        </div>
                    </div>
                );
            },
        },
        {
            key: "result",
            header: "Statut",
            render: (_, row) => (
                <Badge
                    className={cn(
                        "text-xs font-semibold border",
                        RESULT_BADGE_COLORS[row.result] ?? "bg-slate-100 text-slate-600 border-slate-200"
                    )}
                >
                    {row.resultLabel}
                </Badge>
            ),
        },
        {
            key: "channel",
            header: "Canal",
            render: (_, row) => {
                const Icon = CHANNEL_ICONS[row.channel as Channel] ?? Phone;
                const label = CHANNEL_LABELS[row.channel as Channel] ?? row.channel;
                return (
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                        <Icon className="w-4 h-4 text-slate-400" />
                        {label}
                    </span>
                );
            },
        },
        {
            key: "mission",
            header: "Mission / Campagne",
            render: (_, row) => (
                <span className="text-sm text-slate-600 truncate max-w-[160px] block" title={row.missionName || row.campaignName || ""}>
                    {row.missionName || row.campaignName || "—"}
                </span>
            ),
        },
        {
            key: "note",
            header: "Note",
            render: (_, row) => {
                const displayNote = row.note;
                if (!displayNote) {
                    return <span className="text-xs text-slate-300">—</span>;
                }
                return (
                    <div className="max-w-[200px]">
                        <p className="text-xs text-slate-500 truncate italic" title={displayNote}>
                            &quot;{displayNote}&quot;
                        </p>
                    </div>
                );
            },
        },
        {
            key: "callbackDate",
            header: "Rappel",
            render: (_, row) =>
                row.callbackDate ? (
                    <span className="text-sm text-slate-700">{formatCallbackDateTime(row.callbackDate)}</span>
                ) : (
                    <span className="text-xs text-slate-400">—</span>
                ),
        },
        {
            key: "duration",
            header: "Durée",
            render: (_, row) =>
                row.duration != null ? (
                    <span className="text-sm text-slate-600">{formatDuration(row.duration)}</span>
                ) : (
                    <span className="text-xs text-slate-400">—</span>
                ),
        },
        {
            key: "actions",
            header: "",
            render: (_, row) => {
                if (!row.companyId) {
                    return (
                        <span className="text-xs text-slate-400" title="Fiche non disponible (sans société)">
                            —
                        </span>
                    );
                }
                return (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            openDrawer(row);
                        }}
                        title="Voir la fiche"
                        className="w-9 h-9 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 transition-all duration-200"
                    >
                        <Eye className="w-4 h-4" />
                    </button>
                );
            },
        },
    ];

    if (isLoading && actions.length === 0) {
        return (
            <div className="space-y-6 p-2">
                <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
                <TableSkeleton columns={7} rows={10} className="rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in p-2">
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 rounded-2xl p-6 shadow-xl">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-transparent to-slate-500/10" />
                <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
                            <History className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">Historique des actions</h1>
                            <p className="text-sm text-white/60">
                                Consultez toutes vos actions (appels, emails, statuts) et ouvrez les fiches contact/société
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="secondary"
                            onClick={() => fetchHistory()}
                            disabled={isLoading}
                            className="rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white gap-2"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Actualiser
                        </Button>
                        <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 backdrop-blur-sm">
                            <span className="text-sm font-semibold text-white">{actions.length}</span>
                            <span className="text-xs text-white/60 ml-1">actions</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/60 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                                <Filter className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-slate-900">Filtres</h3>
                                <p className="text-xs text-slate-500">Affinez l&apos;historique</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                        <div className="relative" ref={dateFilterRef}>
                            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Période</label>
                            <button
                                type="button"
                                onClick={() => setDateFilterOpen((o) => !o)}
                                className="flex items-center gap-2 w-full h-10 px-3 text-sm font-medium text-slate-900 bg-white border border-slate-200 rounded-xl hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400"
                            >
                                <Calendar className="w-4 h-4 text-indigo-500" />
                                <span className="truncate">{dateRange.preset ? PRESET_LABELS[dateRange.preset] : "Plage de dates"}</span>
                                <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 ml-auto shrink-0", dateFilterOpen && "rotate-180")} />
                            </button>
                            {dateFilterOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" aria-hidden onClick={() => setDateFilterOpen(false)} />
                                    <div className="absolute left-0 top-full mt-1 z-50 right-0 max-w-[calc(100vw-2rem)]">
                                        <DateRangeFilter
                                            value={dateRange}
                                            onChange={setDateRange}
                                            onClose={() => setDateFilterOpen(false)}
                                            isOpen={true}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Mission</label>
                            <select
                                value={selectedMissionId}
                                onChange={(e) => setSelectedMissionId(e.target.value)}
                                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 cursor-pointer"
                            >
                                <option value="">Toutes</option>
                                {missions.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Statut</label>
                            <select
                                value={selectedResult}
                                onChange={(e) => setSelectedResult(e.target.value)}
                                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 cursor-pointer"
                            >
                                <option value="">Tous</option>
                                {(Object.entries(ACTION_RESULT_LABELS) as [ActionResult, string][]).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Canal</label>
                            <select
                                value={selectedChannel}
                                onChange={(e) => setSelectedChannel(e.target.value)}
                                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 cursor-pointer"
                            >
                                <option value="">Tous</option>
                                {(Object.entries(CHANNEL_LABELS) as [Channel, string][]).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {fetchError ? (
                <EmptyState
                    icon={RefreshCw}
                    title={fetchError}
                    description="Vérifiez votre connexion et réessayez."
                    action={
                        <Button variant="secondary" onClick={() => { setFetchError(null); fetchHistory(); }} className="gap-2">
                            <RefreshCw className="w-4 h-4" />
                            Réessayer
                        </Button>
                    }
                />
            ) : actions.length === 0 ? (
                <Card className="text-center py-16 border-dashed border-2 bg-slate-50/50">
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-100">
                        <History className="w-10 h-10 text-indigo-500" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">Aucune action</h3>
                    <p className="text-slate-500 mt-2 max-w-sm mx-auto">
                        Aucune action ne correspond à ces filtres. Modifiez les critères ou lancez des appels pour voir votre historique.
                    </p>
                </Card>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <DataTable
                        data={actions}
                        columns={tableColumns}
                        keyField={(row) => row.id}
                        searchable
                        searchPlaceholder="Rechercher contact, société, note..."
                        searchFields={["contactName", "companyName", "note", "resultLabel", "campaignName", "missionName"]}
                        pagination
                        pageSize={20}
                        emptyMessage="Aucune action avec ces filtres."
                        onRowClick={(row) => row.companyId && openDrawer(row)}
                        getRowClassName={() => "cursor-pointer hover:bg-indigo-50/50"}
                    />
                </div>
            )}

            {unifiedDrawerOpen && unifiedDrawerCompanyId && (
                <UnifiedActionDrawer
                    isOpen={unifiedDrawerOpen}
                    onClose={closeUnifiedDrawer}
                    contactId={unifiedDrawerContactId}
                    companyId={unifiedDrawerCompanyId}
                    missionId={unifiedDrawerMissionId}
                    missionName={unifiedDrawerMissionName}
                    enableGooglePhoneLookup
                    onActionRecorded={fetchHistory}
                />
            )}
        </div>
    );
}
