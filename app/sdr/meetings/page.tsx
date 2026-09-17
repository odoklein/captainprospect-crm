"use client";

import { useState, useEffect, useMemo } from "react";
import { Button, Select, Drawer, Modal, ConfirmModal, ContextMenu, useContextMenu, useToast, DateTimePicker } from "@/components/ui";
import { getPresetRange, toISO } from "@/components/dashboard/DateRangeFilter";
import {
    Calendar,
    User,
    Building2,
    Video,
    Loader2,
    Mail,
    Phone,
    Linkedin,
    ArrowRight,
    Save,
    RotateCcw,
    Eye,
    CalendarClock,
    XCircle,
    Trash2,
    Download,
    Circle,
    MapPin,
    Search,
    Upload,
    FileText,
    MessageSquare,
    History,
    Check,
    X,
} from "lucide-react";
import {
    MEETING_CANCELLATION_REASONS,
    getMeetingCancellationLabel,
} from "@/lib/constants/meetingCancellationReasons";
import { cn } from "@/lib/utils";
import { SdrImportRdvModal } from "./_components/ImportRdvModal";
import "../../manager/rdv/_components/rdv-shell.css";

// ============================================
// TYPES
// ============================================

type MeetingResult = "MEETING_BOOKED" | "MEETING_CANCELLED";

interface MeetingFeedbackData {
    id: string;
    outcome: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "NO_SHOW";
    recontactRequested: "YES" | "NO" | "MAYBE";
    clientNote?: string | null;
    createdAt: string;
}

interface Meeting {
    id: string;
    createdAt: string;
    result?: MeetingResult;
    note?: string;
    callbackDate?: string | null;
    cancellationReason?: string;
    meetingType?: "VISIO" | "PHYSIQUE" | "TELEPHONIQUE" | null;
    meetingCategory?: "EXPLORATOIRE" | "BESOIN" | null;
    meetingAddress?: string | null;
    meetingJoinUrl?: string | null;
    meetingPhone?: string | null;
    confirmationStatus?: "PENDING" | "CONFIRMED" | "CANCELLED";
    meetingFeedback?: MeetingFeedbackData | null;
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        title: string | null;
        email: string | null;
        phone?: string | null;
        linkedin?: string | null;
        company: {
            id: string;
            name: string;
            country?: string | null;
            industry?: string | null;
            website?: string | null;
            size?: string | null;
            list?: {
                id: string;
                name: string;
            } | null;
        };
    };
    mission: {
        id: string;
        name: string;
        client: {
            id: string;
            name: string;
        };
    } | null;
    list?: {
        id: string;
        name: string;
    } | null;
}

interface Mission {
    id: string;
    name: string;
    client: {
        name: string;
    };
}

interface List {
    id: string;
    name: string;
    mission: {
        id: string;
        name: string;
    };
}

type RdvStatus = "upcoming" | "past" | "rescheduled" | "cancelled";
type DetailDrawerTab = "detail" | "note" | "history";

/**
 * An absence still to deal with: flagged NO_SHOW and not yet closed. Once the
 * RDV has been replaced it is cancelled with the "replaced" reason, and it
 * drops off the absence boards instead of sitting there for good.
 */
function isOpenNoShow(m: Meeting): boolean {
    return m.meetingFeedback?.outcome === "NO_SHOW" && m.result !== "MEETING_CANCELLED";
}

function getRdvStatus(m: Meeting): RdvStatus {
    if (m.result === "MEETING_CANCELLED") return "cancelled";
    if (!m.callbackDate) return "upcoming";
    return new Date(m.callbackDate) > new Date() ? "upcoming" : "past";
}

function getMeetingDisplayDate(m: Meeting): Date | null {
    return m.callbackDate ? new Date(m.callbackDate) : null;
}

function getInitials(m: Meeting): string {
    const f = m.contact.firstName?.[0] ?? "";
    const l = m.contact.lastName?.[0] ?? "";
    return (f + l).toUpperCase() || "?";
}

const AVATAR_COLORS = ["#6366f1", "#8b5cf6", "#059669", "#d97706", "#0ea5e9", "#ec4899", "#64748b"];

