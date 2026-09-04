"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Drawer, Button, Badge, Select, useToast, TextSkeleton, ListSkeleton, DateTimePicker, Modal } from "@/components/ui";
import { ACTION_RESULT_LABELS, type ActionResult } from "@/lib/types";
import {
    Building2,
    User,
    Phone,
    Mail,
    Globe,
    Linkedin,
    MapPin,
    Users,
    Copy,
    ExternalLink,
    Clock,
    CheckCircle,
    AlertCircle,
    Loader2,
    PhoneCall,
    Send,
    MessageSquare,
    History,
    ChevronRight,
    Sparkles,
    Pencil,
    Save,
    X,
    Calendar,
    Plus,
    Trash2,
    RefreshCw,
    FileText,
    ChevronDown,
    ChevronUp,
    PhoneMissed,
    ThumbsUp,
    PhoneOff,
    CalendarX,
    Ban,
    RotateCcw,
    Check,
    Info,
    Video,
    UserX,
    XCircle,
} from "lucide-react";
import { AlloCallPickerModal } from "@/components/sdr/AlloCallPickerModal";
import { BookingDrawer } from "@/components/sdr/BookingDrawer";
import { ContactDrawer } from "./ContactDrawer";
import { GooglePhoneSuggestion } from "@/components/enrichment/GooglePhoneSuggestion";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { hasUsablePhone } from "@/lib/phone-utils";
import {
    sdrUnifiedDrawerCompanyKey,
    sdrUnifiedDrawerContactKey,
    sdrUnifiedDrawerActionsKey,
    sdrUnifiedDrawerCampaignsKey,
    sdrUnifiedDrawerStatusConfigKey,
    sdrUnifiedDrawerMailboxesKey,
    sdrUnifiedDrawerTemplatesKey,
} from "@/lib/query-keys";

// ============================================
// TYPES
// ============================================

interface Contact {
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
    customData?: Record<string, unknown> | null;
}

interface Company {
    id: string;
    name: string;
    industry: string | null;
    country: string | null;
    website: string | null;
    size: string | null;
    phone: string | null;
    status: "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";
    contacts: Contact[];
    _count?: { contacts: number };
    customData?: Record<string, unknown> | null;
}

interface UnifiedActionDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    contactId: string | null;
    companyId: string;
    missionId?: string;
    missionName?: string;
    clientBookingUrl?: string;
    clientInterlocuteurs?: Array<{
        id: string; firstName: string; lastName: string; title?: string;
        emails: Array<{ value: string; label: string; isPrimary: boolean }>;
        phones: Array<{ value: string; label: string; isPrimary: boolean }>;
        bookingLinks: Array<{ label: string; url: string; durationMinutes: number }>;
        isActive: boolean;
    }>;
    onActionRecorded?: () => void;
    onValidateAndNext?: () => void;
    onContactSelect?: (contactId: string) => void;
    onBookingDialogOpenChange?: (isOpen: boolean) => void;
    /** When the Allo call-picker modal opens, parent can hide overlapping UI (e.g. ScriptCompanionDrawer). */
    onAlloDialogOpenChange?: (isOpen: boolean) => void;
    enableGooglePhoneLookup?: boolean;
}

interface AlloCallItem {
    id: string;
    from: string;
    to: string;
    duration: number;
    direction: "INBOUND" | "OUTBOUND";
    outcome?: string;
    summary?: string;
    recording_url?: string;
    transcript?: Array<{ source: string; text: string }>;
    created_at?: string;
    start_time?: string | number;
    /** Champs bruts API WithAllo (liste) */
    from_number?: string;
    to_number?: string;
    start_date?: string;
    call_summary?: string;
    transcription?: string;
}

// ============================================
// CONSTANTS
// ============================================

const STATUS_CONFIG = {
    PARTIAL: {
        label: "Partiel",
        color: "text-amber-600",
        bg: "bg-amber-50",
        border: "border-amber-200",
        dot: "bg-amber-400",
        icon: Clock,
    },
    ACTIONABLE: {
        label: "Contact Qualifié",
        color: "text-emerald-600",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        dot: "bg-emerald-400",
        icon: CheckCircle,
    },
};

const RELANCE_HOVER_HINT = "👉 Rappel demandé\n➡️ Le prospect attend ton appel\n➡️ Il y a un signal d’intérêt";
const RAPPEL_HOVER_HINT = "👉 Rappel à faire\n➡️ Le prospect n’a pas encore été joint\n➡️ C’est un rappel logistique, pas commercial";
const HORS_CIBLE_HOVER_HINT = "Prospect hors des critères de ciblage.\n\nSecteur non pertinent\nTaille / structure incompatible\nPas dans les critères de qualification";
const MIN_NOTE_LENGTH_FOR_AI_ENHANCE = 25;

const getStatusHoverHint = (code: string, label?: string | null): string | undefined => {
    const haystack = `${code} ${label ?? ""}`.toUpperCase();
    if (haystack.includes("HORS_CIBLE") || haystack.includes("HORS CIBLE")) return HORS_CIBLE_HOVER_HINT;
    if (haystack.includes("RELANCE")) return RELANCE_HOVER_HINT;
    if (haystack.includes("RAPPEL")) return RAPPEL_HOVER_HINT;
    return undefined;
};

// Result chip definitions — icon + semantic color grouping
const RESULT_CHIP_CONFIG: Record<
    string,
    {
        label: string;
        icon: React.ElementType;
        bg: string;
        text: string;
        border: string;
        dot: string;
        selectedBg: string;
        selectedText: string;
        selectedBorder: string;
    }
> = {
    NO_RESPONSE: {
        label: "Pas de réponse",
        icon: PhoneMissed,
        bg: "bg-slate-50",
        text: "text-slate-600",
        border: "border-slate-200",
        dot: "bg-slate-400",
        selectedBg: "bg-slate-100",
        selectedText: "text-slate-800",
        selectedBorder: "border-slate-400",
    },
    BAD_CONTACT: {
        label: "Mauvais contact",
        icon: PhoneOff,
        bg: "bg-red-50",
        text: "text-red-600",
        border: "border-red-200",
        dot: "bg-red-400",
        selectedBg: "bg-red-100",
        selectedText: "text-red-800",
        selectedBorder: "border-red-400",
    },
    NUMERO_KO: {
        label: "NUMERO KO",
        icon: PhoneOff,
        bg: "bg-orange-50",
        text: "text-orange-600",
        border: "border-orange-200",
        dot: "bg-orange-400",
        selectedBg: "bg-orange-100",
        selectedText: "text-orange-800",
        selectedBorder: "border-orange-400",
    },
    INTERESTED: {
        label: "Intéressé",
        icon: ThumbsUp,
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        border: "border-emerald-200",
        dot: "bg-emerald-400",
        selectedBg: "bg-emerald-100",
        selectedText: "text-emerald-800",
        selectedBorder: "border-emerald-500",
    },
    CALLBACK_REQUESTED: {
        label: "Rappel demandé",
        icon: RotateCcw,
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
        dot: "bg-amber-400",
        selectedBg: "bg-amber-100",
        selectedText: "text-amber-800",
        selectedBorder: "border-amber-500",
    },
    MEETING_BOOKED: {
        label: "RDV planifié",
        icon: Calendar,
        bg: "bg-indigo-50",
        text: "text-indigo-700",
        border: "border-indigo-200",
        dot: "bg-indigo-400",
        selectedBg: "bg-indigo-100",
        selectedText: "text-indigo-800",
        selectedBorder: "border-indigo-500",
    },
    MEETING_CANCELLED: {
        label: "RDV annulé",
        icon: CalendarX,
        bg: "bg-red-50",
        text: "text-red-600",
        border: "border-red-200",
        dot: "bg-red-400",
        selectedBg: "bg-red-100",
        selectedText: "text-red-800",
        selectedBorder: "border-red-400",
    },
    INVALIDE: {
        label: "Invalide",
        icon: Ban,
        bg: "bg-gray-100",
        text: "text-gray-600",
        border: "border-gray-200",
        dot: "bg-gray-400",
        selectedBg: "bg-gray-200",
        selectedText: "text-gray-800",
        selectedBorder: "border-gray-400",
    },
    DISQUALIFIED: {
        label: "Disqualifié",
        icon: Ban,
        bg: "bg-slate-50",
        text: "text-slate-500",
        border: "border-slate-200",
        dot: "bg-slate-300",
        selectedBg: "bg-slate-100",
        selectedText: "text-slate-700",
        selectedBorder: "border-slate-400",
    },
    ENVOIE_MAIL: {
        label: "Envoi mail",
        icon: Send,
        bg: "bg-blue-50",
        text: "text-blue-700",
        border: "border-blue-200",
        dot: "bg-blue-400",
        selectedBg: "bg-blue-100",
        selectedText: "text-blue-800",
        selectedBorder: "border-blue-500",
    },
};

function formatCustomLabel(key: string): string {
    return key
        .replace(/_/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .split(" ")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

// ============================================
// SUB-COMPONENTS
// ============================================

function InfoRow({
    icon: Icon,
    iconColor,
    iconBg,
    label,
    children,
    action,
    editing,
}: {
    icon: React.ElementType;
    iconColor: string;
    iconBg: string;
    label: string;
    children: React.ReactNode;
    action?: React.ReactNode;
    editing?: boolean;
}) {
    return (
        <div
            className={cn(
                "flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0 transition-all duration-150",
                !editing && "hover:bg-slate-50/60 focus-within:bg-slate-50/40"
            )}
            role="group"
            aria-label={label}
        >
            <div
                className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200",
                    iconBg
                )}
                aria-hidden="true"
            >
                <Icon className={cn("w-3.5 h-3.5", iconColor)} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5" id={`field-label-${label.replace(/\s/g, "-").toLowerCase()}`}>
                    {label}
                </p>
                {children}
            </div>
            {action && (
                <div className="shrink-0 flex items-center gap-1">{action}</div>
            )}
        </div>
    );
}

function CopyButton({ text, label }: { text: string; label: string }) {
    const { success } = useToast();
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        success("Copié", `${label} copié dans le presse-papier`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button
            onClick={handleCopy}
            aria-label={`Copier ${label}`}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all duration-150"
        >
            {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
                <Copy className="w-3.5 h-3.5" />
            )}
        </button>
    );
}

