"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Phone,
    Mail,
    Linkedin,
    Building2,
    User,
    Globe,
    Clock,
    Calendar,
    Sparkles,
    ChevronRight,
    CheckCircle2,
    XCircle,
    Ban,
    Loader2,
    ExternalLink,
    RefreshCw,
    AlertCircle,
    Filter,
    RotateCcw,
    MessageSquare,
    SkipForward,
    History,
    PhoneCall,
    Eye,
    Copy,
    ArrowDownUp,
    PhoneOff,
    MailOpen,
    PenLine,
    BarChart2,
    Trash2,
    Send,
} from "lucide-react";
import { Card, Badge, Button, LoadingState, EmptyState, Tabs, Drawer, DataTable, Select, useToast, TableSkeleton, CardSkeleton, Modal, DateTimePicker } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import dynamic from "next/dynamic";
import { CompanyDrawer, ContactDrawer } from "@/components/drawers";
import { BookingDrawer } from "@/components/sdr/BookingDrawer";
import { AlloCallPickerModal } from "@/components/sdr/AlloCallPickerModal";
import { ScriptCompanionDrawer } from "@/components/sdr/ScriptCompanionDrawer";
import { useSidebar } from "@/components/layout/SidebarProvider";

const UnifiedActionDrawer = dynamic(
    () => import("@/components/drawers/UnifiedActionDrawer").then((m) => ({ default: m.UnifiedActionDrawer })),
    { ssr: false }
);
import { QuickEmailModal } from "@/components/email/QuickEmailModal";
import type { ActionResult, Channel } from "@/lib/types";
import { ACTION_RESULT_LABELS, CHANNEL_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
    sdrActionQueueKey,
    sdrDrawerContactKey,
    sdrDrawerCompanyKey,
    sdrClientBookingKey,
} from "@/lib/query-keys";

// ============================================
// TYPES
// ============================================

interface AlloCallItem {
    id: string;
    from: string;
    to: string;
    duration: number;
    direction: 'INBOUND' | 'OUTBOUND';
    outcome?: string;
    summary?: string;
    recording_url?: string;
    transcript?: Array<{ source: string; text: string }>;
    created_at?: string;
    start_time?: string | number;
}

interface NextActionData {
    hasNext: boolean;
    message?: string;
    priority?: "CALLBACK" | "FOLLOW_UP" | "NEW" | "RETRY";
    missionName?: string;
    contact?: {
        id: string;
        firstName?: string;
        lastName?: string;
        title?: string;
        email?: string;
        phone?: string;
        linkedin?: string;
        status: string;
    } | null;
    company?: {
        id: string;
        name: string;
        industry?: string;
        website?: string;
        country?: string;
        phone?: string | null;
    };
    campaignId?: string;
    strategyName?: string | null;
    sourceListId?: string | null;
    sourceListName?: string | null;
    channel?: Channel;
    script?: string;
    scriptAdditional?: string;
    scriptAiEnhanced?: string;
    scriptDefaultTab?: "base" | "additional" | "ai";
    clientBookingUrl?: string;
    clientInterlocuteurs?: Array<{
        id: string; firstName: string; lastName: string; title?: string;
        emails: Array<{ value: string; label: string; isPrimary: boolean }>;
        phones: Array<{ value: string; label: string; isPrimary: boolean }>;
        bookingLinks: Array<{ label: string; url: string; durationMinutes: number }>;
        isActive: boolean;
    }>;
    lastAction?: {
        result: string;
        note?: string;
        createdAt: string;
        callbackDate?: string;
    };
    lastActionBy?: { id: string; name: string | null } | null;
}

interface Mission {
    id: string;
    name: string;
    channel: string;
    client: { name: string };
    defaultMailboxId?: string | null;
}

interface ListItem {
    id: string;
    name: string;
    mission: { id: string; name: string };
    contactsCount: number;
}

interface QueueItem {
    contactId: string | null;
    companyId: string;
    contact: NextActionData["contact"] | null;
    company: NonNullable<NextActionData["company"]>;
    campaignId: string;
    channel: string;
    missionName: string;
    lastAction: NextActionData["lastAction"] | null;
    lastActionBy?: { id: string; name: string | null } | null;
    priority: string;
    _displayName?: string;
    _companyName?: string;
    _phone?: string | null;
    _email?: string | null;
    _searchNote?: string | null;
}

interface DrawerContact {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    additionalPhones?: string[] | null;
    additionalEmails?: string[] | null;
    title: string | null;
    linkedin: string | null;
    status: "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";
    companyId: string;
    companyName?: string;
    companyPhone?: string | null;
}

interface DrawerCompany {
    id: string;
    name: string;
    industry: string | null;
    country: string | null;
    website: string | null;
    size: string | null;
    phone: string | null;
    additionalPhones?: string[] | null;
    status: "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";
    contacts: Array<{
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        title: string | null;
        linkedin: string | null;
        status: "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";
        companyId: string;
    }>;
    _count: { contacts: number };
}

function extractCompanyAdditionalPhones(customData: unknown): string[] {
    if (!customData || typeof customData !== "object" || !("additionalPhones" in customData)) {
        return [];
    }

    const raw = (customData as { additionalPhones?: unknown }).additionalPhones;
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0);
}

function resolveCompanyPhone(
    phone: string | null | undefined,
    customData: unknown
): { phone: string | null; additionalPhones: string[] } {
    const additionalPhones = extractCompanyAdditionalPhones(customData);
    const primaryPhone = phone?.trim() || additionalPhones[0] || null;
    const remainingPhones = additionalPhones.filter((value) => value !== primaryPhone);

    return {
        phone: primaryPhone,
        additionalPhones: remainingPhones,
    };
}

// Fallback when config API not available
const RESULT_OPTIONS_FALLBACK: { value: ActionResult; label: string; icon: React.ReactNode; key: string; color: string }[] = [
    { value: "NO_RESPONSE", label: "Pas de réponse", icon: <XCircle className="w-4 h-4" />, key: "1", color: "slate" },
    { value: "BAD_CONTACT", label: "Mauvais contact", icon: <Ban className="w-4 h-4" />, key: "2", color: "red" },
    { value: "INTERESTED", label: "Intéressé", icon: <Sparkles className="w-4 h-4" />, key: "3", color: "emerald" },
    { value: "CALLBACK_REQUESTED", label: "Rappel demandé", icon: <Clock className="w-4 h-4" />, key: "4", color: "amber" },
    { value: "MEETING_BOOKED", label: "RDV pris", icon: <Calendar className="w-4 h-4" />, key: "5", color: "indigo" },
    { value: "DISQUALIFIED", label: "Disqualifié", icon: <XCircle className="w-4 h-4" />, key: "6", color: "slate" },
    { value: "ENVOIE_MAIL", label: "Mail à envoyer", icon: <Mail className="w-4 h-4" />, key: "7", color: "blue" },
    { value: "MAIL_ENVOYE", label: "Mail envoyé", icon: <Send className="w-4 h-4" />, key: "8", color: "emerald" },
];

const RESULT_ICON_MAP: Record<string, React.ReactNode> = {
    NO_RESPONSE: <XCircle className="w-4 h-4" />,
    BAD_CONTACT: <Ban className="w-4 h-4" />,
    INTERESTED: <Sparkles className="w-4 h-4" />,
    CALLBACK_REQUESTED: <Clock className="w-4 h-4" />,
    MEETING_BOOKED: <Calendar className="w-4 h-4" />,
    MEETING_CANCELLED: <XCircle className="w-4 h-4" />,
    DISQUALIFIED: <XCircle className="w-4 h-4" />,
    ENVOIE_MAIL: <Mail className="w-4 h-4" />,
    MAIL_ENVOYE: <Send className="w-4 h-4" />,
    BARRAGE_STANDARD: <PhoneOff className="w-4 h-4" />,
    BARRAGE_SECRETAIRE: <PhoneOff className="w-4 h-4" />,
    NUMERO_KO: <PhoneOff className="w-4 h-4" />,
    FAUX_NUMERO: <PhoneOff className="w-4 h-4" />,
    INVALIDE: <Ban className="w-4 h-4" />,
    REFUS: <XCircle className="w-4 h-4" />,
    REFUS_ARGU: <XCircle className="w-4 h-4" />,
    REFUS_CATEGORIQUE: <XCircle className="w-4 h-4" />,
    RELANCE: <RotateCcw className="w-4 h-4" />,
    RAPPEL: <Clock className="w-4 h-4" />,
    PROJET_A_SUIVRE: <Sparkles className="w-4 h-4" />,
    MAUVAIS_INTERLOCUTEUR: <Ban className="w-4 h-4" />,
    MAIL_UNIQUEMENT: <Mail className="w-4 h-4" />,
    MAIL_DOC: <Mail className="w-4 h-4" />,
    HORS_CIBLE: <Ban className="w-4 h-4" />,
    GERE_PAR_SIEGE: <Building2 className="w-4 h-4" />,
    NOT_INTERESTED: <XCircle className="w-4 h-4" />,
    CONNECTION_SENT: <Linkedin className="w-4 h-4" />,
    MESSAGE_SENT: <Send className="w-4 h-4" />,
    REPLIED: <MessageSquare className="w-4 h-4" />,
};

const RESULT_SEMANTIC: Record<string, {
    iconCls: string; selectedCls: string; hoverCls: string; activeBorder: string;
}> = {
    NO_RESPONSE:        { iconCls: "bg-slate-100 text-slate-500",   selectedCls: "bg-slate-50 border-slate-400",      hoverCls: "hover:border-slate-300 hover:bg-slate-50",     activeBorder: "border-l-slate-400" },
    BAD_CONTACT:        { iconCls: "bg-red-100 text-red-500",       selectedCls: "bg-red-50 border-red-400",          hoverCls: "hover:border-red-200 hover:bg-red-50/60",      activeBorder: "border-l-red-400" },
    INTERESTED:         { iconCls: "bg-emerald-100 text-emerald-600", selectedCls: "bg-emerald-50 border-emerald-400", hoverCls: "hover:border-emerald-200 hover:bg-emerald-50/60", activeBorder: "border-l-emerald-500" },
    CALLBACK_REQUESTED: { iconCls: "bg-amber-100 text-amber-600",   selectedCls: "bg-amber-50 border-amber-400",      hoverCls: "hover:border-amber-200 hover:bg-amber-50/60",  activeBorder: "border-l-amber-400" },
    RELANCE:            { iconCls: "bg-amber-100 text-amber-600",   selectedCls: "bg-amber-50 border-amber-400",      hoverCls: "hover:border-amber-200 hover:bg-amber-50/60",  activeBorder: "border-l-amber-400" },
    RAPPEL:             { iconCls: "bg-amber-100 text-amber-600",   selectedCls: "bg-amber-50 border-amber-400",      hoverCls: "hover:border-amber-200 hover:bg-amber-50/60",  activeBorder: "border-l-amber-400" },
    MEETING_BOOKED:     { iconCls: "bg-violet-100 text-violet-600", selectedCls: "bg-violet-50 border-violet-400",    hoverCls: "hover:border-violet-200 hover:bg-violet-50/60", activeBorder: "border-l-violet-500" },
    MEETING_CANCELLED:  { iconCls: "bg-slate-100 text-slate-500",   selectedCls: "bg-slate-50 border-slate-400",      hoverCls: "hover:border-slate-300 hover:bg-slate-50",     activeBorder: "border-l-slate-400" },
    DISQUALIFIED:       { iconCls: "bg-slate-100 text-slate-500",   selectedCls: "bg-slate-100 border-slate-400",     hoverCls: "hover:border-slate-300 hover:bg-slate-100/60", activeBorder: "border-l-slate-400" },
    ENVOIE_MAIL:        { iconCls: "bg-blue-100 text-blue-600",     selectedCls: "bg-blue-50 border-blue-400",        hoverCls: "hover:border-blue-200 hover:bg-blue-50/60",    activeBorder: "border-l-blue-400" },
    MAIL_ENVOYE:        { iconCls: "bg-emerald-100 text-emerald-600", selectedCls: "bg-emerald-50 border-emerald-400", hoverCls: "hover:border-emerald-200 hover:bg-emerald-50/60", activeBorder: "border-l-emerald-500" },
};
const DEFAULT_SEMANTIC = { iconCls: "bg-violet-100 text-violet-600", selectedCls: "bg-violet-50 border-violet-400", hoverCls: "hover:border-violet-200 hover:bg-violet-50/60", activeBorder: "border-l-violet-400" };

const getInitials = (firstName?: string | null, lastName?: string | null, fallback?: string | null): string => {
    const f = firstName?.trim() || "";
    const l = lastName?.trim() || "";
    if (f || l) return `${f[0] || ""}${l[0] || ""}`.toUpperCase();
    return (fallback?.trim()[0] || "?").toUpperCase();
};

const TABLE_QUEUE_LIMIT = 120;
const STATS_QUEUE_LIMIT = 250;

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
    ABSENT_RDV: { label: "⚠ RDV Absent", color: "bg-red-100 text-red-800 border-red-300 font-bold animate-pulse" },
    CALLBACK: { label: "Rappel", color: "bg-amber-50 text-amber-700 border-amber-200" },
    FOLLOW_UP: { label: "Suivi", color: "bg-blue-50 text-blue-700 border-blue-200" },
    NEW: { label: "Nouveau", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    RETRY: { label: "Relance", color: "bg-slate-50 text-slate-700 border-slate-200" },
};

const STATUS_HOVER_HINTS: Record<string, string> = {
    RELANCE: "Rappel demandé\nLe prospect attend ton appel\nIl y a un signal d'intérêt",
    RAPPEL: "Rappel à faire\nLe prospect n'a pas encore été joint\nC'est un rappel logistique, pas commercial",
};

const SCRIPT_TABS = [
    { id: "base", label: "Script de base" },
    { id: "additional", label: "Script additionel" },
    { id: "ai", label: "Script amélioré par IA" },
];

/** Format a Date for a datetime-local input (local time, YYYY-MM-DDTHH:mm). */
function toLocalDateTimeInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** One-tap callback slots so the SDR never has to open the date picker mid-call. */
const CALLBACK_QUICK_PICKS: { label: string; compute: () => Date }[] = [
    { label: "Dans 1h", compute: () => new Date(Date.now() + 60 * 60 * 1000) },
    { label: "Demain 9h", compute: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
    { label: "Demain 14h", compute: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(14, 0, 0, 0); return d; } },
    { label: "Dans 2 jours", compute: () => { const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(9, 0, 0, 0); return d; } },
    { label: "Lundi 9h", compute: () => { const d = new Date(); const delta = ((8 - d.getDay()) % 7) || 7; d.setDate(d.getDate() + delta); d.setHours(9, 0, 0, 0); return d; } },
];