function getAvatarColor(m: Meeting): string {
    let h = 0;
    for (let i = 0; i < m.id.length; i++) h = ((h << 5) - h) + m.id.charCodeAt(i);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ============================================
// SDR MEETINGS PAGE
// ============================================

export default function SDRMeetingsPage() {
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<RdvStatus | "all" | "confirmed" | "absent">("all");
    const [query, setQuery] = useState("");

    // Fetch meetings
    useEffect(() => {
        const fetchMeetings = async () => {
            setIsLoading(true);
            try {
                const { start, end } = getPresetRange("last12months");
                const params = new URLSearchParams({
                    startDate: toISO(start),
                    endDate: toISO(end),
                });
                const res = await fetch(`/api/sdr/meetings?${params.toString()}`);
                const json = await res.json();
                if (json.success) {
                    setMeetings(json.data);
                }
            } catch (err) {
                console.error("Failed to fetch meetings:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchMeetings();
    }, []);

    const stats = useMemo(() => {
        const upcoming = meetings.filter((m) => getRdvStatus(m) === "upcoming").length;
        const past = meetings.filter((m) => getRdvStatus(m) === "past").length;
        const rescheduled = meetings.filter((m) => getRdvStatus(m) === "rescheduled").length;
        const cancelled = meetings.filter((m) => getRdvStatus(m) === "cancelled").length;
        const confirmed = meetings.filter((m) => m.confirmationStatus === "CONFIRMED" && m.result !== "MEETING_CANCELLED").length;
        const absent = meetings.filter(isOpenNoShow).length;
        return { upcoming, past, rescheduled, cancelled, confirmed, absent, all: meetings.length };
    }, [meetings]);

    const absentMeetings = useMemo(() =>
        meetings
            .filter(isOpenNoShow)
            .sort((a, b) => {
                const da = a.meetingFeedback?.createdAt ? new Date(a.meetingFeedback.createdAt).getTime() : 0;
                const db = b.meetingFeedback?.createdAt ? new Date(b.meetingFeedback.createdAt).getTime() : 0;
                return db - da;
            }),
        [meetings],
    );

    const filteredMeetings = useMemo(() => {
        let statusScoped: Meeting[];
        if (statusFilter === "all") {
            statusScoped = meetings;
        } else if (statusFilter === "confirmed") {
            statusScoped = meetings.filter((m) => m.confirmationStatus === "CONFIRMED" && m.result !== "MEETING_CANCELLED");
        } else if (statusFilter === "absent") {
            statusScoped = meetings.filter(isOpenNoShow);
        } else {
            statusScoped = meetings.filter((m) => getRdvStatus(m) === statusFilter);
        }

        const queryScoped = query.trim()
            ? statusScoped.filter((m) => {
                const haystack = [
                    m.contact.firstName,
                    m.contact.lastName,
                    m.contact.company.name,
                    m.contact.company.industry,
                    m.mission?.name,
                    m.list?.name,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return haystack.includes(query.trim().toLowerCase());
            })
            : statusScoped;

        return [...queryScoped].sort((a, b) => {
            if (statusFilter === "absent") {
                const fa = a.meetingFeedback?.createdAt ? new Date(a.meetingFeedback.createdAt).getTime() : 0;
                const fb = b.meetingFeedback?.createdAt ? new Date(b.meetingFeedback.createdAt).getTime() : 0;
                return fb - fa;
            }
            const da = a.callbackDate ? new Date(a.callbackDate).getTime() : 0;
            const db = b.callbackDate ? new Date(b.callbackDate).getTime() : 0;
            return statusFilter === "upcoming" ? da - db : db - da;
        });
    }, [meetings, statusFilter, query]);
    const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
    const [editNote, setEditNote] = useState("");
    const [editResult, setEditResult] = useState<MeetingResult>("MEETING_BOOKED");
    const [editCallbackDate, setEditCallbackDate] = useState("");
    const [editMeetingType, setEditMeetingType] = useState<"" | "VISIO" | "PHYSIQUE" | "TELEPHONIQUE">("");
    const [editMeetingCategory, setEditMeetingCategory] = useState<"" | "EXPLORATOIRE" | "BESOIN">("");
    const [editMeetingAddress, setEditMeetingAddress] = useState("");
    const [editMeetingJoinUrl, setEditMeetingJoinUrl] = useState("");
    const [editMeetingPhone, setEditMeetingPhone] = useState("");
    const [saving, setSaving] = useState(false);
    const [savingError, setSavingError] = useState<string | null>(null);
    const [remettreSubmitting, setRemettreSubmitting] = useState(false);
    const [detailDrawerTab, setDetailDrawerTab] = useState<DetailDrawerTab>("detail");

    // Cancel-with-reason modal
    const [cancelModalMeeting, setCancelModalMeeting] = useState<Meeting | null>(null);
    const [cancelReason, setCancelReason] = useState<string>("");
    const [cancelNote, setCancelNote] = useState("");
    const [cancelSubmitting, setCancelSubmitting] = useState(false);

    // Reschedule modal
    const [rescheduleMeeting, setRescheduleMeeting] = useState<Meeting | null>(null);
    const [rescheduleDateValue, setRescheduleDateValue] = useState("");
    const [rescheduleNote, setRescheduleNote] = useState("");
    const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);

    // Delete confirm
    const [deleteConfirmMeeting, setDeleteConfirmMeeting] = useState<Meeting | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Context menu (right-click)
    const { position: contextMenuPosition, contextData: contextMenuMeeting, handleContextMenu, close: closeContextMenu } = useContextMenu();
    const { success: showSuccess, error: showError } = useToast();

    // Import modal
    const [importModalOpen, setImportModalOpen] = useState(false);

    function formatScheduledDate(meeting: Meeting): string {
        if (!meeting.callbackDate) return "Date à confirmer";
        return new Date(meeting.callbackDate).toLocaleDateString("fr-FR", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    // Sync edit state when modal opens
    useEffect(() => {
        if (selectedMeeting) {
            setEditNote(selectedMeeting.note ?? "");
            setEditResult((selectedMeeting.result as MeetingResult) || "MEETING_BOOKED");
            setEditCallbackDate(selectedMeeting.callbackDate ? new Date(selectedMeeting.callbackDate).toISOString().slice(0, 16) : "");
            setEditMeetingType(selectedMeeting.meetingType ?? "");
            setEditMeetingCategory(selectedMeeting.meetingCategory ?? "");
            setEditMeetingAddress(selectedMeeting.meetingAddress ?? "");
            setEditMeetingJoinUrl(selectedMeeting.meetingJoinUrl ?? "");
            setEditMeetingPhone(selectedMeeting.meetingPhone ?? "");
            setSavingError(null);
            setDetailDrawerTab("detail");
        }
    }, [selectedMeeting]);

    const handleSaveMeeting = async () => {
        if (!selectedMeeting) return;
        setSaving(true);
        setSavingError(null);
        try {
            const res = await fetch(`/api/actions/${selectedMeeting.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    result: editResult,
                    note: editNote || undefined,
                    callbackDate: editCallbackDate ? new Date(editCallbackDate).toISOString() : null,
                    meetingType: editMeetingType || null,
                    meetingCategory: editMeetingCategory || null,
                    meetingAddress: editMeetingAddress.trim() ? editMeetingAddress.trim() : null,
                    meetingJoinUrl: editMeetingJoinUrl.trim() ? editMeetingJoinUrl.trim() : null,
                    meetingPhone: editMeetingPhone.trim() ? editMeetingPhone.trim() : null,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                setSavingError(json.error || "Erreur lors de l'enregistrement");
                return;
            }
            setMeetings((prev) =>
                prev.map((m) =>
                    m.id === selectedMeeting.id
                        ? {
                            ...m,
                            result: editResult,
                            note: editNote || undefined,
                            callbackDate: editCallbackDate ? new Date(editCallbackDate).toISOString() : null,
                            meetingType: editMeetingType || null,
                            meetingCategory: editMeetingCategory || null,
                            meetingAddress: editMeetingAddress.trim() || null,
                            meetingJoinUrl: editMeetingJoinUrl.trim() || null,
                            meetingPhone: editMeetingPhone.trim() || null,
                        }
                        : m
                )
            );
            setSelectedMeeting((prev) =>
                prev && prev.id === selectedMeeting.id
                    ? {
                        ...prev,
                        result: editResult,
                        note: editNote || undefined,
                        callbackDate: editCallbackDate ? new Date(editCallbackDate).toISOString() : null,
                        meetingType: editMeetingType || null,
                        meetingCategory: editMeetingCategory || null,
                        meetingAddress: editMeetingAddress.trim() || null,
                        meetingJoinUrl: editMeetingJoinUrl.trim() || null,
                        meetingPhone: editMeetingPhone.trim() || null,
                    }
                    : prev
            );
        } catch (err) {
            setSavingError("Erreur réseau");
        } finally {
            setSaving(false);
        }
    };

    const openCancelModal = (meeting: Meeting) => {
        setCancelModalMeeting(meeting);
        setCancelReason("");
        setCancelNote("");
    };

    const handleConfirmCancel = async () => {
        if (!cancelModalMeeting || !cancelReason.trim()) return;
        setCancelSubmitting(true);
        setSavingError(null);
        try {
            const res = await fetch(`/api/actions/${cancelModalMeeting.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    result: "MEETING_CANCELLED",
                    cancellationReason: cancelReason,
                    note: cancelNote.trim() || undefined,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                setSavingError(json.error || "Erreur");
                return;
            }
            const updated = {
                ...cancelModalMeeting,
                result: "MEETING_CANCELLED" as const,
                note: cancelNote.trim() || cancelModalMeeting.note,
                cancellationReason: cancelReason,
            };
            setMeetings((prev) =>
                prev.map((m) => (m.id === cancelModalMeeting.id ? updated : m))
            );
            if (selectedMeeting?.id === cancelModalMeeting.id) {
                setSelectedMeeting(updated);
                setEditResult("MEETING_CANCELLED");
                setEditNote(cancelNote.trim() || (updated.note ?? ""));
            }
            setCancelModalMeeting(null);
            showSuccess("RDV annulé");
        } catch (err) {
            setSavingError("Erreur réseau");
        } finally {
            setCancelSubmitting(false);
        }
    };

    const openRescheduleModal = (meeting: Meeting) => {
        setRescheduleMeeting(meeting);
        const base = meeting.callbackDate ? new Date(meeting.callbackDate) : new Date();
        setRescheduleDateValue(base.toISOString().slice(0, 16));
        setRescheduleNote("");
    };

    const handleConfirmReschedule = async () => {
        if (!rescheduleMeeting || !rescheduleDateValue) return;
        setRescheduleSubmitting(true);
        setSavingError(null);
        try {
            const res = await fetch(`/api/actions/${rescheduleMeeting.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    callbackDate: new Date(rescheduleDateValue).toISOString(),
                    note: rescheduleNote.trim() ? rescheduleNote.trim() : rescheduleMeeting.note,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                setSavingError(json.error || "Erreur");
                return;
            }
            const updated = {
                ...rescheduleMeeting,
                callbackDate: new Date(rescheduleDateValue).toISOString(),
                note: rescheduleNote.trim() || rescheduleMeeting.note,
            };
            setMeetings((prev) =>
                prev.map((m) => (m.id === rescheduleMeeting.id ? updated : m))
            );
            if (selectedMeeting?.id === rescheduleMeeting.id) setSelectedMeeting(updated);
            setRescheduleMeeting(null);
            showSuccess("RDV reprogrammé");
        } catch (err) {
            setSavingError("Erreur réseau");
        } finally {
            setRescheduleSubmitting(false);
        }
    };

    const handleDeleteMeeting = async () => {
        if (!deleteConfirmMeeting) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/actions/${deleteConfirmMeeting.id}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                showError(json?.error || "Erreur lors de la suppression");
                return;
            }
            setMeetings((prev) => prev.filter((m) => m.id !== deleteConfirmMeeting.id));
            if (selectedMeeting?.id === deleteConfirmMeeting.id) setSelectedMeeting(null);
            setDeleteConfirmMeeting(null);
            closeContextMenu();
            showSuccess("Rendez-vous supprimé");
        } catch (err) {
            showError("Erreur de connexion");
        } finally {
            setDeleting(false);
        }
    };

    const getContextMenuItems = (meeting: Meeting) => [
        {
            label: "Ouvrir",
            icon: <Eye className="w-4 h-4" />,
            onClick: () => setSelectedMeeting(meeting),
        },
        ...(meeting.result === "MEETING_BOOKED"
            ? [
                {
                    label: "Reprogrammer le RDV",
                    icon: <CalendarClock className="w-4 h-4" />,
                    onClick: () => openRescheduleModal(meeting),
                },
                {
                    label: "Annuler le RDV",
                    icon: <XCircle className="w-4 h-4" />,
                    onClick: () => openCancelModal(meeting),
                },
            ]
            : []),
        {
            label: "Supprimer",
            icon: <Trash2 className="w-4 h-4" />,
            onClick: () => setDeleteConfirmMeeting(meeting),
            variant: "danger" as const,
            divider: true,
        },
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-4" />
                    <p className="text-slate-500">Chargement des rendez-vous...</p>
                </div>
            </div>
        );
    }

    const statusBadge = (status: RdvStatus) => {
        const config = {
            upcoming: { label: "À venir", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <Circle className="w-2.5 h-2.5 fill-emerald-600 text-emerald-600 shrink-0" /> },
            past: { label: "Passé", cls: "bg-slate-100 text-slate-600 border-slate-200", icon: <Circle className="w-2.5 h-2.5 fill-slate-400 text-slate-400 shrink-0" /> },
            rescheduled: { label: "Reporté", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Circle className="w-2.5 h-2.5 fill-amber-500 text-amber-500 shrink-0" /> },
            cancelled: { label: "Annulé", cls: "bg-red-50 text-red-700 border-red-200", icon: <Circle className="w-2.5 h-2.5 fill-red-500 text-red-500 shrink-0" /> },
        };
        const c = config[status] ?? config.past;
        return (
            <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border", c.cls)}>
                {c.icon}
                {c.label}
            </span>
        );
    };

    const formatCardTime = (d: Date) =>
        d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    const formatCardMonth = (d: Date) =>
        d.toLocaleDateString("fr-FR", { month: "short" }).toUpperCase().replace(".", "");

    return (
        <div className="min-h-full bg-[#F2F3F7] px-4 py-7 pb-20 sm:px-6 animate-fade-in">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h1 className="text-[2rem] leading-none tracking-tight text-slate-950 font-serif italic">
                            Mes rendez-vous
                        </h1>
                        <p className="mt-2 text-sm text-slate-500">
                            Consultez, qualifiez et gérez vos rendez-vous dans une vue proche du portail client.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative min-w-[280px]">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Contact, entreprise, mission..."
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                            />
                        </div>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-10 gap-2 rounded-xl border-slate-200 bg-white px-4 shadow-sm shrink-0"
                            onClick={() => setImportModalOpen(true)}
                        >
                            <Upload className="w-4 h-4" />
                            Importer
                        </Button>
                        <Button variant="outline" size="sm" className="h-10 gap-2 rounded-xl border-slate-200 bg-white px-4 shadow-sm shrink-0">
                            <Download className="w-4 h-4" />
                            Exporter
                        </Button>
                    </div>
                </header>

                {/* Absent RDVs alert banner */}
                {absentMeetings.length > 0 && (
                    <div className="rounded-2xl border-2 border-red-200 bg-gradient-to-r from-red-50 via-red-50/80 to-orange-50/60 p-5 shadow-sm animate-fade-in">
                        <div className="flex items-start gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                                <XCircle className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                    <h3 className="text-sm font-bold text-red-800">
                                        {absentMeetings.length} RDV marqué{absentMeetings.length > 1 ? "s" : ""} absent{absentMeetings.length > 1 ? "s" : ""}
                                    </h3>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 border border-red-200">
                                        Action requise
                                    </span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {absentMeetings.slice(0, 5).map((m) => {
                                        const contactName = [m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") || "Contact";
                                        const wantsRecontact = m.meetingFeedback?.recontactRequested === "YES";
                                        const maybeRecontact = m.meetingFeedback?.recontactRequested === "MAYBE";
                                        return (
                                            <div
                                                key={m.id}
                                                className="flex items-center gap-3 rounded-xl border border-red-100 bg-white/80 px-3 py-2.5 cursor-pointer hover:bg-white transition"
                                                onClick={() => setSelectedMeeting(m)}
                                            >
                                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">
                                                    {m.contact.firstName?.[0] ?? "?"}{m.contact.lastName?.[0] ?? ""}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-sm font-semibold text-slate-900">{contactName}</span>
                                                    <span className="text-xs text-slate-500 ml-2">{m.contact.company.name}</span>
                                                </div>
                                                {wantsRecontact && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200 shrink-0">
                                                        <RotateCcw className="w-3 h-3" /> A recontacter
                                                    </span>
                                                )}
                                                {maybeRecontact && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200 shrink-0">
                                                        Peut-être
                                                    </span>
                                                )}
                                                {m.meetingFeedback?.clientNote && (
                                                    <span className="text-xs text-slate-500 truncate max-w-[200px]" title={m.meetingFeedback.clientNote}>
                                                        &ldquo;{m.meetingFeedback.clientNote}&rdquo;
                                                    </span>
                                                )}
                                                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            </div>
                                        );
                                    })}
                                    {absentMeetings.length > 5 && (
                                        <p className="text-xs text-red-600 font-medium mt-1">
                                            + {absentMeetings.length - 5} autre{absentMeetings.length - 5 > 1 ? "s" : ""} RDV absent{absentMeetings.length - 5 > 1 ? "s" : ""}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                    {[
                        { key: "upcoming", label: "À venir", val: stats.upcoming, stripe: "bg-emerald-500", activeBg: "bg-emerald-50/70", activeBorder: "border-emerald-200" },
                        { key: "past", label: "Passés", val: stats.past, stripe: "bg-slate-300", activeBg: "bg-slate-100/80", activeBorder: "border-slate-200" },
                        { key: "confirmed" as const, label: "Confirmés", val: stats.confirmed, stripe: "bg-blue-500", activeBg: "bg-blue-50/70", activeBorder: "border-blue-200" },
                        { key: "absent" as const, label: "Absents", val: stats.absent, stripe: "bg-red-600", activeBg: "bg-red-50/80", activeBorder: "border-red-200" },
                        { key: "rescheduled", label: "Reportés", val: stats.rescheduled, stripe: "bg-amber-500", activeBg: "bg-amber-50/80", activeBorder: "border-amber-200" },
                        { key: "cancelled", label: "Annulés", val: stats.cancelled, stripe: "bg-red-500", activeBg: "bg-red-50/80", activeBorder: "border-red-200" },
                    ].map((s) => {
                        const isActive = statusFilter === s.key;
                        return (
                            <button
                                key={s.key}
                                type="button"
                                onClick={() => setStatusFilter(s.key as RdvStatus | "confirmed" | "absent")}
                                className={cn(
                                    "flex items-center gap-3 rounded-2xl border bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                                    isActive ? `${s.activeBg} ${s.activeBorder}` : "border-slate-200"
                                )}
                            >
                                <div className={cn("h-10 w-1 rounded-full", s.stripe)} />
                                <div>
                                    <div className="text-2xl font-extrabold tracking-tight text-slate-900">{s.val}</div>
                                    <div className="text-xs font-medium text-slate-500">{s.label}</div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-black/[0.04] p-1">
                    {([
                        { key: "all", label: "Tous", count: stats.all },
                        { key: "upcoming", label: "À venir", count: stats.upcoming },
                        { key: "confirmed", label: "Confirmés", count: stats.confirmed },
                        { key: "absent", label: "Absents", count: stats.absent },
                        { key: "past", label: "Passés", count: stats.past },
                        { key: "rescheduled", label: "Reportés", count: stats.rescheduled },
                        { key: "cancelled", label: "Annulés", count: stats.cancelled },
                    ] as const).map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => setStatusFilter(f.key)}
                            className={cn(
                                "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition",
                                statusFilter === f.key
                                    ? "bg-white text-slate-900 shadow-sm font-semibold"
                                    : "text-slate-500 hover:bg-white/70 hover:text-slate-700",
                                f.key === "absent" && f.count > 0 && statusFilter !== f.key && "text-red-600"
                            )}
                        >
                            {f.label}
                            <span className={cn(
                                "rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                                statusFilter === f.key ? "bg-indigo-50 text-indigo-700" : f.key === "absent" && f.count > 0 ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-600"
                            )}>
                                {f.count}
                            </span>
                        </button>
                    ))}
                </div>

                {filteredMeetings.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
                        <Calendar className="mx-auto mb-3 h-12 w-12 text-slate-300" strokeWidth={1.5} />
                        <h3 className="text-lg font-semibold text-slate-800">
                            {query ? "Aucun résultat" : "Aucun rendez-vous"}
                        </h3>
                        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                            {query
                                ? "Essayez une autre recherche."
                                : statusFilter === "all"
                                    ? "Vos rendez-vous validés apparaîtront ici."
                                    : statusFilter === "upcoming"
                                        ? "Aucun rendez-vous à venir."
                                        : statusFilter === "past"
                                            ? "Aucun rendez-vous passé."
                                            : statusFilter === "confirmed"
                                                ? "Aucun rendez-vous confirmé."
                                                : statusFilter === "absent"
                                                    ? "Aucun rendez-vous marqué absent."
                                                    : statusFilter === "rescheduled"
                                                        ? "Aucun rendez-vous reporté."
                                                        : "Aucun rendez-vous annulé."}
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                    {filteredMeetings.map((meeting) => {
                        const d = getMeetingDisplayDate(meeting);
                        const status = getRdvStatus(meeting);
                        return (
                            <div
                                key={meeting.id}
                                className={cn(
                                    "group overflow-hidden rounded-[22px] border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer",
                                    meeting.meetingFeedback?.outcome === "NO_SHOW"
                                        ? "border-red-300 bg-red-50/30 ring-1 ring-red-100 hover:border-red-400"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                )}
                                onClick={() => setSelectedMeeting(meeting)}
                                onContextMenu={(e) => handleContextMenu(e, meeting)}
                            >
                                <div className="flex flex-col sm:flex-row">
                                    <div className="flex shrink-0 flex-row items-center justify-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:w-[110px] sm:flex-col sm:border-b-0 sm:border-r">
                                        {d ? (
                                            <>
                                                <div className="text-center">
                                                    <div className="text-[28px] font-extrabold leading-none tracking-tight text-slate-900">{d.getDate()}</div>
                                                    <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{formatCardMonth(d)}</div>
                                                </div>
                                                <div className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                                                    {formatCardTime(d)}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-center">
                                                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Date à</div>
                                                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">confirmer</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 p-4 sm:p-5 flex flex-col gap-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {statusBadge(status)}
                                            {meeting.confirmationStatus === "CONFIRMED" && meeting.result !== "MEETING_CANCELLED" && (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                                                    <Check className="w-2.5 h-2.5" />
                                                    Confirmé
                                                </span>
                                            )}
                                            {meeting.confirmationStatus === "PENDING" && meeting.result !== "MEETING_CANCELLED" && (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                                                    <Circle className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                                                    En attente
                                                </span>
                                            )}
                                            {meeting.meetingFeedback?.outcome === "NO_SHOW" && (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border bg-red-50 text-red-700 border-red-200 animate-pulse">
                                                    <XCircle className="w-2.5 h-2.5" />
                                                    Absent
                                                    {meeting.meetingFeedback.recontactRequested === "YES" && " — A recontacter"}
                                                </span>
                                            )}
                                            {meeting.meetingFeedback && meeting.meetingFeedback.outcome !== "NO_SHOW" && (
                                                <span className={cn(
                                                    "inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border",
                                                    meeting.meetingFeedback.outcome === "POSITIVE" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                    meeting.meetingFeedback.outcome === "NEUTRAL" ? "bg-slate-50 text-slate-700 border-slate-200" :
                                                    "bg-orange-50 text-orange-700 border-orange-200"
                                                )}>
                                                    <MessageSquare className="w-2.5 h-2.5" />
                                                    {meeting.meetingFeedback.outcome === "POSITIVE" ? "Positif" : meeting.meetingFeedback.outcome === "NEUTRAL" ? "Neutre" : "Négatif"}
                                                </span>
                                            )}
                                            {meeting.meetingType && (
                                                <span className="text-xs font-semibold text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200 flex items-center gap-1">
                                                    {meeting.meetingType === "VISIO" && "📹 Visio"}
                                                    {meeting.meetingType === "PHYSIQUE" && "📍 Physique"}
                                                    {meeting.meetingType === "TELEPHONIQUE" && "📞 Téléphonique"}
                                                </span>
                                            )}
                                            {meeting.mission && (
                                                <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">
                                                    {meeting.mission.name}
                                                </span>
                                            )}
                                            {meeting.list && (
                                                <span className="text-xs text-slate-500">{meeting.list.name}</span>
                                            )}
                                        </div>

                                        <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                                                    style={{ backgroundColor: getAvatarColor(meeting) }}
                                                >
                                                    {getInitials(meeting)}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900">{meeting.contact.firstName} {meeting.contact.lastName}</div>
                                                    <div className="text-xs text-slate-500">{meeting.contact.title ?? ""}</div>
                                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                                        {meeting.contact.email && (
                                                            <a href={`mailto:${meeting.contact.email}`} className="text-xs text-indigo-600 hover:underline bg-indigo-50 px-2 py-0.5 rounded inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                                <Mail className="w-3 h-3" />{meeting.contact.email}
                                                            </a>
                                                        )}
                                                        {meeting.contact.phone && (
                                                            <a href={`tel:${meeting.contact.phone}`} className="text-xs text-indigo-600 hover:underline bg-indigo-50 px-2 py-0.5 rounded inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                                <Phone className="w-3 h-3" />{meeting.contact.phone}
                                                            </a>
                                                        )}
                                                        {meeting.contact.linkedin && (
                                                            <a href={meeting.contact.linkedin} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline bg-indigo-50 px-2 py-0.5 rounded inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                                <Linkedin className="w-3 h-3" />LinkedIn
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="sm:border-l sm:border-slate-200 sm:pl-6 flex flex-col gap-0.5">
                                                <div className="font-semibold text-slate-900">{meeting.contact.company.name}</div>
                                                <div className="text-xs text-slate-500 flex flex-wrap gap-x-2 gap-y-0">
                                                    {meeting.contact.company.industry && <span>{meeting.contact.company.industry}</span>}
                                                    {meeting.contact.company.country && <span className="inline-flex items-center gap-1"><Circle className="w-1 h-1 fill-current shrink-0" />{meeting.contact.company.country}</span>}
                                                    {meeting.contact.company.size && <span className="inline-flex items-center gap-1"><Circle className="w-1 h-1 fill-current shrink-0" />{meeting.contact.company.size}</span>}
                                                    {meeting.contact.company.website && (
                                                        <a href={meeting.contact.company.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                                                            {meeting.contact.company.website.replace(/^https?:\/\//, "")}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Format action links on card */}
                                        <div className="flex flex-wrap gap-2">
                                            {meeting.meetingType === "VISIO" && meeting.meetingJoinUrl && (
                                                <a href={meeting.meetingJoinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100" onClick={(e) => e.stopPropagation()}>
                                                    <Video className="w-3.5 h-3.5" /> Rejoindre
                                                </a>
                                            )}
                                            {meeting.meetingType === "PHYSIQUE" && meeting.meetingAddress && (
                                                <a href={`https://maps.google.com/?q=${encodeURIComponent(meeting.meetingAddress)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100" onClick={(e) => e.stopPropagation()}>
                                                    <MapPin className="w-3.5 h-3.5" /> Itinéraire
                                                </a>
                                            )}
                                            {meeting.meetingType === "TELEPHONIQUE" && (meeting.meetingPhone || meeting.contact.phone) && (
                                                <a href={`tel:${meeting.meetingPhone || meeting.contact.phone}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100" onClick={(e) => e.stopPropagation()}>
                                                    <Phone className="w-3.5 h-3.5" /> Appeler
                                                </a>
                                            )}
                                        </div>

                                        {meeting.note && (
                                            <div className="text-sm text-slate-600 bg-slate-50 border-l-2 border-slate-300 pl-3 py-2 rounded-r italic">
                                                &ldquo;{meeting.note}&rdquo;
                                            </div>
                                        )}
                                    </div>

                                    <div className="sm:w-40 shrink-0 p-4 border-t sm:border-t-0 sm:border-l border-slate-100 flex flex-col justify-center gap-2 bg-slate-50/55">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full justify-center gap-1.5 text-xs rounded-xl border-slate-200 bg-white"
                                            onClick={(e) => { e.stopPropagation(); setSelectedMeeting(meeting); }}
                                        >
                                            <Eye className="w-3.5 h-3.5" />
                                            Voir le détail
                                        </Button>
                                        {meeting.result === "MEETING_BOOKED" && (
                                            <>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full justify-center gap-1.5 text-xs rounded-xl border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
                                                    onClick={(e) => { e.stopPropagation(); openRescheduleModal(meeting); }}
                                                >
                                                    <CalendarClock className="w-3.5 h-3.5" />
                                                    Reprogrammer
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full justify-center gap-1.5 text-xs rounded-xl text-amber-700 hover:bg-amber-50"
                                                    onClick={(e) => { e.stopPropagation(); openCancelModal(meeting); }}
                                                >
                                                    <XCircle className="w-3.5 h-3.5" />
                                                    Annuler
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    </div>
                )}
            </div>

            {/* Meeting Detail Drawer - aligned with /rdv panel UX */}
            {selectedMeeting && (
                <Drawer
                    isOpen={!!selectedMeeting}
                    onClose={() => setSelectedMeeting(null)}
                    title="Fiche du rendez-vous"
                    description={selectedMeeting ? formatScheduledDate(selectedMeeting) : undefined}
                    size="xl"
                    headerCentered
                    footer={
                        <div className="flex items-center justify-between gap-4 w-full">
                            <Button variant="ghost" onClick={() => setSelectedMeeting(null)}>
                                Annuler
                            </Button>
                            {savingError && (
                                <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg flex-1">{savingError}</p>
                            )}
                            <Button onClick={handleSaveMeeting} disabled={saving} className="gap-2 ml-auto">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Enregistrer
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-5">
                        {/* Header summary like /rdv */}
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                                        style={{ backgroundColor: getAvatarColor(selectedMeeting) }}
                                    >
                                        {getInitials(selectedMeeting)}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-slate-900">
                                            {selectedMeeting.contact.firstName} {selectedMeeting.contact.lastName}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {selectedMeeting.contact.title || "—"} · {selectedMeeting.contact.company.name}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        className="rdv-btn"
                                        style={{ fontSize: 12, padding: "6px 10px", background: "var(--greenLight)", color: "var(--green)", border: "1px solid rgba(5,150,105,0.2)" }}
                                        onClick={() => setEditResult("MEETING_BOOKED")}
                                    >
                                        <Check size={13} /> Confirmer
                                    </button>
                                    <button
                                        type="button"
                                        className="rdv-btn"
                                        style={{ fontSize: 12, padding: "6px 10px", background: "var(--redLight)", color: "var(--red)", border: "1px solid rgba(220,38,38,0.2)" }}
                                        onClick={() => openCancelModal(selectedMeeting)}
                                    >
                                        <X size={13} /> Annuler
                                    </button>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                {statusBadge(getRdvStatus(selectedMeeting))}
                                <span className="rdv-pill" style={{ background: "var(--surface2)", color: "var(--ink2)", padding: "4px 12px" }}>
                                    {editMeetingType || selectedMeeting.meetingType || "Type non défini"}
                                </span>
                                <span className="rdv-pill" style={{ background: "var(--surface2)", color: "var(--ink2)", padding: "4px 12px" }}>
                                    {editMeetingCategory || selectedMeeting.meetingCategory || "Catégorie non définie"}
                                </span>
                            </div>
                        </div>

                        {/* Tabs like /rdv */}
                        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)" }}>
                            {[
                                { key: "detail" as const, label: "Détail", Icon: FileText },
                                { key: "note" as const, label: "Note interne", Icon: MessageSquare },
                                { key: "history" as const, label: "Historique", Icon: History },
                            ].map(({ key, label, Icon }) => (
                                <button
                                    key={key}
                                    className={`rdv-tab ${detailDrawerTab === key ? "active" : ""}`}
                                    onClick={() => setDetailDrawerTab(key)}
                                >
                                    <Icon size={13} style={{ display: "inline", marginRight: 5, verticalAlign: -2 }} />
                                    {label}
                                </button>
                            ))}
                        </div>

                        {detailDrawerTab === "detail" && (
                            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
                        {/* Left column: Main content */}
                                <div className="space-y-6">
                            {/* Contact */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Contact</h3>
                                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                    <p className="text-lg font-semibold text-slate-900">
                                        {selectedMeeting.contact.firstName} {selectedMeeting.contact.lastName}
                                    </p>
                                    {selectedMeeting.contact.title && (
                                        <p className="text-slate-500 text-sm mb-4">
                                            <span className="font-semibold uppercase text-xs tracking-wide text-slate-400 mr-1">
                                                Fonction
                                            </span>
                                            <span className="text-slate-600 normal-case text-sm">
                                                {selectedMeeting.contact.title}
                                            </span>
                                        </p>
                                    )}
                                    <div className="space-y-2">
                                        {selectedMeeting.contact.email && (
                                            <a href={`mailto:${selectedMeeting.contact.email}`} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors group">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                                                    <Mail className="w-4 h-4 text-slate-500 group-hover:text-indigo-600" />
                                                </div>
                                                <span className="text-sm text-slate-700 group-hover:text-indigo-700">{selectedMeeting.contact.email}</span>
                                            </a>
                                        )}
                                        {selectedMeeting.contact.phone && (
                                            <a href={`tel:${selectedMeeting.contact.phone}`} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors group">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                                                    <Phone className="w-4 h-4 text-slate-500 group-hover:text-indigo-600" />
                                                </div>
                                                <span className="text-sm text-slate-700 group-hover:text-indigo-700">{selectedMeeting.contact.phone}</span>
                                            </a>
                                        )}
                                        {(selectedMeeting.contact.linkedin ? (
                                            <a href={selectedMeeting.contact.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors group">
                                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                                                    <Linkedin className="w-4 h-4 text-slate-500 group-hover:text-blue-600" />
                                                </div>
                                                <span className="text-sm text-slate-700 group-hover:text-blue-700">Voir le profil LinkedIn</span>
                                            </a>
                                        ) : (
                                            <div className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 text-slate-400">
                                                <Linkedin className="w-4 h-4" />
                                                <span className="text-sm">Non renseigné</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Société */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Société</h3>
                                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                                            <Building2 className="w-6 h-6 text-slate-400" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-900 text-lg">{selectedMeeting.contact.company.name}</p>
                                            {selectedMeeting.contact.company.website && (
                                                <a href={selectedMeeting.contact.company.website} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
                                                    {selectedMeeting.contact.company.website.replace(/^https?:\/\//, "")} <ArrowRight className="w-3 h-3" />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {selectedMeeting.contact.company.industry && (
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <p className="text-xs text-slate-500 uppercase font-medium">Secteur</p>
                                                <p className="font-medium text-slate-900 text-sm mt-0.5">{selectedMeeting.contact.company.industry}</p>
                                            </div>
                                        )}
                                        {selectedMeeting.contact.company.country && (
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <p className="text-xs text-slate-500 uppercase font-medium">Pays</p>
                                                <p className="font-medium text-slate-900 text-sm mt-0.5">{selectedMeeting.contact.company.country}</p>
                                            </div>
                                        )}
                                        {selectedMeeting.contact.company.size && (
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <p className="text-xs text-slate-500 uppercase font-medium">Effectif</p>
                                                <p className="font-medium text-slate-900 text-sm mt-0.5">{selectedMeeting.contact.company.size}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Note de prise de RDV */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Informations du RDV</h3>
                                <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-3">
                                    <DateTimePicker
                                        label="Date & heure"
                                        value={editCallbackDate}
                                        onChange={setEditCallbackDate}
                                        placeholder="Choisir date et heure…"
                                    />
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Format</label>
                                            <Select
                                                value={editMeetingType}
                                                onChange={(v) => setEditMeetingType(v as "" | "VISIO" | "PHYSIQUE" | "TELEPHONIQUE")}
                                                options={[
                                                    { value: "", label: "Non précisé" },
                                                    { value: "VISIO", label: "Visio" },
                                                    { value: "PHYSIQUE", label: "Physique" },
                                                    { value: "TELEPHONIQUE", label: "Téléphonique" },
                                                ]}
                                                className="w-full border border-slate-200 rounded-lg bg-white px-3 py-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Catégorie</label>
                                            <Select
                                                value={editMeetingCategory}
                                                onChange={(v) => setEditMeetingCategory(v as "" | "EXPLORATOIRE" | "BESOIN")}
                                                options={[
                                                    { value: "", label: "Non précisée" },
                                                    { value: "EXPLORATOIRE", label: "Exploratoire" },
                                                    { value: "BESOIN", label: "Analyse de besoin" },
                                                ]}
                                                className="w-full border border-slate-200 rounded-lg bg-white px-3 py-2"
                                            />
                                        </div>
                                    </div>
                                    {(editMeetingType === "PHYSIQUE" || (!editMeetingType && selectedMeeting.meetingAddress)) && (
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Adresse</label>
                                            <input
                                                value={editMeetingAddress}
                                                onChange={(e) => setEditMeetingAddress(e.target.value)}
                                                placeholder="Adresse du rendez-vous"
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                            />
                                        </div>
                                    )}
                                    {(editMeetingType === "VISIO" || (!editMeetingType && selectedMeeting.meetingJoinUrl)) && (
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Lien visio</label>
                                            <input
                                                value={editMeetingJoinUrl}
                                                onChange={(e) => setEditMeetingJoinUrl(e.target.value)}
                                                placeholder="https://..."
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                            />
                                        </div>
                                    )}
                                    {(editMeetingType === "TELEPHONIQUE" || (!editMeetingType && (selectedMeeting.meetingPhone || selectedMeeting.contact.phone))) && (
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Téléphone RDV</label>
                                            <input
                                                value={editMeetingPhone}
                                                onChange={(e) => setEditMeetingPhone(e.target.value)}
                                                placeholder={selectedMeeting.contact.phone ?? "+33 ..."}
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Note de prise de RDV */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Note de prise de RDV</h3>
                                <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4">
                                    <textarea
                                        value={editNote}
                                        onChange={(e) => setEditNote(e.target.value)}
                                        placeholder="Ajouter ou modifier une note..."
                                        className="w-full min-h-[100px] bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-700 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-y"
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </div>

                                {/* Right column: Summary */}
                                <div className="space-y-5">
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Récapitulatif</h3>
                                <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase font-medium mb-0.5">Date & Heure</p>
                                        <p className="font-semibold text-slate-900">{editCallbackDate ? new Date(editCallbackDate).toLocaleString("fr-FR") : formatScheduledDate(selectedMeeting)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase font-medium mb-2">Statut</p>
                                        <Select
                                            value={editResult}
                                            onChange={(v) => {
                                                if (v === "MEETING_CANCELLED") openCancelModal(selectedMeeting);
                                                else setEditResult(v as MeetingResult);
                                            }}
                                            options={[
                                                { value: "MEETING_BOOKED", label: "Confirmé" },
                                                { value: "MEETING_CANCELLED", label: "Annulé" },
                                            ]}
                                            className="w-full border border-slate-200 rounded-lg bg-white px-3 py-2"
                                        />
                                    </div>
                                    {editResult === "MEETING_CANCELLED" && (
                                        <div className="space-y-2">
                                            {selectedMeeting.cancellationReason && (
                                                <p className="text-xs text-slate-600 bg-slate-100 rounded-lg px-3 py-2">
                                                    Raison : {getMeetingCancellationLabel(selectedMeeting.cancellationReason)}
                                                </p>
                                            )}
                                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                                Le contact redevient disponible dans la file de prospection.
                                            </p>
                                        </div>
                                    )}
                                    <div className="pt-3 border-t border-slate-200 space-y-2">
                                        <p className="text-xs text-slate-500 uppercase font-medium">Lieu</p>
                                        <div className="flex items-center gap-2 text-sm text-slate-700">
                                            {editMeetingType === "VISIO" && <><Video className="w-4 h-4 text-indigo-500 shrink-0" /><span>Visio Conférence</span></>}
                                            {editMeetingType === "PHYSIQUE" && <><User className="w-4 h-4 text-indigo-500 shrink-0" /><span>Physique {editMeetingAddress ? `(${editMeetingAddress})` : ""}</span></>}
                                            {editMeetingType === "TELEPHONIQUE" && <><Phone className="w-4 h-4 text-indigo-500 shrink-0" /><span>Appel téléphonique</span></>}
                                            {!editMeetingType && <><Video className="w-4 h-4 text-indigo-500 shrink-0" /><span>Visio Conférence</span></>}
                                        </div>
                                        {/* Contextual action buttons by format */}
                                        {editMeetingType === "VISIO" && editMeetingJoinUrl && (
                                            <a href={editMeetingJoinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
                                                <Video className="w-4 h-4" /> Rejoindre
                                            </a>
                                        )}
                                        {editMeetingType === "PHYSIQUE" && editMeetingAddress && (
                                            <a href={`https://maps.google.com/?q=${encodeURIComponent(editMeetingAddress)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
                                                <MapPin className="w-4 h-4" /> Itinéraire
                                            </a>
                                        )}
                                        {editMeetingType === "TELEPHONIQUE" && (editMeetingPhone || selectedMeeting.contact.phone) && (
                                            <a href={`tel:${editMeetingPhone || selectedMeeting.contact.phone}`} className="inline-flex items-center gap-2 mt-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
                                                <Phone className="w-4 h-4" /> Appeler
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {selectedMeeting.mission && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Mission</h3>
                                    <div className="space-y-2">
                                        <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                                            <span className="text-sm font-medium text-slate-700">{selectedMeeting.mission.name}</span>
                                        </div>
                                        {selectedMeeting.mission.client && (
                                            <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center gap-2">
                                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                                <span className="text-sm font-medium text-slate-700">{selectedMeeting.mission.client.name}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {editResult === "MEETING_BOOKED" && (
                                <div className="space-y-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openRescheduleModal(selectedMeeting)}
                                        className="w-full justify-center gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-lg"
                                    >
                                        <CalendarClock className="w-4 h-4" />
                                        Reprogrammer le RDV
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openCancelModal(selectedMeeting)}
                                        disabled={saving || cancelSubmitting}
                                        className="w-full justify-center gap-2 text-amber-700 hover:bg-amber-50 rounded-lg"
                                    >
                                        {cancelSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                        Annuler le RDV
                                    </Button>
                                </div>
                            )}
                                </div>
                            </div>
                        )}

                        {detailDrawerTab === "note" && (
                            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Note interne</h3>
                                <textarea
                                    value={editNote}
                                    onChange={(e) => setEditNote(e.target.value)}
                                    placeholder="Ajouter une note interne..."
                                    className="w-full min-h-[160px] bg-white border border-slate-200 rounded-lg px-4 py-3 text-slate-700 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-y"
                                    rows={6}
                                />
                            </div>
                        )}

                        {detailDrawerTab === "history" && (
                            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Historique</h3>
                                <div className="text-sm text-slate-700 space-y-2">
                                    <p><span className="font-semibold">Créé le:</span> {new Date(selectedMeeting.createdAt).toLocaleString("fr-FR")}</p>
                                    <p><span className="font-semibold">Dernier statut:</span> {selectedMeeting.result === "MEETING_CANCELLED" ? "Annulé" : "Confirmé"}</p>
                                    {selectedMeeting.cancellationReason && (
                                        <p><span className="font-semibold">Raison annulation:</span> {getMeetingCancellationLabel(selectedMeeting.cancellationReason)}</p>
                                    )}
                                    {selectedMeeting.note && (
                                        <p className="italic text-slate-600">"{selectedMeeting.note}"</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </Drawer>
            )}

            {/* Cancel meeting modal (reason required) */}
            <Modal
                isOpen={!!cancelModalMeeting}
                onClose={() => { setCancelModalMeeting(null); setCancelReason(""); setCancelNote(""); }}
                title="Annuler le rendez-vous"
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-slate-600 text-sm">
                        Indiquez la raison de l&apos;annulation. Le contact redevient disponible dans la file de prospection.
                    </p>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Raison d&apos;annulation *</label>
                        <Select
                            value={cancelReason}
                            onChange={setCancelReason}
                            options={[
                                { value: "", label: "Choisir une raison..." },
                                ...MEETING_CANCELLATION_REASONS.map((r) => ({ value: r.code, label: r.label })),
                            ]}
                            className="w-full border border-slate-200 rounded-xl"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Note (optionnel)</label>
                        <textarea
                            value={cancelNote}
                            onChange={(e) => setCancelNote(e.target.value)}
                            placeholder="Précision..."
                            className="w-full min-h-[80px] px-3 py-2 border border-slate-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            rows={2}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
                    <Button variant="ghost" onClick={() => { setCancelModalMeeting(null); setCancelReason(""); setCancelNote(""); }}>
                        Fermer
                    </Button>
                    <Button
                        variant="secondary"
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={handleConfirmCancel}
                        disabled={!cancelReason.trim() || cancelSubmitting}
                    >
                        {cancelSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                        Confirmer l&apos;annulation
                    </Button>
                </div>
            </Modal>

            {/* Reschedule meeting modal */}
            <Modal
                isOpen={!!rescheduleMeeting}
                onClose={() => { setRescheduleMeeting(null); setRescheduleDateValue(""); setRescheduleNote(""); }}
                title="Reprogrammer le RDV"
                size="sm"
            >
                <div className="space-y-4">
                    <div>
                        <DateTimePicker
                            label="Nouvelle date et heure *"
                            value={rescheduleDateValue}
                            onChange={setRescheduleDateValue}
                            placeholder="Choisir date et heure…"
                            min={new Date().toISOString().slice(0, 16)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Note (optionnel)</label>
                        <textarea
                            value={rescheduleNote}
                            onChange={(e) => setRescheduleNote(e.target.value)}
                            placeholder="Ex: RDV reporté au..."
                            className="w-full min-h-[60px] px-3 py-2 border border-slate-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            rows={2}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
                    <Button variant="ghost" onClick={() => { setRescheduleMeeting(null); setRescheduleDateValue(""); setRescheduleNote(""); }}>
                        Fermer
                    </Button>
                    <Button
                        onClick={handleConfirmReschedule}
                        disabled={!rescheduleDateValue || rescheduleSubmitting}
                        className="gap-2"
                    >
                        {rescheduleSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                        Enregistrer la nouvelle date
                    </Button>
                </div>
            </Modal>

            {/* Delete confirmation */}
            <ConfirmModal
                isOpen={!!deleteConfirmMeeting}
                onClose={() => setDeleteConfirmMeeting(null)}
                onConfirm={handleDeleteMeeting}
                title="Supprimer ce rendez-vous ?"
                message="Cette action est irréversible. Le rendez-vous sera définitivement supprimé."
                confirmText="Supprimer"
                variant="danger"
                isLoading={deleting}
            />

            {/* Right-click context menu */}
            <ContextMenu
                items={contextMenuMeeting ? getContextMenuItems(contextMenuMeeting) : []}
                position={contextMenuPosition}
                onClose={closeContextMenu}
            />

            {/* Import RDV Modal */}
            <SdrImportRdvModal
                isOpen={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                onSuccess={() => {
                    // Refresh meetings list after successful import
                    const fetchMeetings = async () => {
                        setIsLoading(true);
                        try {
                            const { start, end } = getPresetRange("last12months");
                            const params = new URLSearchParams({
                                startDate: toISO(start),
                                endDate: toISO(end),
                            });
                            const res = await fetch(`/api/sdr/meetings?${params.toString()}`);
                            const json = await res.json();
                            if (json.success) {
                                setMeetings(json.data);
                                showSuccess("RDV importés avec succès");
                            }
                        } catch (err) {
                            console.error("Failed to fetch meetings:", err);
                        } finally {
                            setIsLoading(false);
                        }
                    };
                    fetchMeetings();
                }}
            />
        </div>
    );
}
