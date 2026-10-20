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
    phone?: string;
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
    MEETING_BOOKED: "bg-primary-50 text-primary-700 border-primary-200",
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
            width: "125px",
            render: (_, row) => (
                <span className="text-xs text-slate-700 font-medium whitespace-nowrap">
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
                    <div className="flex items-center gap-2.5">
                        <div
                            className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border",
                                row.contactId ? "bg-primary-50 border-primary-100 text-primary-600" : "bg-slate-50 border-slate-200 text-slate-500"
                            )}
                        >
                            {row.contactId ? <User className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-slate-900 text-xs truncate max-w-[180px]">{name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                                {row.companyName && row.contactName && (
                                    <span className="truncate max-w-[130px]">{row.companyName}</span>
                                )}
                                {row.phone && (
                                    <span className="text-slate-400 font-mono text-[10px] truncate max-w-[110px]">· {row.phone}</span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            },
        },
        {
            key: "result",
            header: "Statut",
            width: "130px",
            render: (_, row) => (
                <Badge
                    size="xs"
                    className={cn(
                        "font-medium border whitespace-nowrap",
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
            width: "90px",
            render: (_, row) => {
                const Icon = CHANNEL_ICONS[row.channel as Channel] ?? Phone;
                const label = CHANNEL_LABELS[row.channel as Channel] ?? row.channel;
                return (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
                        <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {label}
                    </span>
                );
            },
        },
        {
            key: "mission",
            header: "Mission / Campagne",
            render: (_, row) => (
                <span className="text-xs text-slate-600 truncate max-w-[140px] block" title={row.missionName || row.campaignName || ""}>
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
                    <div className="max-w-[180px]">
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
            width: "120px",
            render: (_, row) =>
                row.callbackDate ? (
                    <span className="text-xs text-slate-700 whitespace-nowrap">{formatCallbackDateTime(row.callbackDate)}</span>
                ) : (
                    <span className="text-xs text-slate-300">—</span>
                ),
        },
        {
            key: "duration",
            header: "Durée",
            align: "right",
            width: "70px",
            render: (_, row) =>
                row.duration != null ? (
                    <span className="text-xs text-slate-600 font-mono">{formatDuration(row.duration)}</span>
                ) : (
                    <span className="text-xs text-slate-300">—</span>
                ),
        },
        {
            key: "actions",
            header: "",
            align: "right",
            width: "48px",
            render: (_, row) => {
                if (!row.companyId) {
                    return (
                        <span className="text-xs text-slate-300" title="Fiche non disponible (sans société)">
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
                        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 transition-colors ml-auto"
                    >
                        <Eye className="w-3.5 h-3.5" />
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
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center">
                            <History className="w-5 h-5 text-primary-600" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-bold text-slate-900 tracking-tight">Historique des actions</h1>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/60">
                                    {actions.length}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Suivi de vos appels, emails et qualifications avec accès direct aux fiches
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => fetchHistory()}
                            disabled={isLoading}
                            className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 gap-1.5 h-8 text-xs font-medium"
                        >
                            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            Actualiser
                        </Button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-3 sm:px-4 sm:py-3">
                <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-xs font-semibold text-slate-700">
                        <Filter className="w-3.5 h-3.5 text-primary-600" />
                        <span>Filtres de recherche</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        <div className="relative space-y-1" ref={dateFilterRef}>
                            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Période</label>
                            <button
                                type="button"
                                onClick={() => setDateFilterOpen((o) => !o)}
                                className="flex items-center gap-2 w-full h-8 px-2.5 text-xs font-medium text-slate-900 bg-white border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-400"
                            >
                                <Calendar className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                                <span className="truncate">{dateRange.preset ? PRESET_LABELS[dateRange.preset] : "Plage de dates"}</span>
                                <ChevronDown className={cn("w-3 h-3 text-slate-400 ml-auto shrink-0", dateFilterOpen && "rotate-180")} />
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
                        <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Mission</label>
                            <select
                                value={selectedMissionId}
                                onChange={(e) => setSelectedMissionId(e.target.value)}
                                className="w-full h-8 px-2.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-400 cursor-pointer"
                            >
                                <option value="">Toutes les missions</option>
                                {missions.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Statut</label>
                            <select
                                value={selectedResult}
                                onChange={(e) => setSelectedResult(e.target.value)}
                                className="w-full h-8 px-2.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-400 cursor-pointer"
                            >
                                <option value="">Tous les statuts</option>
                                {(Object.entries(ACTION_RESULT_LABELS) as [ActionResult, string][]).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Canal</label>
                            <select
                                value={selectedChannel}
                                onChange={(e) => setSelectedChannel(e.target.value)}
                                className="w-full h-8 px-2.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-400 cursor-pointer"
                            >
                                <option value="">Tous les canaux</option>
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
                        <History className="w-10 h-10 text-primary-500" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">Aucune action</h3>
                    <p className="text-slate-500 mt-2 max-w-sm mx-auto">
                        Aucune action ne correspond à ces filtres. Modifiez les critères ou lancez des appels pour voir votre historique.
                    </p>
                </Card>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <DataTable
                        density="compact"
                        data={actions}
                        columns={tableColumns}
                        keyField={(row) => row.id}
                        searchable
                        searchPlaceholder="Rechercher contact, société, numéro, note..."
                        searchFields={["contactName", "companyName", "phone", "note", "resultLabel", "campaignName", "missionName"]}
                        pagination
                        pageSize={20}
                        emptyMessage="Aucune action avec ces filtres."
                        onRowClick={(row) => row.companyId && openDrawer(row)}
                        getRowClassName={() => "cursor-pointer hover:bg-slate-50/80"}
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
