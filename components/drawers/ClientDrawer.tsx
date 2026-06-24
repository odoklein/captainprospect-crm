"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
    Drawer,
    Button,
    Badge,
    Tabs,
    useToast,
    ConfirmModal,
    Modal,
    DatePicker,
} from "@/components/ui";
import { CLIENTS_QUERY_KEY, clientDetailQueryKey } from "@/lib/query-keys";
import {
    InlineText,
    InlineSelect,
    InlineToggle,
    PopoverPanel,
} from "./_inline/InlineField";
import {
    MISSION_STATUS_CONFIG,
    type MissionStatusValue,
} from "@/lib/constants/missionStatus";
import {
    Building2,
    Mail,
    Phone,
    Briefcase,
    Copy,
    X,
    Target,
    Users,
    Link as LinkIcon,
    ExternalLink,
    Trash2,
    ShieldCheck,
    ShieldAlert,
    Activity,
    Plus,
    FileText,
    Settings2,
    UserCog,
    TrendingUp,
    PlayCircle,
    PauseCircle,
    FileCheck2,
    Archive,
    MoreHorizontal,
    CircleDashed,
    Sparkles,
    ChevronRight,
    Inbox,
    User as UserIcon,
    CheckCircle2,
    MessageSquare,
    PhoneCall,
    CalendarDays,
    ChevronDown,
    Pause,
    Ban,
    RefreshCw,
    Receipt,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type ClientStatus = "ACTIVE" | "PAUSED" | "STOPPED";

interface Client {
    id: string;
    name: string;
    industry?: string;
    email?: string;
    phone?: string;
    status?: ClientStatus;
    createdAt: string;
    bookingUrl?: string;
    _count: {
        missions: number;
        users: number;
    };
    portalShowCallHistory?: boolean;
    portalShowDatabase?: boolean;
    rdvEmailNotificationsEnabled?: boolean;
}

interface MissionLite {
    id: string;
    name: string;
    objective?: string | null;
    status: MissionStatusValue;
    createdAt?: string;
    channel?: string | null;
    _count?: { campaigns?: number; lists?: number; sdrAssignments?: number };
    campaigns?: Array<{ id: string; name: string; icp?: string | null }>;
    lists?: Array<{ id: string; name: string; type?: string; _count?: { companies?: number } }>;
    missionPlans?: MissionPlanLite[];
}

interface MissionPlanLite {
    id: string;
    frequency: number;
    preferredDays: string[];
    timePreference?: string | null;
    customStartTime?: string | null;
    customEndTime?: string | null;
    startDate?: string;
    endDate?: string | null;
}

interface ClientUserLite {
    id: string;
    name: string | null;
    email: string;
    role: string;
    isActive: boolean;
    lastSignInAt: string | null;
    lastConnectedAt: string | null;
    createdAt: string;
}

interface InterlocuteurLite {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
    createdAt: string;
    portalUser?: { id: string; email: string; name: string | null; isActive: boolean } | null;
}

interface ClientProductionInsights {
    month: string;
    firstCallAt?: string | null;
    plannedMonthDays: number | null;
    plannedWeekDays: number | null;
    plannedMonthDaysFromWeekly?: number | null;
    hasMonthlyPlan?: boolean;
    executedDays: number;
    workedCallDays?: number;
    totalWorkedCallDays?: number;
    totalActions: number;
    totalCalls: number;
    totalMeetings: number;
}

type EngagementStatut = "BROUILLON" | "ACTIF" | "EXPIRE" | "RENOUVELE" | "RESILIE" | "ARCHIVE";

interface ClientEngagementInsights {
    id: string;
    offreTarifId: string;
    dureeMois: number;
    debut: string;
    fin: string;
    statut: EngagementStatut;
    renouvellement?: string | null;
    penaliteResiliation?: string | null;
    fixeOverride?: number | string | null;
    rdvOverride?: number | string | null;
    offreTarif: { id: string; nom: string; fixeMensuel: number | string; prixParRdv: number | string };
}

interface ClientActionInsight {
    id: string;
    createdAt: string;
    callbackDate?: string | null;
    result: string;
    channel: string;
    note?: string | null;
    duration?: number | null;
    sdr: { id: string; name: string | null };
    company?: { id: string; name: string } | null;
    contact?: {
        id: string;
        firstName?: string | null;
        lastName?: string | null;
        title?: string | null;
        company?: { id: string; name: string } | null;
    } | null;
    campaign: {
        id: string;
        name: string;
        mission: { id: string; name: string };
    };
}

interface ClientSdrFeedbackInsight {
    id: string;
    score: number;
    review: string;
    objections?: string | null;
    missionComment?: string | null;
    submittedAt: string;
    sdr: { id: string; name: string | null; email: string };
    mission?: { id: string; name: string } | null;
    missions: Array<{ mission: { id: string; name: string } }>;
}

interface ClientDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    client: Client | null;
    onUpdate?: (client: Client) => void;
    onDelete?: () => void;
}

type TabId = "apercu" | "missions" | "acces" | "interlocuteurs" | "activite" | "avis-sdr";

// ============================================================================
// HELPERS
// ============================================================================

async function fetchClientDetail(clientId: string) {
    const res = await fetch(`/api/clients/${clientId}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Impossible de charger le client");
    return json.data;
}

async function fetchMailboxes() {
    const res = await fetch("/api/email/mailboxes?includeShared=true");
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) return json.data as Array<{
        id: string;
        email: string;
        displayName: string | null;
    }>;
    return [];
}

function formatDate(d?: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function formatRelative(d?: string | null) {
    if (!d) return "Jamais";
    const diff = Date.now() - new Date(d).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "À l’instant";
    if (min < 60) return `Il y a ${min} min`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `Il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `Il y a ${days}j`;
    return formatDate(d);
}

const ROLE_TONE: Record<string, { label: string; variant: "primary" | "success" | "warning" | "danger" | "default" }> = {
    MANAGER: { label: "Manager", variant: "primary" },
    SDR: { label: "SDR", variant: "success" },
    BOOKER: { label: "Booker", variant: "warning" },
    CLIENT: { label: "Client", variant: "default" },
    COMMERCIAL: { label: "Commercial", variant: "default" },
    DEVELOPER: { label: "Dev", variant: "default" },
    BUSINESS_DEVELOPER: { label: "BizDev", variant: "default" },
};

const ACTION_LABELS: Record<string, string> = {
    MEETING_BOOKED: "RDV pris",
    CALLBACK_REQUESTED: "Rappel demandé",
    RAPPEL: "Rappel",
    RELANCE: "Relance",
    INTERESTED: "Intéressé",
    NO_RESPONSE: "Pas de réponse",
    NOT_INTERESTED: "Pas intéressé",
    DISQUALIFIED: "Disqualifié",
    ENVOIE_MAIL: "Email envoyé",
};

function formatMonth(month?: string) {
    if (!month) return "Mois en cours";
    const [year, monthNumber] = month.split("-").map(Number);
    return new Date(year, monthNumber - 1, 1).toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
    });
}

function toNumber(v: number | string | null | undefined): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
}