// Stats modal body: summary + list of contacts with status (for Actions page)
function ActionStatsModalBody({
    items,
    loading,
    statusLabels,
    onRowClick,
    priorityLabels,
    resultIconMap,
    queueRowKey,
}: {
    items: QueueItem[];
    loading: boolean;
    statusLabels: Record<string, string>;
    onRowClick: (row: QueueItem) => void;
    priorityLabels: Record<string, { label: string; color: string }>;
    resultIconMap: Record<string, React.ReactNode>;
    queueRowKey: (row: QueueItem) => string;
}) {
    const byStatus = useMemo(() => {
        const map: Record<string, number> = {};
        items.forEach((row) => {
            const key = row.lastAction?.result ?? "NONE";
            map[key] = (map[key] ?? 0) + 1;
        });
        return map;
    }, [items]);
    const byPriority = useMemo(() => {
        const map: Record<string, number> = {};
        items.forEach((row) => {
            const key = row.priority ?? "";
            map[key] = (map[key] ?? 0) + 1;
        });
        return map;
    }, [items]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-[#f5f5f5] border border-[#e5e5e5] p-3">
                    <p className="text-[11px] font-[500] text-slate-400 uppercase tracking-wide">Total</p>
                    <p className="text-[24px] font-[500] text-[#1a1a1a] tabular-nums">{items.length}</p>
                </div>
                {Object.entries(priorityLabels).map(([key, { label, color }]) => (
                    <div key={key} className={cn("rounded-xl border p-3", color)}>
                        <p className="text-[11px] font-[500] uppercase tracking-wide opacity-80">{label}</p>
                        <p className="text-[24px] font-[500] tabular-nums">{byPriority[key] ?? 0}</p>
                    </div>
                ))}
            </div>
            <div>
                <h4 className="text-[11px] font-[500] uppercase tracking-wide text-slate-400 mb-2">Par statut</h4>
                <div className="flex flex-wrap gap-1.5">
                    <Badge className="bg-[#f5f5f5] text-slate-600 border-[#e5e5e5] text-[12px]">Jamais contacté: {byStatus["NONE"] ?? 0}</Badge>
                    {Object.entries(statusLabels).map(([key, label]) => (
                        <Badge key={key} className="bg-[#f5f5f5] text-slate-600 border-[#e5e5e5] text-[12px]">{label}: {byStatus[key] ?? 0}</Badge>
                    ))}
                </div>
            </div>
            <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Tous les contacts</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[320px] overflow-y-auto">
                    {items.length === 0 ? (
                        <p className="text-center py-8 text-slate-500 text-sm">Aucun contact dans cette vue.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                <tr>
                                    <th className="text-left py-2.5 px-3 font-medium text-slate-600">Contact / Société</th>
                                    <th className="text-left py-2.5 px-3 font-medium text-slate-600">Statut</th>
                                    <th className="text-left py-2.5 px-3 font-medium text-slate-600">Priorité</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((row) => {
                                    const name = row._displayName ?? (row.contact ? `${row.contact.firstName ?? ""} ${row.contact.lastName ?? ""}`.trim() || row.company.name : row.company.name);
                                    const status = row.lastAction ? (statusLabels[row.lastAction.result] ?? row.lastAction.result) : "Jamais contacté";
                                    const pri = priorityLabels[row.priority];
                                    const isAbsent = row.priority === "ABSENT_RDV";
                                    return (
                                        <tr
                                            key={queueRowKey(row)}
                                            onClick={() => onRowClick(row)}
                                            className={cn(
                                                "border-b last:border-0 cursor-pointer transition-colors",
                                                isAbsent
                                                    ? "bg-red-50 border-red-100 hover:bg-red-100/80"
                                                    : "border-slate-100 hover:bg-indigo-50/80"
                                            )}
                                        >
                                            <td className="py-2.5 px-3">
                                                <span className="font-medium text-slate-900">{name}</span>
                                                {row._companyName && row._companyName !== name && (
                                                    <span className="text-slate-500 text-xs block">{row._companyName}</span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3">
                                                {row.lastAction ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        {resultIconMap[row.lastAction.result]}
                                                        {status}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 italic">Jamais contacté</span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3">
                                                {pri ? <Badge className={cn("text-xs", pri.color)}>{pri.label}</Badge> : row.priority}
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

export default function SDRActionPage() {
    const { setCollapsed } = useSidebar();
    const { data: session } = useSession();
    const { success, error: showError } = useToast();
    const [currentAction, setCurrentAction] = useState<NextActionData | null>(null);
    const [selectedResult, setSelectedResult] = useState<ActionResult | null>(null);
    const [note, setNote] = useState("");
    const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
    /** For CALLBACK_REQUESTED: date/time from calendar (YYYY-MM-DDTHH:mm for datetime-local). */
    const [callbackDateValue, setCallbackDateValue] = useState("");
    /** Label of the quick-pick chip used to fill the callback date (for active styling). */
    const [callbackQuickLabel, setCallbackQuickLabel] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [actionsCompleted, setActionsCompleted] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const nextActionAbortRef = useRef<AbortController | null>(null);
    const refreshQueueAbortRef = useRef<AbortController | null>(null);
    const [isSyncingCalls, setIsSyncingCalls] = useState(false);
    const [syncResult, setSyncResult] = useState<{ enriched: number; total: number } | null>(null);

    // Allo call picker dialog
    const [alloDialogOpen, setAlloDialogOpen] = useState(false);
    const [alloDialogCalls, setAlloDialogCalls] = useState<AlloCallItem[]>([]);
    const [alloDialogLoading, setAlloDialogLoading] = useState(false);
    const [alloDialogSelectedId, setAlloDialogSelectedId] = useState<string | null>(null);
    const [alloDialogFilterPhone, setAlloDialogFilterPhone] = useState("");
    const [alloDialogAlloLineCount, setAlloDialogAlloLineCount] = useState<number | null>(null);
    const [linkedAlloCall, setLinkedAlloCall] = useState<AlloCallItem | null>(null);

    const [missions, setMissions] = useState<Mission[]>([]);
    const [lists, setLists] = useState<ListItem[]>([]);
    const [todayBlocksData, setTodayBlocksData] = useState<{
        todayBlocks: Array<{ id: string; startTime: string; endTime: string; mission: { id: string; name: string; channel: string } }>;
        todayMissionIds: string[];
        weekBlocks: Array<{ id: string; date: string; startTime: string; endTime: string; mission: { id: string; name: string; channel: string } }>;
        hasBlocksToday: boolean;
    } | null>(null);
    const [todayBlocksLoading, setTodayBlocksLoading] = useState(true);
    const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
    const [selectedListId, setSelectedListIdState] = useState<string | null>(null);
    const setSelectedListId = useCallback((value: string | null | ((prev: string | null) => string | null)) => {
        setSelectedListIdState((prev) => {
            const next = typeof value === "function" ? value(prev) : value;
            if (typeof window !== "undefined") {
                if (next) localStorage.setItem("sdr_selected_list", next);
                else localStorage.removeItem("sdr_selected_list");
            }
            return next;
        });
    }, []);
    const [viewType, setViewTypeState] = useState<"all" | "companies" | "contacts">(() =>
        (typeof window !== "undefined" && (localStorage.getItem("sdr_view_type") as "all" | "companies" | "contacts") in { all: 1, companies: 1, contacts: 1 })
            ? (localStorage.getItem("sdr_view_type") as "all" | "companies" | "contacts")
            : "contacts"
    );
    const setViewType = useCallback((value: "all" | "companies" | "contacts" | ((prev: "all" | "companies" | "contacts") => "all" | "companies" | "contacts")) => {
        setViewTypeState((prev) => {
            const next = typeof value === "function" ? value(prev) : value;
            if (typeof window !== "undefined") localStorage.setItem("sdr_view_type", next);
            return next;
        });
    }, []);
    const [activeTab, setActiveTab] = useState<string>("base");
    const [showBookingDrawer, setShowBookingDrawer] = useState(false);
    const [unifiedBookingDialogOpen, setUnifiedBookingDialogOpen] = useState(false);
    const [unifiedAlloDialogOpen, setUnifiedAlloDialogOpen] = useState(false);
    const [rdvDate, setRdvDate] = useState("");
    const [meetingCat, setMeetingCat] = useState<"EXPLORATOIRE" | "BESOIN" | "">("");

    // View mode: card vs table — persisted in localStorage
    const [viewMode, setViewModeState] = useState<"card" | "table">(() =>
        (typeof window !== "undefined" && localStorage.getItem("sdr_view_mode") === "card") ? "card" : "table"
    );
    const setViewMode = useCallback((value: "card" | "table" | ((prev: "card" | "table") => "card" | "table")) => {
        setViewModeState((prev) => {
            const next = typeof value === "function" ? value(prev) : value;
            if (typeof window !== "undefined") localStorage.setItem("sdr_view_mode", next);
            return next;
        });
    }, []);
    // Mission search: server-side search so contacts can be filtered by name
    const [tableSearchInput, setTableSearchInput] = useState("");
    const [tableSearchApi, setTableSearchApi] = useState("");
    const queryClient = useQueryClient();
    const queueQueryKey = sdrActionQueueKey(selectedMissionId, selectedListId, tableSearchApi);
    const mapQueueItems = useCallback((items: QueueItem[]) =>
        items.map((i) => ({
            ...i,
            _displayName: i.contact
                ? `${(i.contact.firstName || "").trim()} ${(i.contact.lastName || "").trim()}`.trim() || i.company.name
                : i.company.name,
            _companyName: i.company.name,
            _phone: i.contact?.phone || i.company?.phone || null,
            _email: i.contact?.email || null,
            _searchNote: i.lastAction?.note ?? null,
        })), []);
    const {
        data: queueItems = [],
        isLoading: queueInitialLoading,
        error: queueFetchError,
    } = useQuery({
        queryKey: queueQueryKey,
        queryFn: async () => {
            const params = new URLSearchParams();
            params.set("missionId", selectedMissionId!);
            params.set("limit", String(TABLE_QUEUE_LIMIT));
            if (selectedListId) params.set("listId", selectedListId);
            if (tableSearchApi) params.set("search", tableSearchApi);
            const res = await fetch(`/api/sdr/action-queue?${params.toString()}`);
            const json = await res.json();
            if (!json.success || !json.data?.items) throw new Error(json.error || "Impossible de charger la file d'actions");
            return mapQueueItems(json.data.items as QueueItem[]);
        },
        enabled: viewMode === "table" && selectedMissionId !== null,
    });
    const queueFetchErrorMsg = queueFetchError ? (queueFetchError as Error).message : null;
    const [submittingRowKey, setSubmittingRowKey] = useState<string | null>(null);
    // Table view multi-select for bulk delete (disqualify)
    const [tableSelectedIds, setTableSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkDisqualifying, setIsBulkDisqualifying] = useState(false);

    // Table view filters (client-side on current queue)
    const [tableFilterResult, setTableFilterResult] = useState<string>(""); // "" | ActionResult | "NONE" (no last action)
    const [tableFilterPriority, setTableFilterPriority] = useState<string>("");
    const [tableFilterChannel, setTableFilterChannel] = useState<string>("");
    const [tableFilterType, setTableFilterType] = useState<string>("contact"); // "" | "contact" | "company" — default to contacts in table view

    // Stats modal (table + card view): view stats and list of contacts with status
    const [showStatsModal, setShowStatsModal] = useState(false);
    const [statsQueueItems, setStatsQueueItems] = useState<QueueItem[]>([]);
    const [statsLoading, setStatsLoading] = useState(false);

    // Drawer for table view (contact/company fiche)
    const [drawerContactId, setDrawerContactId] = useState<string | null>(null);
    const [drawerCompanyId, setDrawerCompanyId] = useState<string | null>(null);
    const { data: drawerContact = null, isFetching: drawerContactLoading } = useQuery({
        queryKey: sdrDrawerContactKey(drawerContactId),
        queryFn: async () => {
            const res = await fetch(`/api/contacts/${drawerContactId}`);
            const json = await res.json();
            if (!json.success || !json.data) throw new Error(json.error || "Impossible de charger le contact");
            const c = json.data;
            return {
                id: c.id,
                firstName: c.firstName,
                lastName: c.lastName,
                email: c.email,
                phone: c.phone,
                additionalPhones: c.additionalPhones ?? undefined,
                additionalEmails: c.additionalEmails ?? undefined,
                title: c.title,
                linkedin: c.linkedin,
                status: (c.status ?? "PARTIAL") as DrawerContact["status"],
                companyId: c.company?.id ?? "",
                companyName: c.company?.name ?? undefined,
                companyPhone: resolveCompanyPhone(c.company?.phone, c.company?.customData).phone ?? undefined,
            } as DrawerContact;
        },
        enabled: !!drawerContactId,
    });
    const { data: drawerCompany = null, isFetching: drawerCompanyLoading } = useQuery({
        queryKey: sdrDrawerCompanyKey(drawerCompanyId),
        queryFn: async () => {
            const res = await fetch(`/api/companies/${drawerCompanyId}`);
            const json = await res.json();
            if (!json.success || !json.data) throw new Error(json.error || "Impossible de charger la société");
            const co = json.data;
            const normalizedCompanyPhone = resolveCompanyPhone(co.phone, co.customData);
            return {
                id: co.id,
                name: co.name,
                industry: co.industry,
                country: co.country,
                website: co.website,
                size: co.size,
                phone: normalizedCompanyPhone.phone,
                additionalPhones: normalizedCompanyPhone.additionalPhones,
                status: (co.status ?? "PARTIAL") as DrawerCompany["status"],
                contacts: (co.contacts ?? []).map((ct: { id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null; title: string | null; linkedin: string | null; status: string; companyId: string }) => ({
                    id: ct.id,
                    firstName: ct.firstName,
                    lastName: ct.lastName,
                    email: ct.email,
                    phone: ct.phone,
                    title: ct.title,
                    linkedin: ct.linkedin,
                    status:
                        ct.status === "INCOMPLETE" || ct.status === "PARTIAL" || ct.status === "ACTIONABLE"
                            ? ct.status
                            : "PARTIAL",
                    companyId: ct.companyId,
                })),
                _count: { contacts: co._count?.contacts ?? co.contacts?.length ?? 0 },
            } as DrawerCompany;
        },
        enabled: !!drawerCompanyId,
    });
    const drawerLoading = drawerContactLoading || drawerCompanyLoading;

    // Quick Email Modal state
    const [showQuickEmailModal, setShowQuickEmailModal] = useState(false);
    const [emailModalContact, setEmailModalContact] = useState<{
        id: string;
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        title?: string | null;
        company?: { id: string; name: string };
    } | null>(null);
    const [emailModalMissionId, setEmailModalMissionId] = useState<string | null>(null);
    const [emailModalMissionName, setEmailModalMissionName] = useState<string | null>(null);
    const [emailModalCompany, setEmailModalCompany] = useState<{ id: string; name: string; phone?: string | null } | null>(null);
    const [pendingEmailAction, setPendingEmailAction] = useState<{ row: QueueItem; result: ActionResult } | { cardMode: true; result: ActionResult } | null>(null);
    // Queue: "Mail à envoyer" choice modal — note only vs open email composer
    const [showMailToSendChoiceModal, setShowMailToSendChoiceModal] = useState(false);
    const [mailToSendChoiceRow, setMailToSendChoiceRow] = useState<QueueItem | null>(null);
    const [mailToSendChoiceNote, setMailToSendChoiceNote] = useState("");

    // Config-driven status options (from API)
    const [statusConfig, setStatusConfig] = useState<{
        statuses: Array<{
            code: string;
            label: string;
            color: string | null;
            requiresNote: boolean;
            triggersCallback?: boolean;
        }>;
    } | null>(null);

    // Load filters + today-blocks
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;
        const loadFilters = async () => {
            try {
                const [missionsRes, listsRes, todayRes] = await Promise.all([
                    fetch("/api/sdr/missions", { signal }),
                    fetch("/api/sdr/lists", { signal }),
                    fetch("/api/sdr/today-blocks", { signal }),
                ]);
                if (signal.aborted) return;
                const missionsJson = await missionsRes.json();
                const listsJson = await listsRes.json();
                const todayJson = await todayRes.json();
                if (signal.aborted) return;

                if (todayJson.success) {
                    setTodayBlocksData(todayJson.data);
                }
                setTodayBlocksLoading(false);

                if (missionsJson.success) {
                    const allMissions: Mission[] = missionsJson.data;
                    setMissions(allMissions);

                    const saved = localStorage.getItem("sdr_selected_mission");
                    const allowedMissionIds = (() => {
                        if (!todayJson.success || !todayJson.data) return new Set(allMissions.map((m: Mission) => m.id));
                        const planningData = todayJson.data as {
                            hasBlocksToday: boolean;
                            todayMissionIds: string[];
                            weekBlocks: Array<{ mission: { id: string } }>;
                        };
                        if (planningData.hasBlocksToday && planningData.todayMissionIds.length > 0) {
                            return new Set(planningData.todayMissionIds);
                        }
                        const weekIds = planningData.weekBlocks.map((b) => b.mission.id);
                        return weekIds.length > 0 ? new Set(weekIds) : new Set<string>();
                    })();
                    const availableMissions = allMissions.filter((m: Mission) => allowedMissionIds.has(m.id));
                    const missionId = (saved && availableMissions.some((m: Mission) => m.id === saved))
                        ? saved
                        : availableMissions.length > 0
                            ? availableMissions[0].id
                            : null;
                    if (missionId) setSelectedMissionId(missionId);
                    if (listsJson.success && missionId) {
                        const listsForMission = (listsJson.data as ListItem[]).filter((l) => l.mission.id === missionId);
                        const savedList = typeof window !== "undefined" ? localStorage.getItem("sdr_selected_list") : null;
                        if (savedList && listsForMission.some((l) => l.id === savedList)) {
                            setSelectedListId(savedList);
                        } else if (listsForMission.length > 0) {
                            setSelectedListId(listsForMission[0].id);
                        }
                    }
                }
                if (listsJson.success) {
                    setLists(listsJson.data);
                }
            } catch (err) {
                if ((err as Error).name === "AbortError") return;
                console.error("Failed to load filters:", err);
                showError("Impossible de charger les missions et listes");
                setTodayBlocksLoading(false);
            }
        };
        loadFilters();
        return () => controller.abort();
    }, [showError]);

    useEffect(() => {
        const allowedMissionIds = (() => {
            if (!todayBlocksData) return null;
            if (todayBlocksData.hasBlocksToday && todayBlocksData.todayMissionIds.length > 0) {
                return new Set(todayBlocksData.todayMissionIds);
            }
            const weekIds = todayBlocksData.weekBlocks.map((block) => block.mission.id);
            if (weekIds.length > 0) return new Set(weekIds);
            return new Set<string>();
        })();

        const availableMissions = allowedMissionIds
            ? missions.filter((mission) => allowedMissionIds.has(mission.id))
            : missions;

        if (selectedMissionId && availableMissions.some((m) => m.id === selectedMissionId)) return;
        if (availableMissions.length === 0) {
            setSelectedMissionId(null);
            setSelectedListId(null);
            return;
        }

        const nextMissionId = availableMissions[0].id;
        setSelectedMissionId(nextMissionId);
        const firstList = lists.find((l) => l.mission.id === nextMissionId);
        setSelectedListId(firstList?.id ?? null);
    }, [selectedMissionId, missions, todayBlocksData, lists, setSelectedListId]);

    // Fetch status config: global on mount, mission-specific when mission selected
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;
        const url = selectedMissionId
            ? `/api/config/action-statuses?missionId=${selectedMissionId}`
            : `/api/config/action-statuses`;
        fetch(url, { signal })
            .then((res) => res.json())
            .then((json) => {
                if (signal.aborted) return;
                if (json.success && json.data?.statuses?.length) {
                    setStatusConfig({ statuses: json.data.statuses });
                }
            })
            .catch((err) => {
                if ((err as Error).name === "AbortError") return;
                console.error("Failed to load status config:", err);
            });
        return () => controller.abort();
    }, [selectedMissionId]);

    const resultOptions = statusConfig?.statuses?.length
        ? statusConfig.statuses.map((s, i) => ({
            value: s.code as ActionResult,
            label: s.label,
            icon: RESULT_ICON_MAP[s.code] ?? <XCircle className="w-4 h-4" />,
            key: String(i + 1),
            color: ["slate", "red", "emerald", "amber", "indigo", "slate", "blue"][i % 7] as string,
        }))
        : RESULT_OPTIONS_FALLBACK;

    const statusLabels: Record<string, string> = statusConfig?.statuses?.length
        ? Object.fromEntries(statusConfig.statuses.map((s) => [s.code, s.label]))
        : ACTION_RESULT_LABELS;

    const callbackResultCodes = useMemo(() => {
        const defaults = ["CALLBACK_REQUESTED", "RAPPEL", "RELANCE"];
        if (!statusConfig?.statuses?.length) {
            return new Set<string>(defaults);
        }
        const configured = statusConfig.statuses
            .filter((s) => {
                if (s.triggersCallback === true) return true;
                const haystack = `${s.code} ${s.label}`.toUpperCase();
                return haystack.includes("RAPPEL") || haystack.includes("RELANCE");
            })
            .map((s) => s.code);
        return new Set<string>([...defaults, ...configured]);
    }, [statusConfig]);

    const isCallbackResult = useCallback((code: string | null | undefined) => {
        if (!code) return false;
        return callbackResultCodes.has(code);
    }, [callbackResultCodes]);

    const handlePhoneCallAttempt = useCallback((
        e: React.MouseEvent,
        phone: string,
        context?: {
            lastAction?: { result: string; note?: string; createdAt?: string } | null;
            lastActionBy?: { id: string; name: string | null } | null;
        }
    ) => {
        e.preventDefault();
        e.stopPropagation();
        const contactedByOther =
            !!context?.lastAction &&
            !!context?.lastActionBy?.id &&
            context.lastActionBy.id !== session?.user?.id;

        if (contactedByOther) {
            const lastStatus = statusLabels[context?.lastAction?.result || ""] ?? context?.lastAction?.result ?? "Inconnu";
            const lastNote = context?.lastAction?.note?.trim() || "Aucune note";
            const byName = context?.lastActionBy?.name || "un autre SDR";
            const confirmMessage =
                `Ce prospect est en cours de contact par un autre SDR (${byName}).\n\n` +
                `Dernier statut: ${lastStatus}\n` +
                `Dernière note: ${lastNote}\n\n` +
                `Voulez-vous quand même appeler ?`;
            const accepted = window.confirm(confirmMessage);
            if (!accepted) return;
        }
        window.location.href = `tel:${phone}`;
    }, [session?.user?.id, statusLabels]);

    const copyToClipboard = useCallback(async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            success("Copié", value);
        } catch {
            showError("Impossible de copier");
        }
    }, [success, showError]);

    const getRequiresNote = useCallback((code: string) =>
        statusConfig?.statuses?.find((s) => s.code === code)?.requiresNote ??
        ["INTERESTED", "CALLBACK_REQUESTED", "ENVOIE_MAIL"].includes(code)
        , [statusConfig]);

    const selectableMissionIds = useMemo(() => {
        if (!todayBlocksData) return null;
        if (todayBlocksData.hasBlocksToday && todayBlocksData.todayMissionIds.length > 0) {
            return new Set(todayBlocksData.todayMissionIds);
        }
        const weekIds = todayBlocksData.weekBlocks.map((block) => block.mission.id);
        if (weekIds.length > 0) return new Set(weekIds);
        return new Set<string>();
    }, [todayBlocksData]);

    const selectableMissions = useMemo(() => {
        if (!selectableMissionIds) return missions;
        return missions.filter((mission) => selectableMissionIds.has(mission.id));
    }, [missions, selectableMissionIds]);

    const filteredLists = selectedMissionId
        ? lists.filter((l) => l.mission.id === selectedMissionId)
        : lists;

    // Table view: client-side filtered queue (by last action result, priority, channel, type)
    const filteredQueueItems = useMemo(() => {
        return queueItems.filter((row) => {
            if (tableFilterResult) {
                if (tableFilterResult === "NONE") {
                    if (row.lastAction) return false;
                } else if (!row.lastAction || row.lastAction.result !== tableFilterResult) return false;
            }
            if (tableFilterPriority && row.priority !== tableFilterPriority) return false;
            if (tableFilterChannel && row.channel !== tableFilterChannel) return false;
            if (tableFilterType === "contact" && !row.contactId) return false;
            if (tableFilterType === "company" && row.contactId) return false;
            return true;
        });
    }, [queueItems, tableFilterResult, tableFilterPriority, tableFilterChannel, tableFilterType]);

    const hasTableFiltersActive = !!(tableFilterResult || tableFilterPriority || tableFilterChannel || tableFilterType);
    const clearTableFilters = () => {
        setTableFilterResult("");
        setTableFilterPriority("");
        setTableFilterChannel("");
        setTableFilterType("");
    };

    // Why is the table empty? (so SDR/BD see a clear reason instead of a generic empty message)
    const emptyTableReason = useMemo((): { title: string; description: string; icon: typeof AlertCircle } => {
        if (missions.length === 0) {
            return {
                icon: AlertCircle,
                title: "Aucune mission active",
                description: "Vous n'avez aucune mission active assignée. Contactez votre manager pour être assigné à une mission et voir la file d'actions.",
            };
        }
        if (selectableMissions.length === 0) {
            return {
                icon: AlertCircle,
                title: "Aucune mission planifiée",
                description: "Vous ne pouvez travailler que sur vos missions planifiées (aujourd'hui ou cette semaine).",
            };
        }
        if (!selectedMissionId) {
            return {
                icon: AlertCircle,
                title: "Sélectionnez une mission",
                description: "Choisissez une mission dans le filtre ci-dessus pour afficher la file d'actions (contacts à appeler, contacter par email ou LinkedIn).",
            };
        }
        if (filteredLists.length === 0) {
            return {
                icon: AlertCircle,
                title: "Cette mission n'a pas de listes",
                description: "Aucune liste n'est associée à cette mission (ou les listes ne sont pas encore chargées). Demandez à votre manager d'ajouter des listes avec des sociétés et contacts.",
            };
        }
        if (tableSearchApi && queueItems.length === 0) {
            return {
                icon: AlertCircle,
                title: "Aucun résultat pour cette recherche",
                description: `Aucun contact ou société ne correspond à « ${tableSearchApi} ». Modifiez la recherche dans le filtre ci-dessus ou videz le champ pour voir toute la file.`,
            };
        }
        if (hasTableFiltersActive && queueItems.length > 0 && filteredQueueItems.length === 0) {
            return {
                icon: Filter,
                title: "Aucun contact ne correspond aux filtres",
                description: "Les filtres (statut, priorité, canal ou type) excluent tous les contacts. Cliquez sur « Réinitialiser » dans la zone Filtres pour tout réafficher.",
            };
        }
        if (queueItems.length === 0) {
            return {
                icon: AlertCircle,
                title: "File vide pour cette mission / liste",
                description: "Aucun contact ou société éligible. Vérifiez : (1) La mission a au moins une campagne active. (2) La liste est active (onglet BDD du manager). (3) Les sociétés ont des contacts liés avec les infos requises selon le canal — téléphone pour Appel, email pour Email, LinkedIn pour LinkedIn ; les sociétés sans contact n'apparaissent qu'en Appel si la société a un téléphone. (4) Vous êtes bien assigné à la mission. Si la liste affiche « 322 sociétés, 1 contact », la plupart des sociétés n'ont pas de contact : seuls les contacts (ou sociétés avec téléphone en Appel) éligibles apparaissent ici.",
            };
        }
        return {
            icon: AlertCircle,
            title: "Aucun contact affiché",
            description: "Aucun contact ne correspond aux critères actuels. Réinitialisez les filtres ou la recherche.",
        };
    }, [missions.length, selectableMissions.length, selectedMissionId, filteredLists.length, tableSearchApi, hasTableFiltersActive, queueItems.length, filteredQueueItems.length]);

    // Debounce mission search so we don't refetch on every keystroke
    useEffect(() => {
        if (!tableSearchInput.trim()) {
            setTableSearchApi("");
            return;
        }
        const t = setTimeout(() => setTableSearchApi(tableSearchInput.trim()), 400);
        return () => clearTimeout(t);
    }, [tableSearchInput]);

    // Load next action
    const loadNextAction = useCallback(async () => {
        nextActionAbortRef.current?.abort();
        const controller = new AbortController();
        nextActionAbortRef.current = controller;
        const signal = controller.signal;

        setIsLoading(true);
        setError(null);
        setSelectedResult(null);
        setNote("");
        setCallbackDateValue("");
        setCallbackQuickLabel(null);
        setMeetingCat("");
        setShowSuccess(false);
        setElapsedTime(0);
        setActiveTab("base");
        setLinkedAlloCall(null);
        setAlloDialogOpen(false);
        setAlloDialogCalls([]);
        setAlloDialogSelectedId(null);

        try {
            const params = new URLSearchParams();
            if (selectedMissionId) params.set("missionId", selectedMissionId);
            if (selectedListId) params.set("listId", selectedListId);

            const res = await fetch(`/api/actions/next?${params.toString()}`, { signal });
            const json = await res.json();
            if (signal.aborted) return;

            if (!json.success) {
                setError(json.error || "Erreur lors du chargement");
                setCurrentAction(null);
            } else {
                setCurrentAction(json.data);
                const preferredTab = json.data?.scriptDefaultTab;
                if (preferredTab === "additional" || preferredTab === "ai" || preferredTab === "base") {
                    setActiveTab(preferredTab);
                }
                if (timerRef.current) clearInterval(timerRef.current);
                timerRef.current = setInterval(() => setElapsedTime((prev) => prev + 1), 1000);
            }
        } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setError("Erreur de connexion");
            setCurrentAction(null);
        } finally {
            if (!signal.aborted) setIsLoading(false);
            if (nextActionAbortRef.current === controller) nextActionAbortRef.current = null;
        }
    }, [selectedMissionId, selectedListId]);

    useEffect(() => {
        if (selectedMissionId !== null) loadNextAction();
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [selectedMissionId, selectedListId, loadNextAction]);

    useEffect(() => {
        if (!currentAction?.campaignId) return;
        const controller = new AbortController();
        fetch(`/api/campaigns/${currentAction.campaignId}/script-companion`, { signal: controller.signal })
            .then((res) => res.json())
            .then((json) => {
                if (!json?.success) return;
                setCurrentAction((prev) => {
                    if (!prev || prev.campaignId !== currentAction.campaignId) return prev;
                    return {
                        ...prev,
                        scriptAdditional: json.data?.additionalShared ?? prev.scriptAdditional,
                        scriptAiEnhanced: json.data?.aiShared ?? prev.scriptAiEnhanced,
                        scriptDefaultTab: json.data?.defaultTab ?? prev.scriptDefaultTab,
                    };
                });
                const preferredTab = json.data?.defaultTab;
                if (preferredTab === "base" || preferredTab === "additional" || preferredTab === "ai") {
                    setActiveTab(preferredTab);
                }
            })
            .catch(() => {
                // best effort only
            });
        return () => controller.abort();
    }, [currentAction?.campaignId]);

    const queueRowKey = (row: QueueItem) => row.contactId ?? row.companyId;

    // Recently updated row keys (highlight in table after status update in drawer)
    const [recentlyUpdatedRowKeys, setRecentlyUpdatedRowKeys] = useState<Set<string>>(new Set());
    const recentlyUpdatedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => () => {
        if (recentlyUpdatedTimeoutRef.current) clearTimeout(recentlyUpdatedTimeoutRef.current);
    }, []);

    // Refetch queue (table view) — invalidate so React Query refetches
    const refreshQueue = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: queueQueryKey });
    }, [queryClient, queueQueryKey]);

    const handleSyncCalls = useCallback(async () => {
        if (isSyncingCalls) return;
        setIsSyncingCalls(true);
        setSyncResult(null);
        try {
            const res = await fetch('/api/sdr/calls/sync', { method: 'POST' });
            const json = await res.json();
            if (json.success) {
                const { enriched, total } = json.data;
                setSyncResult({ enriched, total });
                if (enriched > 0) {
                    success("Appels synchronisés", `${enriched} appel${enriched > 1 ? 's' : ''} enrichi${enriched > 1 ? 's' : ''} (résumé, transcription, audio).`);
                } else if (total === 0) {
                    success("Déjà à jour", "Aucun appel récent à synchroniser.");
                } else {
                    success("Synchronisation terminée", `${total} appel${total > 1 ? 's' : ''} analysé${total > 1 ? 's' : ''} — aucune correspondance Allo trouvée.`);
                }
                refreshQueue();
            } else {
                showError("Erreur de synchronisation", json.error ?? "Impossible de contacter Allo.");
            }
        } catch {
            showError("Erreur réseau", "La synchronisation a échoué.");
        } finally {
            setIsSyncingCalls(false);
        }
    }, [isSyncingCalls, refreshQueue, success, showError]);

    const openAlloDialog = useCallback(async () => {
        const phone =
            currentAction?.contact?.phone ||
            (currentAction?.channel === "CALL" && currentAction?.company?.phone
                ? currentAction.company.phone
                : null);
        if (!phone) {
            showError("Numéro manquant", "Aucun numéro de téléphone trouvé pour ce contact.");
            return;
        }
        setAlloDialogFilterPhone(phone);
        setAlloDialogAlloLineCount(null);
        setAlloDialogOpen(true);
        setAlloDialogLoading(true);
        setAlloDialogCalls([]);
        setAlloDialogSelectedId(null);
        try {
            const res = await fetch(`/api/sdr/calls/for-contact?phone=${encodeURIComponent(phone)}`);
            const json = await res.json();
            if (json.success) {
                setAlloDialogCalls(json.data.calls ?? []);
                const meta = json.data?.meta as { filterPhone?: string; alloLineCount?: number } | undefined;
                if (meta?.filterPhone) setAlloDialogFilterPhone(meta.filterPhone);
                if (typeof meta?.alloLineCount === "number") setAlloDialogAlloLineCount(meta.alloLineCount);
            } else {
                showError("Erreur Allo", json.error ?? "Impossible de charger les appels.");
                setAlloDialogOpen(false);
            }
        } catch {
            showError("Erreur réseau", "Impossible de contacter Allo.");
            setAlloDialogOpen(false);
        } finally {
            setAlloDialogLoading(false);
        }
    }, [currentAction, showError]);

    const confirmAlloCall = useCallback(() => {
        const call = alloDialogCalls.find((c) => c.id === alloDialogSelectedId);
        if (!call) return;
        setLinkedAlloCall(call);
        setAlloDialogOpen(false);
    }, [alloDialogCalls, alloDialogSelectedId]);

    // When opening Stats modal in card view, fetch queue for current mission/list
    useEffect(() => {
        if (!showStatsModal || viewMode !== "card" || !selectedMissionId) return;
        setStatsLoading(true);
        const params = new URLSearchParams();
        params.set("missionId", selectedMissionId);
        params.set("limit", String(STATS_QUEUE_LIMIT));
        if (selectedListId) params.set("listId", selectedListId);
        fetch(`/api/sdr/action-queue?${params.toString()}`, { cache: "no-store" })
            .then((res) => res.json())
            .then((json) => {
                if (json.success && json.data?.items) {
                    const items = json.data.items as QueueItem[];
                    setStatsQueueItems(items.map((i) => ({
                        ...i,
                        _displayName: i.contact
                            ? `${(i.contact.firstName || "").trim()} ${(i.contact.lastName || "").trim()}`.trim() || i.company.name
                            : i.company.name,
                        _companyName: i.company.name,
                        _phone: i.contact?.phone || i.company?.phone || null,
                        _email: i.contact?.email || null,
                        _searchNote: i.lastAction?.note ?? null,
                    })));
                } else {
                    setStatsQueueItems([]);
                }
            })
            .catch(() => setStatsQueueItems([]))
            .finally(() => setStatsLoading(false));
    }, [showStatsModal, viewMode, selectedMissionId, selectedListId]);

    // Unified drawer state (table view)
    const [unifiedDrawerOpen, setUnifiedDrawerOpen] = useState(false);
    const [unifiedDrawerContactId, setUnifiedDrawerContactId] = useState<string | null>(null);
    const [unifiedDrawerCompanyId, setUnifiedDrawerCompanyId] = useState<string | null>(null);
    const [unifiedDrawerMissionId, setUnifiedDrawerMissionId] = useState<string | undefined>();
    const [unifiedDrawerMissionName, setUnifiedDrawerMissionName] = useState<string | undefined>();
    const { data: clientBookingData } = useQuery({
        queryKey: sdrClientBookingKey(unifiedDrawerOpen && unifiedDrawerMissionId ? unifiedDrawerMissionId : null),
        queryFn: async () => {
            const res = await fetch(`/api/missions/${unifiedDrawerMissionId}/client-booking`);
            const json = await res.json();
            if (!json.success) {
                return {
                    bookingUrl: "",
                    interlocuteurs: [] as NonNullable<NextActionData["clientInterlocuteurs"]>,
                };
            }
            return {
                bookingUrl: json.data?.bookingUrl ?? "",
                interlocuteurs: Array.isArray(json.data?.interlocuteurs) ? json.data.interlocuteurs : [],
            };
        },
        enabled: !!unifiedDrawerMissionId && !!unifiedDrawerOpen,
    });
    const unifiedDrawerClientBookingUrl = clientBookingData?.bookingUrl ?? "";
    const unifiedDrawerInterlocuteurs = clientBookingData?.interlocuteurs ?? [];
    /** Row used to open the drawer (for email modal context when "Envoie mail" is selected in drawer) */
    const [drawerRow, setDrawerRow] = useState<QueueItem | null>(null);
    const prevUnifiedDrawerOpenRef = useRef(false);

    // When drawer closes, refresh queue so table shows updated/removed contacts (runs after state commit)
    useEffect(() => {
        const wasOpen = prevUnifiedDrawerOpenRef.current;
        prevUnifiedDrawerOpenRef.current = unifiedDrawerOpen;
        if (wasOpen && !unifiedDrawerOpen && viewMode === "table") {
            const id = setTimeout(() => refreshQueue(), 80);
            return () => clearTimeout(id);
        }
    }, [unifiedDrawerOpen, viewMode, refreshQueue]);

    // Improve workspace when both drawers open in table flow.
    useEffect(() => {
        if (viewMode === "table" && unifiedDrawerOpen) {
            setCollapsed(true);
        }
    }, [viewMode, unifiedDrawerOpen, setCollapsed]);

    const openDrawerForRow = (row: QueueItem) => {
        setDrawerRow(row);
        setUnifiedDrawerContactId(row.contactId || null);
        setUnifiedDrawerCompanyId(row.companyId);

        // Find mission ID from row
        const mission = missions.find(m => m.name === row.missionName);
        setUnifiedDrawerMissionId(mission?.id);
        setUnifiedDrawerMissionName(row.missionName);
        setUnifiedDrawerOpen(true);
    };

    const closeUnifiedDrawer = () => {
        setUnifiedDrawerOpen(false);
        setUnifiedBookingDialogOpen(false);
        setUnifiedAlloDialogOpen(false);
        setDrawerRow(null);
        setUnifiedDrawerContactId(null);
        setUnifiedDrawerCompanyId(null);
        setUnifiedDrawerMissionId(undefined);
        setUnifiedDrawerMissionName(undefined);
    };

    const [emailModalPreferredMailboxId, setEmailModalPreferredMailboxId] = useState<string | null>(null);

    const openEmailModalFromDrawer = () => {
        if (drawerRow) {
            setEmailModalContact(drawerRow.contact ? {
                id: drawerRow.contact.id,
                firstName: drawerRow.contact.firstName,
                lastName: drawerRow.contact.lastName,
                email: drawerRow.contact.email,
                title: drawerRow.contact.title,
                company: drawerRow.company ? { id: drawerRow.company.id, name: drawerRow.company.name } : undefined,
            } : null);
            setEmailModalCompany(drawerRow.company ? {
                id: drawerRow.company.id,
                name: drawerRow.company.name,
                phone: drawerRow.company.phone ?? undefined,
            } : null);
        } else {
            setEmailModalContact(null);
            setEmailModalCompany(null);
        }
        setEmailModalMissionId(unifiedDrawerMissionId ?? null);
        setEmailModalMissionName(unifiedDrawerMissionName ?? null);
        setEmailModalPreferredMailboxId(null);

        if (unifiedDrawerMissionId) {
            (async () => {
                try {
                    // Load mission to get clientId
                    const missionRes = await fetch(`/api/missions/${unifiedDrawerMissionId}`);
                    const missionJson = await missionRes.json();
                    if (!missionJson.success) return;

                    // Mission-level default mailbox has priority
                    const missionDefaultMailboxId = missionJson.data?.defaultMailboxId as string | undefined;
                    if (missionDefaultMailboxId) {
                        setEmailModalPreferredMailboxId(missionDefaultMailboxId);
                        return;
                    }

                    if (!missionJson.data?.client?.id) return;
                    const clientId = missionJson.data.client.id as string;

                    // Load client onboarding data to get default mailbox id
                    const clientRes = await fetch(`/api/clients/${clientId}`);
                    const clientJson = await clientRes.json();
                    if (!clientJson.success) return;
                    const onboardingData = (clientJson.data?.onboarding?.onboardingData ?? {}) as {
                        defaultMailboxId?: string;
                    };
                    if (onboardingData.defaultMailboxId) {
                        setEmailModalPreferredMailboxId(onboardingData.defaultMailboxId);
                    }
                } catch {
                    // optional enhancement; silently ignore failures
                }
            })();
        }

        setShowQuickEmailModal(true);
    };

    // Keep legacy close functions for backwards compatibility
    const closeContactDrawer = () => setDrawerContactId(null);
    const closeCompanyDrawer = () => setDrawerCompanyId(null);
    const handleContactFromCompany = (contact: { id: string }) => {
        setDrawerCompanyId(null);
        setDrawerContactId(contact.id);
    };

    const handleQuickAction = async (row: QueueItem, result: ActionResult) => {
        // For MEETING_BOOKED, open the full drawer so SDR can use the booking flow
        if (result === "MEETING_BOOKED") {
            openDrawerForRow(row);
            return;
        }
        // For ENVOIE_MAIL, open choice modal: note only (Mail à envoyer) or send email (Mail envoyé)
        if (result === "ENVOIE_MAIL") {
            setMailToSendChoiceRow(row);
            setMailToSendChoiceNote("");
            setShowMailToSendChoiceModal(true);
            return;
        }

        const key = queueRowKey(row);
        setSubmittingRowKey(key);
        const noteRequired = getRequiresNote(result);
        const note = noteRequired
            ? (isCallbackResult(result) ? "Rappel demandé" : statusLabels[result] ?? "Note")
            : undefined;
        try {
            const res = await fetch("/api/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contactId: row.contactId ?? undefined,
                    companyId: row.contactId ? undefined : row.companyId,
                    campaignId: row.campaignId,
                    channel: row.channel,
                    result,
                    note: note ?? undefined,
                    callbackDate: isCallbackResult(result) ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined,
                }),
            });
            const json = await res.json();
            if (json.success) {
                queryClient.invalidateQueries({ queryKey: queueQueryKey });
                setActionsCompleted((c) => c + 1);
            } else {
                showError(json.error || "Erreur lors de l'enregistrement");
            }
        } catch {
            showError("Erreur de connexion");
        } finally {
            setSubmittingRowKey(null);
        }
    };

    // Queue: save "Mail à envoyer" with note only (no email sent)
    const handleMailToSendChoiceSaveOnly = async () => {
        const row = mailToSendChoiceRow;
        if (!row || !mailToSendChoiceNote.trim()) {
            showError("Erreur", "Une note est requise pour Mail à envoyer.");
            return;
        }
        setSubmittingRowKey(queueRowKey(row));
        try {
            const res = await fetch("/api/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contactId: row.contactId ?? undefined,
                    companyId: row.contactId ? undefined : row.companyId,
                    campaignId: row.campaignId,
                    channel: row.channel,
                    result: "ENVOIE_MAIL" as const,
                    note: mailToSendChoiceNote.trim(),
                }),
            });
            const json = await res.json();
            if (json.success) {
                queryClient.invalidateQueries({ queryKey: queueQueryKey });
                setActionsCompleted((c) => c + 1);
                success("Enregistré", "Statut Mail à envoyer enregistré.");
                setShowMailToSendChoiceModal(false);
                setMailToSendChoiceRow(null);
                setMailToSendChoiceNote("");
            } else {
                showError(json.error || "Erreur lors de l'enregistrement");
            }
        } catch {
            showError("Erreur de connexion");
        } finally {
            setSubmittingRowKey(null);
        }
    };

    // Queue: open email composer (will record MAIL_ENVOYE when sent)
    const handleMailToSendChoiceOpenComposer = () => {
        const row = mailToSendChoiceRow;
        if (!row) return;
        const mission = missions.find(m => m.name === row.missionName);
        const missionId = mission?.id || selectedMissionId;
        setEmailModalContact(row.contact ? {
            id: row.contact.id,
            firstName: row.contact.firstName,
            lastName: row.contact.lastName,
            email: row.contact.email,
            title: row.contact.title,
            company: { id: row.company.id, name: row.company.name }
        } : null);
        setEmailModalCompany(row.contact ? null : { id: row.company.id, name: row.company.name, phone: row.company.phone });
        setEmailModalMissionId(missionId || null);
        setEmailModalMissionName(mission?.name || row.missionName);
        setEmailModalPreferredMailboxId(null);
        if (mission?.defaultMailboxId) setEmailModalPreferredMailboxId(mission.defaultMailboxId);
        else if (missionId) {
            (async () => {
                try {
                    const missionRes = await fetch(`/api/missions/${missionId}`);
                    const missionJson = await missionRes.json();
                    if (!missionJson.success) return;
                    const missionDefaultMailboxId = missionJson.data?.defaultMailboxId as string | undefined;
                    if (missionDefaultMailboxId) {
                        setEmailModalPreferredMailboxId(missionDefaultMailboxId);
                        return;
                    }
                    if (!missionJson.data?.client?.id) return;
                    const clientId = missionJson.data.client.id as string;
                    const clientRes = await fetch(`/api/clients/${clientId}`);
                    const clientJson = await clientRes.json();
                    if (!clientJson.success) return;
                    const onboardingData = (clientJson.data?.onboarding?.onboardingData ?? {}) as { defaultMailboxId?: string };
                    if (onboardingData.defaultMailboxId) setEmailModalPreferredMailboxId(onboardingData.defaultMailboxId);
                } catch { /* ignore */ }
            })();
        }
        setPendingEmailAction({ row, result: "MAIL_ENVOYE" });
        setShowMailToSendChoiceModal(false);
        setMailToSendChoiceRow(null);
        setMailToSendChoiceNote("");
        setShowQuickEmailModal(true);
    };

    const handleBulkDisqualify = async () => {
        if (tableSelectedIds.size === 0) return;
        if (!confirm(`Marquer ${tableSelectedIds.size} élément(s) comme disqualifié(s) ?`)) return;

        const keysToRemove = new Set(tableSelectedIds);
        const rowsToProcess = filteredQueueItems.filter((r) => keysToRemove.has(queueRowKey(r)));

        // Optimistic: remove from UI immediately
        queryClient.invalidateQueries({ queryKey: queueQueryKey });
        setTableSelectedIds(new Set());
        setActionsCompleted((c) => c + rowsToProcess.length);
        setIsBulkDisqualifying(false);

        // Server: disqualify in background
        let failCount = 0;
        const promises = rowsToProcess.map(async (row) => {
            try {
                const res = await fetch("/api/actions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contactId: row.contactId ?? undefined,
                        companyId: row.contactId ? undefined : row.companyId,
                        campaignId: row.campaignId,
                        channel: row.channel,
                        result: "DISQUALIFIED" as const,
                        note: "Disqualifié",
                    }),
                });
                const json = await res.json();
                if (!json.success) failCount++;
            } catch {
                failCount++;
            }
        });
        await Promise.all(promises);

        if (failCount > 0) {
            await refreshQueue();
            showError("Erreur", `${failCount} élément(s) n'ont pas pu être traités.`);
        } else {
            success(`${rowsToProcess.length} élément(s) disqualifié(s).`);
        }
    };

    // Handle email sent from QuickEmailModal — record as MAIL_ENVOYE (email actually sent)
    const handleEmailSent = async () => {
        if (!pendingEmailAction) return;
        const result = "MAIL_ENVOYE" as const;

        const isCardMode = "cardMode" in pendingEmailAction && pendingEmailAction.cardMode;

        try {
            if (isCardMode && currentAction) {
                const res = await fetch("/api/actions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contactId: currentAction.contact?.id,
                        companyId: !currentAction.contact && currentAction.company ? currentAction.company.id : undefined,
                        campaignId: currentAction.campaignId,
                        channel: "EMAIL",
                        result,
                        note: "Email envoyé via template",
                    }),
                });
                const json = await res.json();
                if (!json.success) {
                    showError(json.error || "Erreur lors de l'enregistrement de l'email");
                    return;
                }
                setActionsCompleted((c) => c + 1);
                await loadNextAction();
            } else if (!isCardMode && "row" in pendingEmailAction) {
                const { row } = pendingEmailAction;
                const res = await fetch("/api/actions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contactId: row.contactId ?? undefined,
                        companyId: row.contactId ? undefined : row.companyId,
                        campaignId: row.campaignId,
                        channel: "EMAIL",
                        result,
                        note: "Email envoyé via template",
                    }),
                });
                const json = await res.json();
                if (!json.success) {
                    showError(json.error || "Erreur lors de l'enregistrement de l'email");
                    return;
                }
                queryClient.invalidateQueries({ queryKey: queueQueryKey });
                setActionsCompleted((c) => c + 1);
            }
        } catch {
            showError("Erreur de connexion");
        }

        setPendingEmailAction(null);
        setEmailModalContact(null);
        setEmailModalCompany(null);
        setEmailModalMissionId(null);
        setEmailModalMissionName(null);
    };

    // Open QuickEmailModal for current card (when SDR chooses "Envoyer un email" for ENVOIE_MAIL)
    const openEmailModalForCard = () => {
        if (!currentAction) return;
        const contact = currentAction.contact;
        setEmailModalContact(contact ? {
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            title: contact.title,
            company: currentAction.company ? { id: currentAction.company.id, name: currentAction.company.name } : undefined,
        } : null);
        setEmailModalCompany(!contact && currentAction.company ? { id: currentAction.company.id, name: currentAction.company.name, phone: currentAction.company.phone } : null);
        setEmailModalMissionId(selectedMissionId ?? null);
        setEmailModalMissionName(currentAction.missionName ?? null);
        setEmailModalPreferredMailboxId(null);
        setPendingEmailAction({ cardMode: true, result: "MAIL_ENVOYE" });
        setShowQuickEmailModal(true);
        if (selectedMissionId) {
            (async () => {
                try {
                    const missionRes = await fetch(`/api/missions/${selectedMissionId}`);
                    const missionJson = await missionRes.json();
                    if (!missionJson.success) return;
                    const missionDefaultMailboxId = missionJson.data?.defaultMailboxId as string | undefined;
                    if (missionDefaultMailboxId) {
                        setEmailModalPreferredMailboxId(missionDefaultMailboxId);
                        return;
                    }
                    if (!missionJson.data?.client?.id) return;
                    const clientId = missionJson.data.client.id as string;
                    const clientRes = await fetch(`/api/clients/${clientId}`);
                    const clientJson = await clientRes.json();
                    if (!clientJson.success) return;
                    const onboardingData = (clientJson.data?.onboarding?.onboardingData ?? {}) as { defaultMailboxId?: string };
                    if (onboardingData.defaultMailboxId) setEmailModalPreferredMailboxId(onboardingData.defaultMailboxId);
                } catch { /* ignore */ }
            })();
        }
    };

    // Submit (wrapped in useCallback so keyboard shortcut always has latest)
    const handleSubmit = useCallback(async () => {
        if (!selectedResult || !currentAction?.campaignId) return;
        if (!currentAction.contact && !currentAction.company) {
            setError("Aucun contact ou entreprise disponible");
            return;
        }
        if (getRequiresNote(selectedResult) && !note.trim()) {
            setError("Note requise pour ce résultat");
            return;
        }

        // For MEETING_BOOKED, always open booking drawer so SDR can pick date/type/category
        if (selectedResult === "MEETING_BOOKED") {
            setShowBookingDrawer(true);
            return;
        }

        // ENVOIE_MAIL: submit with note only (Mail à envoyer). Use "Envoyer un email" button to open composer and record MAIL_ENVOYE.
        setIsSubmitting(true);
        setError(null);
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

        try {
            const res = await fetch("/api/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                    contactId: currentAction.contact?.id,
                    companyId: !currentAction.contact && currentAction.company ? currentAction.company.id : undefined,
                    campaignId: currentAction.campaignId,
                    channel: currentAction.channel,
                    result: selectedResult,
                    note: note || undefined,
                    callbackDate: isCallbackResult(selectedResult) && callbackDateValue ? new Date(callbackDateValue).toISOString() : undefined,
                    duration: elapsedTime,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                setError(json.error || "Erreur");
                return;
            }
            const newActionId = json.data?.id as string | undefined;
            const callToLink = linkedAlloCall;
            if (newActionId && currentAction.channel === "CALL" && callToLink) {
                const transcription =
                    callToLink.transcript?.length ?
                        callToLink.transcript.map((t) => `${t.source}: ${t.text}`).join("\n")
                    :   null;
                try {
                    const enrichRes = await fetch(`/api/actions/${newActionId}/enrich-call`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            callId: callToLink.id,
                            summary: callToLink.summary ?? null,
                            transcription,
                            recordingUrl: callToLink.recording_url ?? null,
                        }),
                    });
                    const enrichJson = await enrichRes.json();
                    if (!enrichJson.success) {
                        showError(
                            "Appel non enregistré",
                            enrichJson.error ?? "Les données Allo n'ont pas pu être attachées à l'action."
                        );
                    }
                } catch {
                    showError("Appel non enregistré", "Erreur réseau lors de l'enrichissement.");
                }
            }
            setShowSuccess(true);
            setActionsCompleted((prev) => prev + 1);
            await loadNextAction();
            setShowSuccess(false);
        } catch {
            setError("Erreur de connexion");
        } finally {
            setIsSubmitting(false);
        }
    }, [
        selectedResult,
        currentAction,
        note,
        callbackDateValue,
        selectedMissionId,
        elapsedTime,
        loadNextAction,
        getRequiresNote,
        isCallbackResult,
        linkedAlloCall,
        showError,
    ]);

    // Handlers
    const handleMissionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setSelectedMissionId(id);
        localStorage.setItem("sdr_selected_mission", id);
        const firstList = lists.find((l) => l.mission.id === id);
        setSelectedListId(firstList?.id ?? null);
    };

    const handleListChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setSelectedListId(id === "all" ? null : id);
    };

    const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

    // Select a result and, when it requires a note, jump the cursor straight into the note field
    const selectResultWithFocus = useCallback((value: ActionResult) => {
        setSelectedResult(value);
        if (getRequiresNote(value)) {
            requestAnimationFrame(() => noteInputRef.current?.focus());
        }
    }, [getRequiresNote]);

    // Any overlay open? Keyboard shortcuts must not fire underneath modals/drawers.
    const overlayOpen = alloDialogOpen || showBookingDrawer || showStatsModal || showQuickEmailModal
        || showMailToSendChoiceModal || unifiedDrawerOpen || !!drawerContactId || !!drawerCompanyId;

    // Keyboard shortcuts (card view):
    //   1-9        → pick a result (auto-focuses the note when required)
    //   Enter      → validate & next (outside typing fields)
    //   Ctrl+Enter → validate & next from anywhere, including the note field
    //   Escape     → clear the selected result
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (viewMode !== "card" || overlayOpen) return;

            // Ctrl/Cmd+Enter works even while typing the note
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                if (selectedResult && !isSubmitting) {
                    e.preventDefault();
                    handleSubmit();
                }
                return;
            }

            const target = e.target as HTMLElement | null;
            const isTypingField = target instanceof HTMLTextAreaElement
                || target instanceof HTMLInputElement
                || target instanceof HTMLSelectElement
                || !!target?.isContentEditable;
            if (isTypingField) {
                // Let Escape blur the note so the SDR can keep using shortcuts
                if (e.key === "Escape") (target as HTMLElement).blur();
                return;
            }
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            if (e.key >= "1" && e.key <= "9") {
                const idx = parseInt(e.key, 10) - 1;
                if (resultOptions[idx]) selectResultWithFocus(resultOptions[idx].value);
            }
            if (e.key === "Escape" && selectedResult) {
                setSelectedResult(null);
            }
            if (e.key === "Enter" && selectedResult && !isSubmitting) {
                e.preventDefault();
                handleSubmit();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [selectedResult, isSubmitting, resultOptions, handleSubmit, viewMode, overlayOpen, selectResultWithFocus]);


    const parseBaseScript = (rawScript?: string): string => {
        if (!rawScript?.trim()) return "";
        const parseCandidate = (candidate: string): string | null => {
            try {
                const parsed = JSON.parse(candidate);
                if (typeof parsed === "string") return parseCandidate(parsed) ?? parsed;
                if (!parsed || typeof parsed !== "object") return null;
                const sections = [
                    { key: "intro", label: "Intro" },
                    { key: "discovery", label: "Decouverte" },
                    { key: "objection", label: "Objections" },
                    { key: "closing", label: "Closing" },
                ]
                    .map(({ key, label }) => {
                        const value = (parsed as Record<string, unknown>)[key];
                        return typeof value === "string" && value.trim() ? `--- ${label} ---\n${value.trim()}` : null;
                    })
                    .filter((value): value is string => Boolean(value));
                return sections.length > 0 ? sections.join("\n\n") : null;
            } catch {
                return null;
            }
        };
        return parseCandidate(rawScript) ?? rawScript;
    };

    const scriptPanelContent = {
        base: parseBaseScript(currentAction?.script),
        additional: currentAction?.scriptAdditional?.trim() || "",
        ai: currentAction?.scriptAiEnhanced?.trim() || "",
    };
    const availableScriptTabs = SCRIPT_TABS.filter((tab) => {
        const content = scriptPanelContent[tab.id as keyof typeof scriptPanelContent];
        return Boolean(content && content.trim());
    });
    useEffect(() => {
        if (availableScriptTabs.length === 0) return;
        if (!availableScriptTabs.some((tab) => tab.id === activeTab)) {
            setActiveTab(availableScriptTabs[0].id);
        }
    }, [activeTab, availableScriptTabs]);

    // NOTE: Planning blocks are informational only — SDRs can prospect even without scheduled blocks today.

    // Sync calls button — always visible in headers
    const syncCallsButton = (
        <button
            type="button"
            onClick={handleSyncCalls}
            disabled={isSyncingCalls}
            title="Synchroniser les résumés et transcriptions d'appels Allo (24 dernières heures)"
            className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all h-auto",
                "border-white/20 bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm",
                isSyncingCalls && "opacity-70 cursor-not-allowed"
            )}
        >
            {isSyncingCalls ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <PhoneCall className="w-4 h-4" />
            )}
            {isSyncingCalls ? "Synchro…" : "Sync appels"}
            {syncResult && !isSyncingCalls && (
                <span className={cn(
                    "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                    syncResult.enriched > 0 ? "bg-emerald-400/30 text-emerald-200" : "bg-white/20 text-white/70"
                )}>
                    {syncResult.enriched}/{syncResult.total}
                </span>
            )}
        </button>
    );

    // ========== TABLE VIEW ==========
    if (viewMode === "table") {
        const queueColumns: Column<QueueItem>[] = [
            {
                key: "name",
                header: "Contact / Société",
                render: (_, row) => {
                    const name = row.contact
                        ? `${row.contact.firstName || ""} ${row.contact.lastName || ""}`.trim() || row.company.name
                        : row.company.name;
                    return (
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border transition-colors",
                                row.contactId
                                    ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                    : "bg-slate-50 border-slate-200 text-slate-500"
                            )}>
                                {row.contactId ? (
                                    <User className="w-4.5 h-4.5" />
                                ) : (
                                    <Building2 className="w-4.5 h-4.5" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="font-semibold text-slate-900 truncate max-w-[220px]">{name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    {row.contact && row.company.name !== name && (
                                        <span className="text-xs text-slate-500 truncate max-w-[140px] flex items-center gap-1">
                                            <Building2 className="w-3 h-3 flex-shrink-0" />
                                            {row.company.name}
                                        </span>
                                    )}
                                    {row.contact?.title && (
                                        <span className="text-xs text-slate-400 truncate max-w-[120px]">
                                            · {row.contact.title}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                },
            },
            {
                key: "_phone",
                header: "Téléphone",
                render: (_, row) => {
                    const phone = row._phone || row.contact?.phone || row.company?.phone;
                    if (!phone) return (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
                            <PhoneOff className="w-3 h-3" /> Aucun
                        </span>
                    );
                    return (
                        <a
                            href={`tel:${phone}`}
                            onClick={(e) => handlePhoneCallAttempt(e, phone, {
                                lastAction: row.lastAction,
                                lastActionBy: row.lastActionBy ?? null,
                            })}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 rounded-lg transition-all duration-150 hover:shadow-sm group"
                            title="Cliquer pour appeler"
                        >
                            <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="font-mono tracking-tight">{phone}</span>
                        </a>
                    );
                },
            },
            {
                key: "channel",
                header: "Canal",
                render: (v) => {
                    const channelConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
                        CALL: { icon: <Phone className="w-3.5 h-3.5" />, color: "bg-indigo-50 text-indigo-700 border-indigo-200", label: "Appel" },
                        EMAIL: { icon: <MailOpen className="w-3.5 h-3.5" />, color: "bg-blue-50 text-blue-700 border-blue-200", label: "Email" },
                        LINKEDIN: { icon: <Linkedin className="w-3.5 h-3.5" />, color: "bg-sky-50 text-sky-700 border-sky-200", label: "LinkedIn" },
                    };
                    const cfg = channelConfig[v as string] || { icon: <Globe className="w-3.5 h-3.5" />, color: "bg-slate-50 text-slate-600 border-slate-200", label: v };
                    return (
                        <Badge className={cn("text-xs gap-1 font-medium border", cfg.color)}>
                            {cfg.icon}
                            {cfg.label}
                        </Badge>
                    );
                },
            },
            {
                key: "lastAction",
                header: "Dernière action",
                render: (_, row) => {
                    if (!row.lastAction) {
                        return (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 italic px-2 py-1 rounded-lg bg-slate-50 border border-slate-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                Jamais contacté
                            </span>
                        );
                    }
                    const resultColor: Record<string, { badge: string; dot: string }> = {
                        NO_RESPONSE: { badge: "bg-slate-50 text-slate-600 border-slate-200", dot: "bg-slate-400" },
                        BAD_CONTACT: { badge: "bg-red-50 text-red-600 border-red-200", dot: "bg-red-400" },
                        INTERESTED: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-400" },
                        CALLBACK_REQUESTED: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
                        RELANCE: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
                        RAPPEL: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
                        MEETING_BOOKED: { badge: "bg-indigo-50 text-indigo-700 border-indigo-200", dot: "bg-indigo-400" },
                        DISQUALIFIED: { badge: "bg-slate-100 text-slate-500 border-slate-200", dot: "bg-slate-400" },
                        ENVOIE_MAIL: { badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-400" },
                        MAIL_ENVOYE: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-400" },
                    };
                    const color = resultColor[row.lastAction.result] || { badge: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" };
                    const contactedByOther = row.lastActionBy?.id && row.lastActionBy.id !== session?.user?.id;
                    return (
                        <div className="space-y-1.5">
                            <Badge className={cn("text-xs border font-medium", color.badge)}>
                                {RESULT_ICON_MAP[row.lastAction.result]}
                                <span className="ml-1">{statusLabels[row.lastAction.result] ?? row.lastAction.result}</span>
                            </Badge>
                            {contactedByOther && row.lastActionBy?.name && (
                                <p className="text-[11px] text-amber-700 font-medium">
                                    Contacté par {row.lastActionBy.name}
                                </p>
                            )}
                            {row.lastAction.note && (
                                <div className="flex items-start gap-1.5 max-w-[220px]" title={row.lastAction.note}>
                                    <MessageSquare className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                                        {row.lastAction.note}
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                },
            },
            {
                key: "priority",
                header: "Urgence",
                render: (_, row) => {
                    if (row.priority === "ABSENT_RDV") {
                        return (
                            <div className="space-y-1">
                                <Badge className="text-xs font-bold border bg-red-100 text-red-800 border-red-300 animate-pulse gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    RDV ABSENT
                                </Badge>
                                <p className="text-[10px] font-semibold text-red-600">A rappeler en priorité</p>
                            </div>
                        );
                    }
                    const isCallbackRow = !!row.lastAction && isCallbackResult(row.lastAction.result);
                    const callbackDateRaw = row.lastAction?.callbackDate;
                    const callbackTs = callbackDateRaw ? new Date(callbackDateRaw).getTime() : NaN;
                    const now = Date.now();
                    const oneDayMs = 24 * 60 * 60 * 1000;
                    const threeDaysMs = 3 * oneDayMs;

                    if (!isCallbackRow || !Number.isFinite(callbackTs)) {
                        return (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200">
                                Non planifié
                            </span>
                        );
                    }

                    const isOverdue = callbackTs < now;
                    const isCritical = callbackTs <= now + oneDayMs;
                    const isSoon = callbackTs <= now + threeDaysMs;
                    const urgencyLabel = isOverdue ? "En retard" : isCritical ? "Urgent" : isSoon ? "Bientot" : "Planifié";
                    const urgencyClass = isOverdue
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : isCritical
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : isSoon
                                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200";

                    return (
                        <div className="space-y-1">
                            <time className="block text-[11px] font-medium text-slate-600">
                                {new Date(callbackDateRaw as string).toLocaleDateString("fr-FR", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </time>
                            <Badge className={cn("text-xs font-medium border", urgencyClass)}>
                                {urgencyLabel}
                            </Badge>
                        </div>
                    );
                },
            },
            {
                key: "quickActions",
                header: "Actions rapides",
                render: (_, row) => {
                    const key = queueRowKey(row);
                    const submitting = submittingRowKey === key;
                    // Show only the most common 4 actions inline, rest via drawer  
                    const primaryActions = resultOptions.slice(0, 5);
                    return (
                        <div className="flex items-center gap-1">
                            {submitting && (
                                <span className="flex items-center justify-center w-8 h-8 text-indigo-500">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                </span>
                            )}
                            {primaryActions.map((opt) => {
                                const actionColors: Record<string, string> = {
                                    NO_RESPONSE: "hover:border-slate-400 hover:bg-slate-50 hover:text-slate-700 hover:shadow-sm",
                                    BAD_CONTACT: "hover:border-red-300 hover:bg-red-50 hover:text-red-600 hover:shadow-sm hover:shadow-red-100",
                                    INTERESTED: "hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 hover:shadow-sm hover:shadow-emerald-100",
                                    CALLBACK_REQUESTED: "hover:border-amber-300 hover:bg-amber-50 hover:text-amber-600 hover:shadow-sm hover:shadow-amber-100",
                                    RELANCE: "hover:border-amber-300 hover:bg-amber-50 hover:text-amber-600 hover:shadow-sm hover:shadow-amber-100",
                                    RAPPEL: "hover:border-amber-300 hover:bg-amber-50 hover:text-amber-600 hover:shadow-sm hover:shadow-amber-100",
                                    MEETING_BOOKED: "hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 hover:shadow-sm hover:shadow-indigo-100",
                                    DISQUALIFIED: "hover:border-slate-400 hover:bg-slate-100 hover:text-slate-600 hover:shadow-sm",
                                    ENVOIE_MAIL: "hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 hover:shadow-sm hover:shadow-blue-100",
                                    MAIL_ENVOYE: "hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 hover:shadow-sm hover:shadow-emerald-100",
                                };
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleQuickAction(row, opt.value);
                                        }}
                                        disabled={submitting}
                                        title={`${opt.label} (${opt.key})`}
                                        className={cn(
                                            "w-8 h-8 rounded-lg border flex items-center justify-center transition-all duration-150",
                                            "border-slate-200 text-slate-400 bg-white",
                                            actionColors[opt.value] || "hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600",
                                            submitting && "opacity-40 pointer-events-none",
                                            "active:scale-95"
                                        )}
                                    >
                                        {opt.icon}
                                    </button>
                                );
                            })}
                            {/* Open drawer for full control */}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openDrawerForRow(row);
                                }}
                                title="Voir la fiche complète"
                                className="w-8 h-8 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-slate-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 transition-all duration-150 active:scale-95"
                            >
                                <Eye className="w-4 h-4" />
                            </button>
                        </div>
                    );
                },
            },
        ];

        return (
            <div className="space-y-4">
                {/* Header — Table View */}
                <div className="relative overflow-hidden bg-gradient-to-br from-[#0f0f12] via-slate-950 to-violet-950 rounded-2xl p-5 shadow-xl">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-600/20 via-transparent to-transparent" />
                    <div className="absolute -top-16 -right-16 w-48 h-48 bg-violet-500/10 rounded-full blur-2xl" />

                    <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center border border-violet-400/20">
                                <Phone className="w-5 h-5 text-violet-300" />
                            </div>
                            <div>
                                <h1 className="text-[22px] font-[500] text-white leading-tight">Actions</h1>
                                <p className="text-[13px] text-white/50">File d'actions — vue tableau</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex rounded-xl border border-white/10 p-0.5 bg-white/5">
                                <button type="button" onClick={() => setViewMode("card")} className={cn("px-3 py-1.5 text-[13px] font-[500] rounded-lg transition-all flex items-center gap-1.5", viewMode === "card" ? "bg-white text-slate-900 shadow-md" : "text-white/60 hover:text-white hover:bg-white/10")}>
                                    <User className="w-3.5 h-3.5" /> Carte
                                </button>
                                <button type="button" onClick={() => setViewMode("table")} className={cn("px-3 py-1.5 text-[13px] font-[500] rounded-lg transition-all flex items-center gap-1.5", viewMode === "table" ? "bg-white text-slate-900 shadow-md" : "text-white/60 hover:text-white hover:bg-white/10")}>
                                    <Building2 className="w-3.5 h-3.5" /> Tableau
                                </button>
                            </div>

                            <Button type="button" onClick={() => setShowStatsModal(true)} className="rounded-xl border border-white/15 bg-white/8 hover:bg-white/15 text-white backdrop-blur-sm gap-1.5 px-3 py-1.5 h-auto text-[13px] font-[500]">
                                <BarChart2 className="w-3.5 h-3.5" /> Stats
                            </Button>

                            {syncCallsButton}

                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/8 border border-white/10">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-[22px] font-[500] text-white tabular-nums leading-none">{actionsCompleted}</span>
                                <span className="text-[11px] text-white/50 uppercase tracking-wide font-[500]">actions</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filter Card */}
                <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[#e5e5e5] bg-[#f5f5f5]/50">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-violet-700 flex items-center justify-center shadow-sm shadow-violet-500/20">
                                    <Filter className="w-3.5 h-3.5 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-[14px] font-[500] text-[#1a1a1a]">Filtres</h3>
                                    {hasTableFiltersActive && (
                                        <p className="text-[12px] text-violet-600 font-[500]">
                                            {[tableFilterResult, tableFilterPriority, tableFilterChannel, tableFilterType].filter(Boolean).length} actif{[tableFilterResult, tableFilterPriority, tableFilterChannel, tableFilterType].filter(Boolean).length > 1 ? "s" : ""}
                                        </p>
                                    )}
                                </div>
                            </div>
                            {hasTableFiltersActive && (
                                <Button variant="ghost" size="sm" onClick={clearTableFilters} className="text-slate-400 hover:text-red-500 hover:bg-red-50 gap-1.5 text-[12px] h-7">
                                    <RotateCcw className="w-3 h-3" />
                                    Réinitialiser
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3">
                            {/* Mission */}
                            <div className="space-y-1 xl:col-span-2">
                                <label className="text-[11px] font-[500] text-slate-400 uppercase tracking-wide block">Mission</label>
                                <select value={selectedMissionId || ""} onChange={handleMissionChange} className="w-full h-9 px-3 text-[13px] border border-[#e5e5e5] rounded-lg bg-white text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-shadow cursor-pointer">
                                    {selectableMissions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>
                            {/* Liste */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-[500] text-slate-400 uppercase tracking-wide block">Liste</label>
                                <select value={selectedListId || "all"} onChange={handleListChange} className="w-full h-9 px-3 text-[13px] border border-[#e5e5e5] rounded-lg bg-white text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-shadow cursor-pointer">
                                    <option value="all">Toutes</option>
                                    {filteredLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                            </div>
                            {/* Search */}
                            <div className="space-y-1 sm:col-span-2 xl:col-span-2">
                                <label className="text-[11px] font-[500] text-slate-400 uppercase tracking-wide block">Rechercher</label>
                                <input type="text" value={tableSearchInput} onChange={(e) => setTableSearchInput(e.target.value)} placeholder="Contact ou société…" className="w-full h-9 px-3 text-[13px] border border-[#e5e5e5] rounded-lg bg-white text-[#1a1a1a] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-shadow" />
                            </div>
                            {/* Statut */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-[500] text-slate-400 uppercase tracking-wide block">Statut</label>
                                <select value={tableFilterResult} onChange={(e) => setTableFilterResult(e.target.value)} className="w-full h-9 px-3 text-[13px] border border-[#e5e5e5] rounded-lg bg-white text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-shadow cursor-pointer">
                                    <option value="">Tous</option>
                                    <option value="NONE">Jamais contacté</option>
                                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                            </div>
                            {/* Priorité */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-[500] text-slate-400 uppercase tracking-wide block">Priorité</label>
                                <select value={tableFilterPriority} onChange={(e) => setTableFilterPriority(e.target.value)} className="w-full h-9 px-3 text-[13px] border border-[#e5e5e5] rounded-lg bg-white text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-shadow cursor-pointer">
                                    <option value="">Toutes</option>
                                    {Object.entries(PRIORITY_LABELS).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                            </div>
                            {/* Canal */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-[500] text-slate-400 uppercase tracking-wide block">Canal</label>
                                <select value={tableFilterChannel} onChange={(e) => setTableFilterChannel(e.target.value)} className="w-full h-9 px-3 text-[13px] border border-[#e5e5e5] rounded-lg bg-white text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-shadow cursor-pointer">
                                    <option value="">Tous</option>
                                    {(Object.entries(CHANNEL_LABELS) as [Channel, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                            </div>
                            {/* Type */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-[500] text-slate-400 uppercase tracking-wide block">Type</label>
                                <select value={tableFilterType} onChange={(e) => setTableFilterType(e.target.value)} className="w-full h-9 px-3 text-[13px] border border-[#e5e5e5] rounded-lg bg-white text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-shadow cursor-pointer">
                                    <option value="">Tous</option>
                                    <option value="contact">Contact</option>
                                    <option value="company">Société</option>
                                </select>
                            </div>
                        </div>

                        {/* Results summary */}
                        <div className="mt-3 pt-3 border-t border-[#e5e5e5] flex items-center justify-between">
                            <span className="text-[12px] text-slate-500">
                                {tableSearchApi ? (
                                    <><span className="font-[500] text-violet-600">{queueItems.length}</span> résultat{queueItems.length !== 1 ? "s" : ""} pour «&nbsp;{tableSearchApi}&nbsp;»</>
                                ) : hasTableFiltersActive ? (
                                    <><span className="font-[500] text-violet-600">{filteredQueueItems.length}</span> sur {queueItems.length}</>
                                ) : (
                                    <><span className="font-[500] text-[#1a1a1a]">{queueItems.length}</span> dans la file</>
                                )}
                            </span>
                            <Button variant="ghost" size="sm" onClick={() => refreshQueue()} className="text-slate-400 hover:text-violet-600 gap-1.5 text-[12px] h-7">
                                <RefreshCw className="w-3 h-3" />
                                Actualiser
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Bulk delete bar */}
                {tableSelectedIds.size > 0 && (
                    <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200 mb-4">
                        <span className="text-sm font-medium text-indigo-800">
                            {tableSelectedIds.size} élément(s) sélectionné(s)
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setTableSelectedIds(new Set())}
                                disabled={isBulkDisqualifying}
                            >
                                Annuler
                            </Button>
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={handleBulkDisqualify}
                                disabled={isBulkDisqualifying}
                                className="gap-2"
                            >
                                {isBulkDisqualifying ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Trash2 className="w-4 h-4" />
                                )}
                                Disqualifier la sélection
                            </Button>
                        </div>
                    </div>
                )}

                {/* Data Table */}
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-lg shadow-slate-200/50 overflow-hidden">
                    {queueInitialLoading ? (
                        <TableSkeleton columns={6} rows={12} className="rounded-2xl" />
                    ) : queueFetchError ? (
                        <EmptyState
                            icon={RefreshCw}
                            title={queueFetchErrorMsg ?? "Erreur"}
                            description="Vérifiez votre connexion et réessayez."
                            action={
                                <Button
                                    variant="secondary"
                                    onClick={() => refreshQueue()}
                                    className="gap-2"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Réessayer
                                </Button>
                            }
                            className="rounded-2xl border-0"
                        />
                    ) : filteredQueueItems.length === 0 ? (
                        <EmptyState
                            icon={emptyTableReason.icon}
                            title={emptyTableReason.title}
                            description={emptyTableReason.description}
                            action={
                                hasTableFiltersActive ? (
                                    <Button variant="secondary" onClick={clearTableFilters} className="gap-2">
                                        <RotateCcw className="w-4 h-4" />
                                        Réinitialiser les filtres
                                    </Button>
                                ) : selectedMissionId ? (
                                    <Button variant="secondary" onClick={() => refreshQueue()} className="gap-2">
                                        <RefreshCw className="w-4 h-4" />
                                        Actualiser
                                    </Button>
                                ) : undefined
                            }
                            className="rounded-2xl border-0"
                        />
                    ) : (
                        <DataTable
                            data={filteredQueueItems}
                            columns={queueColumns}
                            keyField={(row) => queueRowKey(row)}
                            searchable
                            searchPlaceholder="Rechercher contact, société, téléphone, note..."
                            searchFields={["_displayName", "_companyName", "_phone", "_searchNote", "missionName"]}
                            pagination
                            pageSize={15}
                            emptyMessage="Aucun contact dans la file. Changez de mission ou liste."
                            onRowClick={openDrawerForRow}
                            enableSecondaryColumnsToggle
                            selectable
                            selectedIds={tableSelectedIds}
                            onSelectionChange={(ids) => setTableSelectedIds(new Set(ids))}
                            getRowClassName={(row) => {
                                if (recentlyUpdatedRowKeys.has(queueRowKey(row))) {
                                    return "!bg-emerald-50/80 border-l-4 border-l-emerald-500 animate-fade-in";
                                }
                                const isCallbackRow = !!row.lastAction && isCallbackResult(row.lastAction.result);
                                if (!isCallbackRow) return "";
                                const callbackTs = row.lastAction?.callbackDate ? new Date(row.lastAction.callbackDate).getTime() : NaN;
                                const in3Days = Number.isFinite(callbackTs) && callbackTs <= Date.now() + 3 * 24 * 60 * 60 * 1000;
                                return in3Days
                                    ? "!bg-amber-100/80 border-l-8 border-l-amber-500 ring-1 ring-amber-200/70"
                                    : "!bg-amber-50/60 border-l-8 border-l-amber-300 ring-1 ring-amber-100/70";
                            }}
                        />
                    )}
                </div>

                {/* Unified Action Drawer — mount only when open to avoid heavy effects when closed */}
                {unifiedDrawerOpen && unifiedDrawerCompanyId && (
                        <UnifiedActionDrawer
                            isOpen={unifiedDrawerOpen}
                            onClose={closeUnifiedDrawer}
                            contactId={unifiedDrawerContactId}
                            companyId={unifiedDrawerCompanyId}
                            missionId={unifiedDrawerMissionId}
                            missionName={unifiedDrawerMissionName}
                            clientBookingUrl={unifiedDrawerClientBookingUrl || undefined}
                            clientInterlocuteurs={unifiedDrawerInterlocuteurs}
                            onBookingDialogOpenChange={setUnifiedBookingDialogOpen}
                            onAlloDialogOpenChange={setUnifiedAlloDialogOpen}
                            onContactSelect={(newContactId) => {
                                setUnifiedDrawerContactId(newContactId);
                            }}
                            onActionRecorded={() => {
                                const rowKey = unifiedDrawerContactId ?? unifiedDrawerCompanyId ?? "";
                                if (rowKey) {
                                    queryClient.invalidateQueries({ queryKey: queueQueryKey });
                                    setActionsCompleted((c) => c + 1);
                                }
                                refreshQueue();
                            }}
                            onValidateAndNext={() => {
                                if (!drawerRow) return;
                                const key = queueRowKey(drawerRow);
                                const idx = filteredQueueItems.findIndex((row) => queueRowKey(row) === key);
                                queryClient.invalidateQueries({ queryKey: queueQueryKey });
                                setActionsCompleted((c) => c + 1);
                                if (idx >= 0 && idx < filteredQueueItems.length - 1) {
                                    const nextRow = filteredQueueItems[idx + 1];
                                    openDrawerForRow(nextRow);
                                } else {
                                    closeUnifiedDrawer();
                                }
                                refreshQueue();
                            }}
                        />
                    )
                }

                {/* Script companion drawer (table view only), synchronized with unified drawer */}
                {unifiedDrawerOpen && unifiedDrawerMissionId && (
                    <ScriptCompanionDrawer
                        isOpen={
                            unifiedDrawerOpen &&
                            !unifiedBookingDialogOpen &&
                            !unifiedAlloDialogOpen
                        }
                        onClose={closeUnifiedDrawer}
                        missionId={unifiedDrawerMissionId}
                        missionName={unifiedDrawerMissionName}
                    />
                )}

                <QuickEmailModal
                    isOpen={showQuickEmailModal}
                    onClose={() => {
                        setShowQuickEmailModal(false);
                        setPendingEmailAction(null);
                        setEmailModalContact(null);
                        setEmailModalCompany(null);
                        setEmailModalMissionId(null);
                        setEmailModalMissionName(null);
                        setEmailModalPreferredMailboxId(null);
                    }}
                    onSent={handleEmailSent}
                    contact={emailModalContact}
                    company={emailModalCompany}
                    missionId={emailModalMissionId}
                    missionName={emailModalMissionName}
                    preferredMailboxId={emailModalPreferredMailboxId ?? undefined}
                />

                {/* Queue: Mail à envoyer — note only or open composer */}
                <Modal
                    isOpen={showMailToSendChoiceModal}
                    onClose={() => { setShowMailToSendChoiceModal(false); setMailToSendChoiceRow(null); setMailToSendChoiceNote(""); }}
                    title="Mail à envoyer"
                    description={mailToSendChoiceRow ? (mailToSendChoiceRow.contact ? `${mailToSendChoiceRow.contact.firstName ?? ""} ${mailToSendChoiceRow.contact.lastName ?? ""}`.trim() || mailToSendChoiceRow.company?.name : mailToSendChoiceRow.company?.name) ?? "" : ""}
                    size="sm"
                >
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600">Enregistrer une note (Mail à envoyer) ou envoyer un email maintenant (Mail envoyé).</p>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Note *</label>
                            <textarea
                                value={mailToSendChoiceNote}
                                onChange={(e) => setMailToSendChoiceNote(e.target.value)}
                                placeholder="Ex: Mail à envoyer après validation du devis..."
                                rows={3}
                                maxLength={500}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2 justify-end pt-2">
                            <Button variant="ghost" onClick={() => { setShowMailToSendChoiceModal(false); setMailToSendChoiceRow(null); setMailToSendChoiceNote(""); }}>
                                Annuler
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleMailToSendChoiceOpenComposer}
                                className="gap-2 border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                            >
                                <Send className="w-4 h-4" />
                                Envoyer un email
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleMailToSendChoiceSaveOnly}
                                disabled={!mailToSendChoiceNote.trim() || submittingRowKey !== null}
                                isLoading={submittingRowKey !== null}
                            >
                                Enregistrer (Mail à envoyer)
                            </Button>
                        </div>
                    </div>
                </Modal>

                {/* Stats modal: summary + list of contacts with status (click to open drawer) */}
                <Modal
                    isOpen={showStatsModal}
                    onClose={() => setShowStatsModal(false)}
                    title="Statistiques"
                    description={selectedMissionId ? (missions.find((m) => m.id === selectedMissionId)?.name ?? "") + (selectedListId ? ` · ${filteredLists.find((l) => l.id === selectedListId)?.name ?? ""}` : "") : "Sélectionnez une mission"}
                    size="xl"
                >
                    {viewMode === "table" ? (
                        <ActionStatsModalBody
                            items={filteredQueueItems}
                            loading={false}
                            statusLabels={statusLabels}
                            onRowClick={(row) => {
                                openDrawerForRow(row);
                                setShowStatsModal(false);
                            }}
                            priorityLabels={PRIORITY_LABELS}
                            resultIconMap={RESULT_ICON_MAP}
                            queueRowKey={queueRowKey}
                        />
                    ) : (
                        <ActionStatsModalBody
                            items={statsQueueItems}
                            loading={statsLoading}
                            statusLabels={statusLabels}
                            onRowClick={(row) => {
                                openDrawerForRow(row);
                                setShowStatsModal(false);
                            }}
                            priorityLabels={PRIORITY_LABELS}
                            resultIconMap={RESULT_ICON_MAP}
                            queueRowKey={queueRowKey}
                        />
                    )}
                </Modal>
            </div >
        );
    }

    // Loading (card view)
    if (isLoading && !currentAction) {
        return (
            <div className="space-y-6 max-w-2xl mx-auto">
                <CardSkeleton hasHeader hasImage={false} lines={4} />
                <CardSkeleton hasHeader={false} lines={3} />
                <div className="flex gap-4">
                    <CardSkeleton hasHeader className="flex-1" lines={2} />
                    <CardSkeleton hasHeader className="flex-1" lines={2} />
                </div>
            </div>
        );
    }

    // Empty queue (card view)
    if (!currentAction?.hasNext) {
        return (
            <div className="space-y-4">
                {/* Header — Empty Queue */}
                <div className="relative overflow-hidden bg-gradient-to-br from-[#0f0f12] via-slate-950 to-violet-950 rounded-2xl p-5 shadow-xl">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-600/20 via-transparent to-transparent" />
                    <div className="absolute -top-16 -right-16 w-48 h-48 bg-violet-500/10 rounded-full blur-2xl" />
                    <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center border border-violet-400/20">
                                <Phone className="w-5 h-5 text-violet-300" />
                            </div>
                            <div>
                                <h1 className="text-[22px] font-[500] text-white leading-tight">Actions</h1>
                                <p className="text-[13px] text-white/50">Gérez vos actions commerciales</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex rounded-xl border border-white/10 p-0.5 bg-white/5">
                                <button type="button" onClick={() => setViewMode("card")} className={cn("px-3 py-1.5 text-[13px] font-[500] rounded-lg transition-all flex items-center gap-1.5", viewMode === "card" ? "bg-white text-slate-900 shadow-md" : "text-white/60 hover:text-white hover:bg-white/10")}>
                                    <User className="w-3.5 h-3.5" /> Carte
                                </button>
                                <button type="button" onClick={() => setViewMode("table")} className={cn("px-3 py-1.5 text-[13px] font-[500] rounded-lg transition-all flex items-center gap-1.5", viewMode === "table" ? "bg-white text-slate-900 shadow-md" : "text-white/60 hover:text-white hover:bg-white/10")}>
                                    <Building2 className="w-3.5 h-3.5" /> Tableau
                                </button>
                            </div>
                            <Select variant="header-dark" value={selectedMissionId || ""} onChange={(id) => { setSelectedMissionId(id); localStorage.setItem("sdr_selected_mission", id); const firstList = lists.find((l) => l.mission.id === id); setSelectedListId(firstList?.id ?? null); }} options={selectableMissions.map((m) => ({ value: m.id, label: m.name }))} placeholder="Mission" className="min-w-[160px]" />
                            <Select variant="header-dark" value={selectedListId || "all"} onChange={(id) => setSelectedListId(id === "all" ? null : id)} options={[{ value: "all", label: "Toutes les listes" }, ...filteredLists.map((l) => ({ value: l.id, label: l.name }))]} placeholder="Liste" className="min-w-[140px]" />
                            {syncCallsButton}
                        </div>
                    </div>
                </div>

                {/* Empty State */}
                <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-sm p-12">
                    <EmptyState
                        icon={CheckCircle2}
                        title="File d'attente vide"
                        description={
                            missions.length === 0
                                ? "Aucune mission active assignée. Contactez votre manager pour être assigné à une mission."
                                : selectableMissions.length === 0
                                    ? "Aucune mission planifiée (aujourd'hui ou cette semaine). Vous ne pouvez travailler que sur vos missions planifiées."
                                : !selectedMissionId
                                    ? "Sélectionnez une mission ci-dessus pour afficher le prochain contact à contacter."
                                    : (currentAction?.message || "Aucun contact disponible pour le moment (listes vides, contacts sans téléphone/email/LinkedIn, ou tous en cooldown 24h).")
                        }
                        action={
                            <Button variant="secondary" onClick={loadNextAction} className="gap-2">
                                <RefreshCw className="w-4 h-4" />
                                Actualiser
                            </Button>
                        }
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 pb-28">
            {/* Success Overlay */}
            {showSuccess && (
                <div className="fixed inset-0 bg-white/80 backdrop-blur-md z-50 flex items-center justify-center">
                    <div className="text-center animate-fade-in bg-white rounded-2xl border border-[#e5e5e5] shadow-xl px-10 py-8">
                        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                        </div>
                        <p className="text-[18px] font-[500] text-[#1a1a1a]">Action enregistrée</p>
                        <p className="text-[13px] text-slate-400 mt-1">Chargement du contact suivant…</p>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-[#0f0f12] via-slate-950 to-violet-950 rounded-2xl p-5 shadow-xl">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-600/20 via-transparent to-transparent" />
                <div className="absolute -top-16 -right-16 w-48 h-48 bg-violet-500/10 rounded-full blur-2xl" />
                <div className="absolute bottom-0 left-1/4 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl" />

                <div className="relative">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        {/* Left: Title & mission context */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-500/20 backdrop-blur-sm flex items-center justify-center border border-violet-400/20 ring-1 ring-white/5">
                                <Phone className="w-5 h-5 text-violet-300" />
                            </div>
                            <div>
                                <h1 className="text-[22px] font-[500] text-white leading-tight tracking-tight">Actions</h1>
                                <p className="text-[13px] text-white/50 mt-0.5 truncate max-w-[280px]">{currentAction.missionName || "Gérez vos actions commerciales"}</p>
                            </div>
                            {currentAction.priority && PRIORITY_LABELS[currentAction.priority] && (
                                <Badge className={cn("text-[11px] font-[500] uppercase tracking-wide", PRIORITY_LABELS[currentAction.priority].color)}>
                                    {PRIORITY_LABELS[currentAction.priority].label}
                                </Badge>
                            )}
                        </div>

                        {/* Right: Controls & Stats */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* View Toggle */}
                            <div className="flex rounded-xl border border-white/10 p-0.5 bg-white/5">
                                <button type="button" onClick={() => setViewMode("card")} className={cn("px-3 py-1.5 text-[13px] font-[500] rounded-lg transition-all flex items-center gap-1.5", viewMode === "card" ? "bg-white text-slate-900 shadow-md" : "text-white/60 hover:text-white hover:bg-white/10")}>
                                    <User className="w-3.5 h-3.5" /> Carte
                                </button>
                                <button type="button" onClick={() => setViewMode("table")} className={cn("px-3 py-1.5 text-[13px] font-[500] rounded-lg transition-all flex items-center gap-1.5", viewMode === "table" ? "bg-white text-slate-900 shadow-md" : "text-white/60 hover:text-white hover:bg-white/10")}>
                                    <Building2 className="w-3.5 h-3.5" /> Tableau
                                </button>
                            </div>

                            <Select variant="header-dark" value={selectedMissionId || ""} onChange={(id) => { setSelectedMissionId(id); localStorage.setItem("sdr_selected_mission", id); const firstList = lists.find((l) => l.mission.id === id); setSelectedListId(firstList?.id ?? null); }} options={selectableMissions.map((m) => ({ value: m.id, label: m.name }))} placeholder="Mission" className="min-w-[160px]" />
                            <Select variant="header-dark" value={selectedListId || "all"} onChange={(id) => setSelectedListId(id === "all" ? null : id)} options={[{ value: "all", label: "Toutes les listes" }, ...filteredLists.map((l) => ({ value: l.id, label: l.name }))]} placeholder="Liste" className="min-w-[140px]" />

                            <Button type="button" onClick={() => setShowStatsModal(true)} className="rounded-xl border border-white/15 bg-white/8 hover:bg-white/15 text-white backdrop-blur-sm gap-1.5 px-3 py-1.5 h-auto text-[13px] font-[500]">
                                <BarChart2 className="w-3.5 h-3.5" /> Stats
                            </Button>

                            {syncCallsButton}

                            {/* Session counter */}
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/8 border border-white/10">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-[22px] font-[500] text-white tabular-nums leading-none">{actionsCompleted}</span>
                                <span className="text-[11px] text-white/50 uppercase tracking-wide font-[500]">actions</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-[13px] text-red-700 flex-1">{error}</p>
                    <button onClick={() => setError(null)} className="w-6 h-6 rounded-lg flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-100 transition-colors flex-shrink-0">
                        <XCircle className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Left - Contact Panel (2 cols) */}
                <div className="lg:col-span-2 space-y-3">
                    {/* Company Card */}
                    <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-sm overflow-hidden">
                        <div className="p-4">
                            <div className="flex items-start gap-3">
                                {/* Company initials avatar */}
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-800 to-slate-700 flex items-center justify-center flex-shrink-0 shadow-md shadow-slate-800/20">
                                    <span className="text-[15px] font-[500] text-white tracking-wide">
                                        {getInitials(null, null, currentAction.company?.name)}
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <h2 className="text-[18px] font-[500] text-[#1a1a1a] truncate leading-tight">
                                                {currentAction.company?.name}
                                            </h2>
                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                {currentAction.company?.industry && (
                                                    <span className="text-[11px] font-[500] uppercase tracking-wide text-slate-500 bg-[#f5f5f5] border border-[#e5e5e5] px-2 py-0.5 rounded-md">
                                                        {currentAction.company.industry}
                                                    </span>
                                                )}
                                                {currentAction.company?.country && (
                                                    <span className="text-[11px] font-[500] uppercase tracking-wide text-slate-500 bg-[#f5f5f5] border border-[#e5e5e5] px-2 py-0.5 rounded-md">
                                                        {currentAction.company.country}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {currentAction.company?.id && (
                                            <Button variant="ghost" size="sm" onClick={() => setDrawerCompanyId(currentAction.company!.id)} className="shrink-0 h-7 w-7 p-0 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg" title="Modifier l'entreprise">
                                                <PenLine className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                    {currentAction.company?.website && (
                                        <a href={`https://${currentAction.company.website}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-[12px] text-violet-600 hover:text-violet-700 font-[400] transition-colors">
                                            <Globe className="w-3 h-3" />
                                            {currentAction.company.website}
                                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contact/Company Card */}
                    <Card className="border-[#e5e5e5] shadow-sm">
                        {currentAction.contact ? (
                            <>
                                <div className="flex items-start gap-3 mb-4">
                                    {/* Contact initials avatar */}
                                    <div className="relative flex-shrink-0">
                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-violet-700 flex items-center justify-center shadow-md shadow-violet-500/25">
                                            <span className="text-[16px] font-[500] text-white tracking-wide">
                                                {getInitials(currentAction.contact.firstName, currentAction.contact.lastName)}
                                            </span>
                                        </div>
                                        {/* Channel indicator dot */}
                                        <div className={cn("absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white",
                                            currentAction.channel === 'CALL' ? "bg-violet-500" :
                                            currentAction.channel === 'EMAIL' ? "bg-blue-500" : "bg-sky-500"
                                        )}>
                                            {currentAction.channel === 'CALL' ? <Phone className="w-2 h-2 text-white" /> :
                                             currentAction.channel === 'EMAIL' ? <Mail className="w-2 h-2 text-white" /> :
                                             <Linkedin className="w-2 h-2 text-white" />}
                                        </div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[18px] font-[500] text-[#1a1a1a] leading-tight">
                                            {currentAction.contact.firstName} {currentAction.contact.lastName}
                                        </p>
                                        {currentAction.contact.title && (
                                            <p className="text-[13px] text-slate-500 mt-0.5 truncate">{currentAction.contact.title}</p>
                                        )}
                                    </div>
                                    {currentAction.contact.id && (
                                        <Button variant="ghost" size="sm" onClick={() => setDrawerContactId(currentAction.contact!.id)} className="shrink-0 h-7 w-7 p-0 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg" title="Modifier le contact">
                                            <PenLine className="w-3.5 h-3.5" />
                                        </Button>
                                    )}
                                </div>

                                {/* Contact Actions */}
                                <div className="space-y-2">
                                    {/* Phone - validate it looks like a phone number (contains digits) */}
                                    {(() => {
                                        const phone = currentAction.contact.phone || (currentAction.channel === 'CALL' && currentAction.company?.phone ? currentAction.company.phone : null);
                                        const isValidPhone = phone && /[\d+\-().\s]/.test(phone) && phone.length >= 8;
                                        return isValidPhone ? (
                                            <div className="flex items-stretch gap-2">
                                                <a
                                                    href={`tel:${phone}`}
                                                    onClick={(e) => handlePhoneCallAttempt(e, phone, {
                                                        lastAction: currentAction.lastAction,
                                                        lastActionBy: currentAction.lastActionBy ?? null,
                                                    })}
                                                    className="flex flex-1 items-center justify-center gap-2.5 h-12 text-[14px] font-[500] text-white bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 rounded-xl transition-all shadow-md shadow-violet-500/25 active:scale-[0.98]"
                                                >
                                                    <Phone className="w-4 h-4" />
                                                    <span className="font-mono tracking-wide">{phone}</span>
                                                </a>
                                                <button
                                                    type="button"
                                                    onClick={() => copyToClipboard(phone)}
                                                    title="Copier le numéro"
                                                    className="w-12 h-12 rounded-xl border border-[#e5e5e5] bg-white text-slate-400 hover:text-violet-600 hover:border-violet-200 hover:bg-violet-50 flex items-center justify-center transition-colors active:scale-[0.97] flex-shrink-0"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : null;
                                    })()}
                                    {/* Email */}
                                    {(() => {
                                        const email = currentAction.contact.email;
                                        const isValidEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
                                        return isValidEmail ? (
                                            <a
                                                href={`mailto:${email}`}
                                                className="flex items-center justify-center gap-2 h-10 w-full text-[13px] font-[400] text-slate-600 bg-[#f5f5f5] border border-[#e5e5e5] hover:bg-[#ebebeb] hover:border-slate-300 rounded-xl transition-colors"
                                            >
                                                <Mail className="w-3.5 h-3.5 text-slate-500" />
                                                <span className="truncate max-w-[200px]">{email}</span>
                                            </a>
                                        ) : null;
                                    })()}
                                    {currentAction.contact.linkedin && (
                                        <a
                                            href={currentAction.contact.linkedin.startsWith("http") ? currentAction.contact.linkedin : `https://${currentAction.contact.linkedin}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-2 h-10 w-full text-[13px] font-[400] text-sky-700 bg-sky-50 border border-sky-200/60 hover:bg-sky-100 rounded-xl transition-colors"
                                        >
                                            <Linkedin className="w-3.5 h-3.5" />
                                            LinkedIn
                                        </a>
                                    )}
                                    {/* Warnings for missing contact info */}
                                    {(() => {
                                        const phone = currentAction.contact.phone || (currentAction.channel === 'CALL' && currentAction.company?.phone ? currentAction.company.phone : null);
                                        const isValidPhone = phone && /[\d+\-().\s]/.test(phone) && phone.length >= 8;
                                        const email = currentAction.contact.email;
                                        const isValidEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

                                        if (currentAction.channel === 'CALL' && !isValidPhone) {
                                            return (
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-700">
                                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                                        Aucun numéro de téléphone valide
                                                    </div>
                                                    <Button variant="outline" size="sm" onClick={() => setDrawerContactId(currentAction.contact!.id)} className="w-full gap-2 border-[#e5e5e5] text-slate-600 hover:border-violet-200 hover:text-violet-600">
                                                        <PenLine className="w-3.5 h-3.5" />
                                                        Ajouter un numéro
                                                    </Button>
                                                </div>
                                            );
                                        }
                                        if (currentAction.channel === 'EMAIL' && !isValidEmail) {
                                            return (
                                                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-700">
                                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                                    Aucune adresse email valide
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                    {(currentAction.clientBookingUrl || (currentAction.clientInterlocuteurs?.some(i => (i.bookingLinks?.length ?? 0) > 0))) && (
                                        <div className="space-y-2">
                                            <div>
                                                <DateTimePicker
                                                    label={
                                                        <>
                                                            Date du RDV <span className="text-red-500">*</span>
                                                        </>
                                                    }
                                                    value={rdvDate}
                                                    onChange={setRdvDate}
                                                    placeholder="Choisir date et heure du RDV…"
                                                    min={new Date().toISOString().slice(0, 16)}
                                                    triggerClassName="border-indigo-200 focus:ring-indigo-400/40 focus:border-indigo-400"
                                                />
                                            </div>
                                            <Button
                                                variant="primary"
                                                onClick={() => setShowBookingDrawer(true)}
                                                disabled={!rdvDate}
                                                className="w-full gap-2"
                                            >
                                                <Calendar className="w-4 h-4" />
                                                Planifier un RDV
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : currentAction.company ? (
                            <>
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center flex-shrink-0 shadow-md">
                                        <span className="text-[15px] font-[500] text-white">{getInitials(null, null, currentAction.company.name)}</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[18px] font-[500] text-[#1a1a1a] leading-tight">{currentAction.company.name}</p>
                                        <span className="text-[11px] font-[500] uppercase tracking-wide text-slate-500 bg-[#f5f5f5] border border-[#e5e5e5] px-2 py-0.5 rounded-md mt-1 inline-block">Entreprise</span>
                                    </div>
                                    {currentAction.company.id && (
                                        <Button variant="ghost" size="sm" onClick={() => setDrawerCompanyId(currentAction.company!.id)} className="shrink-0 h-7 w-7 p-0 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg" title="Modifier l'entreprise">
                                            <PenLine className="w-3.5 h-3.5" />
                                        </Button>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    {currentAction.company.phone ? (
                                        <div className="flex items-stretch gap-2">
                                            <a href={`tel:${currentAction.company.phone}`} onClick={(e) => handlePhoneCallAttempt(e, currentAction.company.phone!, { lastAction: currentAction.lastAction, lastActionBy: currentAction.lastActionBy ?? null })} className="flex flex-1 items-center justify-center gap-2 h-11 text-[14px] font-[500] text-white bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 rounded-xl transition-all shadow-md shadow-violet-500/25 active:scale-[0.98]">
                                                <Phone className="w-4 h-4" />
                                                {currentAction.company.phone}
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => copyToClipboard(currentAction.company!.phone!)}
                                                title="Copier le numéro"
                                                className="w-11 h-11 rounded-xl border border-[#e5e5e5] bg-white text-slate-400 hover:text-violet-600 hover:border-violet-200 hover:bg-violet-50 flex items-center justify-center transition-colors active:scale-[0.97] flex-shrink-0"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <Button variant="outline" size="sm" onClick={() => setDrawerCompanyId(currentAction.company!.id)} className="w-full gap-2 border-[#e5e5e5] text-slate-600 hover:border-violet-200 hover:text-violet-600">
                                            <PenLine className="w-3.5 h-3.5" />
                                            Ajouter un numéro
                                        </Button>
                                    )}
                                </div>
                            </>
                        ) : null}

                        {/* Previous Action Context */}
                        {currentAction.lastAction && (
                            <div className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50 overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-100">
                                    <History className="w-3.5 h-3.5 text-amber-500" />
                                    <span className="text-[11px] font-[500] uppercase tracking-wide text-amber-700">Dernière interaction</span>
                                    <span className="ml-auto text-[11px] text-amber-500 font-[400]">
                                        {new Date(currentAction.lastAction.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <div className="px-3 py-2.5">
                                    {currentAction.lastActionBy?.id && currentAction.lastActionBy.id !== session?.user?.id && currentAction.lastActionBy.name && (
                                        <p className="text-[12px] text-amber-600 font-[500] mb-1.5">Par {currentAction.lastActionBy.name}</p>
                                    )}
                                    <div className="flex items-center gap-2">
                                        {(() => {
                                            const sem = RESULT_SEMANTIC[currentAction.lastAction.result];
                                            return (
                                                <span className={cn("inline-flex items-center gap-1 text-[12px] font-[500] px-2 py-1 rounded-lg border", sem ? cn(sem.selectedCls) : "bg-slate-100 text-slate-600 border-slate-200")}>
                                                    {RESULT_ICON_MAP[currentAction.lastAction.result]}
                                                    <span className="ml-0.5">{statusLabels[currentAction.lastAction.result] ?? currentAction.lastAction.result}</span>
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    {currentAction.lastAction.note && (
                                        <p className="mt-2 text-[13px] text-amber-900 italic leading-relaxed pl-3 border-l-2 border-amber-300">
                                            "{currentAction.lastAction.note}"
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Right - Script Panel (3 cols) */}
                {!showBookingDrawer && (
                <div className="lg:col-span-3">
                    <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-sm h-full overflow-hidden">
                        <div className="px-5 py-4 border-b border-[#e5e5e5] bg-gradient-to-r from-[#f5f5f5] to-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 flex items-center justify-center shadow-md shadow-violet-500/25">
                                        <Sparkles className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-[16px] font-[500] text-[#1a1a1a]">Script d'appel</h3>
                                        <p className="text-[12px] text-slate-400">Guide conversationnel</p>
                                    </div>
                                </div>
                                {currentAction?.scriptDefaultTab && (
                                    <span className="text-[11px] font-[500] uppercase tracking-wide text-violet-600 bg-violet-50 border border-violet-200 px-2 py-1 rounded-lg">
                                        {SCRIPT_TABS.find((t) => t.id === currentAction.scriptDefaultTab)?.label ?? "Script"}
                                    </span>
                                )}
                            </div>
                            {(currentAction?.strategyName || currentAction?.sourceListName) && (
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                    {currentAction.strategyName && (
                                        <span>
                                            Stratégie : <span className="font-medium text-slate-700">{currentAction.strategyName}</span>
                                        </span>
                                    )}
                                    {currentAction.sourceListName && (
                                        <span>
                                            Liste source : <span className="font-medium text-slate-700">{currentAction.sourceListName}</span>
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-4">
                            {availableScriptTabs.length > 0 ? (
                                <>
                                    <Tabs tabs={availableScriptTabs} activeTab={activeTab} onTabChange={setActiveTab} className="mb-3" />
                                    <div className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-xl p-4 min-h-[200px] max-h-[420px] overflow-y-auto">
                                        <p className="text-[14px] text-slate-700 leading-[1.65] whitespace-pre-wrap font-[400]">
                                            {scriptPanelContent[activeTab as keyof typeof scriptPanelContent] || ""}
                                        </p>
                                    </div>
                                </>
                            ) : currentAction.script ? (
                                <div className="bg-[#f5f5f5] border border-[#e5e5e5] rounded-xl p-4 max-h-[420px] overflow-y-auto">
                                    <p className="text-[14px] text-slate-700 leading-[1.65] whitespace-pre-wrap font-[400]">
                                        {currentAction.script}
                                    </p>
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <div className="w-12 h-12 rounded-2xl bg-[#f5f5f5] border border-[#e5e5e5] flex items-center justify-center mx-auto mb-3">
                                        <Sparkles className="w-5 h-5 text-slate-300" />
                                    </div>
                                    <p className="text-[14px] text-slate-400">Aucun script configuré</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                )}
            </div>

            {/* Action Results */}
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 flex items-center justify-center shadow-md shadow-violet-500/25">
                                <CheckCircle2 className="w-4.5 h-4.5 text-white" />
                            </div>
                            <div>
                                <h3 className="text-[16px] font-[500] text-[#1a1a1a] leading-tight">Résultat de l'action</h3>
                                <p className="text-[12px] text-slate-400 mt-0.5">Sélectionnez ou tapez le chiffre correspondant</p>
                            </div>
                        </div>
                        {selectedResult && (
                            <button
                                type="button"
                                onClick={() => setSelectedResult(null)}
                                className="text-[11px] font-[500] uppercase tracking-wide text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                Effacer
                            </button>
                        )}
                    </div>
                </div>
                <div className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                        {resultOptions.map((option) => {
                            const sem = RESULT_SEMANTIC[option.value] ?? DEFAULT_SEMANTIC;
                            const isSelected = selectedResult === option.value;
                            return (
                                <button
                                    key={option.value}
                                    onClick={() => selectResultWithFocus(option.value)}
                                    title={STATUS_HOVER_HINTS[option.value]}
                                    className={cn(
                                        "relative flex items-center gap-2.5 p-3.5 rounded-xl border-2 transition-all duration-150 text-left group",
                                        "border-l-[3px]",
                                        isSelected
                                            ? cn(sem.selectedCls, "shadow-md scale-[1.02]", sem.activeBorder)
                                            : cn("bg-white border-[#e5e5e5]", sem.hoverCls, "hover:shadow-sm hover:scale-[1.01]", "border-l-transparent")
                                    )}
                                >
                                    <span className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                                        isSelected ? sem.iconCls : "bg-[#f5f5f5] text-slate-400 group-hover:text-slate-600"
                                    )}>
                                        {option.icon}
                                    </span>
                                    <span className={cn(
                                        "text-[13px] font-[400] leading-snug",
                                        isSelected ? "text-[#1a1a1a] font-[500]" : "text-slate-600"
                                    )}>
                                        {option.label}
                                    </span>
                                    <span className={cn(
                                        "absolute top-2 right-2 w-4.5 h-4.5 flex items-center justify-center text-[10px] font-[500] font-mono rounded-md transition-colors",
                                        isSelected ? "bg-white/70 text-slate-500" : "bg-[#f5f5f5] text-slate-400"
                                    )}>
                                        {option.key}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Note */}
            <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-[#e5e5e5] bg-[#f5f5f5]/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-slate-400" />
                            <h3 className="text-[14px] font-[500] text-[#1a1a1a]">
                                Note
                                {selectedResult && getRequiresNote(selectedResult) && (
                                    <span className="text-red-500 ml-1">*</span>
                                )}
                            </h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[12px] text-slate-400 tabular-nums">{note.length}/500</span>
                            {currentAction?.channel === 'CALL' && (
                                <button
                                    type="button"
                                    onClick={openAlloDialog}
                                    className={cn(
                                        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-[500] border transition-all",
                                        linkedAlloCall
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                            : "bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100"
                                    )}
                                >
                                    <PhoneCall className="w-3 h-3" />
                                    {linkedAlloCall ? "Appel validé ✓" : "Valider appel (Allo)"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <div className="p-4 space-y-3">
                    <textarea
                        ref={noteInputRef}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Note sur l'échange...  (Ctrl+Entrée pour valider)"
                        rows={3}
                        maxLength={500}
                        className="w-full px-3 py-2.5 text-[14px] border border-[#e5e5e5] rounded-xl bg-[#f5f5f5]/30 text-[#1a1a1a] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 focus:bg-white resize-none transition-colors leading-relaxed"
                    />
                    {/* Linked call preview */}
                    {linkedAlloCall && (
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-semibold text-emerald-800">Appel Allo lié</span>
                                    {linkedAlloCall.duration > 0 && (
                                        <span className="text-[11px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-md font-medium">
                                            {Math.floor(linkedAlloCall.duration / 60)}m{linkedAlloCall.duration % 60}s
                                        </span>
                                    )}
                                    {linkedAlloCall.outcome && (
                                        <span className="text-[11px] text-slate-500">{linkedAlloCall.outcome}</span>
                                    )}
                                </div>
                                {linkedAlloCall.summary && (
                                    <p className="text-xs text-emerald-700 mt-1 line-clamp-2">{linkedAlloCall.summary}</p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setLinkedAlloCall(null)}
                                className="w-5 h-5 rounded flex items-center justify-center text-emerald-400 hover:text-emerald-600 transition-colors flex-shrink-0"
                                title="Retirer le lien"
                            >
                                <XCircle className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <AlloCallPickerModal
                isOpen={alloDialogOpen}
                onClose={() => setAlloDialogOpen(false)}
                loading={alloDialogLoading}
                calls={alloDialogCalls as unknown[]}
                filterPhone={alloDialogFilterPhone}
                alloLineCount={alloDialogAlloLineCount}
                selectedId={alloDialogSelectedId}
                onSelectId={setAlloDialogSelectedId}
                onConfirm={confirmAlloCall}
            />

            {/* Callback date */}
            {isCallbackResult(selectedResult) && (
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50 overflow-hidden">
                    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-amber-100">
                        <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
                            <Calendar className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-[14px] font-[500] text-[#1a1a1a]">Date de rappel</h3>
                            <p className="text-[12px] text-amber-600">Optionnel — ou indiquez-la dans la note</p>
                        </div>
                    </div>
                    <div className="p-4 space-y-3">
                        {/* One-tap slots — no picker needed mid-call */}
                        <div className="flex flex-wrap gap-1.5">
                            {CALLBACK_QUICK_PICKS.map((pick) => {
                                const isActive = callbackQuickLabel === pick.label && !!callbackDateValue;
                                return (
                                    <button
                                        key={pick.label}
                                        type="button"
                                        onClick={() => {
                                            setCallbackDateValue(toLocalDateTimeInput(pick.compute()));
                                            setCallbackQuickLabel(pick.label);
                                        }}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-[12px] font-[500] border transition-all active:scale-[0.97]",
                                            isActive
                                                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                                                : "bg-white text-amber-700 border-amber-200 hover:bg-amber-100 hover:border-amber-300"
                                        )}
                                    >
                                        {pick.label}
                                    </button>
                                );
                            })}
                        </div>
                        <DateTimePicker
                            label=""
                            value={callbackDateValue}
                            onChange={(v) => { setCallbackDateValue(v); setCallbackQuickLabel(null); }}
                            placeholder="Choisir date et heure du rappel…"
                            min={new Date().toISOString().slice(0, 16)}
                            triggerClassName="border-amber-200 focus:ring-amber-400/40 focus:border-amber-400"
                        />
                    </div>
                </div>
            )}

            {/* Meeting category (Exploratoire / Besoin) — only for MEETING_BOOKED */}
            {selectedResult === "MEETING_BOOKED" && (
                <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/60 to-blue-50/40 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-indigo-100">
                        <h3 className="text-sm font-bold text-slate-900">Catégorie du RDV</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Optionnel — sinon détecté automatiquement depuis la note</p>
                    </div>
                    <div className="px-5 py-4 flex gap-3">
                        {([["EXPLORATOIRE", "Exploratoire", "Prise de contact / découverte"], ["BESOIN", "Besoin", "Projet concret / budget identifié"]] as const).map(([value, label, desc]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setMeetingCat(prev => prev === value ? "" : value)}
                                className={cn(
                                    "flex-1 rounded-xl border-2 p-3 text-left transition-all duration-150",
                                    meetingCat === value
                                        ? value === "BESOIN"
                                            ? "border-emerald-400 bg-emerald-50 shadow-sm"
                                            : "border-blue-400 bg-blue-50 shadow-sm"
                                        : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                                )}
                            >
                                <span className={cn(
                                    "text-sm font-semibold",
                                    meetingCat === value
                                        ? value === "BESOIN" ? "text-emerald-700" : "text-blue-700"
                                        : "text-slate-700"
                                )}>
                                    {label}
                                </span>
                                <span className="block text-xs text-slate-500 mt-0.5">{desc}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Sticky Submit Bar */}
            <div className="sticky bottom-0 z-20 -mx-4 px-4 pb-4 pt-3 bg-gradient-to-t from-[#f5f5f5] via-[#f5f5f5]/95 to-transparent backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-[#e5e5e5] shadow-lg shadow-slate-200/60 px-4 py-3">
                    {/* Skip button + session timer */}
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                                if (!currentAction?.campaignId) return;
                                setIsSubmitting(true);
                                try {
                                    const res = await fetch("/api/actions", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            contactId: currentAction.contact?.id,
                                            companyId: !currentAction.contact && currentAction.company ? currentAction.company.id : undefined,
                                            campaignId: currentAction.campaignId,
                                            channel: currentAction.channel,
                                            result: "NO_RESPONSE",
                                            note: "Passé (skip)",
                                        }),
                                    });
                                    const json = await res.json();
                                    if (!json.success) { showError(json.error || "Erreur lors du passage"); return; }
                                    await loadNextAction();
                                } catch { showError("Erreur de connexion"); } finally { setIsSubmitting(false); }
                            }}
                            disabled={isSubmitting}
                            className="gap-1.5 text-slate-400 hover:text-slate-600 hover:bg-[#f5f5f5] border border-[#e5e5e5] h-9 px-3 text-[13px]"
                        >
                            <SkipForward className="w-3.5 h-3.5" />
                            Passer
                        </Button>
                        {elapsedTime > 0 && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#f5f5f5] border border-[#e5e5e5]">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span className="text-[12px] font-[500] text-slate-500 tabular-nums">{formatTime(elapsedTime)}</span>
                            </div>
                        )}
                        {/* Keyboard shortcut hints */}
                        <div className="hidden xl:flex items-center gap-3 pl-3 border-l border-[#e5e5e5] text-[11px] text-slate-400">
                            <span className="flex items-center gap-1"><span className="cpds-kbd">1-9</span> statut</span>
                            <span className="flex items-center gap-1"><span className="cpds-kbd">⏎</span> valider</span>
                            <span className="flex items-center gap-1"><span className="cpds-kbd">Ctrl+⏎</span> depuis la note</span>
                            <span className="flex items-center gap-1"><span className="cpds-kbd">Échap</span> effacer</span>
                        </div>
                    </div>

                    {/* Right CTA group */}
                    <div className="flex items-center gap-2">
                        {selectedResult && (
                            <div className={cn(
                                "hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-[500] border",
                                (() => {
                                    const sem = RESULT_SEMANTIC[selectedResult] ?? DEFAULT_SEMANTIC;
                                    return sem.selectedCls + " " + sem.activeBorder + " border-l-2";
                                })()
                            )}>
                                {RESULT_ICON_MAP[selectedResult]}
                                <span className="text-[#1a1a1a]">{resultOptions.find(o => o.value === selectedResult)?.label}</span>
                            </div>
                        )}
                        {selectedResult === "ENVOIE_MAIL" && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={openEmailModalForCard}
                                disabled={isSubmitting}
                                className="gap-1.5 border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 h-9 px-3 text-[13px]"
                            >
                                <Send className="w-3.5 h-3.5" />
                                Envoyer un email
                            </Button>
                        )}
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSubmit}
                            disabled={!selectedResult || isSubmitting || (getRequiresNote(selectedResult) && !note.trim())}
                            isLoading={isSubmitting}
                            className="gap-2 px-6 h-9 text-[14px] font-[500] shadow-md shadow-violet-500/20 bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 border-0"
                        >
                            {isSubmitting ? "Enregistrement…" : selectedResult === "ENVOIE_MAIL" ? "Enregistrer" : "Valider & Suivant"}
                            {!isSubmitting && <ChevronRight className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Quick Email Modal (card view) */}
            <QuickEmailModal
                isOpen={showQuickEmailModal}
                onClose={() => {
                    setShowQuickEmailModal(false);
                    setPendingEmailAction(null);
                    setEmailModalContact(null);
                    setEmailModalCompany(null);
                    setEmailModalMissionId(null);
                    setEmailModalMissionName(null);
                    setEmailModalPreferredMailboxId(null);
                }}
                onSent={handleEmailSent}
                contact={emailModalContact}
                company={emailModalCompany}
                missionId={emailModalMissionId}
                missionName={emailModalMissionName}
                preferredMailboxId={emailModalPreferredMailboxId ?? undefined}
            />

            {/* Stats modal (card view) */}
            <Modal
                isOpen={showStatsModal}
                onClose={() => setShowStatsModal(false)}
                title="Statistiques"
                description={selectedMissionId ? (missions.find((m) => m.id === selectedMissionId)?.name ?? "") + (selectedListId ? ` · ${filteredLists.find((l) => l.id === selectedListId)?.name ?? ""}` : "") : "Sélectionnez une mission"}
                size="xl"
            >
                <ActionStatsModalBody
                    items={statsQueueItems}
                    loading={statsLoading}
                    statusLabels={statusLabels}
                    onRowClick={(row) => {
                        openDrawerForRow(row);
                        setShowStatsModal(false);
                    }}
                    priorityLabels={PRIORITY_LABELS}
                    resultIconMap={RESULT_ICON_MAP}
                    queueRowKey={queueRowKey}
                />
            </Modal>

            {/* Unified Action Drawer (card view: when opened from Stats modal) */}
            {unifiedDrawerOpen && unifiedDrawerCompanyId && (
                <UnifiedActionDrawer
                    isOpen={unifiedDrawerOpen}
                    onClose={closeUnifiedDrawer}
                    contactId={unifiedDrawerContactId}
                    companyId={unifiedDrawerCompanyId}
                    missionId={unifiedDrawerMissionId}
                    missionName={unifiedDrawerMissionName}
                    clientBookingUrl={unifiedDrawerClientBookingUrl || undefined}
                    clientInterlocuteurs={unifiedDrawerInterlocuteurs}
                    onBookingDialogOpenChange={setUnifiedBookingDialogOpen}
                    onAlloDialogOpenChange={setUnifiedAlloDialogOpen}
                    onContactSelect={(newContactId) => {
                        setUnifiedDrawerContactId(newContactId);
                    }}
                    onActionRecorded={() => {
                        const rowKey = unifiedDrawerContactId ?? unifiedDrawerCompanyId ?? "";
                        if (rowKey) setActionsCompleted((c) => c + 1);
                        loadNextAction();
                    }}
                    onValidateAndNext={() => {
                        closeUnifiedDrawer();
                        loadNextAction();
                    }}
                />
            )}

            {/* Booking Drawer */}
            {currentAction?.contact && (currentAction.clientBookingUrl || (currentAction.clientInterlocuteurs?.some(i => (i.bookingLinks?.length ?? 0) > 0))) && (
                <BookingDrawer
                    isOpen={showBookingDrawer}
                    onClose={() => setShowBookingDrawer(false)}
                    bookingUrl={currentAction.clientBookingUrl || ""}
                    contactId={currentAction.contact.id}
                    contactName={`${currentAction.contact.firstName || ""} ${currentAction.contact.lastName || ""}`.trim() || "Contact"}
                    contactInfo={{
                        firstName: currentAction.contact.firstName,
                        lastName: currentAction.contact.lastName,
                        email: currentAction.contact.email,
                        phone: currentAction.contact.phone,
                        title: currentAction.contact.title,
                        companyName: currentAction.company?.name,
                    }}
                    rdvDate={rdvDate ? new Date(rdvDate).toISOString() : undefined}
                    meetingCategory={meetingCat || undefined}
                    interlocuteurs={currentAction.clientInterlocuteurs}
                    onBookingSuccess={() => {
                        setShowBookingDrawer(false);
                        setRdvDate("");
                        loadNextAction();
                    }}
                />
            )}

            {/* Contact / Company edit drawers (card view: edit contact info, company info, add phone) */}
            <ContactDrawer
                isOpen={!!drawerContactId}
                onClose={closeContactDrawer}
                contact={drawerContact}
                onUpdate={() => {
                    refreshQueue();
                }}
                isManager={true}
                listId={selectedListId ?? undefined}
                companies={[]}
            />
            <CompanyDrawer
                isOpen={!!drawerCompanyId}
                onClose={closeCompanyDrawer}
                company={drawerCompany}
                onUpdate={() => {
                    refreshQueue();
                }}
                onContactClick={handleContactFromCompany}
                isManager={true}
                listId={selectedListId ?? undefined}
            />
        </div>
    );
}
