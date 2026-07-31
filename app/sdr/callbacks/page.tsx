"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { Card, Badge, Button, Modal, ModalFooter, Select, DataTable, useToast, TableSkeleton, CardSkeleton, EmptyState, DateTimePicker } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";

const UnifiedActionDrawer = dynamic(
    () => import("@/components/drawers/UnifiedActionDrawer").then((m) => ({ default: m.UnifiedActionDrawer })),
    { ssr: false }
);
import {
    Clock,
    Phone,
    Building2,
    ArrowRight,
    Loader2,
    CheckCircle2,
    CalendarClock,
    Filter,
    Calendar,
    Mail,
    Sparkles,
    XCircle,
    AlertTriangle,
    PhoneCall,
    User,
    LayoutGrid,
    LayoutList,
    ArrowUpDown,
    TimerReset,
    RefreshCw,
    BellRing,
    History,
    MessageSquare,
    SkipForward,
    Eye,
    PhoneOff,
    BarChart2,
} from "lucide-react";
import Link from "next/link";
import { formatCallbackDateTime } from "@/lib/utils/parseDateFromNote";
import { ACTION_RESULT_LABELS, type ActionResult } from "@/lib/types";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

interface Mission {
    id: string;
    name: string;
    client?: { name: string };
}

interface ListItem {
    id: string;
    name: string;
    mission: { id: string; name: string };
}

interface Callback {
    id: string;
    campaignId: string;
    channel: string;
    createdAt: string;
    callbackDate?: string | null;
    note?: string;
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        title: string | null;
        phone: string | null;
        email: string | null;
        company: {
            id: string;
            name: string;
        };
    } | null;
    company?: {
        id: string;
        name: string;
        phone: string | null;
    };
    mission: {
        id: string;
        name: string;
        client: {
            name: string;
        };
    } | null;
    sdr?: { id: string; name: string | null };
}

type SortKey = "urgency" | "date" | "name" | "mission";
type SortDir = "asc" | "desc";

// ============================================
// HELPERS
// ============================================

function getUrgencyLevel(cb: Callback): { level: "overdue" | "due_now" | "upcoming" | "future"; label: string; color: string; sortPriority: number } {
    if (!cb.callbackDate) return { level: "upcoming", label: "Non planifié", color: "bg-slate-100 text-slate-600 border-slate-200", sortPriority: 3 };

    const now = new Date();
    const callbackTime = new Date(cb.callbackDate);
    const diffMs = callbackTime.getTime() - now.getTime();
    const diffMins = diffMs / (1000 * 60);
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffMs < 0) {
        const overdueHours = Math.abs(diffHours);
        if (overdueHours > 24) return { level: "overdue", label: `En retard (${Math.floor(overdueHours / 24)}j)`, color: "bg-red-100 text-red-800 border-red-300 animate-pulse", sortPriority: 0 };
        return { level: "overdue", label: `En retard (${Math.floor(overdueHours)}h)`, color: "bg-red-100 text-red-700 border-red-300", sortPriority: 0 };
    }
    if (diffMins <= 30) return { level: "due_now", label: "Maintenant !", color: "bg-amber-100 text-amber-800 border-amber-300", sortPriority: 1 };
    if (diffHours <= 2) return { level: "due_now", label: `Dans ${Math.floor(diffMins)}min`, color: "bg-amber-50 text-amber-700 border-amber-200", sortPriority: 1 };
    if (diffHours <= 24) return { level: "upcoming", label: `Aujourd'hui`, color: "bg-blue-50 text-blue-700 border-blue-200", sortPriority: 2 };
    return { level: "future", label: `${Math.floor(diffHours / 24)}j`, color: "bg-slate-50 text-slate-600 border-slate-200", sortPriority: 3 };
}