function formatEuro(v: number | string | null | undefined): string {
    const n = toNumber(v);
    return n === null ? "—" : `${n.toLocaleString("fr-FR")} €`;
}

const CLIENT_STATUS_CONFIG: Record<
    ClientStatus,
    { label: string; badge: string; dot: string; icon: typeof PlayCircle }
> = {
    ACTIVE: { label: "Actif", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", icon: PlayCircle },
    PAUSED: { label: "En pause", badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", icon: Pause },
    STOPPED: { label: "Arrêté", badge: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400", icon: Ban },
};

const ENGAGEMENT_STATUT_OPTIONS: Array<{
    value: EngagementStatut;
    label: string;
    tone: "default" | "success" | "warning" | "danger" | "info";
}> = [
    { value: "BROUILLON", label: "Brouillon", tone: "default" },
    { value: "ACTIF", label: "Actif", tone: "success" },
    { value: "RENOUVELE", label: "Renouvelé", tone: "info" },
    { value: "EXPIRE", label: "Expiré", tone: "warning" },
    { value: "RESILIE", label: "Résilié", tone: "danger" },
    { value: "ARCHIVE", label: "Archivé", tone: "default" },
];

// ============================================================================
// SECTION CARD — reference image style (title + Edit Info + 2-col grid)
// ============================================================================

function SectionCard({
    title,
    icon,
    action,
    children,
    muted,
}: {
    title: string;
    icon?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
    muted?: boolean;
}) {
    return (
        <div
            className={
                "rounded-2xl border border-slate-200/80 " +
                (muted ? "bg-slate-50/50" : "bg-white")
            }
        >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                    {icon && (
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            {icon}
                        </div>
                    )}
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">{title}</h3>
                </div>
                {action}
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}

// ============================================================================
// STAT PILL (header stats row)
// ============================================================================

function StatPill({
    icon,
    value,
    label,
    tone = "indigo",
}: {
    icon: ReactNode;
    value: ReactNode;
    label: string;
    tone?: "indigo" | "emerald" | "amber" | "slate";
}) {
    const tones: Record<string, string> = {
        indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
        emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
        amber: "bg-amber-50 text-amber-600 border-amber-100",
        slate: "bg-slate-50 text-slate-600 border-slate-100",
    };
    return (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white border border-slate-200">
            <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${tones[tone]}`}>
                {icon}
            </div>
            <div>
                <div className="text-base font-bold text-slate-900 leading-none">{value}</div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-1">
                    {label}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// MAIN
// ============================================================================

export function ClientDrawer({ isOpen, onClose, client, onUpdate, onDelete }: ClientDrawerProps) {
    const queryClient = useQueryClient();
    const { success, error: showError } = useToast();

    const [activeTab, setActiveTab] = useState<TabId>("apercu");
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [scriptModalMission, setScriptModalMission] = useState<MissionLite | null>(null);
    const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const [savingStatus, setSavingStatus] = useState(false);
    const moreBtnRef = useRef<HTMLButtonElement | null>(null);
    const [moreOpen, setMoreOpen] = useState(false);

    // React Query: full client detail
    const { data: clientDetail } = useQuery({
        queryKey: clientDetailQueryKey(client?.id ?? null),
        queryFn: () => fetchClientDetail(client!.id),
        enabled: isOpen && !!client?.id,
    });

    // Mailboxes list (loaded once while drawer is open)
    const { data: mailboxes = [] } = useQuery({
        queryKey: ["manager", "mailboxes"],
        queryFn: fetchMailboxes,
        enabled: isOpen,
        staleTime: 60_000,
    });

    // Reset tab when switching clients
    useEffect(() => {
        if (client) setActiveTab("apercu");
    }, [client?.id]);

    // ─── save helper (single-field PATCH) ────────────────────────────────────
    const saveField = async (patch: Record<string, unknown>) => {
        if (!client) return;
        const res = await fetch(`/api/clients/${client.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
        });
        const json = await res.json();
        if (!json.success) {
            showError("Erreur", json.error || "Impossible de mettre à jour");
            throw new Error(json.error);
        }
        success("Mis à jour", "Modifications enregistrées");
        queryClient.invalidateQueries({ queryKey: clientDetailQueryKey(client.id) });
        queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
        if (onUpdate) onUpdate({ ...client, ...patch } as Client);
    };

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        success("Copié", `${label} copié dans le presse-papier`);
    };

    // Invalidate client detail + list after engagement create/edit/renew
    const refreshClientQueries = () => {
        if (!client) return;
        queryClient.invalidateQueries({ queryKey: clientDetailQueryKey(client.id) });
        queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
    };

    // ─── change client status (Actif / En pause / Arrêté) ─────────────────────
    const changeStatus = async (next: ClientStatus) => {
        if (!client) return;
        setStatusMenuOpen(false);
        setSavingStatus(true);
        try {
            await saveField({ status: next });
        } finally {
            setSavingStatus(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!client) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
            const json = await res.json();
            if (json.success) {
                success("Client supprimé", `${client.name} et toutes les données associées ont été supprimés`);
                setShowDeleteConfirm(false);
                queryClient.invalidateQueries({ queryKey: clientDetailQueryKey(client.id) });
                queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
                onClose();
                onDelete?.();
            } else {
                showError("Erreur", json.error || "Impossible de supprimer le client");
            }
        } catch {
            showError("Erreur", "Impossible de supprimer le client");
        } finally {
            setIsDeleting(false);
        }
    };

    if (!client) return null;

    const missions: MissionLite[] = (clientDetail?.missions ?? []) as MissionLite[];
    const usersList: ClientUserLite[] = (clientDetail?.users ?? []) as ClientUserLite[];
    const interlocuteurs: InterlocuteurLite[] = (clientDetail?.interlocuteurs ?? []) as InterlocuteurLite[];
    const production = clientDetail?.insights?.production as ClientProductionInsights | undefined;
    const engagement = clientDetail?.insights?.engagement as ClientEngagementInsights | null | undefined;
    const recentActions = (clientDetail?.insights?.recentActions ?? []) as ClientActionInsight[];
    const sdrFeedback = (clientDetail?.insights?.sdrFeedback ?? []) as ClientSdrFeedbackInsight[];
    const onboardingData = (clientDetail?.onboarding?.onboardingData ?? {}) as {
        defaultMailboxId?: string;
        icp?: string;
    };
    const bookingUrl = (client.bookingUrl ?? clientDetail?.bookingUrl ?? "") as string;
    const icp = onboardingData.icp || "";
    const defaultMailboxId = onboardingData.defaultMailboxId || "";

    const clientStatus: ClientStatus = (clientDetail?.status ?? client.status ?? "ACTIVE") as ClientStatus;
    const statusInfo = CLIENT_STATUS_CONFIG[clientStatus];

    const activeMissionsCount = missions.filter((m) => m.status === "ACTIVE").length;
    const activeMissionPlans = missions.flatMap((mission) =>
        (mission.missionPlans ?? []).map((plan) => ({ mission, plan })),
    );
    const onlyActivePlan = activeMissionPlans.length === 1 ? activeMissionPlans[0] : null;

    const savePlanFrequency = async (plan: MissionPlanLite, nextFrequency: number) => {
        const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
        const currentDays = plan.preferredDays ?? [];
        const preferredDays = [
            ...currentDays,
            ...weekdays.filter((day) => !currentDays.includes(day)),
        ].slice(0, nextFrequency);

        setSavingPlanId(plan.id);
        try {
            const res = await fetch(`/api/mission-plans/${plan.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ frequency: nextFrequency, preferredDays }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible de mettre Ã  jour le planning");
                throw new Error(json.error);
            }
            success("Planning mis Ã  jour", `${nextFrequency} jour${nextFrequency > 1 ? "s" : ""} / semaine enregistrÃ©`);
            queryClient.invalidateQueries({ queryKey: clientDetailQueryKey(client.id) });
            queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
        } finally {
            setSavingPlanId(null);
        }
    };

    // ───────────────────────────────────────────────────────────────────────
    // HEADER (hero)
    // ───────────────────────────────────────────────────────────────────────

    const Header = (
        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 bg-white">
            {/* Monogram */}
            <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 text-base font-semibold">
                {client.name[0]?.toUpperCase() || "?"}
            </div>

            {/* Name + industry */}
            <div className="flex-1 min-w-0">
                <InlineText
                    value={client.name}
                    onSave={(v) => saveField({ name: v })}
                    valueClassName="text-base font-semibold !text-slate-900"
                    className="!mb-0"
                />
                <p className="text-xs text-slate-500 truncate">
                    {client.industry || "Secteur non spécifié"} · Client depuis{" "}
                    {new Date(client.createdAt).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}
                </p>
            </div>

            {/* Client status pill */}
            <div className="relative flex-shrink-0">
                <button
                    onClick={() => setStatusMenuOpen((v) => !v)}
                    disabled={savingStatus}
                    className={`flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${statusInfo.badge} hover:brightness-95 disabled:opacity-50`}
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                    {statusInfo.label}
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                </button>
                {statusMenuOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setStatusMenuOpen(false)} />
                        <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
                            {(Object.keys(CLIENT_STATUS_CONFIG) as ClientStatus[]).map((key) => {
                                const opt = CLIENT_STATUS_CONFIG[key];
                                const OptIcon = opt.icon;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => changeStatus(key)}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-slate-50 transition-colors ${key === clientStatus ? "text-slate-900 bg-slate-50" : "text-slate-600"}`}
                                    >
                                        <OptIcon className="w-3.5 h-3.5 text-slate-400" />
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Overflow menu */}
            <button
                ref={moreBtnRef}
                onClick={() => setMoreOpen((v) => !v)}
                aria-label="Plus d’actions"
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
            >
                <MoreHorizontal className="w-5 h-5" />
            </button>
            <PopoverPanel open={moreOpen} onClose={() => setMoreOpen(false)} anchor={moreBtnRef} width={200} align="end">
                <div className="py-1">
                    <Link
                        href={`/manager/clients/${client.id}`}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                        <ExternalLink className="w-4 h-4 text-slate-400" />
                        Page détaillée
                    </Link>
                    <div className="border-t border-slate-100 my-1" />
                    <button
                        onClick={() => {
                            setMoreOpen(false);
                            setShowDeleteConfirm(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                        <Trash2 className="w-4 h-4" />
                        Supprimer le client
                    </button>
                </div>
            </PopoverPanel>

            {/* Close */}
            <button
                onClick={onClose}
                aria-label="Fermer"
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
            >
                <X className="w-5 h-5" />
            </button>
        </div>
    );

    // ───────────────────────────────────────────────────────────────────────
    // TAB: APERÇU
    // ───────────────────────────────────────────────────────────────────────

    const OverviewTab = (
        <div className="space-y-5">
            {/* Informations de base */}
            <SectionCard title="Informations de base" icon={<Building2 className="w-3.5 h-3.5" />}>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <InlineText
                        label="Nom du client"
                        value={client.name}
                        icon={<Building2 className="w-3.5 h-3.5" />}
                        onSave={(v) => saveField({ name: v })}
                    />
                    <InlineText
                        label="Secteur d’activité"
                        value={client.industry || ""}
                        icon={<Briefcase className="w-3.5 h-3.5" />}
                        onSave={(v) => saveField({ industry: v })}
                    />
                    <InlineText
                        label="Email de contact"
                        value={client.email || ""}
                        type="email"
                        icon={<Mail className="w-3.5 h-3.5" />}
                        onSave={(v) => saveField({ email: v })}
                        trailing={
                            client.email ? (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(client.email!, "Email");
                                    }}
                                    className="text-slate-300 hover:text-slate-500"
                                >
                                    <Copy className="w-3 h-3" />
                                </button>
                            ) : null
                        }
                    />
                    <InlineText
                        label="Téléphone"
                        value={client.phone || ""}
                        type="tel"
                        icon={<Phone className="w-3.5 h-3.5" />}
                        onSave={(v) => saveField({ phone: v })}
                    />
                    <div className="col-span-2">
                        <InlineText
                            label="URL de réservation (Calendly, etc.)"
                            value={bookingUrl}
                            type="url"
                            icon={<LinkIcon className="w-3.5 h-3.5" />}
                            onSave={(v) => saveField({ bookingUrl: v })}
                            trailing={
                                bookingUrl ? (
                                    <a
                                        href={bookingUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-slate-300 hover:text-indigo-600"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                ) : null
                            }
                        />
                    </div>
                </div>
            </SectionCard>

            {/* Production — mission-derived, calm */}
            <SectionCard
                title={`Production · ${formatMonth(production?.month)}`}
                icon={<CalendarDays className="w-3.5 h-3.5" />}
            >
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs text-slate-500">Jours prévus / mois</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
                            {production?.plannedMonthDays ?? "—"}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                            {production?.hasMonthlyPlan ? "Plan mensuel cumulé" : "Depuis les jours / semaine"}
                        </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs text-slate-500">Jours prévus / semaine</p>
                        {onlyActivePlan ? (
                            <div className="mt-1 max-w-[160px]">
                                <InlineSelect
                                    value={String(onlyActivePlan.plan.frequency)}
                                    options={[1, 2, 3, 4, 5].map((day) => ({
                                        value: String(day),
                                        label: `${day} jour${day > 1 ? "s" : ""} / semaine`,
                                    }))}
                                    onSave={(value) => savePlanFrequency(onlyActivePlan.plan, Number(value))}
                                />
                            </div>
                        ) : (
                            <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
                                {production?.plannedWeekDays ?? "—"}
                            </p>
                        )}
                        <p className="mt-1 text-xs text-slate-400">Fréquence des missions actives</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs text-slate-500">Jours avec appels</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
                            {production?.workedCallDays ?? production?.executedDays ?? 0}
                        </p>
                        <p className="mt-1 text-xs text-slate-400 tabular-nums">
                            {production?.totalCalls ?? 0} appels · {production?.totalMeetings ?? 0} RDV
                        </p>
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">Premier appel :</span>
                    <span className="tabular-nums">
                        {production?.firstCallAt ? formatDate(production.firstCallAt) : "Aucun appel enregistré"}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="tabular-nums">
                        {production?.totalWorkedCallDays ?? 0} jour{(production?.totalWorkedCallDays ?? 0) > 1 ? "s" : ""} travaillés depuis le lancement
                    </span>
                </div>
                {activeMissionPlans.length > 1 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                        <p className="text-xs text-slate-500">Planning par mission</p>
                        {activeMissionPlans.map(({ mission, plan }) => (
                            <div key={plan.id} className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-slate-800 truncate">{mission.name}</p>
                                <div className="w-32 flex-shrink-0">
                                    <InlineSelect
                                        value={String(plan.frequency)}
                                        options={[1, 2, 3, 4, 5].map((day) => ({
                                            value: String(day),
                                            label: `${day} j / sem.`,
                                        }))}
                                        onSave={(value) => savePlanFrequency(plan, Number(value))}
                                        readOnly={savingPlanId === plan.id}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>

            {/* Engagement — editable */}
            <EngagementSection
                engagement={engagement ?? null}
                clientId={client.id}
                onChanged={refreshClientQueries}
            />

            {/* ICP / Persona */}
            <SectionCard title="Persona idéal (ICP)" icon={<Sparkles className="w-3.5 h-3.5" />}>
                <InlineText
                    value={icp}
                    placeholder="Décrivez l’ICP de ce client (secteur, taille, poste cible, douleur, budget…)"
                    onSave={(v) => saveField({ icp: v })}
                    multiline
                    valueClassName="!whitespace-pre-wrap !text-slate-700 !font-normal leading-relaxed"
                />
            </SectionCard>
        </div>
    );

    // ───────────────────────────────────────────────────────────────────────
    // TAB: MISSIONS
    // ───────────────────────────────────────────────────────────────────────

    const MissionsTab = (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-bold text-slate-900">Missions</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {missions.length} mission{missions.length > 1 ? "s" : ""} · {activeMissionsCount} active
                        {activeMissionsCount > 1 ? "s" : ""}
                    </p>
                </div>
                <Link
                    href={`/manager/missions?clientId=${client.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-sm font-medium hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/30 transition-all"
                >
                    <Plus className="w-4 h-4" /> Nouvelle mission
                </Link>
            </div>

            {missions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-white border border-slate-200 flex items-center justify-center mb-3">
                        <Target className="w-5 h-5 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">Aucune mission</p>
                    <p className="text-xs text-slate-500 mt-1">
                        Créez la première mission pour ce client.
                    </p>
                </div>
            ) : (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    {missions.map((m, idx) => (
                        <MissionRow
                            key={m.id}
                            mission={m}
                            isLast={idx === missions.length - 1}
                            clientId={client.id}
                            onScriptClick={() => setScriptModalMission(m)}
                            onStatusChange={async (next) => {
                                const res = await fetch(`/api/missions/${m.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ status: next }),
                                });
                                const json = await res.json();
                                if (!json.success) {
                                    showError("Erreur", json.error || "Changement de statut refusé");
                                    throw new Error(json.error);
                                }
                                success("Statut mis à jour", MISSION_STATUS_CONFIG[next].label);
                                queryClient.invalidateQueries({
                                    queryKey: clientDetailQueryKey(client.id),
                                });
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );

    // ───────────────────────────────────────────────────────────────────────
    // TAB: ACCÈS (team + portal users)
    // ───────────────────────────────────────────────────────────────────────

    const AccessTab = (
        <div className="space-y-5">
            <SectionCard
                title="Utilisateurs portail client"
                icon={<ShieldCheck className="w-3.5 h-3.5" />}
                action={
                    <Link
                        href={`/manager/clients/${client.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold uppercase tracking-wider transition-colors"
                    >
                        {usersList.length > 0 ? "Gérer" : "Créer un accès"}
                        <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                }
            >
                {usersList.length === 0 ? (
                    <div className="text-center py-6">
                        <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-600">Ce client n’a pas encore d’accès au portail.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 -mx-5">
                        {usersList.map((u) => {
                            const role = ROLE_TONE[u.role] ?? { label: u.role, variant: "default" as const };
                            return (
                                <div
                                    key={u.id}
                                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors"
                                >
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 font-semibold text-sm flex-shrink-0">
                                        {(u.name || u.email)[0]?.toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-semibold text-slate-900 truncate">
                                                {u.name || u.email}
                                            </p>
                                            <Badge variant={role.variant} className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0">
                                                {role.label}
                                            </Badge>
                                            {!u.isActive && (
                                                <Badge variant="danger" className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0">
                                                    Désactivé
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500 truncate mt-0.5">{u.email}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-xs text-slate-500">Dernière connexion</p>
                                        <p className="text-xs font-medium text-slate-700 mt-0.5">
                                            {formatRelative(u.lastSignInAt || u.lastConnectedAt)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </SectionCard>

            <SectionCard title="Matrice de permissions" icon={<UserCog className="w-3.5 h-3.5" />} muted>
                <div className="space-y-1">
                    <InlineToggle
                        label="Voir l’historique d’appels"
                        description="Le client peut consulter tous les appels passés par les SDRs"
                        value={!!client.portalShowCallHistory}
                        onSave={(v) => saveField({ portalShowCallHistory: v })}
                    />
                    <InlineToggle
                        label="Voir la base de données prospects"
                        description="Le client peut consulter les contacts et entreprises ciblés"
                        value={!!client.portalShowDatabase}
                        onSave={(v) => saveField({ portalShowDatabase: v })}
                    />
                    <InlineToggle
                        label="Recevoir les notifications de RDV"
                        description="Envoi d’un email à chaque nouveau rendez-vous"
                        value={client.rdvEmailNotificationsEnabled !== false}
                        onSave={(v) => saveField({ rdvEmailNotificationsEnabled: v })}
                    />
                    <div className="pt-3 mt-2 border-t border-slate-100">
                        <p className="text-xs text-slate-500 mb-1.5">Boîte mail par défaut</p>
                        <InlineSelect
                            value={defaultMailboxId}
                            placeholder="Aucune — le SDR choisit"
                            options={[
                                { value: "", label: "Aucune — le SDR choisit", icon: <CircleDashed className="w-3.5 h-3.5" /> },
                                ...mailboxes.map((mb) => ({
                                    value: mb.id,
                                    label: mb.displayName ? `${mb.displayName} <${mb.email}>` : mb.email,
                                    icon: <Mail className="w-3.5 h-3.5 text-indigo-500" />,
                                })),
                            ]}
                            onSave={(v) => saveField({ defaultMailboxId: v })}
                        />
                    </div>
                </div>
            </SectionCard>
        </div>
    );

    // ───────────────────────────────────────────────────────────────────────
    // TAB: INTERLOCUTEURS
    // ───────────────────────────────────────────────────────────────────────

    const InterlocuteursTab = (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-bold text-slate-900">Interlocuteurs</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {interlocuteurs.length} contact{interlocuteurs.length > 1 ? "s" : ""} chez ce client
                    </p>
                </div>
                <Link
                    href={`/manager/clients/${client.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all"
                >
                    <Plus className="w-4 h-4" /> Ajouter
                </Link>
            </div>

            {interlocuteurs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
                    <UserIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">Aucun interlocuteur</p>
                    <p className="text-xs text-slate-500 mt-1">
                        Ajoutez les contacts du client pour ce compte.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3">
                    {interlocuteurs.map((i) => (
                        <div
                            key={i.id}
                            className="rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-200 hover:shadow-sm transition-all"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                                    {i.firstName[0]}
                                    {i.lastName[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 truncate">
                                        {i.firstName} {i.lastName}
                                    </p>
                                    {i.jobTitle && (
                                        <p className="text-xs text-slate-500 truncate mt-0.5">{i.jobTitle}</p>
                                    )}
                                    <div className="flex flex-col gap-1 mt-2">
                                        {i.email && (
                                            <a
                                                href={`mailto:${i.email}`}
                                                className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:underline truncate"
                                            >
                                                <Mail className="w-3 h-3 flex-shrink-0" />
                                                <span className="truncate">{i.email}</span>
                                            </a>
                                        )}
                                        {i.phone && (
                                            <a
                                                href={`tel:${i.phone}`}
                                                className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
                                            >
                                                <Phone className="w-3 h-3 flex-shrink-0" />
                                                {i.phone}
                                            </a>
                                        )}
                                    </div>
                                    {i.portalUser && (
                                        <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                                            <Badge
                                                variant={i.portalUser.isActive ? "success" : "default"}
                                                className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0 gap-1"
                                            >
                                                <ShieldCheck className="w-2.5 h-2.5" />
                                                {i.portalUser.isActive ? "Portail actif" : "Portail désactivé"}
                                            </Badge>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    // ───────────────────────────────────────────────────────────────────────
    // TAB: ACTIVITÉ (derived timeline)
    // ───────────────────────────────────────────────────────────────────────

    type TimelineEvent = {
        id: string;
        date: string;
        type: "client" | "mission" | "access" | "contact";
        title: string;
        description?: string;
        tone: "indigo" | "emerald" | "amber" | "slate";
    };

    const timeline: TimelineEvent[] = (() => {
        const events: TimelineEvent[] = [];
        events.push({
            id: `client-${client.id}`,
            date: client.createdAt,
            type: "client",
            title: "Client créé",
            description: `${client.name} ajouté à la plateforme`,
            tone: "indigo",
        });
        missions.forEach((m) => {
            if (m.createdAt) {
                events.push({
                    id: `mission-${m.id}`,
                    date: m.createdAt,
                    type: "mission",
                    title: `Mission créée · ${m.name}`,
                    description: MISSION_STATUS_CONFIG[m.status]?.label,
                    tone: m.status === "ACTIVE" ? "emerald" : "slate",
                });
            }
        });
        usersList.forEach((u) => {
            events.push({
                id: `user-${u.id}`,
                date: u.createdAt,
                type: "access",
                title: `Accès accordé · ${u.name || u.email}`,
                description: `Rôle : ${ROLE_TONE[u.role]?.label ?? u.role}`,
                tone: "amber",
            });
        });
        interlocuteurs.forEach((i) => {
            events.push({
                id: `contact-${i.id}`,
                date: i.createdAt,
                type: "contact",
                title: `Interlocuteur ajouté · ${i.firstName} ${i.lastName}`,
                description: i.jobTitle || undefined,
                tone: "slate",
            });
        });
        return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    })();

    const toneToClass: Record<string, string> = {
        indigo: "bg-indigo-500",
        emerald: "bg-emerald-500",
        amber: "bg-amber-500",
        slate: "bg-slate-400",
    };

    const AdministrativeActivityTimeline = (
        <div className="space-y-4">
            <div>
                <h3 className="text-base font-bold text-slate-900">Activité récente</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                    Dérivé des événements disponibles (création, missions, accès, contacts)
                </p>
            </div>

            {timeline.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
                    <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">Aucune activité</p>
                </div>
            ) : (
                <div className="relative pl-6">
                    <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200" />
                    <div className="space-y-4">
                        {timeline.map((e) => (
                            <div key={e.id} className="relative">
                                <div
                                    className={`absolute -left-6 top-1.5 w-[11px] h-[11px] rounded-full ring-4 ring-white ${toneToClass[e.tone]}`}
                                />
                                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 transition-colors">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-semibold text-slate-900">{e.title}</p>
                                        <p className="text-xs text-slate-400 flex-shrink-0">
                                            {formatRelative(e.date)}
                                        </p>
                                    </div>
                                    {e.description && (
                                        <p className="text-xs text-slate-500 mt-1">{e.description}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    // ───────────────────────────────────────────────────────────────────────
    // RENDER
    // ───────────────────────────────────────────────────────────────────────

    const actionsByDay = recentActions.reduce<Record<string, ClientActionInsight[]>>((groups, action) => {
        const day = new Date(action.createdAt).toLocaleDateString("fr-CA");
        (groups[day] ||= []).push(action);
        return groups;
    }, {});

    const ActivityTab = (
        <div className="space-y-4">
            <div>
                <h3 className="text-base font-bold text-slate-900">Activité opérationnelle</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                    Même lecture que le portail client, enrichie avec le SDR concerné.
                </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <StatPill icon={<PhoneCall className="w-4 h-4" />} value={production?.totalCalls ?? 0} label="Appels ce mois" tone="indigo" />
                <StatPill icon={<CheckCircle2 className="w-4 h-4" />} value={production?.totalMeetings ?? 0} label="RDV ce mois" tone="emerald" />
                <StatPill icon={<CalendarDays className="w-4 h-4" />} value={production?.workedCallDays ?? production?.executedDays ?? 0} label="Jours avec appels" tone="amber" />
            </div>

            {recentActions.length === 0 ? (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
                        <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm font-medium text-slate-700">Aucune activité opérationnelle</p>
                    </div>
                    {AdministrativeActivityTimeline}
                </div>
            ) : (
                <div className="space-y-3">
                    {Object.entries(actionsByDay).map(([day, actions]) => {
                        const meetings = actions.filter((action) => action.result === "MEETING_BOOKED").length;
                        return (
                            <div key={day} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                                <div className="flex items-center justify-between gap-4 px-4 py-3 bg-slate-50/70 border-b border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex flex-col items-center justify-center">
                                            <span className="text-[9px] uppercase font-bold">
                                                {new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { month: "short" })}
                                            </span>
                                            <span className="text-base font-bold leading-none">
                                                {new Date(`${day}T12:00:00`).getDate()}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">
                                                {actions.length} action{actions.length > 1 ? "s" : ""}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {meetings} RDV · {new Set(actions.map((action) => action.sdr.id)).size} SDR
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-xs font-semibold text-slate-500">
                                        {new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", {
                                            weekday: "long",
                                            day: "numeric",
                                            month: "long",
                                        })}
                                    </span>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {actions.map((action) => {
                                        const contactName = [
                                            action.contact?.firstName,
                                            action.contact?.lastName,
                                        ].filter(Boolean).join(" ");
                                        const companyName =
                                            action.contact?.company?.name || action.company?.name || "Société non renseignée";
                                        return (
                                            <div key={action.id} className="px-4 py-3 hover:bg-slate-50/60 transition-colors">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-sm font-semibold text-slate-900">
                                                                {contactName || companyName}
                                                            </span>
                                                            <Badge
                                                                variant={action.result === "MEETING_BOOKED" ? "success" : "default"}
                                                                className="text-[9px] uppercase tracking-wider"
                                                            >
                                                                {ACTION_LABELS[action.result] || action.result}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-slate-500 mt-1">
                                                            {companyName} · {action.campaign.mission.name} · {action.sdr.name || "SDR"}
                                                        </p>
                                                        {action.note && (
                                                            <p className="text-xs text-slate-600 mt-2 line-clamp-2">{action.note}</p>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-slate-400 flex-shrink-0">
                                                        {new Date(action.createdAt).toLocaleTimeString("fr-FR", {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    const SdrFeedbackTab = (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-base font-bold text-slate-900">Avis SDR</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Ressentis quotidiens liés aux missions de ce client.
                    </p>
                </div>
                <Link
                    href="/manager/sdr-feedback"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Tous les avis
                </Link>
            </div>

            {sdrFeedback.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
                    <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">Aucun avis SDR pour ce client</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {sdrFeedback.map((feedback) => {
                        const missionNames = Array.from(new Set([
                            ...(feedback.mission ? [feedback.mission.name] : []),
                            ...feedback.missions.map((item) => item.mission.name),
                        ]));
                        return (
                            <div key={feedback.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-sm font-bold">
                                            {(feedback.sdr.name || feedback.sdr.email)[0]?.toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-900">
                                                {feedback.sdr.name || feedback.sdr.email}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {missionNames.join(" · ") || "Mission non renseignée"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <Badge
                                            variant={feedback.score >= 4 ? "success" : feedback.score <= 2 ? "danger" : "warning"}
                                            className="font-bold"
                                        >
                                            {feedback.score}/5
                                        </Badge>
                                        <p className="text-[10px] text-slate-400 mt-1">{formatRelative(feedback.submittedAt)}</p>
                                    </div>
                                </div>
                                <p className="mt-3 text-sm leading-relaxed text-slate-700">{feedback.review}</p>
                                {(feedback.objections || feedback.missionComment) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                        {feedback.objections && (
                                            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Objections</p>
                                                <p className="text-xs text-amber-950 mt-1">{feedback.objections}</p>
                                            </div>
                                        )}
                                        {feedback.missionComment && (
                                            <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Commentaire mission</p>
                                                <p className="text-xs text-indigo-950 mt-1">{feedback.missionComment}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    const tabDef = [
        { id: "apercu", label: "Aperçu", icon: <Building2 className="w-3.5 h-3.5" /> },
        { id: "missions", label: "Missions", icon: <Target className="w-3.5 h-3.5" />, badge: missions.length || undefined },
        { id: "acces", label: "Accès", icon: <ShieldCheck className="w-3.5 h-3.5" />, badge: usersList.length || undefined },
        { id: "interlocuteurs", label: "Interlocuteurs", icon: <Users className="w-3.5 h-3.5" />, badge: interlocuteurs.length || undefined },
        { id: "activite", label: "Activité", icon: <Activity className="w-3.5 h-3.5" /> },
        { id: "avis-sdr", label: "Avis SDR", icon: <MessageSquare className="w-3.5 h-3.5" />, badge: sdrFeedback.length || undefined },
    ];

    return (
        <>
            <Drawer
                isOpen={isOpen}
                onClose={onClose}
                size="full"
                showCloseButton={false}
                className="!max-w-[1180px]"
            >
                <div className="-m-6 flex flex-col h-full">
                    {Header}

                    <div className="sticky top-0 z-10 px-6 bg-white border-b border-slate-100">
                        <Tabs
                            tabs={tabDef}
                            activeTab={activeTab}
                            onTabChange={(id) => setActiveTab(id as TabId)}
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 drawer-scrollbar">
                        {activeTab === "apercu" && OverviewTab}
                        {activeTab === "missions" && MissionsTab}
                        {activeTab === "acces" && AccessTab}
                        {activeTab === "interlocuteurs" && InterlocuteursTab}
                        {activeTab === "activite" && ActivityTab}
                        {activeTab === "avis-sdr" && SdrFeedbackTab}
                    </div>
                </div>
            </Drawer>

            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => !isDeleting && setShowDeleteConfirm(false)}
                onConfirm={handleDeleteConfirm}
                title="Supprimer le client"
                message={`Êtes-vous sûr de vouloir supprimer "${client.name}" ? Cette action supprimera définitivement le client et toutes les données associées (missions, campagnes, onboarding, utilisateurs liés, etc.) et ne peut pas être annulée.`}
                confirmText="Supprimer définitivement"
                cancelText="Annuler"
                variant="danger"
                isLoading={isDeleting}
            />

            <ScriptModal
                mission={scriptModalMission}
                onClose={() => setScriptModalMission(null)}
            />
        </>
    );
}

// ============================================================================
// MISSION ROW (inline status/script popover)
// ============================================================================

function MissionRow({
    mission,
    isLast,
    clientId,
    onStatusChange,
    onScriptClick,
}: {
    mission: MissionLite;
    isLast: boolean;
    clientId: string;
    onStatusChange: (next: MissionStatusValue) => Promise<void>;
    onScriptClick: () => void;
}) {
    const cfg = MISSION_STATUS_CONFIG[mission.status];
    const statusToneMap: Record<MissionStatusValue, "success" | "warning" | "info" | "default" | "danger"> = {
        DRAFT: "default",
        ACTIVE: "success",
        PAUSED: "warning",
        COMPLETED: "info",
        ARCHIVED: "default",
    };
    const iconMap: Record<MissionStatusValue, ReactNode> = {
        DRAFT: <FileText className="w-3.5 h-3.5" />,
        ACTIVE: <PlayCircle className="w-3.5 h-3.5" />,
        PAUSED: <PauseCircle className="w-3.5 h-3.5" />,
        COMPLETED: <FileCheck2 className="w-3.5 h-3.5" />,
        ARCHIVED: <Archive className="w-3.5 h-3.5" />,
    };

    const [moreOpen, setMoreOpen] = useState(false);
    const moreRef = useRef<HTMLButtonElement | null>(null);

    return (
        <div
            className={
                "flex items-center gap-4 px-5 py-4 hover:bg-slate-50/60 transition-colors " +
                (isLast ? "" : "border-b border-slate-100")
            }
        >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                mission.status === "ACTIVE"
                    ? "bg-emerald-50 text-emerald-600"
                    : mission.status === "PAUSED"
                    ? "bg-amber-50 text-amber-600"
                    : mission.status === "COMPLETED"
                    ? "bg-blue-50 text-blue-600"
                    : "bg-slate-100 text-slate-500"
            }`}>
                {iconMap[mission.status]}
            </div>

            <div className="flex-1 min-w-0">
                <Link
                    href={`/manager/missions/${mission.id}`}
                    className="text-sm font-semibold text-slate-900 hover:text-indigo-600 truncate block"
                >
                    {mission.name}
                </Link>
                {mission.objective && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{mission.objective}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                    {mission._count?.campaigns !== undefined && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                            <FileText className="w-2.5 h-2.5" />
                            {mission._count.campaigns} campagne{(mission._count.campaigns || 0) > 1 ? "s" : ""}
                        </span>
                    )}
                    {mission._count?.lists !== undefined && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                            <Inbox className="w-2.5 h-2.5" />
                            {mission._count.lists} liste{(mission._count.lists || 0) > 1 ? "s" : ""}
                        </span>
                    )}
                    {mission._count?.sdrAssignments !== undefined && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                            <Users className="w-2.5 h-2.5" />
                            {mission._count.sdrAssignments} SDR{(mission._count.sdrAssignments || 0) > 1 ? "s" : ""}
                        </span>
                    )}
                </div>
            </div>

            {/* Status inline edit */}
            <InlineSelect
                value={mission.status}
                asPill
                options={(Object.keys(MISSION_STATUS_CONFIG) as MissionStatusValue[]).map((s) => ({
                    value: s,
                    label: MISSION_STATUS_CONFIG[s].label,
                    tone: statusToneMap[s] as "success" | "warning" | "info" | "default" | "danger",
                    icon: iconMap[s],
                }))}
                onSave={(v) => onStatusChange(v as MissionStatusValue)}
            />

            {/* Script action */}
            <button
                onClick={onScriptClick}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors"
            >
                <FileText className="w-3.5 h-3.5" />
                Script
            </button>

            {/* More menu */}
            <button
                ref={moreRef}
                onClick={() => setMoreOpen((v) => !v)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Plus d’actions"
            >
                <MoreHorizontal className="w-4 h-4" />
            </button>

            <PopoverPanel
                open={moreOpen}
                onClose={() => setMoreOpen(false)}
                anchor={moreRef}
                width={220}
                align="end"
            >
                <div className="py-1">
                    <Link
                        href={`/manager/missions/${mission.id}`}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                        <ExternalLink className="w-4 h-4 text-slate-400" />
                        Ouvrir la mission
                    </Link>
                    <Link
                        href={`/manager/missions/${mission.id}?tab=assignments`}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                        <UserCog className="w-4 h-4 text-slate-400" />
                        Gérer les SDRs
                    </Link>
                    <Link
                        href={`/manager/missions/${mission.id}?tab=campaigns`}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                        <FileText className="w-4 h-4 text-slate-400" />
                        Campagnes & scripts
                    </Link>
                    <div className="border-t border-slate-100 my-1" />
                    <Link
                        href={`/manager/missions?clientId=${clientId}`}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                        <TrendingUp className="w-4 h-4 text-slate-400" />
                        Voir toutes les missions
                    </Link>
                </div>
            </PopoverPanel>
        </div>
    );
}

// ============================================================================
// SCRIPT MODAL (popover-style complex edit — routes to campaign UI)
// ============================================================================

function ScriptModal({ mission, onClose }: { mission: MissionLite | null; onClose: () => void }) {
    if (!mission) return null;
    const { success, error: showError } = useToast();
    const [scriptDraft, setScriptDraft] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const { data: campaigns = [], isLoading } = useQuery({
        queryKey: ["mission-campaigns-for-script-modal", mission.id],
        queryFn: async () => {
            const res = await fetch(`/api/campaigns?missionId=${mission.id}`);
            const json = await res.json();
            if (!json.success || !Array.isArray(json.data)) {
                throw new Error(json.error || "Impossible de charger les scripts");
            }
            return json.data as Array<{
                id: string;
                isActive: boolean;
                script: string | null;
                _count?: { actions?: number };
            }>;
        },
        enabled: !!mission?.id,
        staleTime: 30_000,
    });

    const targetCampaign = (campaigns.length > 0
        ? [...campaigns].sort((a, b) => {
              const activeDelta = Number(b.isActive) - Number(a.isActive);
              if (activeDelta !== 0) return activeDelta;
              const aActions = a._count?.actions ?? 0;
              const bActions = b._count?.actions ?? 0;
              return bActions - aActions;
          })[0]
        : null) as { id: string; script: string | null } | null;

    useEffect(() => {
        setScriptDraft(targetCampaign?.script ?? "");
    }, [targetCampaign?.id, targetCampaign?.script]);

    const saveScript = async () => {
        if (!targetCampaign) return;
        setIsSaving(true);
        try {
            const res = await fetch(`/api/campaigns/${targetCampaign.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ script: scriptDraft }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible de sauvegarder le script");
                return;
            }
            success("Script mis à jour", "Le script actif de la mission a été sauvegardé");
        } catch {
            showError("Erreur", "Impossible de sauvegarder le script");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={!!mission}
            onClose={onClose}
            title={`Script · ${mission.name}`}
            description="Edition directe du script principal de la mission"
            size="lg"
        >
            {isLoading ? (
                <div className="py-8 text-center text-sm text-slate-500">Chargement du script...</div>
            ) : !targetCampaign ? (
                <div className="text-center py-8">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700">
                        Aucun script disponible pour cette mission
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                        Créez d’abord une campagne active depuis la mission pour initialiser un script.
                    </p>
                    <Link
                        href={`/manager/missions/${mission.id}?tab=campaigns`}
                        className="inline-flex items-center gap-1.5 mt-4 px-3 py-2 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" /> Créer une campagne
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <textarea
                            value={scriptDraft}
                            onChange={(e) => setScriptDraft(e.target.value)}
                            className="w-full min-h-[320px] rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                            placeholder="Ecrivez le script principal de cette mission..."
                        />
                    </div>
                    <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={isSaving}>Fermer</Button>
                        <Button variant="primary" onClick={saveScript} disabled={isSaving}>
                            {isSaving ? "Enregistrement..." : "Enregistrer"}
                        </Button>
                        <Link
                            href={`/manager/missions/${mission.id}?tab=strategy`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-sm font-medium hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/30 transition-all"
                        >
                            <Settings2 className="w-4 h-4" />
                            Ouvrir la mission
                        </Link>
                    </div>
                </div>
            )}
        </Modal>
    );
}

// ============================================================================
// ENGAGEMENT SECTION (inline-editable + create + renew)
// ============================================================================

function EngagementSection({
    engagement,
    clientId,
    onChanged,
}: {
    engagement: ClientEngagementInsights | null;
    clientId: string;
    onChanged: () => void;
}) {
    const { success, error: showError } = useToast();
    const [modal, setModal] = useState<null | "create" | "renew">(null);

    const saveEngagementField = async (patch: Record<string, unknown>) => {
        if (!engagement) return;
        const res = await fetch(`/api/billing/engagements/${engagement.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
        });
        const json = await res.json();
        if (!json.success) {
            showError("Erreur", json.error || "Impossible de mettre à jour l’engagement");
            throw new Error(json.error);
        }
        success("Engagement mis à jour", "Modifications enregistrées");
        onChanged();
    };

    const offerName = engagement?.offreTarif?.nom ?? "—";

    return (
        <>
            <SectionCard
                title="Engagement"
                icon={<Receipt className="w-3.5 h-3.5" />}
                action={
                    engagement ? (
                        <button
                            onClick={() => setModal("renew")}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 text-xs font-medium transition-colors"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Renouveler
                        </button>
                    ) : null
                }
            >
                {!engagement ? (
                    <div className="text-center py-6">
                        <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-600">Aucun engagement pour ce client.</p>
                        <button
                            onClick={() => setModal("create")}
                            className="inline-flex items-center gap-1.5 mt-3 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Créer un engagement
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Top row: offer + status + dates */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
                            <div>
                                <p className="text-xs text-slate-500">Offre</p>
                                <p className="mt-0.5 text-sm font-medium text-slate-900 truncate">{offerName}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 mb-1">Statut</p>
                                <InlineSelect
                                    value={engagement.statut}
                                    asPill
                                    options={ENGAGEMENT_STATUT_OPTIONS}
                                    onSave={(v) => saveEngagementField({ statut: v })}
                                />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Durée</p>
                                <p className="mt-0.5 text-sm font-medium text-slate-900 tabular-nums">
                                    {engagement.dureeMois} mois
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">Période</p>
                                <p className="mt-0.5 text-sm font-medium text-slate-900 tabular-nums">
                                    {formatDate(engagement.debut)} → {formatDate(engagement.fin)}
                                </p>
                            </div>
                        </div>

                        {/* Pricing overrides */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-3 border-t border-slate-100">
                            <InlineText
                                label={`Fixe mensuel (défaut ${formatEuro(engagement.offreTarif?.fixeMensuel)})`}
                                value={toNumber(engagement.fixeOverride)?.toString() ?? ""}
                                type="number"
                                placeholder={formatEuro(engagement.offreTarif?.fixeMensuel)}
                                onSave={(v) =>
                                    saveEngagementField({ fixeOverride: v.trim() === "" ? null : Number(v) })
                                }
                            />
                            <InlineText
                                label={`Prix par RDV (défaut ${formatEuro(engagement.offreTarif?.prixParRdv)})`}
                                value={toNumber(engagement.rdvOverride)?.toString() ?? ""}
                                type="number"
                                placeholder={formatEuro(engagement.offreTarif?.prixParRdv)}
                                onSave={(v) =>
                                    saveEngagementField({ rdvOverride: v.trim() === "" ? null : Number(v) })
                                }
                            />
                        </div>

                        {/* Terms */}
                        <div className="grid grid-cols-1 gap-3 pt-3 border-t border-slate-100">
                            <InlineText
                                label="Conditions de renouvellement"
                                value={engagement.renouvellement || ""}
                                placeholder="Tacite reconduction, préavis, etc."
                                multiline
                                onSave={(v) => saveEngagementField({ renouvellement: v })}
                                valueClassName="!whitespace-pre-wrap !text-slate-700 !font-normal leading-relaxed"
                            />
                            <InlineText
                                label="Pénalité de résiliation"
                                value={engagement.penaliteResiliation || ""}
                                placeholder="Conditions de résiliation anticipée"
                                multiline
                                onSave={(v) => saveEngagementField({ penaliteResiliation: v })}
                                valueClassName="!whitespace-pre-wrap !text-slate-700 !font-normal leading-relaxed"
                            />
                        </div>
                    </div>
                )}
            </SectionCard>

            <EngagementModal
                mode={modal}
                clientId={clientId}
                engagement={engagement}
                onClose={() => setModal(null)}
                onSaved={() => {
                    setModal(null);
                    onChanged();
                }}
            />
        </>
    );
}

function EngagementModal({
    mode,
    clientId,
    engagement,
    onClose,
    onSaved,
}: {
    mode: null | "create" | "renew";
    clientId: string;
    engagement: ClientEngagementInsights | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { success, error: showError } = useToast();
    const [offreTarifId, setOffreTarifId] = useState("");
    const [dureeMois, setDureeMois] = useState(3);
    const [debut, setDebut] = useState(() => new Date().toISOString().slice(0, 10));
    const [isSaving, setIsSaving] = useState(false);

    const { data: offres = [] } = useQuery({
        queryKey: ["billing", "offres", "selectable"],
        queryFn: async () => {
            const res = await fetch("/api/billing/offres");
            const json = await res.json();
            if (!json.success || !Array.isArray(json.data)) return [];
            return json.data as Array<{ id: string; nom: string; fixeMensuel: number; prixParRdv: number }>;
        },
        enabled: mode === "create",
        staleTime: 60_000,
    });

    useEffect(() => {
        // Reset form each time the modal opens
        if (mode) {
            setDureeMois(mode === "renew" ? engagement?.dureeMois ?? 3 : 3);
            setDebut(new Date().toISOString().slice(0, 10));
            setOffreTarifId("");
        }
    }, [mode, engagement?.dureeMois]);

    const submit = async () => {
        setIsSaving(true);
        try {
            if (mode === "create") {
                if (!offreTarifId) {
                    showError("Offre requise", "Sélectionnez une offre tarifaire");
                    return;
                }
                const res = await fetch("/api/billing/engagements", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clientId, offreTarifId, dureeMois, debut }),
                });
                const json = await res.json();
                if (!json.success) {
                    showError("Erreur", json.error || "Impossible de créer l’engagement");
                    return;
                }
                success("Engagement créé", "Le nouvel engagement a été enregistré");
                onSaved();
            } else if (mode === "renew" && engagement) {
                const res = await fetch(`/api/billing/engagements/${engagement.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ nouveauDebut: debut, nouvelleDureeMois: dureeMois }),
                });
                const json = await res.json();
                if (!json.success) {
                    showError("Erreur", json.error || "Impossible de renouveler l’engagement");
                    return;
                }
                success("Engagement renouvelé", "Les nouvelles dates ont été enregistrées");
                onSaved();
            }
        } catch {
            showError("Erreur", "Une erreur est survenue");
        } finally {
            setIsSaving(false);
        }
    };

    const durationOptions = [1, 2, 3, 6, 9, 12, 18, 24, 36];

    return (
        <Modal
            isOpen={!!mode}
            onClose={onClose}
            title={mode === "renew" ? "Renouveler l’engagement" : "Créer un engagement"}
            description={
                mode === "renew"
                    ? "Définissez la nouvelle date de début et la durée."
                    : "Choisissez une offre tarifaire, la durée et la date de début."
            }
            size="md"
        >
            <div className="space-y-4">
                {mode === "create" && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Offre tarifaire</label>
                        <select
                            value={offreTarifId}
                            onChange={(e) => setOffreTarifId(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                        >
                            <option value="">Sélectionner une offre…</option>
                            {offres.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.nom} · {Number(o.fixeMensuel).toLocaleString("fr-FR")} € / mois
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Date de début</label>
                        <DatePicker value={debut} onChange={setDebut} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Durée (mois)</label>
                        <select
                            value={String(dureeMois)}
                            onChange={(e) => setDureeMois(Number(e.target.value))}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                        >
                            {durationOptions.map((m) => (
                                <option key={m} value={m}>
                                    {m} mois
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                        Annuler
                    </Button>
                    <Button variant="primary" onClick={submit} disabled={isSaving}>
                        {isSaving
                            ? "Enregistrement…"
                            : mode === "renew"
                            ? "Renouveler"
                            : "Créer l’engagement"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

export default ClientDrawer;
