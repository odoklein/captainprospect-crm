"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useToast } from "@/components/ui";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import {
    Loader2,
    Calendar,
    X,
    Mail,
    Phone,
    Building2,
    CheckCircle2,
    Copy,
    Video,
    MapPin,
    Clock,
    User,
    Check,
    CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trackMeetingBooked } from "@/lib/openreplay/events";

// ============================================
// TYPES
// ============================================

export interface BookingContactInfo {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    title?: string | null;
    companyName?: string | null;
    companyEmail?: string | null;
    companyPhone?: string | null;
    linkedin?: string | null;
    website?: string | null;
}

export interface SdrBookingLink {
    label: string;
    url: string;
    durationMinutes: number;
}

export interface SdrContactEntry {
    value: string;
    label: string;
    isPrimary: boolean;
}

export interface SdrInterlocuteur {
    id: string;
    firstName: string;
    lastName: string;
    title?: string;
    department?: string;
    territory?: string;
    emails: SdrContactEntry[];
    phones: SdrContactEntry[];
    bookingLinks: SdrBookingLink[];
    notes?: string;
    isActive: boolean;
}

interface BookingDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    bookingUrl: string;
    contactId?: string;
    companyId?: string;
    contactName: string;
    contactInfo?: BookingContactInfo;
    rdvDate?: string;
    meetingType?: "VISIO" | "PHYSIQUE" | "TELEPHONIQUE";
    meetingCategory?: "EXPLORATOIRE" | "BESOIN";
    meetingAddress?: string;
    meetingJoinUrl?: string;
    meetingPhone?: string;
    onRdvDateChange?: (value: string) => void;
    onMeetingTypeChange?: (value: "VISIO" | "PHYSIQUE" | "TELEPHONIQUE" | "") => void;
    onMeetingCategoryChange?: (value: "EXPLORATOIRE" | "BESOIN" | "") => void;
    onMeetingAddressChange?: (value: string) => void;
    onMeetingJoinUrlChange?: (value: string) => void;
    onMeetingPhoneChange?: (value: string) => void;
    onBookingSuccess?: () => void;
    interlocuteurs?: SdrInterlocuteur[];
}

interface CalendarOption {
    id: string;
    label: string;
    sublabel?: string;
    url: string;
    interlocuteurId?: string;
    initials?: string;
    avatarColor?: string;
}

const AVATAR_COLORS = [
    "bg-indigo-100 text-indigo-700",
    "bg-rose-100 text-rose-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-purple-100 text-purple-700",
    "bg-cyan-100 text-cyan-700",
];