function CallbacksStatsModalBody({
    callbacks,
    getUrgencyLevel: getUrgency,
    formatCallbackDateTime,
    onRowClick,
}: {
    callbacks: Callback[];
    getUrgencyLevel: (cb: Callback) => { level: string; label: string; color: string };
    formatCallbackDateTime: (date: string) => string;
    onRowClick: (cb: Callback) => void;
}) {
    const byUrgency = useMemo(() => {
        const map: Record<string, number> = { overdue: 0, due_now: 0, upcoming: 0, future: 0 };
        callbacks.forEach((cb) => {
            const u = getUrgency(cb);
            map[u.level] = (map[u.level] ?? 0) + 1;
        });
        return map;
    }, [callbacks, getUrgency]);
    const byMission = useMemo(() => {
        const map: Record<string, number> = {};
        callbacks.forEach((cb) => {
            const name = cb.mission?.name ?? "Sans mission";
            map[name] = (map[name] ?? 0) + 1;
        });
        return map;
    }, [callbacks]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</p>
                    <p className="text-xl font-bold text-slate-900">{callbacks.length}</p>
                </div>
                <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                    <p className="text-xs font-medium text-red-700 uppercase tracking-wider">En retard</p>
                    <p className="text-xl font-bold text-red-800">{byUrgency.overdue ?? 0}</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                    <p className="text-xs font-medium text-amber-700 uppercase tracking-wider">Imminent</p>
                    <p className="text-xl font-bold text-amber-800">{byUrgency.due_now ?? 0}</p>
                </div>
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-3">
                    <p className="text-xs font-medium text-blue-700 uppercase tracking-wider">À venir</p>
                    <p className="text-xl font-bold text-blue-800">{(byUrgency.upcoming ?? 0) + (byUrgency.future ?? 0)}</p>
                </div>
            </div>
            <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Par mission</h4>
                <div className="flex flex-wrap gap-2">
                    {Object.entries(byMission).map(([name, count]) => (
                        <Badge key={name} className="bg-slate-100 text-slate-700 border-slate-200">{name}: {count}</Badge>
                    ))}
                </div>
            </div>
            <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Tous les rappels</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[320px] overflow-y-auto">
                    {callbacks.length === 0 ? (
                        <p className="text-center py-8 text-slate-500 text-sm">Aucun rappel.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                <tr>
                                    <th className="text-left py-2.5 px-3 font-medium text-slate-600">Contact / Société</th>
                                    <th className="text-left py-2.5 px-3 font-medium text-slate-600">Urgence</th>
                                    <th className="text-left py-2.5 px-3 font-medium text-slate-600">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {callbacks.map((cb) => {
                                    const name = cb.contact
                                        ? `${cb.contact.firstName ?? ""} ${cb.contact.lastName ?? ""}`.trim() || "Contact"
                                        : cb.company?.name ?? "Société";
                                    const company = cb.contact?.company?.name ?? cb.company?.name ?? "—";
                                    const urgency = getUrgency(cb);
                                    return (
                                        <tr
                                            key={cb.id}
                                            onClick={() => onRowClick(cb)}
                                            className="border-b border-slate-100 last:border-0 hover:bg-amber-50/80 cursor-pointer transition-colors"
                                        >
                                            <td className="py-2.5 px-3">
                                                <span className="font-medium text-slate-900">{name}</span>
                                                <span className="text-slate-500 text-xs block">{company}</span>
                                            </td>
                                            <td className="py-2.5 px-3">
                                                <Badge className={cn("text-xs border", urgency.color)}>{urgency.label}</Badge>
                                            </td>
                                            <td className="py-2.5 px-3 text-slate-600">
                                                {cb.callbackDate ? formatCallbackDateTime(cb.callbackDate) : "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================
// SDR CALLBACKS PAGE
// ============================================

export default function SDRCallbacksPage() {
    const { error: showError } = useToast();
    const [callbacks, setCallbacks] = useState<Callback[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [callbacksFetchError, setCallbacksFetchError] = useState<string | null>(null);
    const [rescheduleCallback, setRescheduleCallback] = useState<Callback | null>(null);
    const [rescheduleDateValue, setRescheduleDateValue] = useState("");
    const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);

    // Outcome after rappel
    const [outcomeCallback, setOutcomeCallback] = useState<Callback | null>(null);
    const [outcomeResult, setOutcomeResult] = useState<ActionResult | null>(null);
    const [outcomeNote, setOutcomeNote] = useState("");
    const [outcomeSubmitting, setOutcomeSubmitting] = useState(false);

    // Filters (persisted in localStorage)
    const [missions, setMissions] = useState<Mission[]>([]);
    const [lists, setLists] = useState<ListItem[]>([]);
    const [selectedMissionId, setSelectedMissionId] = useState<string | undefined>(() =>
        typeof window !== "undefined" ? (localStorage.getItem("sdr_callbacks_mission") || "") : ""
    );
    const [selectedListId, setSelectedListId] = useState<string | undefined>(() =>
        typeof window !== "undefined" ? (localStorage.getItem("sdr_callbacks_list") || "") : ""
    );
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");

    // View & Sort
    const [viewMode, setViewMode] = useState<"card" | "table">("table");
    const [sortKey, setSortKey] = useState<SortKey>("urgency");
    const [showStatsModal, setShowStatsModal] = useState(false);
    const [sortDir, setSortDir] = useState<SortDir>("asc");

    // Quick action inline (for table)
    const [submittingId, setSubmittingId] = useState<string | null>(null);

    // Unified drawer
    const [unifiedDrawerOpen, setUnifiedDrawerOpen] = useState(false);
    const [unifiedDrawerContactId, setUnifiedDrawerContactId] = useState<string | null>(null);
    const [unifiedDrawerCompanyId, setUnifiedDrawerCompanyId] = useState<string>("");
    const [unifiedDrawerMissionId, setUnifiedDrawerMissionId] = useState<string | undefined>();
    const [unifiedDrawerMissionName, setUnifiedDrawerMissionName] = useState<string | undefined>();

    const openDrawerForCallback = (cb: Callback, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const companyId = cb.company?.id ?? cb.contact?.company?.id ?? "";
        if (!companyId) return;
        setUnifiedDrawerContactId(cb.contact?.id ?? null);
        setUnifiedDrawerCompanyId(companyId);
        setUnifiedDrawerMissionId(cb.mission?.id);
        setUnifiedDrawerMissionName(cb.mission?.name);
        setUnifiedDrawerOpen(true);
    };

    const closeUnifiedDrawer = () => {
        setUnifiedDrawerOpen(false);
        setUnifiedDrawerContactId(null);
        setUnifiedDrawerCompanyId("");
        setUnifiedDrawerMissionId(undefined);
        setUnifiedDrawerMissionName(undefined);
    };

    const openReschedule = (cb: Callback, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setRescheduleCallback(cb);
        setRescheduleDateValue(cb.callbackDate ? new Date(cb.callbackDate).toISOString().slice(0, 16) : "");
    };

    const submitReschedule = async () => {
        if (!rescheduleCallback || !rescheduleDateValue) return;
        setRescheduleSubmitting(true);
        try {
            const res = await fetch(`/api/actions/${rescheduleCallback.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ callbackDate: new Date(rescheduleDateValue).toISOString() }),
            });
            const json = await res.json();
            if (json.success) {
                setCallbacks((prev) =>
                    prev.map((c) =>
                        c.id === rescheduleCallback.id
                            ? { ...c, callbackDate: rescheduleDateValue }
                            : c
                    )
                );
                setRescheduleCallback(null);
            } else {
                showError(json.error || "Erreur lors du report du rappel");
            }
        } catch (err) {
            console.error("Reschedule failed:", err);
            showError("Erreur de connexion");
        } finally {
            setRescheduleSubmitting(false);
        }
    };

    const openOutcome = (cb: Callback, result: ActionResult, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setOutcomeCallback(cb);
        setOutcomeResult(result);
        setOutcomeNote("");
    };

    const submitOutcome = async () => {
        if (!outcomeCallback || !outcomeResult) return;
        const noteRequired =
            outcomeResult === "INTERESTED" ||
            outcomeResult === "CALLBACK_REQUESTED" ||
            outcomeResult === "ENVOIE_MAIL";
        if (noteRequired && !outcomeNote.trim()) return;
        setOutcomeSubmitting(true);
        try {
            const res = await fetch("/api/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contactId: outcomeCallback.contact?.id ?? undefined,
                    companyId: outcomeCallback.contact ? undefined : outcomeCallback.company?.id,
                    campaignId: outcomeCallback.campaignId,
                    channel:
                        outcomeResult === "ENVOIE_MAIL"
                            ? "EMAIL"
                            : outcomeCallback.channel === "EMAIL"
                                ? "EMAIL"
                                : outcomeCallback.channel === "LINKEDIN"
                                    ? "LINKEDIN"
                                    : "CALL",
                    result: outcomeResult,
                    note: outcomeNote.trim() || (outcomeResult === "MEETING_BOOKED" ? "RDV pris suite au rappel" : undefined),
                    callbackDate: outcomeResult === "CALLBACK_REQUESTED" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined,
                }),
            });
            const json = await res.json();
            if (json.success) {
                setCallbacks((prev) => prev.filter((c) => c.id !== outcomeCallback.id));
                setOutcomeCallback(null);
                setOutcomeResult(null);
                setOutcomeNote("");
            } else {
                showError(json.error || "Erreur lors de l'enregistrement");
            }
        } catch (err) {
            console.error("Outcome failed:", err);
            showError("Erreur de connexion");
        } finally {
            setOutcomeSubmitting(false);
        }
    };

    // Quick action inline for table view
    const handleQuickOutcome = async (cb: Callback, result: ActionResult) => {
        setSubmittingId(cb.id);
        try {
            const res = await fetch("/api/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contactId: cb.contact?.id ?? undefined,
                    companyId: cb.contact ? undefined : cb.company?.id,
                    campaignId: cb.campaignId,
                    channel: cb.channel === "EMAIL" ? "EMAIL" : cb.channel === "LINKEDIN" ? "LINKEDIN" : "CALL",
                    result,
                    note: result === "NO_RESPONSE" ? "Pas de réponse au rappel" : result === "MEETING_BOOKED" ? "RDV pris suite au rappel" : undefined,
                }),
            });
            const json = await res.json();
            if (json.success) {
                setCallbacks((prev) => prev.filter((c) => c.id !== cb.id));
            } else {
                showError(json.error || "Erreur lors de l'enregistrement");
            }
        } catch {
            showError("Erreur de connexion");
        }
        setSubmittingId(null);
    };

    const CALLBACKS_CACHE_KEY = "sdr_callbacks_cache";

    const fetchCallbacksAbortRef = useRef<AbortController | null>(null);
    const fetchCallbacks = useCallback(async () => {
        fetchCallbacksAbortRef.current?.abort();
        const controller = new AbortController();
        fetchCallbacksAbortRef.current = controller;
        const signal = controller.signal;
        const filterKey = `${selectedMissionId ?? ""}|${selectedListId ?? ""}|${dateFrom}|${dateTo}`;
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            if (selectedMissionId) params.set("missionId", selectedMissionId);
            if (selectedListId) params.set("listId", selectedListId);
            if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
            if (dateTo) params.set("dateTo", new Date(dateTo + "T23:59:59.999Z").toISOString());
            const res = await fetch(`/api/sdr/callbacks?${params.toString()}`, { signal });
            const json = await res.json();
            if (signal.aborted) return;
            if (json.success) {
                setCallbacksFetchError(null);
                setCallbacks(json.data);
                try {
                    if (typeof sessionStorage !== "undefined") {
                        sessionStorage.setItem(CALLBACKS_CACHE_KEY, JSON.stringify({ filterKey, data: json.data, ts: Date.now() }));
                    }
                } catch {
                    // ignore storage errors
                }
            } else {
                setCallbacksFetchError("Impossible de charger les rappels");
                showError("Impossible de charger les rappels");
            }
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            console.error("Failed to fetch callbacks:", err);
            setCallbacksFetchError("Impossible de charger les rappels");
            showError("Impossible de charger les rappels");
        } finally {
            if (!signal.aborted) setIsLoading(false);
            if (fetchCallbacksAbortRef.current === controller) fetchCallbacksAbortRef.current = null;
        }
    }, [selectedMissionId, selectedListId, dateFrom, dateTo, showError]);

    // Restore cached callbacks for current filters so table/cards show instantly while refetching
    useEffect(() => {
        const filterKey = `${selectedMissionId ?? ""}|${selectedListId ?? ""}|${dateFrom}|${dateTo}`;
        try {
            if (typeof sessionStorage !== "undefined") {
                const raw = sessionStorage.getItem(CALLBACKS_CACHE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw) as { filterKey?: string; data?: Callback[] };
                    if (parsed.filterKey === filterKey && Array.isArray(parsed.data)) {
                        setCallbacks(parsed.data);
                        setCallbacksFetchError(null);
                    }
                }
            }
        } catch {
            // ignore
        }
    }, [selectedMissionId, selectedListId, dateFrom, dateTo]);

    useEffect(() => {
        fetch("/api/sdr/missions")
            .then((res) => res.json())
            .then((json) => {
                if (json.success && Array.isArray(json.data)) {
                    setMissions(json.data);
                }
            })
            .catch(() => {
                showError("Impossible de charger les missions");
            });
    }, [showError]);

    useEffect(() => {
        fetch("/api/sdr/lists")
            .then((res) => res.json())
            .then((json) => {
                if (json.success && Array.isArray(json.data)) {
                    setLists(json.data);
                }
            })
            .catch(() => {
                showError("Impossible de charger les listes");
            });
    }, [showError]);

    useEffect(() => {
        fetchCallbacks();
        return () => fetchCallbacksAbortRef.current?.abort();
    }, [fetchCallbacks]);

    // Sorted callbacks
    const sortedCallbacks = useMemo(() => {
        const sorted = [...callbacks].sort((a, b) => {
            let cmp = 0;
            switch (sortKey) {
                case "urgency":
                    cmp = getUrgencyLevel(a).sortPriority - getUrgencyLevel(b).sortPriority;
                    if (cmp === 0) {
                        const dateA = a.callbackDate ? new Date(a.callbackDate).getTime() : Infinity;
                        const dateB = b.callbackDate ? new Date(b.callbackDate).getTime() : Infinity;
                        cmp = dateA - dateB;
                    }
                    break;
                case "date":
                    const dateA = a.callbackDate ? new Date(a.callbackDate).getTime() : Infinity;
                    const dateB = b.callbackDate ? new Date(b.callbackDate).getTime() : Infinity;
                    cmp = dateA - dateB;
                    break;
                case "name":
                    const nameA = a.contact ? `${a.contact.firstName || ""} ${a.contact.lastName || ""}`.trim() : a.company?.name || "";
                    const nameB = b.contact ? `${b.contact.firstName || ""} ${b.contact.lastName || ""}`.trim() : b.company?.name || "";
                    cmp = nameA.localeCompare(nameB);
                    break;
                case "mission":
                    cmp = (a.mission?.name || "").localeCompare(b.mission?.name || "");
                    break;
            }
            return sortDir === "desc" ? -cmp : cmp;
        });
        return sorted;
    }, [callbacks, sortKey, sortDir]);

    // Stats
    const overdueCount = callbacks.filter(c => getUrgencyLevel(c).level === "overdue").length;
    const dueNowCount = callbacks.filter(c => getUrgencyLevel(c).level === "due_now").length;

    // Table columns
    const tableColumns: Column<Callback>[] = [
        {
            key: "urgency",
            header: "Urgence",
            render: (_, cb) => {
                const urgency = getUrgencyLevel(cb);
                return (
                    <Badge className={cn("text-xs font-semibold border", urgency.color)}>
                        {urgency.level === "overdue" && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {urgency.level === "due_now" && <BellRing className="w-3 h-3 mr-1" />}
                        {urgency.label}
                    </Badge>
                );
            },
        },
        {
            key: "contact",
            header: "Contact / Société",
            render: (_, cb) => {
                const name = cb.contact
                    ? `${cb.contact.firstName || ""} ${cb.contact.lastName || ""}`.trim() || "Contact inconnu"
                    : cb.company?.name || "Société inconnue";
                return (
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border",
                            cb.contact ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-slate-50 border-slate-200 text-slate-500"
                        )}>
                            {cb.contact ? <User className="w-4.5 h-4.5" /> : <Building2 className="w-4.5 h-4.5" />}
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate max-w-[200px]">{name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-slate-500 truncate max-w-[140px] flex items-center gap-1">
                                    <Building2 className="w-3 h-3 flex-shrink-0" />
                                    {cb.contact?.company.name || cb.company?.name || "N/A"}
                                </span>
                                {cb.contact?.title && (
                                    <span className="text-xs text-slate-400 truncate max-w-[100px]">· {cb.contact.title}</span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            },
        },
        {
            key: "phone",
            header: "Téléphone",
            render: (_, cb) => {
                const phone = cb.contact?.phone || cb.company?.phone;
                if (!phone) return <span className="text-xs text-slate-300 flex items-center gap-1"><PhoneOff className="w-3 h-3" /> —</span>;
                return (
                    <a
                        href={`tel:${phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 rounded-lg transition-all hover:shadow-sm group"
                        title="Cliquer pour appeler"
                    >
                        <PhoneCall className="w-3.5 h-3.5 group-hover:animate-pulse" />
                        <span className="font-mono">{phone}</span>
                    </a>
                );
            },
        },
        {
            key: "callbackDate",
            header: "Date rappel",
            render: (_, cb) => cb.callbackDate ? (
                <span className="text-sm text-slate-700 font-medium">{formatCallbackDateTime(cb.callbackDate)}</span>
            ) : (
                <span className="text-xs text-slate-400 italic">Non définie</span>
            ),
        },
        {
            key: "note",
            header: "Note",
            render: (_, cb) => cb.note ? (
                <p className="text-xs text-slate-500 truncate max-w-[180px] italic" title={cb.note}>
                    &quot;{cb.note}&quot;
                </p>
            ) : (
                <span className="text-xs text-slate-300">—</span>
            ),
        },
        {
            key: "actions",
            header: "Actions",
            render: (_, cb) => {
                const submitting = submittingId === cb.id;
                return (
                    <div className="flex items-center gap-1">
                        {submitting && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openOutcome(cb, "MEETING_BOOKED"); }}
                            disabled={submitting}
                            title="RDV pris"
                            className="w-9 h-9 rounded-xl border-2 border-slate-200 flex items-center justify-center text-slate-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 transition-all duration-200"
                        >
                            <Calendar className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openOutcome(cb, "INTERESTED"); }}
                            disabled={submitting}
                            title="Intéressé"
                            className="w-9 h-9 rounded-xl border-2 border-slate-200 flex items-center justify-center text-slate-400 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 transition-all duration-200"
                        >
                            <Sparkles className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleQuickOutcome(cb, "NO_RESPONSE"); }}
                            disabled={submitting}
                            title="Pas de réponse"
                            className="w-9 h-9 rounded-xl border-2 border-slate-200 flex items-center justify-center text-slate-400 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-all duration-200"
                        >
                            <XCircle className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openReschedule(cb); }}
                            disabled={submitting}
                            title="Reprogrammer"
                            className="w-9 h-9 rounded-xl border-2 border-slate-200 flex items-center justify-center text-slate-400 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-600 transition-all duration-200"
                        >
                            <TimerReset className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openDrawerForCallback(cb); }}
                            title="Voir la fiche"
                            className="w-9 h-9 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 transition-all duration-200"
                        >
                            <Eye className="w-4 h-4" />
                        </button>
                    </div>
                );
            },
        },
    ];

    // Show skeleton only when loading and no data to show (no cache)
    if (isLoading && callbacks.length === 0) {
        return (
            <div className="space-y-6 p-2">
                <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
                {viewMode === "table" ? (
                    <TableSkeleton columns={5} rows={10} className="rounded-2xl" />
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <CardSkeleton hasHeader lines={2} />
                        <CardSkeleton hasHeader lines={2} />
                        <CardSkeleton hasHeader lines={2} />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in p-2">
            {/* Modern Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-amber-900 rounded-2xl p-6 shadow-xl">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-orange-500/10" />
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl" />

                <div className="relative">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
                                <BellRing className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-white">Rappels</h1>
                                <p className="text-sm text-white/60">Gérez vos demandes de rappel et optimisez vos conversions</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                            {/* View Toggle */}
                            <div className="flex rounded-xl border border-white/10 p-1 bg-white/5 backdrop-blur-sm">
                                <button
                                    type="button"
                                    onClick={() => setViewMode("card")}
                                    className={cn(
                                        "px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2",
                                        viewMode === "card"
                                            ? "bg-white text-slate-900 shadow-lg"
                                            : "text-white/70 hover:text-white hover:bg-white/10"
                                    )}
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                    Cartes
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode("table")}
                                    className={cn(
                                        "px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2",
                                        viewMode === "table"
                                            ? "bg-white text-slate-900 shadow-lg"
                                            : "text-white/70 hover:text-white hover:bg-white/10"
                                    )}
                                >
                                    <LayoutList className="w-4 h-4" />
                                    Tableau
                                </button>
                            </div>

                            <Button
                                type="button"
                                onClick={() => setShowStatsModal(true)}
                                className="rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm gap-2 px-4 py-2 h-auto font-medium"
                            >
                                <BarChart2 className="w-4 h-4" />
                                Stats
                            </Button>

                            {/* Stats */}
                            <div className="flex items-center gap-3">
                                <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 backdrop-blur-sm">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-amber-400" />
                                        <span className="text-sm font-semibold text-white">{callbacks.length}</span>
                                        <span className="text-xs text-white/60">rappels</span>
                                    </div>
                                </div>
                                {overdueCount > 0 && (
                                    <div className="px-3 py-2 rounded-xl bg-red-500/20 border border-red-400/30 backdrop-blur-sm animate-pulse">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4 text-red-400" />
                                            <span className="text-sm font-bold text-red-100">{overdueCount}</span>
                                            <span className="text-xs text-red-200/80">en retard</span>
                                        </div>
                                    </div>
                                )}
                                {dueNowCount > 0 && (
                                    <div className="px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-400/30 backdrop-blur-sm">
                                        <div className="flex items-center gap-2">
                                            <BellRing className="w-4 h-4 text-amber-400" />
                                            <span className="text-sm font-bold text-amber-100">{dueNowCount}</span>
                                            <span className="text-xs text-amber-200/80">imminent</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters & Sort - no overflow-hidden so Select dropdowns can extend outside */}
            <div className="relative z-20 bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/60 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                                <Filter className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-slate-900">Filtres & Tri</h3>
                                <p className="text-xs text-slate-500">Affinez et triez vos rappels</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                        {/* Date From */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Du</label>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-400 transition-shadow"
                            />
                        </div>
                        {/* Date To */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Au</label>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-400 transition-shadow"
                            />
                        </div>
                        {/* Mission */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Mission</label>
                            <Select
                                value={selectedMissionId ?? ""}
                                onChange={(v) => {
                                    setSelectedMissionId(v || undefined);
                                    if (typeof window !== "undefined") localStorage.setItem("sdr_callbacks_mission", v || "");
                                    if (v) {
                                        setSelectedListId(undefined);
                                        if (typeof window !== "undefined") localStorage.removeItem("sdr_callbacks_list");
                                    }
                                }}
                                placeholder="Toutes les missions"
                                options={[
                                    { value: "", label: "Toutes les missions" },
                                    ...missions.map((m) => ({ value: m.id, label: m.name })),
                                ]}
                                className="flex-1"
                            />
                        </div>
                        {/* List */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Liste</label>
                            <Select
                                value={selectedListId ?? ""}
                                onChange={(v) => {
                                    setSelectedListId(v || undefined);
                                    if (typeof window !== "undefined") {
                                        if (v) localStorage.setItem("sdr_callbacks_list", v);
                                        else localStorage.removeItem("sdr_callbacks_list");
                                    }
                                }}
                                placeholder="Toutes les listes"
                                options={[
                                    { value: "", label: "Toutes les listes" },
                                    ...(selectedMissionId
                                        ? lists.filter((l) => l.mission.id === selectedMissionId)
                                        : lists
                                    ).map((l) => ({ value: l.id, label: l.name })),
                                ]}
                                className="flex-1"
                            />
                        </div>
                        {/* Sort */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Trier par</label>
                            <select
                                value={sortKey}
                                onChange={(e) => setSortKey(e.target.value as SortKey)}
                                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-400 transition-shadow cursor-pointer"
                            >
                                <option value="urgency">Urgence</option>
                                <option value="date">Date</option>
                                <option value="name">Nom</option>
                                <option value="mission">Mission</option>
                            </select>
                        </div>
                        {/* Sort direction */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ordre</label>
                            <button
                                type="button"
                                onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                                className="w-full h-10 px-3 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 hover:bg-slate-50 flex items-center justify-center gap-2 transition-colors"
                            >
                                <ArrowUpDown className="w-4 h-4 text-slate-500" />
                                {sortDir === "asc" ? "Croissant ↑" : "Décroissant ↓"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            {callbacksFetchError ? (
                <EmptyState
                    icon={AlertTriangle}
                    title={callbacksFetchError}
                    description="Vérifiez votre connexion et réessayez."
                    action={
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setCallbacksFetchError(null);
                                fetchCallbacks();
                            }}
                            className="gap-2"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Réessayer
                        </Button>
                    }
                />
            ) : callbacks.length === 0 ? (
                <Card className="text-center py-16 border-dashed border-2 bg-slate-50/50">
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-100">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">Tout est à jour !</h3>
                    <p className="text-slate-500 mt-2 max-w-sm mx-auto">
                        Aucun rappel en attente. C&apos;est le moment idéal pour lancer une nouvelle session de prospection.
                    </p>
                    <Link href="/sdr/action" className="inline-block mt-8">
                        <Button className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 text-white shadow-lg shadow-indigo-200 transaction-all hover:-translate-y-0.5">
                            Démarrer une session
                        </Button>
                    </Link>
                </Card>
            ) : viewMode === "table" ? (
                /* ========== TABLE VIEW ========== */
                <div className="relative z-0 bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <DataTable
                        data={sortedCallbacks}
                        columns={tableColumns}
                        keyField={(cb) => cb.id}
                        searchable
                        searchPlaceholder="Rechercher contact, société, téléphone, note..."
                        searchFields={["contact.firstName", "contact.lastName", "company.name", "contact.company.name", "contact.phone", "company.phone", "note"]}
                        pagination
                        pageSize={20}
                        emptyMessage="Aucun rappel trouvé avec ces filtres."
                        onRowClick={(cb) => openDrawerForCallback(cb)}
                        getRowClassName={(cb) => {
                            const urgency = getUrgencyLevel(cb);
                            if (urgency.level === "overdue") return "bg-red-50/40 hover:bg-red-50/70 border-l-4 border-l-red-400";
                            if (urgency.level === "due_now") return "bg-amber-50/30 hover:bg-amber-50/60 border-l-4 border-l-amber-400";
                            return "";
                        }}
                    />
                </div>
            ) : (
                /* ========== CARD VIEW ========== */
                <div className="grid grid-cols-1 gap-4">
                    {sortedCallbacks.map((callback) => {
                        const urgency = getUrgencyLevel(callback);
                        const borderColor = urgency.level === "overdue"
                            ? "from-red-500 to-red-400"
                            : urgency.level === "due_now"
                                ? "from-amber-500 to-orange-400"
                                : "from-amber-400 to-orange-400";

                        return (
                            <div
                                key={callback.id}
                                className={cn(
                                    "group relative bg-white rounded-2xl p-5 border shadow-[0_2px_8px_rgb(0,0,0,0.04)] hover:shadow-[0_12px_24px_rgb(0,0,0,0.08)] hover:border-indigo-200/60 transition-all duration-300 hover:-translate-y-0.5",
                                    urgency.level === "overdue"
                                        ? "border-red-200/80 bg-gradient-to-r from-red-50/20 to-white"
                                        : urgency.level === "due_now"
                                            ? "border-amber-200/80 bg-gradient-to-r from-amber-50/20 to-white"
                                            : "border-slate-200/60"
                                )}
                            >
                                <div className={cn("absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b rounded-l-2xl group-hover:w-2 transition-all duration-300", borderColor)} />

                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pl-4">
                                    <div
                                        className="flex items-start gap-5 cursor-pointer min-w-0 flex-1"
                                        onClick={() => openDrawerForCallback(callback)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => e.key === "Enter" && openDrawerForCallback(callback)}
                                    >
                                        <div className={cn(
                                            "w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 border shadow-inner group-hover:scale-110 transition-transform duration-300",
                                            urgency.level === "overdue"
                                                ? "bg-gradient-to-br from-red-50 to-red-100 border-red-200"
                                                : urgency.level === "due_now"
                                                    ? "bg-gradient-to-br from-amber-50 to-orange-100 border-amber-200"
                                                    : "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100"
                                        )}>
                                            {urgency.level === "overdue" ? (
                                                <AlertTriangle className="w-7 h-7 text-red-600" />
                                            ) : urgency.level === "due_now" ? (
                                                <BellRing className="w-7 h-7 text-amber-600" />
                                            ) : (
                                                <Clock className="w-7 h-7 text-amber-600" />
                                            )}
                                        </div>

                                        <div className="space-y-1.5 min-w-0 flex-1">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-900 transition-colors">
                                                    {callback.contact
                                                        ? `${callback.contact.firstName || ''} ${callback.contact.lastName || ''}`.trim() || 'Contact inconnu'
                                                        : callback.company?.name || 'Société inconnue'
                                                    }
                                                </h3>
                                                {/* Urgency badge */}
                                                <Badge className={cn("text-xs font-semibold border", urgency.color)}>
                                                    {urgency.level === "overdue" && <AlertTriangle className="w-3 h-3 mr-1" />}
                                                    {urgency.label}
                                                </Badge>
                                                {callback.callbackDate && (
                                                    <span className="text-xs text-slate-500 font-medium">
                                                        {formatCallbackDateTime(callback.callbackDate)}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                                                <div className="flex items-center gap-1.5 font-medium">
                                                    <Building2 className="w-4 h-4 text-slate-400" />
                                                    {callback.contact?.company.name || callback.company?.name || 'N/A'}
                                                </div>
                                                {callback.contact?.title && (
                                                    <div className="flex items-center gap-1.5 text-slate-500">
                                                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                                                        {callback.contact.title}
                                                    </div>
                                                )}
                                                {/* Inline phone */}
                                                {(callback.contact?.phone || callback.company?.phone) && (
                                                    <a
                                                        href={`tel:${callback.contact?.phone || callback.company?.phone}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 rounded-md transition-all"
                                                    >
                                                        <PhoneCall className="w-3 h-3" />
                                                        {callback.contact?.phone || callback.company?.phone}
                                                    </a>
                                                )}
                                            </div>

                                            {/* Context */}
                                            {(callback.mission || callback.note || callback.sdr) && (
                                                <div className="flex flex-wrap items-center gap-3 mt-2">
                                                    {callback.sdr && (
                                                        <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
                                                            Assigné à: {callback.sdr.name ?? '—'}
                                                        </Badge>
                                                    )}
                                                    {callback.mission?.client && (
                                                        <Badge variant="outline" className="bg-indigo-50/50 text-indigo-700 border-indigo-100">
                                                            {callback.mission.name}
                                                        </Badge>
                                                    )}
                                                    {callback.note && (
                                                        <p className="text-sm text-slate-500 italic truncate max-w-md border-l-2 border-slate-200 pl-2">
                                                            &quot;{callback.note}&quot;
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 pl-4 md:pl-0 border-t md:border-t-0 border-slate-50 pt-4 md:pt-0 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Suite à donner</p>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="gap-1.5 border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                                onClick={(e) => openOutcome(callback, "MEETING_BOOKED", e)}
                                            >
                                                <Calendar className="w-3.5 h-3.5" />
                                                RDV pris
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="gap-1.5 border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                                onClick={(e) => openOutcome(callback, "INTERESTED", e)}
                                            >
                                                <Sparkles className="w-3.5 h-3.5" />
                                                Intéressé
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="gap-1.5 border border-blue-200 text-blue-700 hover:bg-blue-50"
                                                onClick={(e) => openOutcome(callback, "ENVOIE_MAIL", e)}
                                            >
                                                <Mail className="w-3.5 h-3.5" />
                                                Mail
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50"
                                                onClick={(e) => openOutcome(callback, "NO_RESPONSE", e)}
                                            >
                                                <XCircle className="w-3.5 h-3.5" />
                                                Pas de réponse
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="gap-1.5 border border-red-200 text-red-600 hover:bg-red-50"
                                                onClick={(e) => openOutcome(callback, "DISQUALIFIED", e)}
                                            >
                                                <XCircle className="w-3.5 h-3.5" />
                                                Disqualifié
                                            </Button>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50"
                                                onClick={(e) => openReschedule(callback, e)}
                                            >
                                                <CalendarClock className="w-4 h-4" />
                                                Reprogrammer
                                            </Button>
                                            <Button
                                                size="sm"
                                                className="bg-slate-900 hover:bg-indigo-600 text-white shadow-md hover:shadow-indigo-200 transition-all duration-300 gap-2"
                                                onClick={(e) => openDrawerForCallback(callback, e)}
                                            >
                                                <Eye className="w-4 h-4" />
                                                <span>Fiche complète</span>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Unified Action Drawer — mount only when open */}
            {unifiedDrawerOpen && unifiedDrawerCompanyId && (
                <UnifiedActionDrawer
                    isOpen={unifiedDrawerOpen}
                    onClose={closeUnifiedDrawer}
                    contactId={unifiedDrawerContactId}
                    companyId={unifiedDrawerCompanyId}
                    missionId={unifiedDrawerMissionId}
                    missionName={unifiedDrawerMissionName}
                    enableGooglePhoneLookup
                    onActionRecorded={fetchCallbacks}
                />
            )}

            {/* Stats modal */}
            <Modal
                isOpen={showStatsModal}
                onClose={() => setShowStatsModal(false)}
                title="Statistiques des rappels"
                description={selectedMissionId ? missions.find((m) => m.id === selectedMissionId)?.name : "Tous les rappels"}
                size="xl"
            >
                <CallbacksStatsModalBody
                    callbacks={sortedCallbacks}
                    getUrgencyLevel={getUrgencyLevel}
                    formatCallbackDateTime={formatCallbackDateTime}
                    onRowClick={(cb) => {
                        openDrawerForCallback(cb);
                        setShowStatsModal(false);
                    }}
                />
            </Modal>

            {/* Outcome modal */}
            <Modal
                isOpen={!!outcomeCallback && !!outcomeResult}
                onClose={() => { setOutcomeCallback(null); setOutcomeResult(null); setOutcomeNote(""); }}
                title={outcomeResult ? `Résultat du rappel — ${ACTION_RESULT_LABELS[outcomeResult]}` : ""}
                description={outcomeCallback ? (outcomeCallback.contact ? `${outcomeCallback.contact.firstName ?? ""} ${outcomeCallback.contact.lastName ?? ""}`.trim() || outcomeCallback.company?.name : outcomeCallback.company?.name) ?? "" : ""}
                size="sm"
            >
                {outcomeCallback && outcomeResult && (
                    <div className="space-y-4">
                        {(outcomeResult === "INTERESTED" || outcomeResult === "CALLBACK_REQUESTED" || outcomeResult === "ENVOIE_MAIL") && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                Une note est requise pour ce résultat.
                            </p>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                {(outcomeResult === "INTERESTED" || outcomeResult === "CALLBACK_REQUESTED" || outcomeResult === "ENVOIE_MAIL") ? "Note *" : "Note (optionnel)"}
                            </label>
                            <textarea
                                value={outcomeNote}
                                onChange={(e) => setOutcomeNote(e.target.value)}
                                placeholder="Ex: RDV confirmé jeudi 14h, Intéressé par la démo..."
                                rows={3}
                                maxLength={500}
                                className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            />
                            <p className="text-xs text-slate-400 mt-1 text-right">{outcomeNote.length}/500</p>
                        </div>
                        <ModalFooter>
                            <Button variant="ghost" onClick={() => { setOutcomeCallback(null); setOutcomeResult(null); setOutcomeNote(""); }}>
                                Annuler
                            </Button>
                            <Button
                                variant="primary"
                                onClick={submitOutcome}
                                disabled={outcomeSubmitting || ((outcomeResult === "INTERESTED" || outcomeResult === "CALLBACK_REQUESTED" || outcomeResult === "ENVOIE_MAIL") && !outcomeNote.trim())}
                                isLoading={outcomeSubmitting}
                            >
                                Enregistrer
                            </Button>
                        </ModalFooter>
                    </div>
                )}
            </Modal>

            {/* Reschedule modal */}
            <Modal
                isOpen={!!rescheduleCallback}
                onClose={() => setRescheduleCallback(null)}
                title="Reprogrammer le rappel"
                description={rescheduleCallback ? (rescheduleCallback.mission?.name ? `Mission: ${rescheduleCallback.mission.name}` : "Choisissez une nouvelle date") : ""}
                size="sm"
            >
                {rescheduleCallback && (
                    <div className="space-y-4">
                        {rescheduleCallback.sdr && (
                            <p className="text-sm text-slate-600">
                                <span className="font-medium">SDR:</span> {rescheduleCallback.sdr.name}
                            </p>
                        )}
                        {rescheduleCallback.note && (
                            <p className="text-sm text-slate-500 italic border-l-2 border-slate-200 pl-2">
                                &quot;{rescheduleCallback.note}&quot;
                            </p>
                        )}
                        {/* Quick reschedule buttons */}
                        <div>
                            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Raccourcis rapides</label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { label: "Dans 1h", ms: 60 * 60 * 1000 },
                                    { label: "Dans 2h", ms: 2 * 60 * 60 * 1000 },
                                    { label: "Demain 9h", ms: null, fn: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
                                    { label: "Demain 14h", ms: null, fn: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(14, 0, 0, 0); return d; } },
                                    { label: "Lundi 9h", ms: null, fn: () => { const d = new Date(); const dayOfWeek = d.getDay(); const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek; d.setDate(d.getDate() + daysUntilMonday); d.setHours(9, 0, 0, 0); return d; } },
                                ].map((shortcut) => (
                                    <button
                                        key={shortcut.label}
                                        type="button"
                                        onClick={() => {
                                            const date = shortcut.fn ? shortcut.fn() : new Date(Date.now() + (shortcut.ms || 0));
                                            setRescheduleDateValue(date.toISOString().slice(0, 16));
                                        }}
                                        className="px-3 py-1.5 text-xs font-medium border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                                    >
                                        {shortcut.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <DateTimePicker
                                label="Nouvelle date et heure"
                                value={rescheduleDateValue}
                                onChange={setRescheduleDateValue}
                                placeholder="Choisir date et heure…"
                                min={new Date().toISOString().slice(0, 16)}
                                triggerClassName="border-amber-200 focus:ring-amber-400/40 focus:border-amber-400"
                            />
                        </div>
                        <ModalFooter>
                            <Button variant="ghost" onClick={() => setRescheduleCallback(null)}>
                                Annuler
                            </Button>
                            <Button
                                variant="primary"
                                onClick={submitReschedule}
                                disabled={!rescheduleDateValue || rescheduleSubmitting}
                                isLoading={rescheduleSubmitting}
                            >
                                Enregistrer
                            </Button>
                        </ModalFooter>
                    </div>
                )}
            </Modal>
        </div>
    );
}