function StatusPill({ status }: { status: string }) {
    const cfg = (STATUS_CONFIG as Record<string, (typeof STATUS_CONFIG)["PARTIAL"] | undefined>)[status];
    if (!cfg) return null; // e.g. INCOMPLETE: intentionally not shown
    const Icon = cfg.icon;
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border",
                cfg.bg,
                cfg.color,
                cfg.border
            )}
            aria-label={`Statut: ${cfg.label}`}
        >
            <Icon className="w-3 h-3" aria-hidden="true" />
            {cfg.label}
        </span>
    );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function UnifiedActionDrawer({
    isOpen,
    onClose,
    contactId,
    companyId,
    missionId,
    missionName,
    clientBookingUrl,
    clientInterlocuteurs,
    onActionRecorded,
    onValidateAndNext,
    onContactSelect,
    onBookingDialogOpenChange,
    onAlloDialogOpenChange,
    enableGooglePhoneLookup = false,
}: UnifiedActionDrawerProps) {
    const { success, error: showError } = useToast();
    const { data: session } = useSession();
    const isManager = session?.user?.role === "MANAGER";

    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<"contact" | "company">("contact");

    type ActionItem = {
        id: string;
        result: string;
        note: string | null;
        createdAt: string;
        callbackDate?: string | null;
        channel?: string;
        campaign?: { name: string };
        sdr?: { id: string; name: string };
    };

    // React Query: company
    const { data: company = null, isFetching: companyFetching } = useQuery({
        queryKey: sdrUnifiedDrawerCompanyKey(isOpen && companyId ? companyId : null),
        queryFn: async () => {
            const r = await fetch(`/api/companies/${companyId}?light=true`);
            const j = await r.json();
            if (!j.success || !j.data) throw new Error(j.error || "Impossible de charger la société");
            return j.data as Company;
        },
        enabled: isOpen && !!companyId,
        staleTime: 30_000,
    });

    // React Query: contact
    const { data: contact = null, isFetching: contactFetching } = useQuery({
        queryKey: sdrUnifiedDrawerContactKey(isOpen && contactId ? contactId : null),
        queryFn: async () => {
            const r = await fetch(`/api/contacts/${contactId}`);
            const j = await r.json();
            if (!j.success || !j.data) throw new Error(j.error || "Impossible de charger le contact");
            return j.data as Contact;
        },
        enabled: isOpen && !!contactId,
        staleTime: 30_000,
    });

    const loading = companyFetching || contactFetching;

    // Set active tab when contactId changes
    useEffect(() => {
        if (contactId) setActiveTab("contact");
        else setActiveTab("company");
    }, [contactId]);

    // React Query: actions history
    const actionsQueryKey = sdrUnifiedDrawerActionsKey(contactId, companyId);
    const q = contactId ? `contactId=${contactId}` : `companyId=${companyId}`;
    const {
        data: actions = [],
        isFetching: actionsLoading,
    } = useQuery<ActionItem[]>({
        queryKey: actionsQueryKey,
        queryFn: async () => {
            const r = await fetch(`/api/actions?${q}&limit=10`);
            const j = await r.json();
            if (!j.success || !Array.isArray(j.data)) throw new Error("Impossible de charger l'historique des actions");
            return j.data;
        },
        enabled: isOpen && !!(contactId || companyId),
        staleTime: 10_000,
    });

    const refetchActions = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: actionsQueryKey });
    }, [queryClient, actionsQueryKey]);

    const companyAdditionalPhones = useMemo(() => {
        const value = company?.customData?.additionalPhones;
        return Array.isArray(value)
            ? value.filter(
                  (phone): phone is string =>
                      typeof phone === "string" && phone.trim().length > 0,
              )
            : [];
    }, [company?.customData]);

    const contactHasPhone = hasUsablePhone(
        contact?.phone,
        contact?.additionalPhones ?? [],
    );
    const companyHasPhone = hasUsablePhone(
        company?.phone,
        companyAdditionalPhones,
    );

    const handleGooglePhoneApplied = useCallback(() => {
        queryClient.invalidateQueries({
            queryKey: sdrUnifiedDrawerCompanyKey(companyId),
        });
    }, [companyId, queryClient]);

    // React Query: campaigns
    const { data: campaigns = [], isFetching: campaignsLoading } = useQuery<
        Array<{ id: string; name: string; mission?: { channel: string } }>
    >({
        queryKey: sdrUnifiedDrawerCampaignsKey(isOpen && missionId ? missionId : null),
        queryFn: async () => {
            const r = await fetch(`/api/campaigns?missionId=${missionId}&isActive=true&limit=50`);
            const j = await r.json();
            if (!j.success || !Array.isArray(j.data)) return [];
            return j.data;
        },
        enabled: isOpen && !!missionId,
        staleTime: 60_000,
    });

    const isCallCampaign = useMemo(
        () => campaigns[0]?.mission?.channel === "CALL",
        [campaigns]
    );

    // React Query: action status config
    const { data: statusConfig = null } = useQuery<{
        statuses: Array<{ code: string; label: string; requiresNote: boolean; triggersCallback?: boolean }>;
    } | null>({
        queryKey: sdrUnifiedDrawerStatusConfigKey(isOpen && missionId ? missionId : null),
        queryFn: async () => {
            const r = await fetch(`/api/config/action-statuses?missionId=${missionId}`);
            const j = await r.json();
            if (!j.success || !j.data?.statuses) return null;
            return { statuses: j.data.statuses };
        },
        enabled: isOpen && !!missionId,
        staleTime: 120_000,
    });

    // Action form
    const [newActionResult, setNewActionResult] = useState<string>("");
    const [newActionNote, setNewActionNote] = useState("");
    const [newCallbackDateValue, setNewCallbackDateValue] = useState("");
    const noteRef = useRef<HTMLTextAreaElement>(null);

    // Edit / delete an existing history entry (re-qualify a status in place
    // instead of creating a duplicate action record)
    const [editingActionId, setEditingActionId] = useState<string | null>(null);
    const [editActionResult, setEditActionResult] = useState("");
    const [editActionNote, setEditActionNote] = useState("");
    const [deleteConfirmActionId, setDeleteConfirmActionId] = useState<string | null>(null);

    const [alloDialogOpen, setAlloDialogOpen] = useState(false);
    const [alloDialogCalls, setAlloDialogCalls] = useState<AlloCallItem[]>([]);
    const [alloDialogLoading, setAlloDialogLoading] = useState(false);
    const [alloDialogSelectedId, setAlloDialogSelectedId] = useState<string | null>(null);
    const [alloDialogFilterPhone, setAlloDialogFilterPhone] = useState("");
    const [alloDialogAlloLineCount, setAlloDialogAlloLineCount] = useState<number | null>(null);
    const [linkedAlloCall, setLinkedAlloCall] = useState<AlloCallItem | null>(null);
    const linkedAlloCallRef = useRef<AlloCallItem | null>(null);
    useEffect(() => {
        linkedAlloCallRef.current = linkedAlloCall;
    }, [linkedAlloCall]);

    const [showBookingDrawer, setShowBookingDrawer] = useState(false);
    const [rdvDate, setRdvDate] = useState("");
    const [meetingType, setMeetingType] = useState<"VISIO" | "PHYSIQUE" | "TELEPHONIQUE" | "">("");
    const [meetingCat, setMeetingCat] = useState<"EXPLORATOIRE" | "BESOIN" | "">("");
    const [meetingJoinUrl, setMeetingJoinUrl] = useState("");
    const [meetingAddress, setMeetingAddress] = useState("");
    const [meetingPhone, setMeetingPhone] = useState("");
    useEffect(() => {
        onBookingDialogOpenChange?.(showBookingDrawer);
    }, [showBookingDrawer, onBookingDialogOpenChange]);

    useEffect(() => {
        if (!isOpen) onBookingDialogOpenChange?.(false);
    }, [isOpen, onBookingDialogOpenChange]);

    useEffect(() => {
        onAlloDialogOpenChange?.(alloDialogOpen);
    }, [alloDialogOpen, onAlloDialogOpenChange]);

    useEffect(() => {
        if (!isOpen) onAlloDialogOpenChange?.(false);
    }, [isOpen, onAlloDialogOpenChange]);

    const [showAddContact, setShowAddContact] = useState(false);
    const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
    const notesDefaultInitializedForKeyRef = useRef<string | null>(null);
    const [historyExpanded, setHistoryExpanded] = useState(true);
    const [expandedCompanyContactId, setExpandedCompanyContactId] = useState<string | null>(null);
    const [newInterlocutorContact, setNewInterlocutorContact] = useState({
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
    });
    const [interlocutorContactSaved, setInterlocutorContactSaved] = useState(false);

    // Inline editing
    const [isEditingContact, setIsEditingContact] = useState(false);
    const [isEditingCompany, setIsEditingCompany] = useState(false);
    const [editContactData, setEditContactData] = useState<Partial<Contact>>({});
    const [editCompanyData, setEditCompanyData] = useState<Partial<Company>>({});

    // ── Inline email panel (ENVOIE_MAIL) ──────────────────────────────────────
    const [emailSelectedMailboxId, setEmailSelectedMailboxId] = useState<string>("");
    const [emailSelectedTemplateId, setEmailSelectedTemplateId] = useState<string>("");
    const [emailPreviewTemplateId, setEmailPreviewTemplateId] = useState<string>("");

    // Auto-focus note textarea when result requiring note is selected
    useEffect(() => {
        if (newActionResult && getRequiresNote(newActionResult)) {
            setTimeout(() => noteRef.current?.focus(), 50);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [newActionResult]);

    useEffect(() => {
        if (newActionResult !== "MAUVAIS_INTERLOCUTEUR") {
            setNewInterlocutorContact({ firstName: "", lastName: "", phone: "", email: "" });
            setInterlocutorContactSaved(false);
        }
    }, [newActionResult]);

    const toggleNoteExpand = (actionId: string) => {
        setExpandedNotes((prev) => {
            const next = new Set(prev);
            if (next.has(actionId)) next.delete(actionId);
            else next.add(actionId);
            return next;
        });
    };

    useEffect(() => {
        if (!isOpen) {
            notesDefaultInitializedForKeyRef.current = null;
            setExpandedNotes(new Set());
            return;
        }

        const historyTargetKey = `${companyId ?? ""}:${contactId ?? ""}`;
        if (notesDefaultInitializedForKeyRef.current === historyTargetKey) return;
        if (actionsLoading) return;

        const noteActionIds = actions
            .filter((action) => Boolean(action.note?.trim()))
            .map((action) => action.id);
        setExpandedNotes(new Set(noteActionIds));
        notesDefaultInitializedForKeyRef.current = historyTargetKey;
    }, [isOpen, companyId, contactId, actionsLoading, actions]);

    // Reset editing when drawer closes
    useEffect(() => {
        if (!isOpen || !companyId) {
            setIsEditingContact(false);
            setIsEditingCompany(false);
            setExpandedCompanyContactId(null);
        }
    }, [isOpen, companyId]);

    useEffect(() => {
        if (!isOpen) {
            setLinkedAlloCall(null);
            setAlloDialogOpen(false);
            setAlloDialogCalls([]);
            setAlloDialogSelectedId(null);
            setAlloDialogFilterPhone("");
            setAlloDialogAlloLineCount(null);
        }
    }, [isOpen]);

    const openAlloDialog = useCallback(async () => {
        const phone =
            contact?.phone || (isCallCampaign && company?.phone ? company.phone : null);
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
    }, [contact, company, isCallCampaign, showError]);

    const confirmAlloCall = useCallback(() => {
        const call = alloDialogCalls.find((c) => c.id === alloDialogSelectedId);
        if (!call) return;
        setLinkedAlloCall(call);
        setAlloDialogOpen(false);
    }, [alloDialogCalls, alloDialogSelectedId]);

    // "Pas bon contact" — one-click BAD_CONTACT action
    const handleBadContact = async (targetContactId?: string) => {
        const campaignId = campaigns[0]?.id;
        if (!campaignId) return;
        try {
            const channel = (campaigns[0]?.mission?.channel ?? "CALL") as "CALL" | "EMAIL" | "LINKEDIN";
            const res = await fetch("/api/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contactId: targetContactId || contactId || undefined,
                    companyId: (targetContactId || contactId) ? undefined : companyId,
                    campaignId,
                    channel,
                    result: "BAD_CONTACT",
                    note: "Mauvais contact",
                }),
            });
            const json = await res.json();
            if (json.success) {
                success("Contact marqué", "Ce contact a été marqué comme mauvais contact");
                queryClient.invalidateQueries({ queryKey: actionsQueryKey });
                onActionRecorded?.();
                if (!targetContactId || targetContactId === contactId) {
                    onValidateAndNext?.();
                }
            } else {
                showError("Erreur", json.error || "Impossible d'enregistrer");
            }
        } catch {
            showError("Erreur", "Erreur de connexion");
        }
    };

    // ── Email mailboxes (React Query) ──
    type Mailbox = { id: string; email: string; displayName: string | null };
    const isEmailMode = newActionResult === "ENVOIE_MAIL";
    const { data: emailMailboxes = [], isFetching: emailMailboxesLoading } = useQuery<Mailbox[]>({
        queryKey: sdrUnifiedDrawerMailboxesKey(isOpen && isEmailMode && missionId ? missionId : null),
        queryFn: async () => {
            let missionDefault: Mailbox | null = null;
            if (missionId) {
                try {
                    const mr = await fetch(`/api/missions/${missionId}`);
                    const mj = await mr.json();
                    if (mj.success && mj.data?.defaultMailbox) missionDefault = mj.data.defaultMailbox as Mailbox;
                } catch { /* ignore */ }
            }
            const res = await fetch("/api/email/mailboxes?includeShared=true");
            const json = await res.json();
            let list: Mailbox[] = json.success && Array.isArray(json.data) ? json.data : [];
            if (list.length === 0 && missionDefault) list = [missionDefault];
            return list;
        },
        enabled: isOpen && isEmailMode,
        staleTime: 60_000,
    });

    // Auto-select preferred mailbox when list loads
    useEffect(() => {
        if (emailMailboxes.length > 0 && !emailSelectedMailboxId) {
            setEmailSelectedMailboxId(emailMailboxes[0].id);
        }
    }, [emailMailboxes, emailSelectedMailboxId]);

    // ── Email templates (React Query) ──
    type MissionTemplate = { id: string; templateId: string; order: number; template: { id: string; name: string; subject: string; bodyHtml: string; category: string } };
    const { data: emailTemplates = [], isFetching: emailTemplatesLoading } = useQuery<MissionTemplate[]>({
        queryKey: sdrUnifiedDrawerTemplatesKey(isOpen && isEmailMode && missionId ? missionId : null),
        queryFn: async () => {
            const tr = await fetch(`/api/missions/${missionId}/templates`);
            const tj = await tr.json();
            return tj.success ? (tj.data || []) : [];
        },
        enabled: isOpen && isEmailMode && !!missionId,
        staleTime: 60_000,
    });

    // Auto-select first template when list loads
    useEffect(() => {
        if (emailTemplates.length > 0 && !emailSelectedTemplateId) {
            setEmailSelectedTemplateId(emailTemplates[0].templateId);
        }
    }, [emailTemplates, emailSelectedTemplateId]);

    // Reset email panel state when result changes away from ENVOIE_MAIL
    useEffect(() => {
        if (!isEmailMode) {
            setEmailSelectedTemplateId("");
            setEmailPreviewTemplateId("");
        }
    }, [isEmailMode]);

    // ── Derived state ──────────────────────────────────────────────────────────

    const getRequiresNote = useCallback(
        (code: string) =>
            statusConfig?.statuses?.find((s) => s.code === code)?.requiresNote ??
            ["INTERESTED", "CALLBACK_REQUESTED", "ENVOIE_MAIL"].includes(code),
        [statusConfig]
    );

    const statusOptions = useMemo(
        () => {
            const raw =
                statusConfig?.statuses?.length
                    ? statusConfig.statuses.map((s) => ({ value: s.code, label: s.label, title: getStatusHoverHint(s.code, s.label) }))
                    : Object.entries(ACTION_RESULT_LABELS).map(([value, label]) => ({ value, label, title: getStatusHoverHint(value, label) }));
            // Exclude MEETING_CANCELLED from call result options — invalid phone / bad number
            // should use NUMERO_KO, BAD_CONTACT, or INVALIDE, not meeting cancelled
            return raw.filter((opt) => opt.value !== "MEETING_CANCELLED");
        },
        [statusConfig]
    );

    const statusLabels = useMemo<Record<string, string>>(
        () =>
            statusConfig?.statuses?.length
                ? Object.fromEntries(statusConfig.statuses.map((s) => [s.code, s.label]))
                : { ...ACTION_RESULT_LABELS },
        [statusConfig]
    );

    const callbackResultCodes = useMemo(() => {
        const defaults = ["CALLBACK_REQUESTED", "RAPPEL", "RELANCE"];
        if (!statusConfig?.statuses?.length) return new Set<string>(defaults);

        const configured = statusConfig.statuses
            .filter((s) => {
                if (s.triggersCallback === true) return true;
                const haystack = `${s.code} ${s.label}`.toUpperCase();
                return haystack.includes("RAPPEL") || haystack.includes("RELANCE");
            })
            .map((s) => s.code);

        return new Set<string>([...defaults, ...configured]);
    }, [statusConfig]);

    const isCallbackResult = useCallback(
        (code: string | null | undefined) => !!code && callbackResultCodes.has(code),
        [callbackResultCodes]
    );

    const renderStatusWithHint = useCallback((resultCode: string) => {
        const label = statusLabels[resultCode] ?? resultCode;
        const hint = getStatusHoverHint(resultCode, label);
        if (!hint) return <span>{label}</span>;
        return (
            <Tooltip
                position="top"
                maxWidth="max-w-sm"
                content={
                    <div className="space-y-1">
                        {hint.split("\n").map((line, idx) => (
                            <p key={`${resultCode}-${idx}`} className="text-xs leading-relaxed">
                                {line}
                            </p>
                        ))}
                    </div>
                }
            >
                <span className="underline decoration-dotted underline-offset-2 cursor-help">{label}</span>
            </Tooltip>
        );
    }, [statusLabels]);

    const primaryPhone = useMemo(() => {
        if (contact?.phone) return { number: contact.phone, label: "Contact" };
        if (company?.phone) return { number: company.phone, label: "Société" };
        return null;
    }, [contact, company]);

    const primaryEmail = useMemo(() => {
        if (contact?.email) return contact.email;
        return company?.contacts?.find((c) => c.email)?.email ?? null;
    }, [contact, company]);

    const displayName = useMemo(() => {
        if (contact) {
            const n = `${contact.firstName || ""} ${contact.lastName || ""}`.trim();
            return n || company?.name || "Sans nom";
        }
        return company?.name || "Sans nom";
    }, [contact, company]);

    const hasPriorCall = useMemo(
        () => actions.some((a) => a.channel === "CALL"),
        [actions]
    );

    const priorCallActions = useMemo(
        () =>
            actions
                .filter((a) => a.channel === "CALL")
                .sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )
                .slice(0, 3),
        [actions]
    );

    const noteRequiredForResult = newActionResult ? getRequiresNote(newActionResult) : false;
    const isRefusalResult = newActionResult === "REFUS";
    const isOutOfTargetResult = newActionResult === "HORS_CIBLE";
    const textFieldRequiredForResult = noteRequiredForResult || isRefusalResult || isOutOfTargetResult;
    const notePlaceholder = useMemo(() => {
        switch (newActionResult) {
            case "INTERESTED": return "Qu'est-ce qui a suscité l'intérêt ? Prochaine étape ?";
            case "CALLBACK_REQUESTED": return "À quel sujet rappeler ? Date souhaitée ?";
            case "REFUS": return "Raison du refus (texte libre)...";
            case "HORS_CIBLE": return "Raison du hors cible (texte libre)...";
            case "DISQUALIFIED": return "Pourquoi ce contact est-il disqualifié ?";
            case "MEETING_BOOKED": return "Détails du rendez-vous planifié...";
            case "ENVOIE_MAIL": return "Objet et résumé de l'email envoyé...";
            default: return "Ajouter une note optionnelle...";
        }
    }, [newActionResult]);

    // ── Actions ────────────────────────────────────────────────────────────────

    const improveNoteMutation = useMutation({
        mutationFn: async (text: string) => {
            const res = await fetch("/api/ai/mistral/note-improve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });
            const json = await res.json();
            if (!json.success || !json.data?.improvedText) throw new Error(json.error || "Impossible d'améliorer la note");
            return json.data.improvedText as string;
        },
        onSuccess: (improvedText) => setNewActionNote(improvedText),
        onError: (err: Error) => showError("Erreur", err.message || "Connexion à l'IA impossible"),
    });

    const handleImproveNote = () => {
        const trimmed = newActionNote.trim();
        if (!trimmed) return;
        if (trimmed.length < MIN_NOTE_LENGTH_FOR_AI_ENHANCE) {
            showError(
                "Texte trop court",
                `Ajoutez plus de contexte (au moins ${MIN_NOTE_LENGTH_FOR_AI_ENHANCE} caractères) avant l'amélioration IA.`
            );
            return;
        }
        improveNoteMutation.mutate(trimmed);
    };

    // ── Send email from inline panel + record action ────────────────────────
    const getChosenTemplateId = () => {
        // Prefer explicit selection; otherwise fall back to first template if any
        if (emailSelectedTemplateId) return emailSelectedTemplateId;
        if (emailTemplates.length > 0) return emailTemplates[0].templateId;
        return null;
    };

    const sendEmailMutation = useMutation({
        mutationFn: async ({ andNext }: { andNext?: boolean }) => {
            const recipientEmail = contact?.email;
            if (!recipientEmail) throw new Error("Ce contact n'a pas d'adresse email");
            if (!emailSelectedMailboxId) throw new Error("Sélectionnez une boîte d'envoi");
            const chosenTemplateId = getChosenTemplateId();
            if (!chosenTemplateId) throw new Error("Sélectionnez un template d'email");

            const sendRes = await fetch("/api/email/quick-send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mailboxId: emailSelectedMailboxId,
                    templateId: chosenTemplateId,
                    to: [{ email: recipientEmail }],
                    contactId: contactId || undefined,
                    companyId: contactId ? undefined : companyId,
                    missionId: missionId || undefined,
                }),
            });
            const sendJson = await sendRes.json();
            if (!sendJson.success) throw new Error(sendJson.error || "Impossible d'envoyer l'email");

            const campaignId = campaigns[0]?.id;
            if (campaignId) {
                const template = emailTemplates.find(t => t.templateId === chosenTemplateId)?.template;
                await fetch("/api/actions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contactId: contactId || undefined,
                        companyId: contactId ? undefined : companyId,
                        campaignId,
                        channel: "EMAIL",
                        result: "MAIL_ENVOYE",
                        note: template ? `Email envoyé : ${template.subject}` : "Email envoyé",
                    }),
                });
            }
            return { recipientEmail, andNext };
        },
        onSuccess: ({ recipientEmail, andNext }) => {
            success("Email envoyé", `Email envoyé avec succès à ${recipientEmail}`);
            setNewActionResult("");
            setEmailSelectedTemplateId("");
            setEmailPreviewTemplateId("");
            onActionRecorded?.();
            queryClient.invalidateQueries({ queryKey: actionsQueryKey });
            if (andNext && onValidateAndNext) onValidateAndNext();
        },
        onError: (err: Error) => showError("Erreur", err.message || "Erreur lors de l'envoi de l'email"),
    });

    const handleSendEmailAndRecord = (andNext?: boolean) => sendEmailMutation.mutate({ andNext });

    const addActionMutation = useMutation({
        mutationFn: async ({ andNext }: { andNext?: boolean }) => {
            const campaignId = campaigns[0]?.id;
            if (!campaignId) throw new Error("Aucune campagne disponible pour cette mission");
            if (!newActionResult) throw new Error("Sélectionnez un résultat");
            if (requiresSavedInterlocutorBeforeSubmit) {
                throw new Error("Veuillez d'abord sauvegarder le nouveau contact avant d'enregistrer l'action");
            }
            if (textFieldRequiredForResult && !newActionNote.trim()) {
                noteRef.current?.focus();
                throw new Error(
                    isRefusalResult
                        ? "La raison du refus est requise"
                        : isOutOfTargetResult
                            ? "La raison du hors cible est requise"
                            : "Une note est requise pour ce résultat"
                );
            }
            const selectedCampaign = campaigns[0];
            const channel = (selectedCampaign?.mission?.channel ?? "CALL") as "CALL" | "EMAIL" | "LINKEDIN";
            const res = await fetch("/api/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contactId: contactId || undefined,
                    companyId: contactId ? undefined : companyId,
                    campaignId,
                    channel: newActionResult === "ENVOIE_MAIL" ? "EMAIL" : channel,
                    result: newActionResult,
                    note: newActionNote.trim() || undefined,
                    callbackDate:
                        isCallbackResult(newActionResult) && newCallbackDateValue
                            ? new Date(newCallbackDateValue).toISOString()
                            : newActionResult === "MEETING_BOOKED" && rdvDate
                                ? new Date(rdvDate).toISOString()
                                : undefined,
                    ...(newActionResult === "MEETING_BOOKED" && {
                        meetingType: meetingType || undefined,
                        meetingCategory: meetingCat || undefined,
                        meetingAddress: meetingAddress?.trim() || undefined,
                        meetingJoinUrl: meetingJoinUrl?.trim() || undefined,
                        meetingPhone: meetingPhone?.trim() || undefined,
                    }),
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Impossible d'enregistrer l'action");

            const newActionId = json.data?.id as string | undefined;
            const callToLink = linkedAlloCallRef.current;
            const missionChannel = (selectedCampaign?.mission?.channel ?? "CALL") as string;
            if (newActionId && missionChannel === "CALL" && callToLink) {
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

            return { andNext };
        },
        onSuccess: ({ andNext }) => {
            success("Action enregistrée", "L'action a été ajoutée à l'historique");
            setNewActionNote("");
            setNewActionResult("");
            setNewCallbackDateValue("");
            setLinkedAlloCall(null);
            queryClient.invalidateQueries({ queryKey: actionsQueryKey });
            onActionRecorded?.();
            if (andNext && onValidateAndNext) onValidateAndNext();
        },
        onError: (err: Error) => showError("Erreur", err.message),
    });

    const handleAddAction = (andNext?: boolean) => addActionMutation.mutate({ andNext });

    // ── Edit / delete an existing action (fix status without duplicating) ───────

    const startEditAction = useCallback((a: ActionItem) => {
        setEditingActionId(a.id);
        setEditActionResult(a.result);
        setEditActionNote(a.note ?? "");
    }, []);

    const cancelEditAction = useCallback(() => {
        setEditingActionId(null);
        setEditActionResult("");
        setEditActionNote("");
    }, []);

    const updateActionMutation = useMutation({
        mutationFn: async ({ actionId, result, note }: { actionId: string; result: string; note: string }) => {
            const res = await fetch(`/api/actions/${actionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ result, note: note.trim() || undefined }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Impossible de modifier cette action");
            return json.data;
        },
        onSuccess: () => {
            success("Action mise à jour", "Le statut a été modifié sans créer de doublon");
            cancelEditAction();
            queryClient.invalidateQueries({ queryKey: actionsQueryKey });
            onActionRecorded?.();
        },
        onError: (err: Error) => showError("Erreur", err.message),
    });

    const handleSaveEditAction = () => {
        if (!editingActionId || !editActionResult) return;
        updateActionMutation.mutate({ actionId: editingActionId, result: editActionResult, note: editActionNote });
    };

    const deleteActionMutation = useMutation({
        mutationFn: async (actionId: string) => {
            const res = await fetch(`/api/actions/${actionId}`, { method: "DELETE" });
            if (res.status !== 204) {
                const json = await res.json().catch(() => null);
                throw new Error(json?.error || "Impossible de supprimer cette action");
            }
        },
        onSuccess: () => {
            success("Action supprimée", "L'entrée a été retirée de l'historique");
            setDeleteConfirmActionId(null);
            queryClient.invalidateQueries({ queryKey: actionsQueryKey });
            onActionRecorded?.();
        },
        onError: (err: Error) => showError("Erreur", err.message),
    });

    const createInterlocutorContactMutation = useMutation({
        mutationFn: async () => {
            const targetCompanyId = contact?.companyId || company?.id || companyId;
            if (!targetCompanyId) throw new Error("Aucune société liée au contact courant");
            const payload = {
                companyId: targetCompanyId,
                firstName: newInterlocutorContact.firstName.trim() || undefined,
                lastName: newInterlocutorContact.lastName.trim() || undefined,
                phone: newInterlocutorContact.phone.trim() || undefined,
                email: newInterlocutorContact.email.trim() || undefined,
            };
            const isReplacingCurrentContact = !!contactId;
            const res = await fetch(
                isReplacingCurrentContact ? `/api/contacts/${contactId}` : "/api/contacts",
                {
                    method: isReplacingCurrentContact ? "PUT" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(
                        isReplacingCurrentContact
                            ? {
                                firstName: payload.firstName ?? null,
                                lastName: payload.lastName ?? null,
                                phone: payload.phone ?? null,
                                email: payload.email ?? null,
                            }
                            : payload
                    ),
                }
            );
            const json = await res.json();
            if (!json.success || !json.data?.id) {
                throw new Error(json.error || "Impossible de sauvegarder le contact");
            }
            return json.data as Contact;
        },
        onSuccess: (createdContact) => {
            success("Contact sauvegardé", "Le bon interlocuteur a été enregistré avec succès");
            setNewInterlocutorContact({ firstName: "", lastName: "", phone: "", email: "" });
            setInterlocutorContactSaved(true);
            queryClient.invalidateQueries({ queryKey: sdrUnifiedDrawerCompanyKey(createdContact.companyId) });
            queryClient.invalidateQueries({ queryKey: sdrUnifiedDrawerContactKey(createdContact.id) });
            queryClient.invalidateQueries({ queryKey: actionsQueryKey });
            onContactSelect?.(createdContact.id);
        },
        onError: (err: Error) => showError("Erreur", err.message || "Impossible de créer le contact"),
    });

    const hasInterlocutorName =
        newInterlocutorContact.firstName.trim().length > 0 ||
        newInterlocutorContact.lastName.trim().length > 0;
    const hasInterlocutorChannel =
        newInterlocutorContact.phone.trim().length > 0 ||
        newInterlocutorContact.email.trim().length > 0;
    const canCreateInterlocutorContact =
        !!(contact?.companyId || company?.id || companyId) &&
        hasInterlocutorName &&
        hasInterlocutorChannel &&
        !createInterlocutorContactMutation.isPending;
    const hasStartedInterlocutorInput =
        newInterlocutorContact.firstName.trim().length > 0 ||
        newInterlocutorContact.lastName.trim().length > 0 ||
        newInterlocutorContact.phone.trim().length > 0 ||
        newInterlocutorContact.email.trim().length > 0;
    const requiresSavedInterlocutorBeforeSubmit =
        newActionResult === "MAUVAIS_INTERLOCUTEUR" &&
        (hasStartedInterlocutorInput || interlocutorContactSaved) &&
        !interlocutorContactSaved;

    const saveContactMutation = useMutation({
        mutationFn: async () => {
            if (!contactId) throw new Error("Aucun contact sélectionné");
            const payload = {
                ...editContactData,
                additionalPhones: (editContactData.additionalPhones ?? []).filter(Boolean),
                additionalEmails: (editContactData.additionalEmails ?? []).filter(Boolean),
            };
            const res = await fetch(`/api/contacts/${contactId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Impossible de mettre à jour le contact");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: sdrUnifiedDrawerContactKey(contactId) });
            setIsEditingContact(false);
            success("Succès", "Contact mis à jour");
        },
        onError: (err: Error) => showError("Erreur", err.message),
    });

    const handleSaveContact = () => saveContactMutation.mutate();

    const saveCompanyMutation = useMutation({
        mutationFn: async () => {
            if (!companyId) throw new Error("Aucune société sélectionnée");
            const res = await fetch(`/api/companies/${companyId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editCompanyData),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Impossible de mettre à jour la société");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: sdrUnifiedDrawerCompanyKey(companyId) });
            setIsEditingCompany(false);
            success("Succès", "Société mise à jour");
        },
        onError: (err: Error) => showError("Erreur", err.message),
    });

    const handleSaveCompany = () => saveCompanyMutation.mutate();

    // ── Render guards ──────────────────────────────────────────────────────────

    if (!isOpen) return null;

    const canSubmit =
        !!newActionResult &&
        !requiresSavedInterlocutorBeforeSubmit &&
        (!textFieldRequiredForResult || newActionNote.trim().length > 0) &&
        !addActionMutation.isPending;

    const sortedHistoryActions = useMemo(() => {
        const copy = [...actions];
        copy.sort((a, b) => {
            const aCb = isCallbackResult(a.result) ? 1 : 0;
            const bCb = isCallbackResult(b.result) ? 1 : 0;
            if (aCb !== bCb) return bCb - aCb; // callback statuses first
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        return copy;
    }, [actions, isCallbackResult]);
    const visibleActions = historyExpanded ? sortedHistoryActions : sortedHistoryActions.slice(0, 5);

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={displayName}
            description={missionName ? `Mission : ${missionName}` : undefined}
            size="lg"
            className="top-2 bottom-2 right-2 rounded-[24px] border border-slate-200/80 shadow-[0_24px_64px_rgba(15,23,42,0.16)]"
        >
            <style>{`
                @keyframes uadSectionIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes uadPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
            {loading ? (
                <div className="space-y-5 p-1" role="status" aria-label="Chargement des données">
                    <div className="flex gap-3">
                        <TextSkeleton lines={2} className="flex-1" />
                        <TextSkeleton lines={1} className="w-20" />
                    </div>
                    <ListSkeleton items={3} hasAvatar className="mt-2" />
                    <TextSkeleton lines={4} />
                    <span className="sr-only">Chargement en cours...</span>
                </div>
            ) : (companyId && !company) || (contactId && !contact) ? (
                /* ── Error state ── */
                <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 flex items-center justify-center mb-5 shadow-sm">
                        <AlertCircle className="w-8 h-8 text-amber-500" />
                    </div>
                    <p className="text-slate-800 font-bold text-base mb-1">Données inaccessibles</p>
                    <p className="text-sm text-slate-500 mb-6 max-w-[260px] leading-relaxed">
                        Vérifiez votre connexion et réessayez de charger les données.
                    </p>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            queryClient.invalidateQueries({ queryKey: sdrUnifiedDrawerCompanyKey(companyId) });
                            queryClient.invalidateQueries({ queryKey: sdrUnifiedDrawerContactKey(contactId) });
                        }}
                        className="gap-2 shadow-sm"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Réessayer
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-4 pb-4" role="main" aria-label="Actions sur le contact">

                    {/* ── Unified history section (moved to top) ── */}
                    <section
                        aria-label="Historique des actions"
                        className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                        style={{ animation: "uadSectionIn 250ms cubic-bezier(0.16, 1, 0.3, 1)" }}
                    >
                        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white">
                            <div
                                className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center shadow-sm"
                                aria-hidden="true"
                            >
                                <History className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-sm font-bold text-slate-900" id="history-heading">Historique</h2>
                                <p className="text-[11px] text-slate-500">Dernieres interactions et contextes utiles</p>
                            </div>
                            {actionsLoading && (
                                <div className="ml-1 w-3.5 h-3.5 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" aria-hidden="true" />
                            )}
                            {actions.length > 0 && (
                                <span
                                    className="ml-auto text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2.5 py-0.5 tabular-nums"
                                    aria-label={`${actions.length} action${actions.length > 1 ? "s" : ""}`}
                                >
                                    {actions.length}
                                </span>
                            )}
                        </div>

                        {hasPriorCall && (
                            <div className="mx-4 mt-4 px-3 py-2.5 rounded-xl bg-gradient-to-r from-emerald-50 to-emerald-50/60 border border-emerald-200">
                                <div className="flex items-center gap-2">
                                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">
                                        <PhoneCall className="w-3 h-3" aria-hidden="true" />
                                        <span>Déjà appelé</span>
                                    </div>
                                    <p className="text-[11px] text-emerald-800">
                                        Un ou plusieurs appels ont déjà eu lieu avec {contactId ? "ce contact" : "cette société"}.
                                    </p>
                                </div>
                                {priorCallActions.length > 0 && (
                                    <ul className="mt-1.5 space-y-0.5 text-[11px] text-emerald-800">
                                        {priorCallActions.map((a) => (
                                            <li key={a.id} className="flex items-center gap-1.5 flex-wrap">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                                                <span className="font-semibold">{renderStatusWithHint(a.result)}</span>
                                                <span className="text-emerald-800/70">
                                                    ·{" "}
                                                    {new Date(a.createdAt).toLocaleDateString("fr-FR", {
                                                        day: "2-digit",
                                                        month: "2-digit",
                                                    })}{" "}
                                                    {new Date(a.createdAt).toLocaleTimeString("fr-FR", {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </span>
                                                {a.sdr?.name && (
                                                    <span className="text-emerald-800/70">
                                                        · par <span className="font-medium">{a.sdr.name}</span>
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        <div className="p-4" aria-live="polite">
                            {actionsLoading ? (
                                <div role="status" aria-label="Chargement de l'historique">
                                    <ListSkeleton items={3} hasAvatar={false} className="py-1" />
                                    <span className="sr-only">Chargement de l'historique...</span>
                                </div>
                            ) : actions.length === 0 ? (
                                <div className="flex flex-col items-center py-10 text-slate-400">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 flex items-center justify-center mb-3 shadow-sm">
                                        <History className="w-6 h-6 text-slate-300" aria-hidden="true" />
                                    </div>
                                    <p className="text-sm font-medium text-slate-500">Aucune action enregistrée</p>
                                    <p className="text-xs text-slate-400 mt-1 max-w-[200px] text-center leading-relaxed">
                                        Utilisez le formulaire ci-dessous pour enregistrer votre première action
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <ol className="space-y-2 pl-5 relative" aria-label="Liste des actions">
                                        {/* Vertical timeline line */}
                                        <div
                                            className="absolute top-3 bottom-3 left-[9px] w-[2px] bg-gradient-to-b from-slate-200 via-slate-150 to-slate-100 rounded-full"
                                            aria-hidden="true"
                                        />

                                        {visibleActions.map((a, index) => {
                                            const cfg =
                                                RESULT_CHIP_CONFIG[a.result] ||
                                                RESULT_CHIP_CONFIG.NO_RESPONSE;
                                            const Icon = cfg.icon;
                                            const isExpanded = expandedNotes.has(a.id);
                                            const noteText = a.note;
                                            const hasLongNote = noteText && noteText.length > 80;
                                            const hasContent = !!a.note?.trim();
                                            const isMeetingResultItem = a.result === "MEETING_BOOKED" || a.result === "MEETING_CANCELLED";
                                            const isEditingThis = editingActionId === a.id;

                                            return (
                                                <li
                                                    key={a.id}
                                                    className="relative pb-3 last:pb-0"
                                                >
                                                    {/* Timeline dot */}
                                                    <div
                                                        className={cn(
                                                            "absolute left-[-20px] top-2.5 w-4 h-4 rounded-full border-2 border-white shadow-md z-10 flex items-center justify-center ring-1 ring-black/5",
                                                            cfg.dot
                                                        )}
                                                        aria-hidden="true"
                                                    >
                                                        <Icon className="w-2.5 h-2.5 text-white" />
                                                    </div>

                                                    {/* Card */}
                                                    <div
                                                        className={cn(
                                                            "rounded-2xl border transition-all duration-200",
                                                            cfg.border,
                                                            "bg-white/95 hover:shadow-lg hover:-translate-y-[1px]"
                                                        )}
                                                    >
                                                        {/* Header row — clickable if has content */}
                                                        <button
                                                            type="button"
                                                            className={cn(
                                                                "w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left rounded-2xl transition-colors",
                                                                hasContent
                                                                    ? "cursor-pointer hover:bg-slate-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-300"
                                                                    : "cursor-default"
                                                            )}
                                                            onClick={() => hasContent && toggleNoteExpand(a.id)}
                                                            aria-expanded={hasContent ? isExpanded : undefined}
                                                            aria-label={
                                                                hasContent
                                                                    ? isExpanded
                                                                        ? `Masquer les détails de ${statusLabels[a.result] ?? a.result}`
                                                                        : `Voir les détails de ${statusLabels[a.result] ?? a.result}`
                                                                    : undefined
                                                            }
                                                            disabled={!hasContent}
                                                        >
                                                            <div className="flex-1 min-w-0 space-y-1">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span
                                                                        className={cn(
                                                                            "text-sm font-semibold",
                                                                            cfg.text
                                                                        )}
                                                                    >
                                                                        {renderStatusWithHint(a.result)}
                                                                    </span>
                                                                    {a.channel && (
                                                                        <span className={cn(
                                                                            "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded",
                                                                            a.channel === "CALL" ? "bg-emerald-50 text-emerald-600" :
                                                                            a.channel === "EMAIL" ? "bg-blue-50 text-blue-600" :
                                                                            "bg-sky-50 text-sky-600"
                                                                        )}>
                                                                            {a.channel === "CALL" ? <PhoneCall className="w-2.5 h-2.5" /> :
                                                                             a.channel === "EMAIL" ? <Mail className="w-2.5 h-2.5" /> :
                                                                             <Linkedin className="w-2.5 h-2.5" />}
                                                                            {a.channel === "CALL" ? "Appel" : a.channel === "EMAIL" ? "Email" : "LinkedIn"}
                                                                        </span>
                                                                    )}
                                                                    {a.campaign?.name && (
                                                                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md font-medium truncate max-w-[120px]">
                                                                            {a.campaign.name}
                                                                        </span>
                                                                    )}
                                                                    {a.sdr?.name && (
                                                                        <span className="text-[10px] text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded-md">
                                                                            {a.sdr.name}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {a.callbackDate && (a.result === "MEETING_BOOKED" || isCallbackResult(a.result)) ? (
                                                                    <div className="flex flex-col">
                                                                        <time
                                                                            dateTime={a.callbackDate}
                                                                            className="text-[11px] text-indigo-500 font-semibold"
                                                                        >
                                                                            {a.result === "MEETING_BOOKED" ? "RDV " : "Rappel "}
                                                                            {new Date(a.callbackDate).toLocaleDateString("fr-FR", {
                                                                                day: "2-digit",
                                                                                month: "short",
                                                                                year: "numeric",
                                                                                hour: "2-digit",
                                                                                minute: "2-digit",
                                                                            })}
                                                                        </time>
                                                                        <time
                                                                            dateTime={a.createdAt}
                                                                            className="text-[10px] text-slate-400"
                                                                        >
                                                                            créé le {new Date(a.createdAt).toLocaleDateString("fr-FR", {
                                                                                day: "2-digit",
                                                                                month: "short",
                                                                            })}
                                                                        </time>
                                                                    </div>
                                                                ) : (
                                                                    <time
                                                                        dateTime={a.createdAt}
                                                                        className="text-[11px] text-slate-400 font-medium"
                                                                    >
                                                                        {new Date(a.createdAt).toLocaleDateString("fr-FR", {
                                                                            day: "2-digit",
                                                                            month: "short",
                                                                            year: "numeric",
                                                                            hour: "2-digit",
                                                                            minute: "2-digit",
                                                                        })}
                                                                    </time>
                                                                )}
                                                            </div>
                                                            {hasContent && (
                                                                <ChevronDown
                                                                    className={cn(
                                                                        "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                                                                        isExpanded && "rotate-180"
                                                                    )}
                                                                    aria-hidden="true"
                                                                />
                                                            )}
                                                        </button>

                                                        {/* Expandable note content */}
                                                        {hasContent && isExpanded && !isEditingThis && (
                                                            <div className="px-3.5 pb-3.5 pt-0 border-t border-slate-100 space-y-2">
                                                                {a.note && (
                                                                    <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed pt-2">
                                                                        {a.note}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Inline edit: fix the status/note on this entry without creating a duplicate */}
                                                        {!isMeetingResultItem && isEditingThis && (
                                                            <div className="px-3.5 pb-3.5 pt-3 border-t border-slate-100 space-y-2.5">
                                                                <Select
                                                                    options={statusOptions}
                                                                    value={editActionResult}
                                                                    onChange={setEditActionResult}
                                                                    placeholder="Statut"
                                                                />
                                                                <textarea
                                                                    value={editActionNote}
                                                                    onChange={(e) => setEditActionNote(e.target.value)}
                                                                    placeholder="Note (optionnel)"
                                                                    rows={2}
                                                                    className="w-full min-h-[56px] px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                                                                />
                                                                <div className="flex items-center justify-end gap-2 pt-0.5">
                                                                    <Button variant="ghost" size="sm" onClick={cancelEditAction} disabled={updateActionMutation.isPending}>
                                                                        Annuler
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={handleSaveEditAction}
                                                                        disabled={!editActionResult || updateActionMutation.isPending}
                                                                        className="gap-1.5"
                                                                    >
                                                                        {updateActionMutation.isPending ? (
                                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                        ) : (
                                                                            <Save className="w-3.5 h-3.5" />
                                                                        )}
                                                                        Enregistrer
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Fix status / remove duplicate — not for meetings (managed from the RDV pages) */}
                                                        {!isMeetingResultItem && !isEditingThis && (
                                                            <div className="flex items-center justify-end gap-1 px-2 pb-1.5 -mt-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => startEditAction(a)}
                                                                    aria-label={`Modifier le statut « ${statusLabels[a.result] ?? a.result} »`}
                                                                    className="flex items-center gap-1 px-1.5 py-1 text-[10px] font-semibold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                                >
                                                                    <Pencil className="w-3 h-3" aria-hidden="true" />
                                                                    Modifier
                                                                </button>
                                                                {isManager && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setDeleteConfirmActionId(a.id)}
                                                                        aria-label={`Supprimer l'action « ${statusLabels[a.result] ?? a.result} »`}
                                                                        className="flex items-center gap-1 px-1.5 py-1 text-[10px] font-semibold text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                    >
                                                                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                                                                        Supprimer
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ol>

                                    {/* Show more / less */}
                                    {actions.length > 5 && (
                                        <button
                                            type="button"
                                            onClick={() => setHistoryExpanded((v) => !v)}
                                            className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 py-2.5 rounded-xl bg-indigo-50/40 hover:bg-indigo-50 border border-indigo-100 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 hover:border-indigo-200 active:scale-[0.99]"
                                        >
                                            {historyExpanded ? (
                                                <>
                                                    <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                                                    Voir moins
                                                </>
                                            ) : (
                                                <>
                                                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                                                    Voir {actions.length - 5} action{actions.length - 5 > 1 ? "s" : ""} de plus
                                                </>
                                            )}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </section>

                    {/* ── Quick Action Bar ── */}
                    <section
                        aria-label="Actions rapides"
                        className="flex flex-wrap gap-2 p-3 rounded-2xl bg-gradient-to-r from-slate-50 via-white to-slate-50 border border-slate-200/60"
                        style={{ animation: "uadSectionIn 250ms 50ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
                    >
                        {primaryPhone && (
                            <button
                                type="button"
                                aria-label={`Appeler ${primaryPhone.number}`}
                                onClick={() => {
                                    window.open(`tel:${primaryPhone.number}`, "_self");
                                }}
                                className="flex-1 min-w-[130px] flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 active:from-emerald-700 active:to-emerald-800 text-white rounded-xl font-semibold text-sm shadow-md hover:shadow-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 active:scale-[0.98]"
                            >
                                <PhoneCall className="w-4 h-4" aria-hidden="true" />
                                <span>Appeler</span>
                                {primaryPhone.label === "Société" && (
                                    <span className="text-xs opacity-75 font-normal">
                                        (société)
                                    </span>
                                )}
                            </button>
                        )}

                        {primaryEmail && (
                            <a
                                href={`mailto:${primaryEmail}`}
                                aria-label={`Envoyer un email à ${primaryEmail}`}
                                className="flex-1 min-w-[110px] flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 active:from-indigo-700 active:to-indigo-800 text-white rounded-xl font-semibold text-sm shadow-md hover:shadow-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 active:scale-[0.98]"
                            >
                                <Send className="w-4 h-4" aria-hidden="true" />
                                Email
                            </a>
                        )}

                        {(contact?.linkedin || company?.website) && (
                            <a
                                href={
                                    contact?.linkedin
                                        ? contact.linkedin.startsWith("http")
                                            ? contact.linkedin
                                            : `https://${contact.linkedin}`
                                        : company?.website?.startsWith("http")
                                            ? company.website
                                            : `https://${company?.website}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={contact?.linkedin ? "Ouvrir le profil LinkedIn" : "Ouvrir le site web"}
                                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-sm shadow-sm hover:shadow-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 active:scale-[0.98]"
                            >
                                {contact?.linkedin ? (
                                    <Linkedin className="w-4 h-4 text-blue-600" aria-hidden="true" />
                                ) : (
                                    <Globe className="w-4 h-4 text-slate-500" aria-hidden="true" />
                                )}
                                {contact?.linkedin ? "LinkedIn" : "Site web"}
                            </a>
                        )}
                    </section>

                    {/* ── Tab Navigation ── */}
                    {contact && (
                        <div
                            role="tablist"
                            aria-label="Informations contact ou société"
                            className="flex rounded-xl bg-slate-100/80 p-1 gap-1 border border-slate-200/60"
                            style={{ animation: "uadSectionIn 250ms 100ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
                            onKeyDown={(e) => {
                                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                                    e.preventDefault();
                                    const next = activeTab === "contact" ? "company" : "contact";
                                    setActiveTab(next);
                                    document.getElementById(`tab-${next}`)?.focus();
                                }
                            }}
                        >
                            <button
                                role="tab"
                                id="tab-contact"
                                aria-selected={activeTab === "contact"}
                                aria-controls="tabpanel-contact"
                                tabIndex={activeTab === "contact" ? 0 : -1}
                                onClick={() => setActiveTab("contact")}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1",
                                    activeTab === "contact"
                                        ? "bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100"
                                        : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                                )}
                            >
                                <User className="w-4 h-4" aria-hidden="true" />
                                Contact
                            </button>
                            <button
                                role="tab"
                                id="tab-company"
                                aria-selected={activeTab === "company"}
                                aria-controls="tabpanel-company"
                                tabIndex={activeTab === "company" ? 0 : -1}
                                onClick={() => setActiveTab("company")}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1",
                                    activeTab === "company"
                                        ? "bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100"
                                        : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                                )}
                            >
                                <Building2 className="w-4 h-4" aria-hidden="true" />
                                Société
                            </button>
                        </div>
                    )}

                    {/* ── Contact Tab ── */}
                    {activeTab === "contact" && contact && (
                        <section
                            id="tabpanel-contact"
                            role="tabpanel"
                            aria-labelledby="tab-contact"
                            tabIndex={0}
                            className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-1"
                            style={{ animation: "uadSectionIn 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
                        >
                            {/* Contact header */}
                            <div className="flex items-start gap-4 p-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50/40 to-transparent">
                                <div
                                    className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-base font-bold text-white shadow-md ring-2 ring-white shrink-0"
                                    aria-hidden="true"
                                >
                                    {(contact.firstName?.[0] || contact.lastName?.[0] || "?").toUpperCase()}
                                </div>

                                <div className="flex-1 min-w-0">
                                    {isEditingContact ? (
                                        <div className="space-y-2">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={editContactData.firstName || ""}
                                                    onChange={(e) =>
                                                        setEditContactData({ ...editContactData, firstName: e.target.value })
                                                    }
                                                    placeholder="Prénom"
                                                    aria-label="Prénom"
                                                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                                                />
                                                <input
                                                    type="text"
                                                    value={editContactData.lastName || ""}
                                                    onChange={(e) =>
                                                        setEditContactData({ ...editContactData, lastName: e.target.value })
                                                    }
                                                    placeholder="Nom"
                                                    aria-label="Nom de famille"
                                                    className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                                                />
                                            </div>
                                            <input
                                                type="text"
                                                value={editContactData.title || ""}
                                                onChange={(e) =>
                                                    setEditContactData({ ...editContactData, title: e.target.value })
                                                }
                                                placeholder="Titre / Poste"
                                                aria-label="Titre ou poste"
                                                className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                                                {contact.firstName || ""} {contact.lastName || ""}
                                                {!contact.firstName && !contact.lastName && (
                                                    <span className="text-slate-400 italic font-normal">Sans nom</span>
                                                )}
                                            </h3>
                                            {contact.title && (
                                                <p className="text-xs text-slate-500 mt-0.5">{contact.title}</p>
                                            )}
                                            <div className="mt-1.5">
                                                <StatusPill status={contact.status} />
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="flex gap-1 shrink-0">
                                    {isEditingContact ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setIsEditingContact(false)}
                                                disabled={saveContactMutation.isPending}
                                                aria-label="Annuler les modifications"
                                                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                                            >
                                                <X className="w-4 h-4" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleSaveContact}
                                                disabled={saveContactMutation.isPending}
                                                aria-label="Sauvegarder le contact"
                                                className="w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                                            >
                                                {saveContactMutation.isPending ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                                                ) : (
                                                    <Save className="w-4 h-4" aria-hidden="true" />
                                                )}
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handleBadContact()}
                                                title="Marquer comme mauvais contact"
                                                aria-label="Marquer comme mauvais contact"
                                                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                                            >
                                                <UserX className="w-4 h-4" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditContactData({
                                                        firstName: contact.firstName,
                                                        lastName: contact.lastName,
                                                        title: contact.title,
                                                        email: contact.email,
                                                        phone: contact.phone,
                                                        additionalPhones: Array.isArray(contact.additionalPhones) ? contact.additionalPhones : [],
                                                        additionalEmails: Array.isArray(contact.additionalEmails) ? contact.additionalEmails : [],
                                                        linkedin: contact.linkedin,
                                                    });
                                                    setIsEditingContact(true);
                                                }}
                                                aria-label="Modifier le contact"
                                                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                                            >
                                                <Pencil className="w-4 h-4" aria-hidden="true" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Contact fields */}
                            <div>
                                {(contact.phone || isEditingContact) && (
                                    <InfoRow
                                        icon={Phone}
                                        iconColor="text-emerald-600"
                                        iconBg="bg-emerald-50"
                                        label="Téléphone"
                                        editing={isEditingContact}
                                        action={
                                            !isEditingContact && contact.phone ? (
                                                <CopyButton text={contact.phone} label="Téléphone" />
                                            ) : undefined
                                        }
                                    >
                                        {isEditingContact ? (
                                            <input
                                                type="tel"
                                                value={editContactData.phone || ""}
                                                onChange={(e) =>
                                                    setEditContactData({ ...editContactData, phone: e.target.value })
                                                }
                                                placeholder="Numéro de téléphone"
                                                aria-label="Téléphone principal"
                                                className="w-full mt-0.5 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                                            />
                                        ) : (
                                            <a
                                                href={`tel:${contact.phone}`}
                                                className="text-sm font-medium text-emerald-600 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 rounded"
                                            >
                                                {contact.phone}
                                            </a>
                                        )}
                                    </InfoRow>
                                )}

                                {enableGooglePhoneLookup &&
                                    !isEditingContact &&
                                    !contactHasPhone &&
                                    !companyHasPhone &&
                                    company && (
                                        <div className="border-b border-slate-100 px-4 py-3">
                                            <GooglePhoneSuggestion
                                                companyId={company.id}
                                                companyName={company.name}
                                                onApplied={handleGooglePhoneApplied}
                                            />
                                        </div>
                                    )}

                                {(contact.email || isEditingContact) && (
                                    <InfoRow
                                        icon={Mail}
                                        iconColor="text-indigo-600"
                                        iconBg="bg-indigo-50"
                                        label="Email"
                                        editing={isEditingContact}
                                        action={
                                            !isEditingContact && contact.email ? (
                                                <CopyButton text={contact.email} label="Email" />
                                            ) : undefined
                                        }
                                    >
                                        {isEditingContact ? (
                                            <input
                                                type="email"
                                                value={editContactData.email || ""}
                                                onChange={(e) =>
                                                    setEditContactData({ ...editContactData, email: e.target.value })
                                                }
                                                placeholder="Adresse email"
                                                aria-label="Email principal"
                                                className="w-full mt-0.5 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                                            />
                                        ) : (
                                            <a
                                                href={`mailto:${contact.email}`}
                                                className="text-sm font-medium text-indigo-600 hover:underline truncate block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded"
                                            >
                                                {contact.email}
                                            </a>
                                        )}
                                    </InfoRow>
                                )}

                                {/* Additional phones */}
                                {(isEditingContact
                                    ? (editContactData.additionalPhones?.length ?? 0) > 0
                                    : Array.isArray(contact.additionalPhones) &&
                                    contact.additionalPhones.filter(Boolean).length > 0) && (
                                        <div className="px-4 py-3 border-b border-slate-100">
                                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                                                <Phone className="w-3 h-3 text-emerald-500" aria-hidden="true" />
                                                Autres numéros
                                            </p>
                                            {isEditingContact ? (
                                                <div className="space-y-2">
                                                    {(editContactData.additionalPhones ?? []).map((num, idx) => (
                                                        <div key={idx} className="flex gap-2">
                                                            <input
                                                                type="tel"
                                                                value={num}
                                                                aria-label={`Numéro supplémentaire ${idx + 1}`}
                                                                onChange={(e) => {
                                                                    const next = [...(editContactData.additionalPhones ?? [])];
                                                                    next[idx] = e.target.value;
                                                                    setEditContactData({ ...editContactData, additionalPhones: next });
                                                                }}
                                                                placeholder="Numéro"
                                                                className="flex-1 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                                                            />
                                                            <button
                                                                type="button"
                                                                aria-label="Supprimer ce numéro"
                                                                onClick={() =>
                                                                    setEditContactData({
                                                                        ...editContactData,
                                                                        additionalPhones: (editContactData.additionalPhones ?? []).filter((_, i) => i !== idx),
                                                                    })
                                                                }
                                                                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setEditContactData({
                                                                ...editContactData,
                                                                additionalPhones: [...(editContactData.additionalPhones ?? []), ""],
                                                            })
                                                        }
                                                        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium mt-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                                                        Ajouter un numéro
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {(contact.additionalPhones ?? []).filter(Boolean).map((num, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs"
                                                        >
                                                            <a href={`tel:${num}`} className="text-emerald-700 hover:underline font-medium">
                                                                {num}
                                                            </a>
                                                            <CopyButton text={num} label="Numéro" />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                {isEditingContact && (editContactData.additionalPhones?.length ?? 0) === 0 && (
                                    <div className="px-4 py-3 border-b border-slate-100">
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
                                            Autres numéros
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setEditContactData({
                                                    ...editContactData,
                                                    additionalPhones: [""],
                                                })
                                            }
                                            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded"
                                        >
                                            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                                            Ajouter un numéro
                                        </button>
                                    </div>
                                )}

                                {/* Additional emails */}
                                {(isEditingContact
                                    ? (editContactData.additionalEmails?.length ?? 0) > 0
                                    : Array.isArray(contact.additionalEmails) &&
                                    contact.additionalEmails.filter(Boolean).length > 0) && (
                                        <div className="px-4 py-3 border-b border-slate-100">
                                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                                                <Mail className="w-3 h-3 text-indigo-500" aria-hidden="true" />
                                                Autres emails
                                            </p>
                                            {isEditingContact ? (
                                                <div className="space-y-2">
                                                    {(editContactData.additionalEmails ?? []).map((em, idx) => (
                                                        <div key={idx} className="flex gap-2">
                                                            <input
                                                                type="email"
                                                                value={em}
                                                                aria-label={`Email supplémentaire ${idx + 1}`}
                                                                onChange={(e) => {
                                                                    const next = [...(editContactData.additionalEmails ?? [])];
                                                                    next[idx] = e.target.value;
                                                                    setEditContactData({ ...editContactData, additionalEmails: next });
                                                                }}
                                                                placeholder="Email"
                                                                className="flex-1 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                                                            />
                                                            <button
                                                                type="button"
                                                                aria-label="Supprimer cet email"
                                                                onClick={() =>
                                                                    setEditContactData({
                                                                        ...editContactData,
                                                                        additionalEmails: (editContactData.additionalEmails ?? []).filter((_, i) => i !== idx),
                                                                    })
                                                                }
                                                                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setEditContactData({
                                                                ...editContactData,
                                                                additionalEmails: [...(editContactData.additionalEmails ?? []), ""],
                                                            })
                                                        }
                                                        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium mt-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                                                        Ajouter un email
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {(contact.additionalEmails ?? []).filter(Boolean).map((em, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-xs"
                                                        >
                                                            <a
                                                                href={`mailto:${em}`}
                                                                className="text-indigo-700 hover:underline truncate max-w-[160px]"
                                                            >
                                                                {em}
                                                            </a>
                                                            <CopyButton text={em} label="Email" />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                {isEditingContact && (editContactData.additionalEmails?.length ?? 0) === 0 && (
                                    <div className="px-4 py-3 border-b border-slate-100">
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
                                            Autres emails
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setEditContactData({
                                                    ...editContactData,
                                                    additionalEmails: [""],
                                                })
                                            }
                                            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded"
                                        >
                                            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                                            Ajouter un email
                                        </button>
                                    </div>
                                )}

                                {(contact.linkedin || isEditingContact) && (
                                    <InfoRow
                                        icon={Linkedin}
                                        iconColor="text-blue-600"
                                        iconBg="bg-blue-50"
                                        label="LinkedIn"
                                        editing={isEditingContact}
                                        action={
                                            !isEditingContact && contact.linkedin ? (
                                                <a
                                                    href={
                                                        contact.linkedin.startsWith("http")
                                                            ? contact.linkedin
                                                            : `https://${contact.linkedin}`
                                                    }
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    aria-label="Ouvrir LinkedIn dans un nouvel onglet"
                                                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                                                </a>
                                            ) : undefined
                                        }
                                    >
                                        {isEditingContact ? (
                                            <input
                                                type="url"
                                                value={editContactData.linkedin || ""}
                                                onChange={(e) =>
                                                    setEditContactData({ ...editContactData, linkedin: e.target.value })
                                                }
                                                placeholder="URL LinkedIn"
                                                aria-label="Profil LinkedIn"
                                                className="w-full mt-0.5 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                                            />
                                        ) : (
                                            <a
                                                href={
                                                    contact.linkedin!.startsWith("http")
                                                        ? contact.linkedin!
                                                        : `https://${contact.linkedin}`
                                                }
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm font-medium text-blue-600 hover:underline truncate block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
                                            >
                                                Voir le profil
                                            </a>
                                        )}
                                    </InfoRow>
                                )}

                                {/* Contact custom data */}
                                {contact.customData &&
                                    typeof contact.customData === "object" &&
                                    Object.keys(contact.customData).length > 0 &&
                                    !isEditingContact && (
                                        <div className="px-4 py-3 bg-slate-50/60">
                                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                                                <FileText className="w-3 h-3" aria-hidden="true" />
                                                Infos supplémentaires
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {Object.entries(contact.customData as Record<string, unknown>).map(
                                                    ([key, value]) => {
                                                        if (value == null || value === "") return null;
                                                        return (
                                                            <div
                                                                key={key}
                                                                className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[11px] text-slate-700"
                                                            >
                                                                <span className="font-semibold text-slate-500 mr-1">
                                                                    {formatCustomLabel(key)}:
                                                                </span>
                                                                <span>{String(value)}</span>
                                                            </div>
                                                        );
                                                    }
                                                )}
                                            </div>
                                        </div>
                                    )}

                                {!isEditingContact &&
                                    !contact.phone &&
                                    !contact.email &&
                                    !contact.linkedin &&
                                    !(contact.additionalPhones?.filter(Boolean).length) &&
                                    !(contact.additionalEmails?.filter(Boolean).length) && (
                                        <div className="flex flex-col items-center py-8 text-slate-400">
                                            <Info className="w-8 h-8 mb-2 opacity-40" aria-hidden="true" />
                                            <p className="text-sm">Aucune information de contact</p>
                                        </div>
                                    )}
                            </div>
                        </section>
                    )}

                    {/* ── Company Tab ── */}
                    {(activeTab === "company" || !contact) && company && (
                        <section
                            id="tabpanel-company"
                            role="tabpanel"
                            aria-labelledby="tab-company"
                            tabIndex={0}
                            className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-1"
                            style={{ animation: "uadSectionIn 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
                        >
                            {/* No contact prompt */}
                            {!contact && (
                                <div className="mx-4 mt-4 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                                            <User className="w-4 h-4 text-indigo-600" aria-hidden="true" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-900 text-sm">
                                                Aucun contact associé
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                Ajoutez un contact pour enregistrer des actions.
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="primary"
                                        onClick={() => setShowAddContact(true)}
                                        className="gap-2 shrink-0"
                                    >
                                        <Plus className="w-4 h-4" aria-hidden="true" />
                                        Ajouter
                                    </Button>
                                </div>
                            )}

                            {/* Company header */}
                            <div className="flex items-start gap-4 p-4 border-b border-slate-100 bg-gradient-to-r from-violet-50/40 to-transparent">
                                <div
                                    className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center shrink-0 shadow-md ring-2 ring-white"
                                    aria-hidden="true"
                                >
                                    <Building2 className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    {isEditingCompany ? (
                                        <div className="space-y-2">
                                            <input
                                                type="text"
                                                value={editCompanyData.name || ""}
                                                onChange={(e) =>
                                                    setEditCompanyData({ ...editCompanyData, name: e.target.value })
                                                }
                                                placeholder="Nom de la société"
                                                aria-label="Nom de la société"
                                                className="w-full px-2.5 py-1.5 text-sm font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                            />
                                            <input
                                                type="text"
                                                value={editCompanyData.industry || ""}
                                                onChange={(e) =>
                                                    setEditCompanyData({ ...editCompanyData, industry: e.target.value })
                                                }
                                                placeholder="Secteur d'activité"
                                                aria-label="Secteur d'activité"
                                                className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                                                {company.name}
                                            </h3>
                                            {company.industry && (
                                                <p className="text-xs text-slate-500 mt-0.5">{company.industry}</p>
                                            )}
                                            <div className="mt-1.5">
                                                <StatusPill status={company.status} />
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    {isEditingCompany ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setIsEditingCompany(false)}
                                                disabled={saveCompanyMutation.isPending}
                                                aria-label="Annuler les modifications"
                                                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                                            >
                                                <X className="w-4 h-4" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleSaveCompany}
                                                disabled={saveCompanyMutation.isPending}
                                                aria-label="Sauvegarder la société"
                                                className="w-8 h-8 flex items-center justify-center bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                                            >
                                                {saveCompanyMutation.isPending ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                                                ) : (
                                                    <Save className="w-4 h-4" aria-hidden="true" />
                                                )}
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditCompanyData({
                                                    name: company.name,
                                                    industry: company.industry,
                                                    country: company.country,
                                                    website: company.website,
                                                    size: company.size,
                                                    phone: company.phone,
                                                });
                                                setIsEditingCompany(true);
                                            }}
                                            aria-label="Modifier la société"
                                            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                                        >
                                            <Pencil className="w-4 h-4" aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Company fields */}
                            <div>
                                {(company.phone || isEditingCompany) && (
                                    <InfoRow
                                        icon={Phone}
                                        iconColor="text-emerald-600"
                                        iconBg="bg-emerald-50"
                                        label="Téléphone"
                                        editing={isEditingCompany}
                                        action={
                                            !isEditingCompany && company.phone ? (
                                                <CopyButton text={company.phone} label="Téléphone société" />
                                            ) : undefined
                                        }
                                    >
                                        {isEditingCompany ? (
                                            <input
                                                type="tel"
                                                value={editCompanyData.phone || ""}
                                                onChange={(e) =>
                                                    setEditCompanyData({ ...editCompanyData, phone: e.target.value })
                                                }
                                                placeholder="Numéro de téléphone"
                                                aria-label="Téléphone de la société"
                                                className="w-full mt-0.5 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                            />
                                        ) : (
                                            <a
                                                href={`tel:${company.phone}`}
                                                className="text-sm font-medium text-emerald-600 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 rounded"
                                            >
                                                {company.phone}
                                            </a>
                                        )}
                                    </InfoRow>
                                )}

                                {enableGooglePhoneLookup &&
                                    !isEditingCompany &&
                                    !companyHasPhone && (
                                        <div className="border-b border-slate-100 px-4 py-3">
                                            <GooglePhoneSuggestion
                                                companyId={company.id}
                                                companyName={company.name}
                                                onApplied={handleGooglePhoneApplied}
                                            />
                                        </div>
                                    )}

                                {(company.website || isEditingCompany) && (
                                    <InfoRow
                                        icon={Globe}
                                        iconColor="text-indigo-600"
                                        iconBg="bg-indigo-50"
                                        label="Site web"
                                        editing={isEditingCompany}
                                        action={
                                            !isEditingCompany && company.website ? (
                                                <a
                                                    href={
                                                        company.website.startsWith("http")
                                                            ? company.website
                                                            : `https://${company.website}`
                                                    }
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    aria-label="Ouvrir le site web dans un nouvel onglet"
                                                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                                                </a>
                                            ) : undefined
                                        }
                                    >
                                        {isEditingCompany ? (
                                            <input
                                                type="url"
                                                value={editCompanyData.website || ""}
                                                onChange={(e) =>
                                                    setEditCompanyData({ ...editCompanyData, website: e.target.value })
                                                }
                                                placeholder="Site web"
                                                aria-label="Site web de la société"
                                                className="w-full mt-0.5 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                            />
                                        ) : (
                                            <a
                                                href={
                                                    company.website!.startsWith("http")
                                                        ? company.website!
                                                        : `https://${company.website}`
                                                }
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm font-medium text-indigo-600 hover:underline truncate block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded"
                                            >
                                                {company.website}
                                            </a>
                                        )}
                                    </InfoRow>
                                )}

                                {/* Country + Size grid */}
                                <div className="grid grid-cols-2 border-b border-slate-100">
                                    <div className="flex items-center gap-3 px-4 py-3 border-r border-slate-100 hover:bg-slate-50/60 transition-colors">
                                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                                        <div className="w-full">
                                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Pays</p>
                                            {isEditingCompany ? (
                                                <input
                                                    type="text"
                                                    value={editCompanyData.country || ""}
                                                    onChange={(e) =>
                                                        setEditCompanyData({ ...editCompanyData, country: e.target.value })
                                                    }
                                                    placeholder="Pays"
                                                    aria-label="Pays"
                                                    className="w-full mt-0.5 px-2 py-1 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                                />
                                            ) : (
                                                <p className="text-sm font-medium text-slate-700">{company.country || "—"}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                                        <div className="w-full">
                                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Effectif</p>
                                            {isEditingCompany ? (
                                                <input
                                                    type="text"
                                                    value={editCompanyData.size || ""}
                                                    onChange={(e) =>
                                                        setEditCompanyData({ ...editCompanyData, size: e.target.value })
                                                    }
                                                    placeholder="Taille"
                                                    aria-label="Taille de l'effectif"
                                                    className="w-full mt-0.5 px-2 py-1 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                                />
                                            ) : (
                                                <p className="text-sm font-medium text-slate-700">{company.size || "—"}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Company custom data */}
                                {company.customData &&
                                    typeof company.customData === "object" &&
                                    Object.keys(company.customData).length > 0 &&
                                    !isEditingCompany && (
                                        <div className="px-4 py-3 bg-slate-50/60">
                                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                                                <FileText className="w-3 h-3" aria-hidden="true" />
                                                Infos supplémentaires
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {Object.entries(company.customData as Record<string, unknown>).map(
                                                    ([key, value]) => {
                                                        if (value == null || value === "") return null;
                                                        return (
                                                            <div
                                                                key={key}
                                                                className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[11px] text-slate-700"
                                                            >
                                                                <span className="font-semibold text-slate-500 mr-1">
                                                                    {formatCustomLabel(key)}:
                                                                </span>
                                                                <span>{String(value)}</span>
                                                            </div>
                                                        );
                                                    }
                                                )}
                                            </div>
                                        </div>
                                    )}

                                {/* Other contacts */}
                                {company.contacts?.length > 0 && (
                                    <div className="px-4 py-3 border-t border-slate-100">
                                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                                            <Users className="w-3 h-3" aria-hidden="true" />
                                            Autres contacts ({company.contacts.length})
                                        </p>
                                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                                            {company.contacts.slice(0, 5).map((c) => (
                                                <div key={c.id} className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
                                                    <div
                                                        className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-100/70 transition-colors cursor-pointer"
                                                        onClick={() => {
                                                            if (expandedCompanyContactId === c.id) {
                                                                onContactSelect?.(c.id);
                                                                return;
                                                            }
                                                            setExpandedCompanyContactId(c.id);
                                                        }}
                                                        role="button"
                                                        tabIndex={0}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter" || e.key === " ") {
                                                                e.preventDefault();
                                                                if (expandedCompanyContactId === c.id) {
                                                                    onContactSelect?.(c.id);
                                                                } else {
                                                                    setExpandedCompanyContactId(c.id);
                                                                }
                                                            }
                                                        }}
                                                    >
                                                        <div
                                                            className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 shrink-0"
                                                            aria-hidden="true"
                                                        >
                                                            {(c.firstName?.[0] || c.lastName?.[0] || "?").toUpperCase()}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium text-slate-800 truncate">
                                                                {c.firstName || ""} {c.lastName || ""}
                                                            </p>
                                                            {c.title && (
                                                                <p className="text-xs text-slate-400 truncate">{c.title}</p>
                                                            )}
                                                        </div>
                                                        {expandedCompanyContactId === c.id ? (
                                                            <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                                                        ) : (
                                                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                                                        )}
                                                    </div>
                                                    {expandedCompanyContactId === c.id && (
                                                        <div className="px-3 pb-2.5 pt-1 border-t border-slate-200 bg-white">
                                                            <div className="space-y-1.5 text-xs text-slate-600">
                                                                <p className="font-medium text-slate-700">
                                                                    {`${c.firstName || ""} ${c.lastName || ""}`.trim() || "Sans nom"}
                                                                </p>
                                                                {c.phone && (
                                                                    <p className="flex items-center gap-1.5">
                                                                        <Phone className="w-3 h-3 text-emerald-500" />
                                                                        {c.phone}
                                                                    </p>
                                                                )}
                                                                {c.email && (
                                                                    <p className="flex items-center gap-1.5">
                                                                        <Mail className="w-3 h-3 text-indigo-500" />
                                                                        {c.email}
                                                                    </p>
                                                                )}
                                                                {!c.phone && !c.email && (
                                                                    <p className="text-slate-400">Aucun téléphone/email</p>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                                                                {c.phone && (
                                                                    <a
                                                                        href={`tel:${c.phone}`}
                                                                        aria-label={`Appeler ${c.firstName || c.lastName || "contact"}`}
                                                                        className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                                                                    >
                                                                        <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                                                                    </a>
                                                                )}
                                                                {c.email && (
                                                                    <a
                                                                        href={`mailto:${c.email}`}
                                                                        aria-label={`Envoyer un email à ${c.firstName || c.lastName || "contact"}`}
                                                                        className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                                                                    >
                                                                        <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                                                                    </a>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleBadContact(c.id);
                                                                    }}
                                                                    title="Mauvais contact"
                                                                    aria-label={`Marquer ${c.firstName || c.lastName || "contact"} comme mauvais contact`}
                                                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                                >
                                                                    <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowAddContact(true)}
                                            className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 text-sm font-medium transition-colors"
                                        >
                                            <Plus className="w-4 h-4" aria-hidden="true" />
                                            Ajouter un nouveau contact
                                        </button>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {/* ── Record Action Section ── */}
                    <section
                        aria-label="Enregistrer une action"
                        className="rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden ring-1 ring-indigo-50"
                        style={{ animation: "uadSectionIn 250ms 150ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
                    >
                        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-indigo-50/40 to-white">
                            <div
                                className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-sm"
                                aria-hidden="true"
                            >
                                <MessageSquare className="w-3.5 h-3.5 text-white" />
                            </div>
                            <h2 className="text-sm font-bold text-slate-900" id="record-action-heading">Enregistrer une action</h2>
                            {newActionResult && (
                                <span className="ml-auto text-[10px] font-semibold text-indigo-500 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                                    {statusLabels[newActionResult] ?? newActionResult}
                                </span>
                            )}
                        </div>

                        <div className="p-4">
                            {campaignsLoading ? (
                                <div className="space-y-3 py-2">
                                    <TextSkeleton lines={1} className="h-9 w-full" />
                                    <TextSkeleton lines={2} />
                                </div>
                            ) : campaigns.length === 0 ? (
                                <p className="text-sm text-slate-500 py-4 text-center">
                                    Aucune campagne disponible pour cette mission.
                                </p>
                            ) : (
                                <div className="space-y-4">
                                    {/* Outcome chips */}
                                    <fieldset>
                                        <legend className="text-xs font-bold text-slate-700 mb-2.5 uppercase tracking-wider flex items-center gap-1.5">
                                            Résultat <span className="text-red-500" aria-hidden="true">*</span>
                                            <span className="sr-only">(obligatoire)</span>
                                        </legend>
                                        <div
                                            className="flex flex-wrap gap-2"
                                            role="radiogroup"
                                            aria-label="Sélectionnez le résultat de l'action"
                                            aria-required="true"
                                        >
                                            {statusOptions.map((opt) => {
                                                const cfg =
                                                    RESULT_CHIP_CONFIG[opt.value] ||
                                                    RESULT_CHIP_CONFIG.NO_RESPONSE;
                                                const Icon = cfg.icon;
                                                const isSelected = newActionResult === opt.value;
                                                const chipButton = (
                                                    <button
                                                        key={opt.value}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={isSelected}
                                                        onClick={() => {
                                                            setNewActionResult(opt.value);
                                                        }}
                                                        className={cn(
                                                            "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                                                            isSelected
                                                                ? cn(
                                                                    cfg.selectedBg,
                                                                    cfg.selectedText,
                                                                    cfg.selectedBorder,
                                                                    "ring-1 shadow-sm scale-[1.02]",
                                                                    `focus-visible:ring-${cfg.dot.replace("bg-", "")}`
                                                                )
                                                                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm active:scale-[0.98]"
                                                        )}
                                                    >
                                                        <Icon
                                                            className={cn("w-3.5 h-3.5 shrink-0", isSelected ? cfg.selectedText : "text-slate-400")}
                                                            aria-hidden="true"
                                                        />
                                                        {opt.label}
                                                    </button>
                                                );
                                                if (!opt.title) return chipButton;
                                                return (
                                                    <Tooltip
                                                        key={`${opt.value}-tooltip`}
                                                        position="top"
                                                        maxWidth="max-w-sm"
                                                        content={
                                                            <div className="space-y-1">
                                                                {opt.title.split("\n").map((line, idx) => (
                                                                    <p key={`${opt.value}-${idx}`} className="text-xs leading-relaxed">
                                                                        {line}
                                                                    </p>
                                                                ))}
                                                            </div>
                                                        }
                                                    >
                                                        {chipButton}
                                                    </Tooltip>
                                                );
                                            })}
                                        </div>
                                    </fieldset>

                                    {/* ── Inline email panel: mailbox + template picker ── */}
                                    {newActionResult === "ENVOIE_MAIL" && (
                                        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 space-y-3">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <Mail className="w-4 h-4 text-blue-600" aria-hidden="true" />
                                                <span className="text-sm font-semibold text-blue-800">Envoyer un email</span>
                                            </div>

                                            {/* Recipient display */}
                                            {contact?.email ? (
                                                <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
                                                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                    <span className="font-medium text-slate-700">À :</span>
                                                    <span className="truncate">{contact.email}</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                    Ce contact n&apos;a pas d&apos;adresse email enregistrée
                                                </div>
                                            )}

                                            {/* Mailbox selector */}
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Boîte d&apos;envoi <span className="text-red-500">*</span></label>
                                                {emailMailboxesLoading ? (
                                                    <div className="flex items-center gap-2 text-xs text-slate-500 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement...</div>
                                                ) : emailMailboxes.length === 0 ? (
                                                    <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                                                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                        Aucune boîte mail configurée
                                                    </div>
                                                ) : (
                                                    <select
                                                        value={emailSelectedMailboxId}
                                                        onChange={e => setEmailSelectedMailboxId(e.target.value)}
                                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400"
                                                    >
                                                        {emailMailboxes.map(mb => (
                                                            <option key={mb.id} value={mb.id}>
                                                                {mb.displayName ? `${mb.displayName} <${mb.email}>` : mb.email}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>

                                            {/* Template selector */}
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Template <span className="text-red-500">*</span></label>
                                                {emailTemplatesLoading ? (
                                                    <div className="flex items-center gap-2 text-xs text-slate-500 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement des templates...</div>
                                                ) : emailTemplates.length === 0 ? (
                                                    <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                                                        <FileText className="w-3.5 h-3.5 shrink-0" />
                                                        Aucun template assigné à cette mission
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                                                        {emailTemplates.map(mt => {
                                                            const isSelected = emailSelectedTemplateId === mt.templateId;
                                                            const isPreviewing = emailPreviewTemplateId === mt.templateId;
                                                            const catColors: Record<string, string> = {
                                                                OUTREACH: "bg-blue-100 text-blue-700",
                                                                FOLLOW_UP: "bg-amber-100 text-amber-700",
                                                                NURTURE: "bg-violet-100 text-violet-700",
                                                                CLOSING: "bg-emerald-100 text-emerald-700",
                                                                OTHER: "bg-slate-100 text-slate-600",
                                                            };
                                                            return (
                                                                <div key={mt.id}>
                                                                    <div
                                                                        role="button"
                                                                        tabIndex={0}
                                                                        onClick={() => {
                                                                            setEmailSelectedTemplateId(mt.templateId);
                                                                            setEmailPreviewTemplateId("");
                                                                        }}
                                                                        onKeyDown={e => e.key === "Enter" && setEmailSelectedTemplateId(mt.templateId)}
                                                                        className={cn(
                                                                            "flex items-start gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-all",
                                                                            isSelected
                                                                                ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300"
                                                                                : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
                                                                        )}
                                                                    >
                                                                        <div className={cn("mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all", isSelected ? "border-blue-500 bg-blue-500" : "border-slate-300")}>
                                                                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <span className="text-sm font-medium text-slate-800 truncate">{mt.template.name}</span>
                                                                                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0", catColors[mt.template.category] ?? catColors.OTHER)}>
                                                                                    {mt.template.category}
                                                                                </span>
                                                                            </div>
                                                                            <p className="text-xs text-slate-500 truncate mt-0.5">Objet : {mt.template.subject}</p>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={e => { e.stopPropagation(); setEmailPreviewTemplateId(isPreviewing ? "" : mt.templateId); }}
                                                                            className="shrink-0 p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                                                            title={isPreviewing ? "Masquer l'aperçu" : "Voir l'aperçu"}
                                                                        >
                                                                            {isPreviewing ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                                        </button>
                                                                    </div>
                                                                    {isPreviewing && (
                                                                        <div className="mt-1 border border-blue-200 rounded-lg overflow-hidden">
                                                                            <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex items-center gap-1.5">
                                                                                <div className="w-2 h-2 rounded-full bg-red-400" /><div className="w-2 h-2 rounded-full bg-amber-400" /><div className="w-2 h-2 rounded-full bg-emerald-400" />
                                                                                <span className="text-[11px] text-slate-500 ml-1">Aperçu</span>
                                                                            </div>
                                                                            <div
                                                                                className="bg-white p-3 max-h-48 overflow-y-auto text-sm prose prose-sm max-w-none"
                                                                                style={{ fontFamily: "Arial, sans-serif", fontSize: "13px", lineHeight: "1.5" }}
                                                                                dangerouslySetInnerHTML={{ __html: mt.template.bodyHtml }}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Send button */}
                                            <div className="flex gap-2 pt-1 border-t border-blue-200">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSendEmailAndRecord(false)}
                                                    disabled={sendEmailMutation.isPending || !contact?.email || !emailSelectedMailboxId || !getChosenTemplateId()}
                                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all"
                                                >
                                                    {sendEmailMutation.isPending ? (
                                                        <><Loader2 className="w-4 h-4 animate-spin" /> Envoi...</>
                                                    ) : (
                                                        <><Send className="w-4 h-4" /> Envoyer l&apos;email</>
                                                    )}
                                                </button>
                                                {onValidateAndNext && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSendEmailAndRecord(true)}
                                                        disabled={sendEmailMutation.isPending || !contact?.email || !emailSelectedMailboxId || !getChosenTemplateId()}
                                                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all"
                                                    >
                                                        {sendEmailMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                                                        Envoyer &amp; Suivant
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Contextual: callback date */}
                                    {isCallbackResult(newActionResult) && (
                                        <div
                                            role="group"
                                            aria-label="Date de rappel"
                                            className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5"
                                        >
                                            <DateTimePicker
                                                label="Date de rappel"
                                                value={newCallbackDateValue}
                                                onChange={setNewCallbackDateValue}
                                                placeholder="Choisir date et heure du rappel…"
                                                triggerClassName="border-amber-200 focus:ring-amber-400/40 focus:border-amber-400"
                                            />
                                            <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                                Optionnel. Vous pouvez aussi indiquer la date dans la note.
                                            </p>
                                        </div>
                                    )}

                                    {/* Contextual: meeting booking — always shown for MEETING_BOOKED */}
                                    {newActionResult === "MEETING_BOOKED" && (
                                        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-3">
                                            {/* Calendar button — only when a booking URL or at least one interlocuteur calendar exists */}
                                            {(clientBookingUrl || clientInterlocuteurs?.some(i => (i.bookingLinks?.length ?? 0) > 0)) && (contactId && contact || companyId && company) && (
                                                <>
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        onClick={() => setShowBookingDrawer(true)}
                                                        className="gap-2 w-full"
                                                    >
                                                        <Calendar className="w-4 h-4" aria-hidden="true" />
                                                        Ouvrir le calendrier client
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {newActionResult === "MAUVAIS_INTERLOCUTEUR" && (
                                        <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5 space-y-3">
                                            <div className="flex items-start gap-2">
                                                <Info className="w-4 h-4 text-rose-600 mt-0.5" aria-hidden="true" />
                                                <div>
                                                    <p className="text-sm font-semibold text-rose-800">Ajouter le bon contact</p>
                                                    <p className="text-xs text-rose-700/90">
                                                        Renseignez les informations du bon interlocuteur puis enregistrez-le.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                <input
                                                    value={newInterlocutorContact.firstName}
                                                    onChange={(e) => {
                                                        setInterlocutorContactSaved(false);
                                                        setNewInterlocutorContact((prev) => ({ ...prev, firstName: e.target.value }));
                                                    }}
                                                    placeholder="Prénom"
                                                    className="w-full px-3 py-2 text-sm border border-rose-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400"
                                                />
                                                <input
                                                    value={newInterlocutorContact.lastName}
                                                    onChange={(e) => {
                                                        setInterlocutorContactSaved(false);
                                                        setNewInterlocutorContact((prev) => ({ ...prev, lastName: e.target.value }));
                                                    }}
                                                    placeholder="Nom"
                                                    className="w-full px-3 py-2 text-sm border border-rose-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400"
                                                />
                                                <input
                                                    value={newInterlocutorContact.phone}
                                                    onChange={(e) => {
                                                        setInterlocutorContactSaved(false);
                                                        setNewInterlocutorContact((prev) => ({ ...prev, phone: e.target.value }));
                                                    }}
                                                    placeholder="Téléphone"
                                                    className="w-full px-3 py-2 text-sm border border-rose-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400"
                                                />
                                                <input
                                                    type="email"
                                                    value={newInterlocutorContact.email}
                                                    onChange={(e) => {
                                                        setInterlocutorContactSaved(false);
                                                        setNewInterlocutorContact((prev) => ({ ...prev, email: e.target.value }));
                                                    }}
                                                    placeholder="Email"
                                                    className="w-full px-3 py-2 text-sm border border-rose-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-400"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-[11px] text-rose-700/80">
                                                    Renseignez au moins un nom (prénom/nom) et un canal (téléphone/email).
                                                </p>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    onClick={() => createInterlocutorContactMutation.mutate()}
                                                    disabled={!canCreateInterlocutorContact}
                                                    isLoading={createInterlocutorContactMutation.isPending}
                                                    className="gap-2 shrink-0 border-rose-300 text-rose-700 hover:bg-rose-100"
                                                >
                                                    <Save className="w-4 h-4" aria-hidden="true" />
                                                    Sauvegarder le contact
                                                </Button>
                                            </div>
                                            {requiresSavedInterlocutorBeforeSubmit && (
                                                <p className="text-[11px] text-rose-700">
                                                    Sauvegardez d&apos;abord le nouveau contact pour pouvoir enregistrer l&apos;action.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Note */}
                                    {newActionResult !== "ENVOIE_MAIL" && (
                                    <div>
                                        <label
                                            htmlFor="action-note"
                                            className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider"
                                        >
                                            {isRefusalResult ? "Raison du refus" : isOutOfTargetResult ? "Raison du hors cible" : "Note"}
                                            {textFieldRequiredForResult && (
                                                <span className="text-red-500 ml-1" aria-hidden="true">*</span>
                                            )}
                                            {textFieldRequiredForResult && (
                                                <span className="sr-only"> (obligatoire)</span>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <textarea
                                                id="action-note"
                                                ref={noteRef}
                                                value={newActionNote}
                                                onChange={(e) => setNewActionNote(e.target.value)}
                                                placeholder={notePlaceholder}
                                                rows={3}
                                                maxLength={500}
                                                aria-required={textFieldRequiredForResult}
                                                aria-describedby="note-char-count"
                                                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 resize-none transition-all"
                                            />
                                        </div>
                                        {linkedAlloCall && (
                                            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 mt-2">
                                                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                                    <PhoneCall className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-xs font-semibold text-emerald-800">Appel Allo validé</span>
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
                                                    className="w-6 h-6 rounded flex items-center justify-center text-emerald-400 hover:text-emerald-700 transition-colors flex-shrink-0"
                                                    title="Retirer le lien"
                                                    aria-label="Retirer l'appel Allo sélectionné"
                                                >
                                                    <XCircle className="w-4 h-4" aria-hidden="true" />
                                                </button>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={handleImproveNote}
                                                disabled={newActionNote.trim().length < MIN_NOTE_LENGTH_FOR_AI_ENHANCE || improveNoteMutation.isPending}
                                                aria-label="Améliorer la note avec l'IA"
                                                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded-lg px-2 py-1 hover:bg-indigo-50 border border-transparent hover:border-indigo-100"
                                            >
                                                {improveNoteMutation.isPending ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                                                ) : (
                                                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                                                )}
                                                {improveNoteMutation.isPending ? "Amélioration…" : "Améliorer avec l'IA"}
                                            </button>
                                            {isCallCampaign && (
                                                <button
                                                    type="button"
                                                    onClick={openAlloDialog}
                                                    className={cn(
                                                        "flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1 border transition-all",
                                                        linkedAlloCall
                                                            ? "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                                                            : "text-indigo-600 bg-indigo-50 border-indigo-100 hover:bg-indigo-100"
                                                    )}
                                                >
                                                    <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
                                                    {linkedAlloCall ? "Appel validé ✓" : "Valider l'appel (Allo)"}
                                                </button>
                                            )}
                                            <p
                                                id="note-char-count"
                                                className="text-xs text-slate-400 ml-auto"
                                                aria-live="polite"
                                                aria-atomic="true"
                                            >
                                                {newActionNote.length}/500
                                            </p>
                                        </div>
                                    </div>
                                    )}

                                    {/* Submit — hidden when ENVOIE_MAIL (email panel has its own send) */}
                                    {newActionResult !== "ENVOIE_MAIL" && (
                                    <div className="flex flex-col sm:flex-row gap-2 pt-3 mt-1 border-t border-indigo-100">
                                        <Button
                                            type="button"
                                            variant="primary"
                                            onClick={() => handleAddAction(false)}
                                            disabled={!canSubmit}
                                            isLoading={addActionMutation.isPending}
                                            className={cn(
                                                "gap-2 shadow-sm transition-all duration-200",
                                                canSubmit && "hover:shadow-md hover:scale-[1.01]",
                                                onValidateAndNext ? "flex-1" : "w-full"
                                            )}
                                        >
                                            <Check className="w-4 h-4" aria-hidden="true" />
                                            Enregistrer
                                        </Button>
                                        {onValidateAndNext && (
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={() => handleAddAction(true)}
                                                disabled={!canSubmit}
                                                isLoading={addActionMutation.isPending}
                                                className="gap-2 flex-1 shadow-sm"
                                            >
                                                <ChevronRight className="w-4 h-4" aria-hidden="true" />
                                                Valider & suivant
                                            </Button>
                                        )}
                                    </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>

                </div>
            )}

            {/* ── Modals ── */}
            {company && (
                <ContactDrawer
                    isOpen={showAddContact}
                    onClose={() => setShowAddContact(false)}
                    contact={null}
                    isCreating={true}
                    companies={[{ id: company.id, name: company.name }]}
                    isManager={true}
                    enableGooglePhoneLookup={enableGooglePhoneLookup}
                    onCreate={async (newContact) => {
                        setShowAddContact(false);
                        setActiveTab("contact");
                        onActionRecorded?.();
                        queryClient.invalidateQueries({ queryKey: sdrUnifiedDrawerCompanyKey(companyId) });
                        queryClient.invalidateQueries({ queryKey: sdrUnifiedDrawerContactKey((newContact as Contact).id) });
                        queryClient.invalidateQueries({ queryKey: actionsQueryKey });
                    }}
                />
            )}

            {(contactId && contact || companyId && company) && (clientBookingUrl || clientInterlocuteurs?.some(i => (i.bookingLinks?.length ?? 0) > 0)) && (
                <BookingDrawer
                    isOpen={showBookingDrawer}
                    onClose={() => setShowBookingDrawer(false)}
                    bookingUrl={clientBookingUrl || ""}
                    contactId={contactId ?? undefined}
                    companyId={companyId}
                    contactName={contact
                        ? `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || "Contact"
                        : (company?.name ?? "Société")}
                    contactInfo={
                        contact
                            ? {
                                  firstName: contact.firstName ?? null,
                                  lastName: contact.lastName ?? null,
                                  email: contact.email ?? null,
                                  phone: contact.phone ?? null,
                                  title: contact.title ?? null,
                                  companyName: company?.name ?? null,
                                  companyEmail: company?.email ?? null,
                                  companyPhone: company?.phone ?? null,
                              }
                            : undefined
                    }
                    rdvDate={rdvDate || undefined}
                    meetingType={meetingType || undefined}
                    meetingCategory={meetingCat || undefined}
                    meetingAddress={meetingType === "PHYSIQUE" ? meetingAddress : undefined}
                    meetingJoinUrl={meetingType === "VISIO" ? meetingJoinUrl : undefined}
                    meetingPhone={meetingType === "TELEPHONIQUE" ? (meetingPhone || contact?.phone || company?.phone || undefined) : undefined}
                    onRdvDateChange={setRdvDate}
                    onMeetingTypeChange={setMeetingType}
                    onMeetingCategoryChange={setMeetingCat}
                    onMeetingAddressChange={setMeetingAddress}
                    onMeetingJoinUrlChange={setMeetingJoinUrl}
                    onMeetingPhoneChange={setMeetingPhone}
                    interlocuteurs={clientInterlocuteurs}
                    onBookingSuccess={() => {
                        setShowBookingDrawer(false);
                        setNewActionResult("");
                        setNewActionNote("");
                        setRdvDate("");
                        setMeetingType("");
                        setMeetingCat("");
                        setMeetingJoinUrl("");
                        setMeetingAddress("");
                        setMeetingPhone("");
                        onActionRecorded?.();
                        queryClient.invalidateQueries({ queryKey: actionsQueryKey });
                    }}
                />
            )}

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

            <Modal
                isOpen={!!deleteConfirmActionId}
                onClose={() => setDeleteConfirmActionId(null)}
                title="Supprimer cette action ?"
                size="sm"
            >
                <p className="text-sm text-slate-600">
                    Cette entrée de l&apos;historique sera définitivement supprimée. Cette action est irréversible.
                </p>
                <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-100">
                    <Button variant="ghost" onClick={() => setDeleteConfirmActionId(null)} disabled={deleteActionMutation.isPending}>
                        Annuler
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => deleteConfirmActionId && deleteActionMutation.mutate(deleteConfirmActionId)}
                        disabled={deleteActionMutation.isPending}
                        className="gap-2 bg-red-600 hover:bg-red-700 text-white"
                    >
                        {deleteActionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        Supprimer
                    </Button>
                </div>
            </Modal>

        </Drawer>
    );
}

export default UnifiedActionDrawer;