function hashStr(s: string) {
    return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

function getEmbedBookingUrl(rawUrl: string): string {
    try {
        const url = new URL(rawUrl);
        if (url.hostname.endsWith("cal.com") || url.hostname === "cal.com") {
            url.searchParams.set("embed", "true");
        }
        if (url.hostname.endsWith("calendly.com") || url.hostname === "calendly.com") {
            url.searchParams.set("embed_domain", typeof window !== "undefined" ? window.location.hostname : "localhost");
            url.searchParams.set("embed_type", "Inline");
            url.searchParams.set("hide_gdpr_banner", "1");
        }
        return url.toString();
    } catch {
        return rawUrl;
    }
}

// ── Typewriter hook
function useTypewriter(text: string, speed = 22, startDelay = 0) {
    const [displayed, setDisplayed] = useState("");
    const [done, setDone] = useState(false);

    useEffect(() => {
        setDisplayed("");
        setDone(false);
        if (!text) { setDone(true); return; }

        let i = 0;
        let timeout: ReturnType<typeof setTimeout>;

        const tick = () => {
            i++;
            setDisplayed(text.slice(0, i));
            if (i < text.length) {
                timeout = setTimeout(tick, speed);
            } else {
                setDone(true);
            }
        };

        const start = setTimeout(tick, startDelay);
        return () => { clearTimeout(start); clearTimeout(timeout); };
    }, [text, speed, startDelay]);

    return { displayed, done };
}

// ── Typewriter line component — renders char by char, then shows children after done
function TypewriterLine({
    text,
    speed = 22,
    delay = 0,
    className,
    afterDone,
}: {
    text: string;
    speed?: number;
    delay?: number;
    className?: string;
    afterDone?: React.ReactNode;
}) {
    const { displayed, done } = useTypewriter(text, speed, delay);
    return (
        <span className={className}>
            {displayed}
            {!done && (
                <span className="inline-block w-[1px] h-[0.85em] bg-current opacity-70 ml-[1px] animate-pulse align-middle" />
            )}
            {done && afterDone}
        </span>
    );
}

// ── Copy pill button
function CopyPill({ text, label }: { text: string; label: string }) {
    const { success } = useToast();
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            onClick={() => {
                navigator.clipboard.writeText(text);
                success("Copié", `${label} dans le presse-papier`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }}
            title={`Copier ${label}`}
            className="ml-auto shrink-0 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded transition-colors"
        >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        </button>
    );
}

// ── Animated fade-in wrapper (appears after a delay)
function FadeIn({ delay = 0, children, className }: { delay?: number; children: React.ReactNode; className?: string }) {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setVisible(true), delay);
        return () => clearTimeout(t);
    }, [delay]);
    return (
        <div
            className={cn("transition-all duration-500", visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1", className)}
        >
            {children}
        </div>
    );
}

// ── Format date for display
function formatRdvDate(iso: string): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

const MEETING_TYPE_LABELS: Record<string, { label: string; icon: React.ElementType; colorClass: string }> = {
    VISIO: { label: "Visio", icon: Video, colorClass: "text-indigo-600" },
    PHYSIQUE: { label: "Physique", icon: MapPin, colorClass: "text-emerald-600" },
    TELEPHONIQUE: { label: "Téléphonique", icon: Phone, colorClass: "text-amber-600" },
};

const MEETING_CATEGORY_LABELS: Record<string, string> = {
    EXPLORATOIRE: "Exploratoire",
    BESOIN: "Analyse de besoin",
};

// ── Extract date from calendar postMessage event data (client-side mirror of API's extractScheduledStartTime)
function extractDateFromEventData(eventData: unknown): string | null {
    if (!eventData || typeof eventData !== "object") return null;
    const data = eventData as Record<string, unknown>;
    const candidates = [
        data.invitee_start_time,
        data.start_time,
        data.startTime,
        data.scheduled_start,
        data.start,
        (data.payload as Record<string, unknown> | undefined)?.invitee_start_time,
        (data.payload as Record<string, unknown> | undefined)?.start_time,
        (data.event as Record<string, unknown> | undefined)?.start_time,
        (data.event as Record<string, unknown> | undefined)?.startTime,
    ];
    for (const c of candidates) {
        if (typeof c === "string") {
            const d = new Date(c);
            if (!Number.isNaN(d.getTime())) return d.toISOString();
        }
    }
    return null;
}

// ============================================
// BOOKING DRAWER
// ============================================

export function BookingDrawer({
    isOpen,
    onClose,
    bookingUrl,
    contactId,
    companyId,
    contactName,
    contactInfo,
    rdvDate,
    meetingType,
    meetingCategory,
    meetingAddress,
    meetingJoinUrl,
    meetingPhone,
    onRdvDateChange,
    onMeetingTypeChange,
    onMeetingCategoryChange,
    onMeetingAddressChange,
    onMeetingJoinUrlChange,
    onMeetingPhoneChange,
    onBookingSuccess,
    interlocuteurs,
}: BookingDrawerProps) {
    const { success, error: showError } = useToast();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [booked, setBooked] = useState(false);
    const [iframeLoading, setIframeLoading] = useState(true);

    const [rdvDateLocal, setRdvDateLocal] = useState<string>(rdvDate ?? "");
    const [meetingTypeLocal, setMeetingTypeLocal] = useState<"" | "VISIO" | "PHYSIQUE" | "TELEPHONIQUE">(meetingType ?? "");
    const [meetingCategoryLocal, setMeetingCategoryLocal] = useState<"" | "EXPLORATOIRE" | "BESOIN">(meetingCategory ?? "");
    const [meetingAddressLocal, setMeetingAddressLocal] = useState<string>(meetingAddress ?? "");
    const [meetingJoinUrlLocal, setMeetingJoinUrlLocal] = useState<string>(meetingJoinUrl ?? "");
    const [meetingPhoneLocal, setMeetingPhoneLocal] = useState<string>(meetingPhone ?? "");

    // Calendar-synced state: date extracted from calendar postMessage (eliminates double-typing)
    const [calendarSyncedDate, setCalendarSyncedDate] = useState<string>("");
    const [showManualDate, setShowManualDate] = useState(false);

    // Typewriter trigger key — reset on open so animation replays
    const [twKey, setTwKey] = useState(0);

    const activeInterlocuteurs = (interlocuteurs || []).filter(
        i => i.isActive && i.bookingLinks.length > 0
    );

    const bookingOptions: CalendarOption[] = [];
    if (bookingUrl?.trim()) {
        bookingOptions.push({
            id: "general",
            label: "Calendrier général",
            sublabel: "Lien de réservation client",
            url: bookingUrl,
            initials: "CG",
            avatarColor: "bg-slate-100 text-slate-600",
        });
    }
    activeInterlocuteurs.forEach((interl) => {
        const color = AVATAR_COLORS[hashStr(interl.id) % AVATAR_COLORS.length];
        const initials = `${interl.firstName[0]}${interl.lastName[0]}`.toUpperCase();
        interl.bookingLinks.forEach((bl, idx) => {
            bookingOptions.push({
                id: `${interl.id}-${idx}`,
                label: `${interl.firstName} ${interl.lastName}`,
                sublabel: `${bl.label} · ${bl.durationMinutes} min`,
                url: bl.url,
                interlocuteurId: interl.id,
                initials,
                avatarColor: color,
            });
        });
    });

    const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
    const selectedOption = bookingOptions.find(o => o.id === selectedOptionId) || bookingOptions[0] || null;
    const embedUrl = selectedOption ? getEmbedBookingUrl(selectedOption.url) : "";

    useEffect(() => {
        if (!isOpen) return;
        setBooked(false);
        setIsProcessing(false);
        setIframeLoading(true);
        setSelectedOptionId(bookingOptions[0]?.id ?? null);
        setTwKey(k => k + 1); // restart typewriter

        setRdvDateLocal(rdvDate ?? "");
        setMeetingTypeLocal(meetingType ?? "");
        setMeetingCategoryLocal(meetingCategory ?? "");
        setMeetingAddressLocal(meetingAddress ?? "");
        setMeetingJoinUrlLocal(meetingJoinUrl ?? "");
        setMeetingPhoneLocal(meetingPhone ?? "");
        setCalendarSyncedDate("");
        setShowManualDate(false);
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const effectiveRdvDate = onRdvDateChange ? (rdvDate ?? "") : rdvDateLocal;
    const effectiveMeetingType = onMeetingTypeChange ? (meetingType ?? "") : meetingTypeLocal;
    const effectiveMeetingCategory = onMeetingCategoryChange ? (meetingCategory ?? "") : meetingCategoryLocal;
    const effectiveMeetingAddress = onMeetingAddressChange ? (meetingAddress ?? "") : meetingAddressLocal;
    const effectiveMeetingJoinUrl = onMeetingJoinUrlChange ? (meetingJoinUrl ?? "") : meetingJoinUrlLocal;
    const effectiveMeetingPhone = onMeetingPhoneChange ? (meetingPhone ?? "") : meetingPhoneLocal;

    const setEffectiveRdvDate = (v: string) => { onRdvDateChange?.(v); if (!onRdvDateChange) setRdvDateLocal(v); };
    const setEffectiveMeetingType = (v: "" | "VISIO" | "PHYSIQUE" | "TELEPHONIQUE") => { onMeetingTypeChange?.(v); if (!onMeetingTypeChange) setMeetingTypeLocal(v); };
    const setEffectiveMeetingCategory = (v: "" | "EXPLORATOIRE" | "BESOIN") => { onMeetingCategoryChange?.(v); if (!onMeetingCategoryChange) setMeetingCategoryLocal(v); };
    const setEffectiveMeetingAddress = (v: string) => { onMeetingAddressChange?.(v); if (!onMeetingAddressChange) setMeetingAddressLocal(v); };
    const setEffectiveMeetingJoinUrl = (v: string) => { onMeetingJoinUrlChange?.(v); if (!onMeetingJoinUrlChange) setMeetingJoinUrlLocal(v); };
    const setEffectiveMeetingPhone = (v: string) => { onMeetingPhoneChange?.(v); if (!onMeetingPhoneChange) setMeetingPhoneLocal(v); };

    // Auto-fill phone from contact info when TELEPHONIQUE is selected (avoids re-typing known data)
    useEffect(() => {
        if (effectiveMeetingType === "TELEPHONIQUE" && !effectiveMeetingPhone && contactInfo?.phone) {
            setEffectiveMeetingPhone(contactInfo.phone);
        }
    }, [effectiveMeetingType]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSelectCalendar = useCallback((id: string) => {
        if (id === selectedOptionId) return;
        setIframeLoading(true);
        setSelectedOptionId(id);
    }, [selectedOptionId]);

    // Listen for booking completion postMessage
    useEffect(() => {
        if (!isOpen) return;
        const handleMessage = async (event: MessageEvent) => {
            const origin = event.origin;
            const isAllowed =
                origin === window.location.origin ||
                origin.endsWith(".calendly.com") ||
                origin === "https://calendly.com" ||
                origin.endsWith(".cal.com") ||
                origin === "https://cal.com";
            if (!isAllowed) return;

            const processBooking = async (eventData: unknown) => {
                setIsProcessing(true);
                try {
                    // Auto-extract date from calendar event → eliminates manual DateTimePicker entry
                    const extractedDate = extractDateFromEventData(eventData);
                    if (extractedDate) {
                        setCalendarSyncedDate(extractedDate);
                        setEffectiveRdvDate(extractedDate);
                    }
                    // Use extracted date immediately (state hasn't flushed yet)
                    const resolvedRdvDate = extractedDate || effectiveRdvDate;

                    if (effectiveMeetingType === "PHYSIQUE" && !effectiveMeetingAddress.trim()) {
                        showError("Adresse requise", "Veuillez renseigner une adresse pour un RDV physique.");
                        return;
                    }
                    const isoRdvDate = resolvedRdvDate ? new Date(resolvedRdvDate).toISOString() : undefined;
                    const res = await fetch("/api/actions/booking-success", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            ...(contactId && { contactId }),
                            ...(companyId && !contactId && { companyId }),
                            eventData,
                            rdvDate: isoRdvDate,
                            ...(effectiveMeetingType && { meetingType: effectiveMeetingType }),
                            ...(effectiveMeetingCategory && { meetingCategory: effectiveMeetingCategory }),
                            ...(effectiveMeetingAddress?.trim() && { meetingAddress: effectiveMeetingAddress.trim() }),
                            ...(effectiveMeetingJoinUrl?.trim() && { meetingJoinUrl: effectiveMeetingJoinUrl.trim() }),
                            ...(effectiveMeetingPhone?.trim() && { meetingPhone: effectiveMeetingPhone.trim() }),
                                    ...(selectedOption?.interlocuteurId && { interlocuteurId: selectedOption.interlocuteurId }),
                                    ...(selectedOption?.interlocuteurId && { interlocuteurName: selectedOption.label }),
                        }),
                    });
                    const json = await res.json();
                    if (json.success) {
                        setBooked(true);
                        success("Rendez-vous confirmé", `Le rendez-vous avec ${contactName} a été enregistré`);
                        trackMeetingBooked({
                            leadId: contactId || companyId || "",
                            companyName: contactInfo?.companyName || undefined,
                            contactName: contactName,
                            scheduledAt: effectiveRdvDate ? new Date(effectiveRdvDate).toISOString() : undefined,
                        });
                        onBookingSuccess?.();
                        setTimeout(onClose, 1800);
                    } else {
                        showError("Erreur", json.error || "Impossible d'enregistrer le rendez-vous");
                    }
                } catch (err) {
                    console.error("Failed to process booking:", err);
                    showError("Erreur", "Impossible d'enregistrer le rendez-vous");
                } finally {
                    setIsProcessing(false);
                }
            };

            if (event.data.event === "calendly.event_scheduled") await processBooking(event.data.payload);
            else if (event.data.type === "booking_success" || event.data.event === "booking.completed") await processBooking(event.data);
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [isOpen, contactId, companyId, contactName, effectiveRdvDate, effectiveMeetingType, effectiveMeetingCategory, effectiveMeetingAddress, effectiveMeetingJoinUrl, effectiveMeetingPhone, selectedOption, onBookingSuccess, onClose, success, showError]);

    const handleConfirmRdv = useCallback(async () => {
        if (effectiveMeetingType === "PHYSIQUE" && !effectiveMeetingAddress.trim()) {
            showError("Adresse requise", "Veuillez renseigner une adresse pour un RDV physique.");
            return;
        }
        setIsProcessing(true);
        try {
            const isoRdvDate = effectiveRdvDate ? new Date(effectiveRdvDate).toISOString() : undefined;
            const res = await fetch("/api/actions/booking-success", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(contactId && { contactId }),
                    ...(companyId && !contactId && { companyId }),
                    eventData: {},
                    rdvDate: isoRdvDate,
                    ...(effectiveMeetingType && { meetingType: effectiveMeetingType }),
                    ...(effectiveMeetingCategory && { meetingCategory: effectiveMeetingCategory }),
                    ...(effectiveMeetingAddress?.trim() && { meetingAddress: effectiveMeetingAddress.trim() }),
                    ...(effectiveMeetingJoinUrl?.trim() && { meetingJoinUrl: effectiveMeetingJoinUrl.trim() }),
                    ...(effectiveMeetingPhone?.trim() && { meetingPhone: effectiveMeetingPhone.trim() }),
                    ...(selectedOption?.interlocuteurId && { interlocuteurId: selectedOption.interlocuteurId }),
                    ...(selectedOption?.interlocuteurId && { interlocuteurName: selectedOption.label }),
                }),
            });
            const json = await res.json();
            if (json.success) {
                setBooked(true);
                success("Rendez-vous confirmé", `Le rendez-vous avec ${contactName} a été enregistré`);
                trackMeetingBooked({
                    leadId: contactId || companyId || "",
                    companyName: contactInfo?.companyName || undefined,
                    contactName: contactName,
                    scheduledAt: isoRdvDate,
                });
                onBookingSuccess?.();
                setTimeout(onClose, 1800);
            } else {
                showError("Erreur", json.error || "Impossible d'enregistrer le rendez-vous");
            }
        } catch (err) {
            console.error("Failed to process booking:", err);
            showError("Erreur", "Impossible d'enregistrer le rendez-vous");
        } finally {
            setIsProcessing(false);
        }
    }, [contactId, companyId, contactName, effectiveRdvDate, effectiveMeetingType, effectiveMeetingCategory, effectiveMeetingAddress, effectiveMeetingJoinUrl, effectiveMeetingPhone, selectedOption, onBookingSuccess, onClose, success, showError]);

    if (!isOpen) return null;

    // Build display name for typewriter
    const displayName = contactInfo?.firstName || contactInfo?.lastName
        ? `${contactInfo?.firstName ?? ""} ${contactInfo?.lastName ?? ""}`.trim()
        : contactName;

    const MeetingTypeIcon = effectiveMeetingType ? MEETING_TYPE_LABELS[effectiveMeetingType]?.icon : null;

    return (
        <>
            {/* Overlay */}
            <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

            {/* Dialog */}
            <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Planifier un RDV avec ${contactName}`}
                    className="w-full max-w-5xl h-[88vh] min-h-[560px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-indigo-600 text-white">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                                <CalendarCheck className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-base font-semibold">Planifier un rendez-vous</h2>
                                <p className="text-xs text-indigo-100 mt-0.5">
                                    {contactName}
                                    {contactInfo?.companyName ? ` — ${contactInfo.companyName}` : ""}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} aria-label="Fermer" className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-0 overflow-hidden">
                        {/* ── LEFT PANEL ── */}
                        <div className="p-4 border-r border-slate-200 flex flex-col gap-4 overflow-y-auto min-h-0">

                            {/* ── Contact card with typewriter ── */}
                            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2 text-xs text-slate-700">
                                <div className="flex items-start gap-2">
                                    <div className="mt-0.5 shrink-0">
                                        <User className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <div className="space-y-0.5 min-w-0">
                                        {/* Typewriter on name */}
                                        <p className="font-semibold text-slate-900 text-sm">
                                            <TypewriterLine key={`name-${twKey}`} text={displayName} speed={20} delay={80} />
                                        </p>
                                        {/* Title fades in after name */}
                                        {contactInfo?.title && (
                                            <FadeIn delay={displayName.length * 20 + 200}>
                                                <p className="text-[11px] text-slate-500">{contactInfo.title}</p>
                                            </FadeIn>
                                        )}
                                        {/* Email */}
                                        {contactInfo?.email && (
                                            <FadeIn delay={displayName.length * 20 + 320}>
                                                <p className="flex items-center gap-1">
                                                    <Mail className="w-3 h-3 text-indigo-500 shrink-0" />
                                                    <a href={`mailto:${contactInfo.email}`} className="truncate hover:text-indigo-600">
                                                        {contactInfo.email}
                                                    </a>
                                                    <CopyPill text={contactInfo.email} label="email" />
                                                </p>
                                            </FadeIn>
                                        )}
                                        {/* Phone */}
                                        {contactInfo?.phone && (
                                            <FadeIn delay={displayName.length * 20 + 440}>
                                                <p className="flex items-center gap-1">
                                                    <Phone className="w-3 h-3 text-emerald-500 shrink-0" />
                                                    <a href={`tel:${contactInfo.phone}`} className="truncate hover:text-emerald-600">
                                                        {contactInfo.phone}
                                                    </a>
                                                    <CopyPill text={contactInfo.phone} label="téléphone" />
                                                </p>
                                            </FadeIn>
                                        )}
                                    </div>
                                </div>

                                {/* Company section */}
                                {contactInfo?.companyName && (
                                    <FadeIn delay={displayName.length * 20 + 560}>
                                        <div className="pt-2 border-t border-slate-200/70 space-y-0.5">
                                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                                                <Building2 className="w-3 h-3 text-slate-400" />
                                                Société
                                            </div>
                                            <p className="text-sm font-semibold text-slate-900">{contactInfo.companyName}</p>
                                            {contactInfo.companyEmail && (
                                                <p className="flex items-center gap-1">
                                                    <Mail className="w-3 h-3 text-indigo-500 shrink-0" />
                                                    <a href={`mailto:${contactInfo.companyEmail}`} className="truncate hover:text-indigo-600">
                                                        {contactInfo.companyEmail}
                                                    </a>
                                                    <CopyPill text={contactInfo.companyEmail} label="email société" />
                                                </p>
                                            )}
                                            {contactInfo.companyPhone && (
                                                <p className="flex items-center gap-1">
                                                    <Phone className="w-3 h-3 text-emerald-500 shrink-0" />
                                                    <a href={`tel:${contactInfo.companyPhone}`} className="truncate hover:text-emerald-600">
                                                        {contactInfo.companyPhone}
                                                    </a>
                                                    <CopyPill text={contactInfo.companyPhone} label="téléphone société" />
                                                </p>
                                            )}
                                        </div>
                                    </FadeIn>
                                )}

                                {/* ── Live RDV summary — updates as user fills form ── */}
                                {(effectiveRdvDate || effectiveMeetingType || effectiveMeetingCategory) && (
                                    <div className="pt-2 border-t border-indigo-100 space-y-1.5 mt-1">
                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-500 uppercase tracking-wide">
                                            <Calendar className="w-3 h-3" />
                                            Récapitulatif RDV
                                        </div>

                                        {/* Date */}
                                        {effectiveRdvDate && (
                                            <p className="flex items-center gap-1.5 text-[11px] text-slate-700">
                                                <Clock className="w-3 h-3 text-indigo-400 shrink-0" />
                                                <span className="font-medium capitalize">{formatRdvDate(effectiveRdvDate)}</span>
                                            </p>
                                        )}

                                        {/* Type */}
                                        {effectiveMeetingType && MeetingTypeIcon && (
                                            <p className={cn("flex items-center gap-1.5 text-[11px] font-medium", MEETING_TYPE_LABELS[effectiveMeetingType]?.colorClass)}>
                                                <MeetingTypeIcon className="w-3 h-3 shrink-0" />
                                                {MEETING_TYPE_LABELS[effectiveMeetingType]?.label}
                                                {/* Show detail for each type */}
                                                {effectiveMeetingType === "VISIO" && effectiveMeetingJoinUrl && (
                                                    <a href={effectiveMeetingJoinUrl} target="_blank" rel="noopener noreferrer" className="ml-1 truncate max-w-[120px] underline underline-offset-2">
                                                        {effectiveMeetingJoinUrl.replace(/^https?:\/\//, "").slice(0, 28)}…
                                                    </a>
                                                )}
                                                {effectiveMeetingType === "PHYSIQUE" && effectiveMeetingAddress && (
                                                    <span className="ml-1 truncate max-w-[140px] text-slate-600 font-normal">{effectiveMeetingAddress}</span>
                                                )}
                                                {effectiveMeetingType === "TELEPHONIQUE" && effectiveMeetingPhone && (
                                                    <span className="ml-1 text-slate-600 font-normal">{effectiveMeetingPhone}</span>
                                                )}
                                            </p>
                                        )}

                                        {/* Category */}
                                        {effectiveMeetingCategory && (
                                            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block shrink-0" />
                                                {MEETING_CATEGORY_LABELS[effectiveMeetingCategory]}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── Form: date + type + detail + category ── */}
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                                Détails du rendez-vous
                            </p>

                            {/* Date: auto-synced from calendar, or manual fallback */}
                            {calendarSyncedDate ? (
                                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                    <span className="text-emerald-800 font-medium capitalize">
                                        {formatRdvDate(calendarSyncedDate)}
                                    </span>
                                    <span className="text-emerald-500 text-xs ml-auto">via calendrier</span>
                                </div>
                            ) : showManualDate ? (
                                <DateTimePicker
                                    label="Date et heure (saisie manuelle)"
                                    value={effectiveRdvDate}
                                    onChange={setEffectiveRdvDate}
                                    placeholder="Choisir date et heure…"
                                    triggerClassName="border-slate-200 focus:ring-indigo-400/30 focus:border-indigo-400 bg-white"
                                />
                            ) : (
                                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-600">
                                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                                    <span>Le créneau sera récupéré depuis le calendrier</span>
                                    <button
                                        type="button"
                                        onClick={() => setShowManualDate(true)}
                                        className="ml-auto text-[11px] text-indigo-500 hover:text-indigo-700 underline underline-offset-2 whitespace-nowrap"
                                    >
                                        Saisie manuelle
                                    </button>
                                </div>
                            )}

                            <div className="space-y-2 text-xs text-slate-600">
                                <p className="font-semibold">Type de réunion</p>
                                <div className="flex flex-wrap gap-2">
                                    {(["VISIO", "PHYSIQUE", "TELEPHONIQUE"] as const).map((type) => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => setEffectiveMeetingType(effectiveMeetingType === type ? "" : type)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-full border text-xs font-semibold transition-all",
                                                effectiveMeetingType === type
                                                    ? "bg-indigo-50 border-indigo-400 text-indigo-700"
                                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                                            )}
                                        >
                                            {type === "VISIO" ? "Visio" : type === "PHYSIQUE" ? "Physique" : "Téléphonique"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {effectiveMeetingType === "PHYSIQUE" && (
                                <div className="space-y-1 text-xs">
                                    <label className="font-semibold text-slate-700">
                                        Adresse du RDV <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        value={effectiveMeetingAddress}
                                        onChange={(e) => setEffectiveMeetingAddress(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400"
                                        placeholder="Adresse complète du lieu"
                                    />
                                </div>
                            )}

                            {effectiveMeetingType === "VISIO" && (
                                <div className="space-y-1 text-xs">
                                    <label className="font-semibold text-slate-700">
                                        Lien de connexion <span className="text-slate-400 font-normal">(auto-détecté si disponible)</span>
                                    </label>
                                    <input
                                        value={effectiveMeetingJoinUrl}
                                        onChange={(e) => setEffectiveMeetingJoinUrl(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                                        placeholder="Auto-récupéré du calendrier, ou saisir manuellement…"
                                    />
                                </div>
                            )}

                            {effectiveMeetingType === "TELEPHONIQUE" && (
                                <div className="space-y-1 text-xs">
                                    <label className="font-semibold text-slate-700">
                                        Numéro à appeler <span className="text-slate-400 font-normal">(optionnel)</span>
                                    </label>
                                    <input
                                        value={effectiveMeetingPhone}
                                        onChange={(e) => setEffectiveMeetingPhone(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
                                        placeholder={contactInfo?.phone ?? "Numéro du contact"}
                                    />
                                </div>
                            )}

                            <div className="space-y-1 text-xs">
                                <label className="font-semibold text-slate-700">Catégorie</label>
                                <div className="flex flex-wrap gap-2">
                                    {(["EXPLORATOIRE", "BESOIN"] as const).map((cat) => (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => setEffectiveMeetingCategory(effectiveMeetingCategory === cat ? "" : cat)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-full border text-xs font-semibold transition-all",
                                                effectiveMeetingCategory === cat
                                                    ? "bg-indigo-50 border-indigo-400 text-indigo-700"
                                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                                            )}
                                        >
                                            {MEETING_CATEGORY_LABELS[cat]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Confirm button */}
                            <div className="mt-auto pt-4 border-t border-slate-200">
                                <button
                                    type="button"
                                    onClick={handleConfirmRdv}
                                    disabled={isProcessing || (effectiveMeetingType === "PHYSIQUE" && !effectiveMeetingAddress.trim())}
                                    className={cn(
                                        "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white transition-all",
                                        isProcessing || (effectiveMeetingType === "PHYSIQUE" && !effectiveMeetingAddress.trim())
                                            ? "bg-indigo-300 cursor-not-allowed"
                                            : "bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg"
                                    )}
                                >
                                    {isProcessing ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Enregistrement…</>
                                    ) : (
                                        <><CheckCircle2 className="w-4 h-4" aria-hidden="true" />Confirmer le RDV</>
                                    )}
                                </button>
                                <p className="text-[11px] text-slate-400 mt-2 text-center">
                                    Choisissez un créneau dans le calendrier — la date et l&apos;heure seront récupérées automatiquement.
                                </p>
                            </div>
                        </div>

                        {/* ── RIGHT PANEL: calendar selector + iframe ── */}
                        <div className="relative bg-white min-h-0 flex-1 flex flex-col">
                            {!selectedOption ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50">
                                    <Calendar className="w-8 h-8 text-slate-300" />
                                    <p className="text-sm font-semibold text-slate-600">Aucun calendrier configuré</p>
                                    <p className="text-xs text-slate-400">Contactez votre administrateur</p>
                                </div>
                            ) : (
                                <>
                                    {bookingOptions.length > 1 && (
                                        <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 bg-slate-50/80">
                                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                                Choisir un commercial / calendrier
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {bookingOptions.map((opt) => (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() => handleSelectCalendar(opt.id)}
                                                        className={cn(
                                                            "inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all",
                                                            selectedOptionId === opt.id
                                                                ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                                                                : "bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50"
                                                        )}
                                                    >
                                                        <span className={cn(
                                                            "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                                                            selectedOptionId === opt.id ? "bg-white/20" : opt.avatarColor ?? "bg-slate-100 text-slate-600"
                                                        )}>
                                                            {opt.initials ?? "?"}
                                                        </span>
                                                        <span className="text-left">
                                                            <span className="block truncate max-w-[140px]">{opt.label}</span>
                                                            {opt.sublabel && (
                                                                <span className="block text-xs opacity-80 truncate max-w-[140px]">{opt.sublabel}</span>
                                                            )}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex-1 min-h-0 relative">
                                        {iframeLoading && !isProcessing && !booked && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white z-10">
                                                <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
                                                <p className="text-sm text-slate-500">Chargement du calendrier…</p>
                                            </div>
                                        )}
                                        {isProcessing && (
                                            <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center gap-3">
                                                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                                                <p className="text-sm font-medium text-slate-700">Enregistrement du rendez-vous…</p>
                                            </div>
                                        )}
                                        {booked && (
                                            <div className="absolute inset-0 bg-white z-20 flex flex-col items-center justify-center gap-4">
                                                <CheckCircle2 className="w-14 h-14 text-emerald-500" />
                                                <p className="text-lg font-semibold text-slate-900">RDV confirmé !</p>
                                                <p className="text-sm text-slate-500 text-center">
                                                    Rendez-vous avec {contactName} enregistré.
                                                </p>
                                            </div>
                                        )}
                                        <iframe
                                            ref={iframeRef}
                                            src={embedUrl}
                                            key={selectedOption.id}
                                            onLoad={() => setIframeLoading(false)}
                                            className="w-full h-full min-h-[320px] border-0"
                                            title={selectedOption.label}
                                            allow="camera; microphone; geolocation"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default BookingDrawer;