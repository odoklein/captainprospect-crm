"use client";

/**
 * ============================================================
 * CLIENT DETAIL PAGE — RESTRUCTURED
 * ============================================================
 * 4 tabs:
 *   1. Vue d'ensemble  — health dashboard
 *   2. Missions & Prospection — missions + lists merged
 *   3. Sessions & CRs  — Leexi transcriptions → AI CR generation
 *   4. Analytics & Persona — stats + persona merged
 *
 * Portal access (team) → collapsible section in overview
 * Contact info        → small block in overview
 * Calendar            → next meeting banner in overview
 * Quick-access sidebar → REMOVED
 * ============================================================
 */

import { useState, useEffect, use, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    Card,
    Button,
    Badge,
    ConfirmModal,
    Modal,
    ModalFooter,
    Skeleton,
    useToast,
    Input,
    Tabs,
    StatCard,
} from "@/components/ui";
import { ProgressBar } from "@/components/ui/ProgressBar";
import {
    ArrowLeft, Edit, Trash2, Building2, Target, Users, Mail,
    Phone, Plus, TrendingUp, Calendar, CheckCircle2, XCircle,
    Copy, CalendarCheck, User, Briefcase, FileText, Key,
    ShieldCheck, BarChart3, Loader2, ExternalLink, Zap, Video,
    MapPin, ChevronDown, ChevronUp, Mic, Sparkles, Clock,
    AlertCircle, RefreshCw, Send, Eye, List, Hash, ArrowUpRight,
    PenLine, Download,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AITaskExtractor, { type ExtractedTask } from "@/components/sessions/AITaskExtractor";
import { NewMissionDialog } from "@/app/manager/missions/_components/NewMissionDialog";
import { EditMissionDialog } from "@/app/manager/missions/[id]/_components/EditMissionDialog";
import { MISSION_STATUS_CONFIG } from "@/lib/constants/missionStatus";
import type { MissionStatusValue } from "@/lib/constants/missionStatus";

// ============================================================
// TYPES
// ============================================================

interface ListItem {
    id: string;
    name: string;
    type: string;
    _count: { companies: number };
}

interface CampaignItem {
    id: string;
    name: string;
    icp?: string;
}

interface Mission {
    id: string;
    name: string;
    channel: "CALL" | "EMAIL" | "LINKEDIN";
    channels?: ("CALL" | "EMAIL" | "LINKEDIN")[];
    objective?: string;
    status?: MissionStatusValue;
    isActive: boolean;
    startDate: string;
    endDate?: string;
    _count: { campaigns: number; lists: number };
    lists?: ListItem[];
    campaigns?: CampaignItem[];
}

interface PortalUser {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
    isActive?: boolean;
    lastSignInAt?: string | null;
    lastSignInIp?: string | null;
    lastSignInCountry?: string | null;
    lastConnectedAt?: string | null;
}

interface IntBookingLink {
    label: string;
    url: string;
    durationMinutes: number;
}

interface ContactEntry {
    value: string;
    label: string;
    isPrimary: boolean;
}

interface ClientInterlocuteur {
    id: string;
    firstName: string;
    lastName: string;
    title?: string;
    department?: string;
    territory?: string;
    emails: ContactEntry[];
    phones: ContactEntry[];
    bookingLinks: IntBookingLink[];
    notes?: string;
    isActive: boolean;
    createdAt: string;
    portalUser?: {
        id: string;
        email: string;
        name: string;
        isActive: boolean;
    } | null;
}

interface Client {
    id: string;
    name: string;
    industry?: string;
    email?: string;
    phone?: string;
    bookingUrl?: string;
    portalShowCallHistory?: boolean;
    portalShowDatabase?: boolean;
    createdAt: string;
    _count: { missions: number; users: number };
    missions?: Mission[];
    users?: PortalUser[];
    interlocuteurs?: ClientInterlocuteur[];
    onboarding?: { onboardingData?: { icp?: string } | null } | null;
    insights?: {
        production: {
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
        };
        engagement?: {
            id: string;
            dureeMois: number;
            debut: string;
            fin: string;
            statut: string;
            offreTarif: { nom: string };
        } | null;
    };
}

interface Meeting {
    id: string;
    createdAt: string;
    callbackDate?: string | null;
    meetingType?: "VISIO" | "PHYSIQUE" | "TELEPHONIQUE" | null;
    meetingAddress?: string | null;
    meetingJoinUrl?: string | null;
    meetingPhone?: string | null;
    contact: {
        id: string;
        firstName?: string;
        lastName?: string;
        title?: string;
        email?: string;
        phone?: string | null;
        company: { id: string; name: string; industry?: string };
    };
    campaign: {
        id: string;
        name: string;
        missionId: string;
        mission: { id: string; name: string };
    };
    sdr: { id: string; name: string; email: string };
}

interface MeetingsData {
    totalMeetings: number;
    byMission: Array<{
        missionId: string;
        missionName: string;
        count: number;
        meetings: Meeting[];
    }>;
    allMeetings: Meeting[];
}

// ---- Leexi types ----
interface LeexiTranscription {
    id: string;
    title: string;
    date: string;          // ISO
    duration: number;      // seconds
    participants: string[];
    transcript?: string;   // full text, loaded on demand
    recordingUrl?: string;
}

// ---- Session / CR types ----
type SessionType = "Kick-Off" | "Onboarding" | "Validation" | "Reporting" | "Suivi" | "Autre";

interface SessionTask {
    id: string;
    label: string;
    assignee?: string;
    assigneeRole?: "SDR" | "MANAGER" | "DEV" | "ALWAYS";
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    dueDate?: string | null;
    doneAt?: string | null;
    taskId?: string | null;
}

const ROLE_BADGE_COLORS: Record<string, { color: string; bg: string; label: string }> = {
    SDR: { color: "#10B981", bg: "rgba(16,185,129,0.1)", label: "SDR" },
    MANAGER: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)", label: "Manager" },
    DEV: { color: "#3B82F6", bg: "rgba(59,130,246,0.1)", label: "Dev" },
    ALWAYS: { color: "#8B5CF6", bg: "rgba(139,92,246,0.1)", label: "Tous" },
};

const PRIORITY_INDICATOR: Record<string, { color: string; label: string }> = {
    URGENT: { color: "#EF4444", label: "⚡" },
    HIGH: { color: "#F59E0B", label: "↑" },
    MEDIUM: { color: "#3B82F6", label: "→" },
    LOW: { color: "#6B7280", label: "↓" },
};

interface ClientSession {
    id: string;
    type: SessionType;
    customTypeLabel?: string;
    date: string;
    leexiId?: string;
    recordingUrl?: string;
    crMarkdown?: string;
    summaryEmail?: string;
    emailSentAt?: string | null;
    projectId?: string | null;
    tasks: SessionTask[];
    createdAt: string;
}

const SESSION_TYPE_COLORS: Record<SessionType, string> = {
    "Kick-Off":  "bg-indigo-100 text-indigo-700 border-indigo-200",
    "Onboarding":"bg-emerald-100 text-emerald-700 border-emerald-200",
    "Validation":"bg-pink-100 text-pink-700 border-pink-200",
    "Reporting": "bg-amber-100 text-amber-700 border-amber-200",
    "Suivi":     "bg-slate-100 text-slate-600 border-slate-200",
    "Autre":     "bg-purple-100 text-purple-700 border-purple-200",
};

const SESSION_MARKDOWN_CLASS =
    "prose prose-sm prose-slate max-w-none text-slate-800 " +
    "[&_h1]:text-slate-900 [&_h2]:text-slate-900 [&_h3]:text-slate-900 [&_h4]:text-slate-900 " +
    "[&_p]:text-slate-700 [&_li]:text-slate-700 [&_strong]:text-slate-900 " +
    "[&_a]:text-indigo-700 [&_a]:underline [&_code]:text-slate-900 [&_pre]:text-slate-900 [&_blockquote]:text-slate-700";

const CHANNEL_LABELS = { CALL: "Appel", EMAIL: "Email", LINKEDIN: "LinkedIn" };

function generateRandomPassword(length = 14): string {
    const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
    let out = "";
    for (let i = 0; i < length; i++) {
        out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
}

// ============================================================
// HELPER — ChatGPT prompt builder
// ============================================================

/**
 * Builds the full ChatGPT/Claude prompt used to generate:
 *   1. A structured compte-rendu (CR) in markdown
 *   2. A concise executive summary email
 *
 * @param clientName   – e.g. "UpikaJob"
 * @param sessionType  – e.g. "Kick-Off"
 * @param sessionDate  – e.g. "21/01/2026"
 * @param transcript   – full Leexi transcript text
 * @param crPublicUrl  – URL to the CR on the client portal (may be placeholder)
 * @param notifyByEmail– whether we will send the summary email automatically
 */
export function buildCRPrompt({
    clientName,
    sessionType,
    sessionDate,
    transcript,
    crPublicUrl = "[URL_ESPACE_CLIENT]",
    notifyByEmail = false,
}: {
    clientName: string;
    sessionType: string;
    sessionDate: string;
    transcript: string;
    crPublicUrl?: string;
    notifyByEmail?: boolean;
}): string {
    return `Tu es un assistant expert en relation client B2B pour une agence de prospection commerciale (Captain Prospect).
À partir de la transcription intégrale ci-dessous d'une session de type "${sessionType}" avec le client "${clientName}" (${sessionDate}), produis EXACTEMENT deux blocs séparés par le séparateur "---EMAIL_START---".

════════════════════════════════════════
BLOC 1 — COMPTE RENDU COMPLET (markdown)
════════════════════════════════════════
Rédige un compte rendu structuré, détaillé et fidèle au déroulé de la réunion.
- Commence par un titre H1 : "CR du ${sessionDate} — ${clientName} (${sessionType})"
- Utilise des titres H2/H3 pour chaque grande section
- Mets en avant : contexte, points clés, décisions prises, questions ouvertes, prochaines étapes
- Style : fluide, professionnel, précis mais humain
- À la fin, ajoute une section "## Prochaines étapes" avec une liste numérotée claire
- Langue : français

════════════════════════════════════════
BLOC 2 — MAIL DE SYNTHÈSE DIRIGEANTS
════════════════════════════════════════
Rédige un mail extrêmement concis, humain et professionnel dans l'esprit Captain Prospect.
Règles impératives :
- Commence UNIQUEMENT par le prénom du contact principal suivi d'une virgule
- Phrase d'intro naturelle type "Merci pour notre échange, voici l'essentiel à retenir" (varier la tournure à chaque fois)
- Aucun emoji, icône ou smiley
- Points numérotés (max 5), chacun en une phrase directe et actionnable couvrant : sujets clés, prochaines étapes, actions de chaque partie
- Termine par une phrase du type "Retrouve le compte rendu complet ici : ${crPublicUrl}" (varier la tournure)
- Lisible en moins de 30 secondes
- Langue : français
${notifyByEmail
    ? "\n⚠️ NOTE SYSTÈME : Ce mail sera envoyé automatiquement au client après validation. Assure-toi qu'il est prêt à l'envoi."
    : "\n⚠️ NOTE SYSTÈME : Ce mail ne sera PAS envoyé automatiquement. Il sera copié manuellement par l'équipe."}

════════════════════════════════════════
TRANSCRIPTION
════════════════════════════════════════
${transcript}

════════════════════════════════════════
FORMAT DE RÉPONSE OBLIGATOIRE
════════════════════════════════════════
[compte rendu markdown complet ici]

---EMAIL_START---

[mail de synthèse ici]
`;
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [client, setClient] = useState<Client | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editFormData, setEditFormData] = useState({
        name: "", industry: "", email: "", phone: "", bookingUrl: "",
    });
    const [showPersonaModal, setShowPersonaModal] = useState(false);
    const [personaValue, setPersonaValue] = useState("");
    const [isSavingPersona, setIsSavingPersona] = useState(false);

    // Meetings
    const [meetingsData, setMeetingsData] = useState<MeetingsData | null>(null);
    const [isLoadingMeetings, setIsLoadingMeetings] = useState(true);

    // Portal users
    const [showCreateUserModal, setShowCreateUserModal] = useState(false);
    const [isCreatingUser, setIsCreatingUser] = useState(false);
    const [createdUserCredentials, setCreatedUserCredentials] = useState<{ email: string; password?: string } | null>(null);
    const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);
    const [isDeletingUser, setIsDeletingUser] = useState(false);
    const [userFormData, setUserFormData] = useState({ name: "", email: "", password: "" });
    const [showPortalAccess, setShowPortalAccess] = useState(false);
    const [isSavingPortalSettings, setIsSavingPortalSettings] = useState(false);

    // Manage Access Dialog
    const [showManageAccessDialog, setShowManageAccessDialog] = useState(false);
    const [manageAccessSelectedId, setManageAccessSelectedId] = useState<string | null>(null);
    const [manageAccessSelectedType, setManageAccessSelectedType] = useState<"CLIENT_USER" | "COMMERCIAL" | null>(null);
    const [manageAccessMode, setManageAccessMode] = useState<"view" | "new">("view");
    const [manageAccessForm, setManageAccessForm] = useState({ name: "", email: "", password: "" });
    const [isSavingAccessUser, setIsSavingAccessUser] = useState(false);
    const [isTogglingAccessActive, setIsTogglingAccessActive] = useState(false);
    const [accessNewPassword, setAccessNewPassword] = useState("");
    const [isResettingAccessPassword, setIsResettingAccessPassword] = useState(false);
    const [resetPasswordResult, setResetPasswordResult] = useState<{ email: string; password: string } | null>(null);
    const [accessUserDetails, setAccessUserDetails] = useState<PortalUser | null>(null);
    const [isLoadingAccessDetails, setIsLoadingAccessDetails] = useState(false);
    const [isSendingRdvTestEmail, setIsSendingRdvTestEmail] = useState(false);

    // Interlocuteurs
    const [interlocuteurs, setInterlocuteurs] = useState<ClientInterlocuteur[]>([]);
    const [showIntModal, setShowIntModal] = useState(false);
    const [editingInt, setEditingInt] = useState<ClientInterlocuteur | null>(null);
    const [isDeletingInt, setIsDeletingInt] = useState<string | null>(null);
    const [showInterlocuteurs, setShowInterlocuteurs] = useState(true);
    const [isSavingInt, setIsSavingInt] = useState(false);
    const [activatingPortalFor, setActivatingPortalFor] = useState<string | null>(null);
    const [portalCredentials, setPortalCredentials] = useState<{ intId: string; email: string; password: string } | null>(null);

    // Tabs
    const [activeTab, setActiveTab] = useState<"overview" | "missions" | "sessions" | "analytics">("overview");
    const [showNewMissionDialog, setShowNewMissionDialog] = useState(false);
    const [editingMission, setEditingMission] = useState<Mission | null>(null);

    // Analytics
    const [clientStats, setClientStats] = useState<any>(null);
    const [clientPersona, setClientPersona] = useState<any>(null);
    const [isLoadingStats, setIsLoadingStats] = useState(false);
    const [isLoadingPersona, setIsLoadingPersona] = useState(false);
    const [statsDateRange, setStatsDateRange] = useState({ from: "", to: "" });

    // Sessions & CRs
    const [sessions, setSessions] = useState<ClientSession[]>([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);
    const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
    const [showCRTab, setShowCRTab] = useState<"cr" | "email">("cr");
    const [reportDialogSession, setReportDialogSession] = useState<ClientSession | null>(null);
    const [reportDialogTab, setReportDialogTab] = useState<"cr" | "email">("cr");
    const [editingSession, setEditingSession] = useState<ClientSession | null>(null);
    const [editPreviewMode, setEditPreviewMode] = useState(false);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [isDeletingSession, setIsDeletingSession] = useState<string | null>(null);
    const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
    const [sessionSearch, setSessionSearch] = useState("");
    const [sessionTypeFilter, setSessionTypeFilter] = useState<SessionType | "all">("all");
    const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);

    // Leexi
    const [leexiTranscriptions, setLeexiTranscriptions] = useState<LeexiTranscription[]>([]);
    const [isLoadingLeexi, setIsLoadingLeexi] = useState(false);
    const [showNewSessionModal, setShowNewSessionModal] = useState(false);
    const [newSessionForm, setNewSessionForm] = useState({
        type: "Kick-Off" as SessionType,
        leexiId: "",
        notifyByEmail: false,
        customTypeLabel: "",
    });
    const [sessionDateInput, setSessionDateInput] = useState("");
    const [transcriptMode, setTranscriptMode] = useState<"leexi" | "text" | "cr">("leexi");
    const [manualTranscript, setManualTranscript] = useState("");
    const [manualCR, setManualCR] = useState("");
    const [manualSummaryEmail, setManualSummaryEmail] = useState("");
    const [isGeneratingCR, setIsGeneratingCR] = useState(false);
    const [generatedCR, setGeneratedCR] = useState<{ cr: string; email: string } | null>(null);
    const [isSavingSession, setIsSavingSession] = useState(false);
    const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);

    const getSessionTypeLabel = (session: ClientSession) =>
        session.type === "Autre" && session.customTypeLabel?.trim()
            ? session.customTypeLabel.trim()
            : session.type;

    const openSessionReportDialog = (session: ClientSession, tab: "cr" | "email" = "cr") => {
        setReportDialogSession(session);
        setReportDialogTab(tab);
    };

    const downloadSessionReportCsv = (session: ClientSession) => {
        if (!client) return;

        const BOM = "\uFEFF";
        const delimiter = ";";
        const headers = [
            "Client",
            "Date session",
            "Type session",
            "Compte rendu complet",
            "Mail de synthese",
            "Statut email",
            "Lien enregistrement",
            "Projet",
            "Tache",
            "Statut tache",
            "Priorite",
            "Role",
            "Assignee",
            "Echeance",
        ];

        const taskRows = session.tasks.length > 0 ? session.tasks : [null];
        const rows = taskRows.map((task) => [
            client.name,
            new Date(session.date).toLocaleDateString("fr-FR"),
            getSessionTypeLabel(session),
            session.crMarkdown || "",
            session.summaryEmail || "",
            session.emailSentAt
                ? `Envoye le ${new Date(session.emailSentAt).toLocaleDateString("fr-FR")}`
                : "Non envoye automatiquement",
            session.recordingUrl || "",
            session.projectId ? `/manager/projects/${session.projectId}` : "",
            task?.label || "",
            task?.doneAt ? "Terminee" : task ? "A faire" : "",
            task?.priority || "",
            task?.assigneeRole || "",
            task?.assignee || "",
            task?.dueDate ? new Date(task.dueDate).toLocaleDateString("fr-FR") : "",
        ]);

        const escapeCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
        const csv = BOM + [headers, ...rows].map((row) => row.map(escapeCell).join(delimiter)).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const safeClientName = client.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase();

        link.href = url;
        link.download = `${safeClientName || "client"}_rapport_session_${session.date.slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        success("Export CSV", "Le rapport a ete telecharge.");
    };

    // ============================================================
    // FETCH CLIENT
    // ============================================================

    const fetchClient = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/clients/${resolvedParams.id}`);
            const json = await res.json();
            if (json.success) {
                setClient(json.data);
                setInterlocuteurs(
                    (json.data.interlocuteurs || []).map((i: Record<string, unknown>) => ({
                        ...i,
                        emails: Array.isArray(i.emails) ? i.emails : [],
                        phones: Array.isArray(i.phones) ? i.phones : [],
                        bookingLinks: Array.isArray(i.bookingLinks) ? i.bookingLinks : [],
                    })) as ClientInterlocuteur[]
                );
                setEditFormData({
                    name: json.data.name,
                    industry: json.data.industry || "",
                    email: json.data.email || "",
                    phone: json.data.phone || "",
                    bookingUrl: json.data.bookingUrl || "",
                });
            } else {
                showError("Erreur", json.error);
                router.push("/manager/clients");
            }
        } catch {
            showError("Erreur", "Impossible de charger le client");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchClient(); }, [resolvedParams.id]);

    const getMissionStatus = (mission: Mission): MissionStatusValue => {
        if (mission.status) return mission.status;
        return mission.isActive ? "ACTIVE" : "PAUSED";
    };

    // ============================================================
    // FETCH MEETINGS
    // ============================================================

    const fetchMeetings = async () => {
        setIsLoadingMeetings(true);
        try {
            const res = await fetch(`/api/clients/${resolvedParams.id}/meetings`);
            const json = await res.json();
            if (json.success) setMeetingsData(json.data);
        } catch { /* silent */ }
        finally { setIsLoadingMeetings(false); }
    };

    useEffect(() => { if (client) fetchMeetings(); }, [client]);

    // ============================================================
    // FETCH SESSIONS (from your DB)
    // ============================================================

    const fetchSessions = async () => {
        setIsLoadingSessions(true);
        try {
            const res = await fetch(`/api/clients/${resolvedParams.id}/sessions`);
            const json = await res.json();
            if (json.success) setSessions(json.data);
        } catch { /* silent */ }
        finally { setIsLoadingSessions(false); }
    };

    useEffect(() => {
        if (activeTab === "sessions" && client) fetchSessions();
    }, [activeTab, client]);

    // ============================================================
    // FETCH LEEXI TRANSCRIPTIONS
    // ============================================================

    /**
     * Calls your backend proxy: GET /api/leexi/transcriptions?clientId=xxx
     *
     * Your backend should:
     *   1. Call Leexi API  GET https://api.leexi.ai/v1/recordings
     *      with header  Authorization: Bearer {LEEXI_API_KEY}
     *      and filter by clientId / contact email if the Leexi API supports it.
     *   2. Return { success: true, data: LeexiTranscription[] }
     *
     * Leexi API docs: https://docs.leexi.ai
     * Required env var: LEEXI_API_KEY
     */
    const fetchLeexiTranscriptions = async () => {
        setIsLoadingLeexi(true);
        try {
            const res = await fetch(`/api/leexi/transcriptions?clientId=${resolvedParams.id}`);
            const json = await res.json();
            if (json.success) setLeexiTranscriptions(json.data);
            else showError("Leexi", json.error || "Impossible de charger les transcriptions");
        } catch {
            showError("Leexi", "Erreur de connexion à Leexi");
        } finally {
            setIsLoadingLeexi(false);
        }
    };

    useEffect(() => {
        if (showNewSessionModal) fetchLeexiTranscriptions();
    }, [showNewSessionModal]);

    // ============================================================
    // ANALYTICS
    // ============================================================

    useEffect(() => {
        const to = new Date();
        const from = new Date(to);
        from.setDate(from.getDate() - 30);
        setStatsDateRange({
            from: from.toISOString().split("T")[0],
            to: to.toISOString().split("T")[0],
        });
    }, []);

    const fetchClientStats = async () => {
        if (!client?.id) return;
        setIsLoadingStats(true);
        try {
            const p = new URLSearchParams();
            p.set("from", statsDateRange.from);
            p.set("to", statsDateRange.to);
            p.append("clientIds[]", client.id);
            const res = await fetch(`/api/analytics/stats?${p}`);
            const json = await res.json();
            if (json.success) setClientStats(json.data);
        } catch { /* silent */ }
        finally { setIsLoadingStats(false); }
    };

    const fetchClientPersona = async () => {
        if (!client?.id || !client.missions?.length) return;
        setIsLoadingPersona(true);
        try {
            const p = new URLSearchParams();
            p.set("from", statsDateRange.from);
            p.set("to", statsDateRange.to);
            client.missions.forEach((m) => p.append("missionIds[]", m.id));
            const res = await fetch(`/api/analytics/persona?${p}`);
            const json = await res.json();
            if (json.success) setClientPersona(json.data);
        } catch { /* silent */ }
        finally { setIsLoadingPersona(false); }
    };

    useEffect(() => {
        if (activeTab === "analytics" && client?.id) {
            fetchClientStats();
            fetchClientPersona();
        }
    }, [activeTab, client?.id, statsDateRange]);

    // ============================================================
    // GENERATE CR VIA CLAUDE / ANTHROPIC API
    // ============================================================

    /**
     * Flow:
     *  1. Fetch full transcript from Leexi via /api/leexi/transcript/:id
     *  2. Build the prompt using buildCRPrompt()
     *  3. POST to /api/ai/generate-cr  (your backend calls Anthropic claude-opus-4-6)
     *  4. Parse the response — split on "---EMAIL_START---"
     *  5. Store in generatedCR state
     *
     * Backend route /api/ai/generate-cr should:
     *   - Accept { prompt: string }
     *   - Call Anthropic API with model: "claude-opus-4-6", max_tokens: 4096
     *   - Return { success: true, data: { text: string } }
     */
    const handleGenerateCR = async () => {
        if (!client) {
            showError("Erreur", "Client introuvable");
            return;
        }

        // Determine transcript source (Leexi vs manual text / imported CR)
        const isLeexiMode = transcriptMode === "leexi";
        const isTextMode = transcriptMode === "text";

        if (isLeexiMode && !newSessionForm.leexiId) {
            showError("Erreur", "Sélectionnez une transcription Leexi");
            return;
        }

        // Only enforce the 20‑character minimum when user pastes a raw transcription
        if (isTextMode && (!manualTranscript.trim() || manualTranscript.trim().length < 20)) {
            showError("Erreur", "La transcription doit contenir au moins 20 caractères");
            return;
        }

        setIsGeneratingCR(true);
        setGeneratedCR(null);

        try {
            // If user chose to import an already prepared CR, we skip AI generation
            if (transcriptMode === "cr") {
                const cr = manualCR.trim();
                const email = manualSummaryEmail.trim();
                if (!cr) {
                    showError("Erreur", "Merci de coller au minimum le compte rendu.");
                    return;
                }
                setGeneratedCR({ cr, email });
                return;
            }

            let transcriptText: string;
            const selectedLeexi = leexiTranscriptions.find((t) => t.id === newSessionForm.leexiId);

            // Effective date for the session (used both in prompt and for saving)
            const effectiveDateIso = sessionDateInput
                ? new Date(sessionDateInput).toISOString()
                : (selectedLeexi?.date || new Date().toISOString());
            const sessionDate = new Date(effectiveDateIso).toLocaleDateString("fr-FR");

            if (isLeexiMode) {
                // 1. Fetch full transcript from Leexi
                const transcriptRes = await fetch(`/api/leexi/transcript/${newSessionForm.leexiId}`);
                const transcriptJson = await transcriptRes.json();
                if (!transcriptJson.success) throw new Error(transcriptJson.error || "Transcript fetch failed");
                transcriptText = transcriptJson.data.transcript;
            } else {
                // Use manually pasted transcript
                transcriptText = manualTranscript.trim();
            }

            // 2. Build prompt
            const sessionTypeLabel =
                newSessionForm.type === "Autre" && newSessionForm.customTypeLabel.trim().length > 0
                    ? newSessionForm.customTypeLabel.trim()
                    : newSessionForm.type;
            const prompt = buildCRPrompt({
                clientName: client.name,
                sessionType: sessionTypeLabel,
                sessionDate,
                transcript: transcriptText,
                crPublicUrl: `${process.env.NEXT_PUBLIC_APP_URL}/client/sessions/[SESSION_ID]`,
                notifyByEmail: newSessionForm.notifyByEmail,
            });

            // 3. Call AI endpoint
            const aiRes = await fetch("/api/ai/generate-cr", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt }),
            });
            const aiJson = await aiRes.json();
            if (!aiJson.success) throw new Error(aiJson.error || "AI generation failed");

            // 4. Parse response
            const fullText: string = aiJson.data.text;
            const splitIndex = fullText.indexOf("---EMAIL_START---");
            if (splitIndex === -1) {
                setGeneratedCR({ cr: fullText, email: "" });
            } else {
                setGeneratedCR({
                    cr: fullText.slice(0, splitIndex).trim(),
                    email: fullText.slice(splitIndex + "---EMAIL_START---".length).trim(),
                });
            }
        } catch (err: any) {
            showError("Erreur", err.message || "Impossible de générer le CR");
        } finally {
            setIsGeneratingCR(false);
        }
    };

    // ============================================================
    // SAVE SESSION
    // ============================================================

    /**
     * POST /api/clients/:id/sessions
     * Body: { type, leexiId, crMarkdown, summaryEmail, notifyByEmail, recordingUrl }
     *
     * If notifyByEmail is true, your backend should:
     *   - Save the session
     *   - Send the summaryEmail to client.email via your email provider (Resend, SendGrid, etc.)
     *   - Return { success: true, data: ClientSession, emailSent: boolean }
     *
     * If notifyByEmail is false:
     *   - Just save and return { success: true, data: ClientSession, emailSent: false }
     */
    const handleSaveSession = async () => {
        if (!client || !generatedCR) return;
        setIsSavingSession(true);
        try {
            const selectedLeexi = leexiTranscriptions.find((t) => t.id === newSessionForm.leexiId);
            const effectiveDateIso = sessionDateInput
                ? new Date(sessionDateInput).toISOString()
                : (selectedLeexi?.date || new Date().toISOString());
            const res = await fetch(`/api/clients/${client.id}/sessions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: newSessionForm.type,
                    leexiId: newSessionForm.leexiId,
                    crMarkdown: generatedCR.cr,
                    summaryEmail: generatedCR.email,
                    notifyByEmail: newSessionForm.notifyByEmail,
                    recordingUrl: selectedLeexi?.recordingUrl,
                    date: effectiveDateIso,
                    // Optional label when type === "Autre"
                    customTypeLabel:
                        newSessionForm.type === "Autre" && newSessionForm.customTypeLabel.trim().length > 0
                            ? newSessionForm.customTypeLabel.trim()
                            : undefined,
                    tasks: extractedTasks.filter(t => t.label.trim().length > 0).map(t => ({
                        label: t.label.trim(),
                        assignee: t.assignee || undefined,
                        assigneeId: t.assigneeId || undefined,
                        assigneeRole: t.assigneeRole,
                        priority: t.priority,
                        dueDate: t.dueDate || undefined,
                    })),
                }),
            });
            const json = await res.json();
            if (json.success) {
                const taskCount = extractedTasks.filter(t => t.label.trim().length > 0).length;
                let msg = json.emailSent
                    ? `CR sauvegardé et mail envoyé à ${client.email}`
                    : "CR sauvegardé. Le mail n'a pas été envoyé automatiquement.";
                if (taskCount > 0 && json.projectId) {
                    msg += ` — ${taskCount} tâche${taskCount > 1 ? "s" : ""} ajoutée${taskCount > 1 ? "s" : ""} au projet.`;
                }
                success("Session enregistrée", msg);
                setShowNewSessionModal(false);
                setGeneratedCR(null);
                setNewSessionForm({ type: "Kick-Off", leexiId: "", notifyByEmail: false, customTypeLabel: "" });
                setSessionDateInput("");
                setManualTranscript("");
                setManualCR("");
                setManualSummaryEmail("");
                setExtractedTasks([]);
                await fetchSessions();
            } else {
                showError("Erreur", json.error);
            }
        } catch {
            showError("Erreur", "Impossible d'enregistrer la session");
        } finally {
            setIsSavingSession(false);
        }
    };

    // ============================================================
    // EDIT / DELETE SESSION
    // ============================================================

    const handleUpdateSession = async () => {
        if (!client || !editingSession) return;
        setIsSavingEdit(true);
        try {
            const newTasks = extractedTasks.filter(t => t.label.trim().length > 0);
            const res = await fetch(`/api/clients/${client.id}/sessions/${editingSession.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: editingSession.type,
                    date: editingSession.date,
                    crMarkdown: editingSession.crMarkdown,
                    summaryEmail: editingSession.summaryEmail,
                    ...(newTasks.length > 0 ? {
                        tasks: newTasks.map(t => ({
                            label: t.label.trim(),
                            assignee: t.assignee || undefined,
                            assigneeId: t.assigneeId || undefined,
                            assigneeRole: t.assigneeRole,
                            priority: t.priority,
                            dueDate: t.dueDate || undefined,
                        })),
                    } : {}),
                }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible de mettre à jour la session");
                return;
            }
            const taskCount = newTasks.length;
            success(
                "Session mise à jour",
                taskCount > 0 && json.data?.projectId
                    ? `${taskCount} tâche${taskCount > 1 ? "s" : ""} ajoutée${taskCount > 1 ? "s" : ""} au projet.`
                    : ""
            );
            setEditingSession(null);
            setExtractedTasks([]);
            setEditPreviewMode(false);
            await fetchSessions();
        } catch {
            showError("Erreur", "Impossible de mettre à jour la session");
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleDeleteSession = async (sessionId: string) => {
        if (!client) return;
        setIsDeletingSession(sessionId);
        try {
            const res = await fetch(`/api/clients/${client.id}/sessions/${sessionId}`, {
                method: "DELETE",
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible de supprimer la session");
                return;
            }
            success("Session supprimée", "");
            setExpandedSessionId((prev) => (prev === sessionId ? null : prev));
            await fetchSessions();
        } catch {
            showError("Erreur", "Impossible de supprimer la session");
        } finally {
            setIsDeletingSession(null);
        }
    };

    // ============================================================
    // TOGGLE SESSION TASK DONE/UNDONE
    // ============================================================

    const handleToggleTask = async (sessionId: string, taskId: string) => {
        if (!client) return;
        setTogglingTaskId(taskId);
        try {
            const res = await fetch(`/api/clients/${client.id}/sessions/${sessionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ toggleTaskId: taskId }),
            });
            const json = await res.json();
            if (json.success) {
                setSessions(prev => prev.map(s => {
                    if (s.id !== sessionId) return s;
                    return {
                        ...s,
                        tasks: s.tasks.map(t =>
                            t.id === taskId ? { ...t, doneAt: json.data.doneAt } : t
                        ),
                    };
                }));
            }
        } catch { /* silent */ } finally {
            setTogglingTaskId(null);
        }
    };

    // ============================================================
    // UPDATE / DELETE CLIENT
    // ============================================================

    const handleUpdate = async () => {
        if (!client) return;
        try {
            const res = await fetch(`/api/clients/${client.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editFormData),
            });
            const json = await res.json();
            if (json.success) {
                setClient(json.data);
                setShowEditModal(false);
                success("Client mis à jour", `${editFormData.name} a été mis à jour`);
            } else showError("Erreur", json.error);
        } catch { showError("Erreur", "Impossible de mettre à jour le client"); }
    };

    const handleSavePersona = async () => {
        if (!client) return;
        setIsSavingPersona(true);
        try {
            const res = await fetch(`/api/clients/${client.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ icp: personaValue }),
            });
            const json = await res.json();
            if (json.success) {
                setClient(json.data);
                setShowPersonaModal(false);
                success("Persona mis à jour", "Le profil cible (ICP) du client a été enregistré.");
            } else showError("Erreur", json.error);
        } catch {
            showError("Erreur", "Impossible de mettre à jour le persona");
        } finally {
            setIsSavingPersona(false);
        }
    };

    const handleDelete = async () => {
        if (!client) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
            const json = await res.json();
            if (json.success) {
                success("Client supprimé", `${client.name} a été supprimé`);
                router.push("/manager/clients");
            } else showError("Erreur", json.error);
        } catch { showError("Erreur", "Impossible de supprimer le client"); }
        finally { setIsDeleting(false); setShowDeleteModal(false); }
    };

    // ============================================================
    // PORTAL USERS
    // ============================================================

    const handleCreateUser = async () => {
        if (!client || !userFormData.name || !userFormData.email) {
            showError("Erreur", "Veuillez remplir le nom et l'email");
            return;
        }
        setIsCreatingUser(true);
        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: userFormData.name,
                    email: userFormData.email,
                    password: userFormData.password || undefined,
                    role: "CLIENT",
                    clientId: client.id,
                }),
            });
            const json = await res.json();
            if (json.success) {
                success("Accès créé", "Le compte portail client a été créé");
                setCreatedUserCredentials({ email: userFormData.email, password: json.generatedPassword || userFormData.password });
                setUserFormData({ name: "", email: "", password: "" });
                await fetchClient();
            } else showError("Erreur", json.error || "Impossible de créer l'accès");
        } catch { showError("Erreur", "Une erreur est survenue"); }
        finally { setIsCreatingUser(false); }
    };

    const handleDeleteUser = async () => {
        if (!userToDelete) return;
        setIsDeletingUser(true);
        try {
            const res = await fetch(`/api/users/${userToDelete.id}`, { method: "DELETE" });
            const json = await res.json();
            if (json.success) {
                success("Accès révoqué", `L'accès de ${userToDelete.name} a été supprimé`);
                if (manageAccessSelectedId === userToDelete.id) {
                    setManageAccessSelectedId(null);
                    setAccessUserDetails(null);
                    setManageAccessMode("view");
                }
                await fetchClient();
            } else showError("Erreur", json.error);
        } catch { showError("Erreur", "Une erreur est survenue"); }
        finally { setIsDeletingUser(false); setUserToDelete(null); }
    };

    const handlePortalVisibilityChange = async (
        key: "portalShowCallHistory" | "portalShowDatabase",
        value: boolean
    ) => {
        if (!client) return;
        const previous = client[key] ?? false;
        setIsSavingPortalSettings(true);
        setClient((prev) => (prev ? { ...prev, [key]: value } : prev));

        try {
            const res = await fetch(`/api/clients/${client.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ [key]: value }),
            });
            const json = await res.json();
            if (json.success) {
                setClient((prev) => (prev ? { ...prev, ...json.data } : prev));
            } else {
                setClient((prev) => (prev ? { ...prev, [key]: previous } : prev));
                showError("Erreur", json.error || "Impossible de mettre à jour le portail client");
            }
        } catch {
            setClient((prev) => (prev ? { ...prev, [key]: previous } : prev));
            showError("Erreur", "Impossible de mettre à jour le portail client");
        } finally {
            setIsSavingPortalSettings(false);
        }
    };

    // ============================================================
    // MANAGE ACCESS DIALOG
    // ============================================================

    const openManageAccessDialog = () => {
        setShowManageAccessDialog(true);
        setResetPasswordResult(null);
        setAccessNewPassword("");
        const firstClientUser = client?.users?.find((u) => u.role === "CLIENT") || client?.users?.[0];
        if (firstClientUser) {
            setManageAccessMode("view");
            setManageAccessSelectedId(firstClientUser.id);
            setManageAccessSelectedType(firstClientUser.role === "COMMERCIAL" ? "COMMERCIAL" : "CLIENT_USER");
            void loadAccessUserDetails(firstClientUser.id);
        } else {
            setManageAccessMode("new");
            setManageAccessSelectedId(null);
            setManageAccessSelectedType(null);
            setManageAccessForm({ name: "", email: "", password: "" });
        }
    };

    const closeManageAccessDialog = () => {
        if (isSavingAccessUser || isResettingAccessPassword || isTogglingAccessActive) return;
        setShowManageAccessDialog(false);
        setManageAccessSelectedId(null);
        setManageAccessSelectedType(null);
        setAccessUserDetails(null);
        setResetPasswordResult(null);
        setAccessNewPassword("");
        setManageAccessForm({ name: "", email: "", password: "" });
    };

    const loadAccessUserDetails = async (userId: string) => {
        setIsLoadingAccessDetails(true);
        try {
            const res = await fetch(`/api/users/${userId}`);
            const json = await res.json();
            if (json.success) {
                setAccessUserDetails(json.data);
                setManageAccessForm({ name: json.data.name || "", email: json.data.email || "", password: "" });
            }
        } catch {
            // fallback to data from client.users list
            const fallback = client?.users?.find((u) => u.id === userId) || null;
            if (fallback) {
                setAccessUserDetails(fallback);
                setManageAccessForm({ name: fallback.name, email: fallback.email, password: "" });
            }
        } finally {
            setIsLoadingAccessDetails(false);
        }
    };

    const handleSelectAccessUser = (userId: string, type: "CLIENT_USER" | "COMMERCIAL" = "CLIENT_USER") => {
        setManageAccessMode("view");
        setManageAccessSelectedId(userId);
        setManageAccessSelectedType(type);
        setResetPasswordResult(null);
        setAccessNewPassword("");
        void loadAccessUserDetails(userId);
    };

    const handleStartNewAccess = () => {
        setManageAccessMode("new");
        setManageAccessSelectedId(null);
        setManageAccessSelectedType(null);
        setAccessUserDetails(null);
        setResetPasswordResult(null);
        setAccessNewPassword("");
        setManageAccessForm({ name: "", email: "", password: "" });
    };

    const handleSendRdvTestEmail = async () => {
        if (!client || !manageAccessSelectedId || !manageAccessSelectedType) return;
        setIsSendingRdvTestEmail(true);
        try {
            let payload: Record<string, string> | null = null;
            if (manageAccessSelectedType === "CLIENT_USER") {
                payload = { recipientType: "CLIENT_USER", userId: manageAccessSelectedId };
            } else {
                const targetInterlocuteur = interlocuteurs.find(
                    (i) => i.portalUser?.id === manageAccessSelectedId
                );
                if (!targetInterlocuteur) {
                    showError("Erreur", "Commercial introuvable pour cet accès");
                    return;
                }
                payload = { recipientType: "COMMERCIAL", interlocuteurId: targetInterlocuteur.id };
            }

            const res = await fetch(`/api/clients/${client.id}/rdv-email-test`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (json.success) {
                success(
                    "Email test envoyé",
                    `Test RDV confirmé envoyé à ${json.data?.to || "le destinataire"}`
                );
            } else {
                showError("Erreur", json.error || "Impossible d'envoyer le test");
            }
        } catch {
            showError("Erreur", "Impossible d'envoyer le test");
        } finally {
            setIsSendingRdvTestEmail(false);
        }
    };

    const handleSaveAccessProfile = async () => {
        if (!manageAccessSelectedId) return;
        if (!manageAccessForm.name.trim() || !manageAccessForm.email.trim()) {
            showError("Erreur", "Le nom et l'email sont requis");
            return;
        }
        setIsSavingAccessUser(true);
        try {
            const res = await fetch(`/api/users/${manageAccessSelectedId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: manageAccessForm.name, email: manageAccessForm.email }),
            });
            const json = await res.json();
            if (json.success) {
                success("Profil mis à jour", "Les informations ont été sauvegardées");
                await fetchClient();
                await loadAccessUserDetails(manageAccessSelectedId);
            } else showError("Erreur", json.error || "Impossible de mettre à jour");
        } catch { showError("Erreur", "Une erreur est survenue"); }
        finally { setIsSavingAccessUser(false); }
    };

    const handleToggleAccessActive = async () => {
        if (!manageAccessSelectedId || !accessUserDetails) return;
        const next = !(accessUserDetails.isActive ?? true);
        setIsTogglingAccessActive(true);
        try {
            const res = await fetch(`/api/users/${manageAccessSelectedId}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: next }),
            });
            const json = await res.json();
            if (json.success) {
                success(next ? "Accès réactivé" : "Accès révoqué", json.data?.message || "");
                await fetchClient();
                await loadAccessUserDetails(manageAccessSelectedId);
            } else showError("Erreur", json.error || "Impossible de modifier le statut");
        } catch { showError("Erreur", "Une erreur est survenue"); }
        finally { setIsTogglingAccessActive(false); }
    };

    const handleResetAccessPassword = async () => {
        if (!manageAccessSelectedId || !accessUserDetails) return;
        if (accessNewPassword && accessNewPassword.length < 6) {
            showError("Erreur", "Le mot de passe doit contenir au moins 6 caractères");
            return;
        }
        const passwordToSet = accessNewPassword || generateRandomPassword();
        setIsResettingAccessPassword(true);
        try {
            const res = await fetch(`/api/users/${manageAccessSelectedId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: passwordToSet }),
            });
            const json = await res.json();
            if (json.success) {
                success("Mot de passe réinitialisé", "Communiquez le nouveau mot de passe au client");
                setResetPasswordResult({ email: accessUserDetails.email, password: passwordToSet });
                setAccessNewPassword("");
            } else showError("Erreur", json.error || "Impossible de réinitialiser le mot de passe");
        } catch { showError("Erreur", "Une erreur est survenue"); }
        finally { setIsResettingAccessPassword(false); }
    };

    const handleCreateAccessUser = async () => {
        if (!client) return;
        if (!manageAccessForm.name.trim() || !manageAccessForm.email.trim()) {
            showError("Erreur", "Le nom et l'email sont requis");
            return;
        }
        setIsSavingAccessUser(true);
        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: manageAccessForm.name,
                    email: manageAccessForm.email,
                    password: manageAccessForm.password || undefined,
                    role: "CLIENT",
                    clientId: client.id,
                }),
            });
            const json = await res.json();
            if (json.success) {
                success("Accès créé", "Le compte portail a été créé");
                setResetPasswordResult({
                    email: manageAccessForm.email,
                    password: json.generatedPassword || manageAccessForm.password,
                });
                const newId = json.data?.id;
                await fetchClient();
                if (newId) {
                    setManageAccessMode("view");
                    setManageAccessSelectedId(newId);
                    await loadAccessUserDetails(newId);
                }
            } else showError("Erreur", json.error || "Impossible de créer l'accès");
        } catch { showError("Erreur", "Une erreur est survenue"); }
        finally { setIsSavingAccessUser(false); }
    };

    // ============================================================
    // INTERLOCUTEURS CRUD
    // ============================================================

    const handleCreateInterlocuteur = async (data: Omit<ClientInterlocuteur, "id" | "createdAt">) => {
        if (!client) return;
        setIsSavingInt(true);
        try {
            const res = await fetch(`/api/clients/${client.id}/interlocuteurs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            const json = await res.json();
            if (json.success) {
                const created = {
                    ...json.data,
                    emails: Array.isArray(json.data.emails) ? json.data.emails : [],
                    phones: Array.isArray(json.data.phones) ? json.data.phones : [],
                    bookingLinks: Array.isArray(json.data.bookingLinks) ? json.data.bookingLinks : [],
                } as ClientInterlocuteur;
                setInterlocuteurs(prev => [...prev, created]);
                setShowIntModal(false);
                setEditingInt(null);
                success("Commercial ajouté", `${data.firstName} ${data.lastName} a été ajouté`);
            } else showError("Erreur", json.error);
        } catch { showError("Erreur", "Impossible de créer le commercial"); }
        finally { setIsSavingInt(false); }
    };

    const handleUpdateInterlocuteur = async (iid: string, data: Partial<Omit<ClientInterlocuteur, "id" | "createdAt">>) => {
        if (!client) return;
        setIsSavingInt(true);
        try {
            const res = await fetch(`/api/clients/${client.id}/interlocuteurs/${iid}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            const json = await res.json();
            if (json.success) {
                const updated = {
                    ...json.data,
                    emails: Array.isArray(json.data.emails) ? json.data.emails : [],
                    phones: Array.isArray(json.data.phones) ? json.data.phones : [],
                    bookingLinks: Array.isArray(json.data.bookingLinks) ? json.data.bookingLinks : [],
                } as ClientInterlocuteur;
                setInterlocuteurs(prev => prev.map(i => i.id === iid ? updated : i));
                setShowIntModal(false);
                setEditingInt(null);
                success("Commercial mis à jour", `${updated.firstName} ${updated.lastName} a été mis à jour`);
            } else showError("Erreur", json.error);
        } catch { showError("Erreur", "Impossible de mettre à jour le commercial"); }
        finally { setIsSavingInt(false); }
    };

    const handleDeleteInterlocuteur = async (iid: string) => {
        if (!client) return;
        setIsDeletingInt(iid);
        try {
            const res = await fetch(`/api/clients/${client.id}/interlocuteurs/${iid}`, { method: "DELETE" });
            const json = await res.json();
            if (json.success) {
                setInterlocuteurs(prev => prev.filter(i => i.id !== iid));
                success("Commercial supprimé", "Le commercial a été supprimé");
            } else showError("Erreur", json.error);
        } catch { showError("Erreur", "Impossible de supprimer le commercial"); }
        finally { setIsDeletingInt(null); }
    };

    const handleActivatePortal = async (interl: ClientInterlocuteur) => {
        if (!client) return;
        setActivatingPortalFor(interl.id);
        try {
            const res = await fetch(`/api/clients/${client.id}/interlocuteurs/${interl.id}/activate-portal`, {
                method: "POST",
            });
            const json = await res.json();
            if (json.success) {
                if (json.data.alreadyExists) {
                    success("Portail déjà activé", `Un compte existe déjà pour ${interl.firstName}`);
                } else {
                    setPortalCredentials({
                        intId: interl.id,
                        email: json.data.user.email,
                        password: json.data.generatedPassword,
                    });
                    setInterlocuteurs(prev => prev.map(i => i.id === interl.id
                        ? { ...i, portalUser: { id: json.data.user.id, email: json.data.user.email, name: json.data.user.name, isActive: true } }
                        : i
                    ));
                }
            } else {
                showError("Erreur", json.error || "Impossible d'activer le portail");
            }
        } catch { showError("Erreur", "Une erreur est survenue"); }
        finally { setActivatingPortalFor(null); }
    };

    const handleDeactivatePortal = async (interl: ClientInterlocuteur) => {
        if (!client || !interl.portalUser) return;
        setActivatingPortalFor(interl.id);
        try {
            const res = await fetch(`/api/clients/${client.id}/interlocuteurs/${interl.id}/activate-portal`, {
                method: "DELETE",
            });
            const json = await res.json();
            if (json.success) {
                setInterlocuteurs(prev => prev.map(i => i.id === interl.id
                    ? { ...i, portalUser: null }
                    : i
                ));
                success("Portail désactivé", `L'accès portail de ${interl.firstName} a été révoqué`);
            } else showError("Erreur", json.error);
        } catch { showError("Erreur", "Une erreur est survenue"); }
        finally { setActivatingPortalFor(null); }
    };

    // ============================================================
    // COMPUTED
    // ============================================================

    const nextMeeting = meetingsData?.allMeetings
        .filter((m) => m.callbackDate && new Date(m.callbackDate) > new Date())
        .sort((a, b) => new Date(a.callbackDate!).getTime() - new Date(b.callbackDate!).getTime())[0];

    const lastSessionDaysAgo = sessions.length
        ? Math.floor((Date.now() - new Date(sessions[0].createdAt).getTime()) / 86400000)
        : null;

    const openTasksCount = sessions.reduce((acc, s) =>
        acc + s.tasks.filter((t) => !t.doneAt).length, 0);

    const clientPortalUsers = (client?.users || []).filter((u) => u.role === "CLIENT");
    const commercialPortalUsers = interlocuteurs.filter((i) => i.portalUser);

    // ============================================================
    // LOADING
    // ============================================================

    if (isLoading) {
        return (
            <div className="space-y-8 max-w-7xl mx-auto">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="space-y-2">
                        <Skeleton className="h-8 w-64" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
                </div>
                <Skeleton className="h-96 rounded-2xl" />
            </div>
        );
    }

    if (!client) return null;

    // ============================================================
    // RENDER
    // ============================================================

    return (
        <div className="max-w-[1440px] mx-auto pb-16 space-y-8">

            {/* ── HEADER ── */}
            <div className="relative">
                <div className="absolute inset-0 -top-6 -left-6 -right-6 h-40 bg-gradient-to-b from-indigo-50/60 to-transparent rounded-3xl -z-10" />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pt-2">
                    <div className="flex items-center gap-4">
                        <Link href="/manager/clients">
                            <button className="h-10 w-10 rounded-xl bg-white/80 backdrop-blur border border-slate-200/60 text-slate-400 hover:text-slate-700 hover:border-slate-300 hover:shadow-sm flex items-center justify-center transition-all duration-200">
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                        </Link>
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 shadow-lg shadow-indigo-500/20 flex items-center justify-center text-2xl font-bold text-white ring-4 ring-white">
                                {client.name[0]}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">{client.name}</h1>
                                <div className="flex items-center gap-2.5 mt-1">
                                    <Badge variant="outline" className="bg-white/80 text-slate-600 border-slate-200 text-[11px]">
                                        <Building2 className="w-3 h-3 mr-1 text-slate-400" />
                                        {client.industry || "Secteur non défini"}
                                    </Badge>
                                    <span className="text-slate-300 text-xs">·</span>
                                    <span className="text-xs text-slate-400 font-medium">
                                        Client depuis {new Date(client.createdAt).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {client.bookingUrl && (
                            <a href={client.bookingUrl} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="sm" className="gap-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all">
                                    <Calendar className="w-3.5 h-3.5" />
                                    Réserver
                                </Button>
                            </a>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setShowEditModal(true)} className="gap-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all">
                            <Edit className="w-3.5 h-3.5" />
                            Modifier
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)} className="gap-1.5">
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* ── SEGMENTED CONTROL ── */}
            <Tabs
                variant="pills"
                activeTab={activeTab}
                onTabChange={(id) => setActiveTab(id as typeof activeTab)}
                tabs={[
                    { id: "overview",  label: "Vue d'ensemble",         icon: <Building2 className="w-4 h-4" /> },
                    { id: "missions",  label: "Missions & Prospection", icon: <Target className="w-4 h-4" /> },
                    { id: "sessions",  label: "Sessions & CRs",         icon: <FileText className="w-4 h-4" /> },
                    { id: "analytics", label: "Analytics",              icon: <BarChart3 className="w-4 h-4" /> },
                ]}
                className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border border-slate-200/60 shadow-sm rounded-2xl"
            />

            {/* ════════════════════════════════════════════
                TAB 1 — VUE D'ENSEMBLE
            ════════════════════════════════════════════ */}
            {activeTab === "overview" && (
                <div className="space-y-8">

                    {/* ── KPI CARDS ── */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        <StatCard
                            label="Missions actives"
                            value={client.missions?.filter(m => m.isActive).length || 0}
                            icon={Target}
                            iconBg="bg-indigo-50"
                            iconColor="text-indigo-600"
                            subtitle={client.missions?.length ? (
                                <span className="text-slate-500">{client.missions.length} au total</span>
                            ) : undefined}
                        />
                        <StatCard
                            label="Sessions"
                            value={sessions.length}
                            icon={Mic}
                            iconBg="bg-violet-50"
                            iconColor="text-violet-600"
                            subtitle={sessions.length > 0 ? (
                                <button onClick={() => setActiveTab("sessions")} className="text-violet-600 font-medium text-xs hover:underline">Voir les sessions</button>
                            ) : undefined}
                        />
                        <StatCard
                            label="RDV pris"
                            value={meetingsData?.totalMeetings || 0}
                            icon={CalendarCheck}
                            iconBg="bg-emerald-50"
                            iconColor="text-emerald-600"
                            subtitle={nextMeeting ? (
                                <span className="text-emerald-600 font-medium">Prochain : {new Date(nextMeeting.callbackDate!).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                            ) : undefined}
                        />
                        <StatCard
                            label="Tâches ouvertes"
                            value={openTasksCount}
                            icon={AlertCircle}
                            iconBg={openTasksCount > 0 ? "bg-amber-50" : "bg-slate-50"}
                            iconColor={openTasksCount > 0 ? "text-amber-600" : "text-slate-400"}
                            className={openTasksCount > 0 ? "ring-1 ring-amber-200/60" : ""}
                        />
                        <StatCard
                            label="Dernière session"
                            value={lastSessionDaysAgo === null ? "—" : `J-${lastSessionDaysAgo}`}
                            icon={Clock}
                            iconBg={lastSessionDaysAgo !== null && lastSessionDaysAgo > 14 ? "bg-red-50" : "bg-emerald-50"}
                            iconColor={lastSessionDaysAgo !== null && lastSessionDaysAgo > 14 ? "text-red-500" : "text-emerald-600"}
                            className={lastSessionDaysAgo !== null && lastSessionDaysAgo > 14 ? "ring-1 ring-red-200/60" : ""}
                            subtitle={lastSessionDaysAgo !== null && lastSessionDaysAgo > 14 ? (
                                <span className="text-red-500 font-medium text-xs">Relance recommandée</span>
                            ) : undefined}
                        />
                    </div>

                    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-4 mb-4">
                            <div>
                                <h2 className="text-sm font-bold text-slate-900">Production & engagement</h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Objectifs de planning et activité réellement enregistrée ce mois.
                                </p>
                            </div>
                            {client.insights?.production.month && (
                                <Badge variant="outline" className="bg-slate-50 text-slate-600">
                                    {new Date(`${client.insights.production.month}-01T12:00:00`).toLocaleDateString("fr-FR", {
                                        month: "long",
                                        year: "numeric",
                                    })}
                                </Badge>
                            )}
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Jours prévus / mois</p>
                                <p className="mt-2 text-2xl font-bold text-slate-900">
                                    {client.insights?.production.plannedMonthDays ?? "Non défini"}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                    {client.insights?.production.hasMonthlyPlan ? "Plans mensuels actifs" : "Calculé depuis les jours / semaine"}
                                </p>
                            </div>
                            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">Jours prévus / semaine</p>
                                <p className="mt-2 text-2xl font-bold text-slate-900">
                                    {client.insights?.production.plannedWeekDays ?? "Non défini"}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">Fréquence des missions</p>
                            </div>
                            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Jours avec appels</p>
                                <p className="mt-2 text-2xl font-bold text-slate-900">
                                    {client.insights?.production.workedCallDays ?? client.insights?.production.executedDays ?? 0}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                    {client.insights?.production.totalCalls ?? 0} appels · {client.insights?.production.totalMeetings ?? 0} RDV
                                </p>
                            </div>
                            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Engagement</p>
                                <p className="mt-2 text-xl font-bold text-slate-900">
                                    {client.insights?.engagement
                                        ? `${client.insights.engagement.dureeMois} mois`
                                        : "Sans engagement"}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                    {client.insights?.engagement
                                        ? `${client.insights.engagement.offreTarif.nom} · fin ${new Date(client.insights.engagement.fin).toLocaleDateString("fr-FR")}`
                                        : "Aucun engagement actif"}
                                </p>
                            </div>
                        </div>
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Début réel de mission</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                                Premier appel : {client.insights?.production.firstCallAt
                                    ? new Date(client.insights.production.firstCallAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
                                    : "Aucun appel enregistré"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                {client.insights?.production.totalWorkedCallDays ?? 0} jour{(client.insights?.production.totalWorkedCallDays ?? 0) > 1 ? "s" : ""} avec appels depuis le lancement.
                            </p>
                        </div>
                    </div>

                    {/* ── PROCHAIN RDV — timeline highlight ── */}
                    {nextMeeting && (
                        <div className="relative rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-indigo-50 via-indigo-50/80 to-white p-5 overflow-hidden group hover:shadow-md hover:border-indigo-300 transition-all duration-300">
                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-indigo-500 to-indigo-400 rounded-l-2xl" />
                            <div className="flex items-center justify-between gap-6 pl-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-white border border-indigo-200/60 shadow-sm flex flex-col items-center justify-center">
                                        <span className="text-[10px] font-bold text-indigo-600 uppercase leading-none">
                                            {new Date(nextMeeting.callbackDate!).toLocaleDateString("fr-FR", { month: "short" })}
                                        </span>
                                        <span className="text-lg font-bold text-slate-900 leading-none mt-0.5">
                                            {new Date(nextMeeting.callbackDate!).getDate()}
                                        </span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Prochain RDV</span>
                                            {nextMeeting.meetingType && (
                                                <Badge variant="primary" className="text-[10px] py-0 border-0">
                                                    {nextMeeting.meetingType === "VISIO" ? "Visio" : nextMeeting.meetingType === "PHYSIQUE" ? "Présentiel" : "Téléphone"}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="font-semibold text-slate-900 text-sm">
                                            {nextMeeting.contact.firstName} {nextMeeting.contact.lastName}
                                            {nextMeeting.contact.company?.name && (
                                                <span className="text-slate-500 font-normal"> — {nextMeeting.contact.company.name}</span>
                                            )}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {new Date(nextMeeting.callbackDate!).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                                            {" à "}
                                            {new Date(nextMeeting.callbackDate!).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {nextMeeting.meetingJoinUrl && (
                                        <a href={nextMeeting.meetingJoinUrl} target="_blank" rel="noopener noreferrer">
                                            <Button variant="primary" size="sm" className="gap-1.5 shadow-sm shadow-indigo-500/20">
                                                <Video className="w-3.5 h-3.5" />
                                                Rejoindre
                                            </Button>
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                        {/* LEFT — Missions actives + Sessions récentes */}
                        <div className="lg:col-span-2 space-y-8">
                            {/* Missions actives */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Missions actives</h2>
                                    <button onClick={() => setActiveTab("missions")} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                                        Tout voir <ArrowUpRight className="w-3 h-3" />
                                    </button>
                                </div>
                                {client.missions?.filter(m => m.isActive).length ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {client.missions.filter(m => m.isActive).slice(0, 4).map((mission) => (
                                            <Link key={mission.id} href={`/manager/missions/${mission.id}`}>
                                                <Card className="group overflow-hidden border-slate-200 hover:shadow-md transition-all duration-200 h-full">
                                                    <div className="p-4 space-y-3">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                                                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 truncate">{mission.name}</p>
                                                                    <p className="text-xs text-slate-500 mt-0.5">{CHANNEL_LABELS[mission.channel]}</p>
                                                                </div>
                                                            </div>
                                                            <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0 mt-1" />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <div className="flex items-center justify-between text-xs text-slate-500">
                                                                <span>{mission._count.campaigns} campagne{mission._count.campaigns > 1 ? "s" : ""}</span>
                                                                <span>{mission._count.lists} liste{mission._count.lists > 1 ? "s" : ""}</span>
                                                            </div>
                                                            <ProgressBar value={mission._count.campaigns} max={Math.max(mission._count.campaigns + mission._count.lists, 1)} height="sm" />
                                                        </div>
                                                    </div>
                                                </Card>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <Card className="border-slate-200">
                                        <div className="p-8 text-center">
                                            <Target className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                                            <p className="text-sm text-slate-500">Aucune mission active</p>
                                            <Link href={`/manager/missions/new?clientId=${client.id}`}>
                                                <Button variant="outline" size="sm" className="mt-3">Créer une mission</Button>
                                            </Link>
                                        </div>
                                    </Card>
                                )}
                            </div>

                            {/* Sessions récentes */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Sessions récentes</h2>
                                    <button onClick={() => setActiveTab("sessions")} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                                        Tout voir <ArrowUpRight className="w-3 h-3" />
                                    </button>
                                </div>
                                {sessions.length > 0 ? (
                                    <Card className="overflow-hidden border-slate-200">
                                        <div className="divide-y divide-slate-100">
                                            {sessions.slice(0, 4).map((s) => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => { setActiveTab("sessions"); setExpandedSessionId(s.id); }}
                                                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50/80 transition-colors text-left"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <Badge className={cn("text-[10px] border shrink-0", SESSION_TYPE_COLORS[s.type])}>{s.type}</Badge>
                                                        <span className="text-sm text-slate-700">
                                                            {new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {s.tasks.filter(t => !t.doneAt).length > 0 && (
                                                            <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                                                {s.tasks.filter(t => !t.doneAt).length} tâche{s.tasks.filter(t => !t.doneAt).length > 1 ? "s" : ""}
                                                            </Badge>
                                                        )}
                                                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-300" />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </Card>
                                ) : (
                                    <Card className="border-slate-200">
                                        <div className="p-8 text-center">
                                            <FileText className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                                            <p className="text-sm text-slate-500">Aucune session enregistrée</p>
                                            <button onClick={() => setActiveTab("sessions")} className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1">
                                                Créer la première <ArrowUpRight className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </Card>
                                )}
                            </div>
                        </div>

                        {/* RIGHT — Contact + Persona + Commerciaux + Portal */}
                        <div className="space-y-4">
                            {/* Contact principal */}
                            <Card className="overflow-hidden border-slate-200 hover:shadow-md transition-shadow duration-200">
                                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Contact principal</h2>
                                    <button onClick={() => setShowEditModal(true)} className="text-xs text-indigo-600 font-semibold hover:text-indigo-700">Modifier</button>
                                </div>
                                <div className="p-4 space-y-2.5">
                                    {client.email ? (
                                        <div className="group/item flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                            </div>
                                            <a href={`mailto:${client.email}`} className="text-sm text-slate-700 hover:text-indigo-600 truncate flex-1">{client.email}</a>
                                            <button onClick={() => { navigator.clipboard.writeText(client.email!); success("Copié", ""); }} className="opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                <Copy className="w-3.5 h-3.5 text-slate-300 hover:text-slate-500" />
                                            </button>
                                        </div>
                                    ) : <p className="text-sm text-slate-400 italic">Email non renseigné</p>}
                                    {client.phone ? (
                                        <div className="group/item flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                            </div>
                                            <a href={`tel:${client.phone}`} className="text-sm text-slate-700 hover:text-indigo-600 flex-1">{client.phone}</a>
                                            <button onClick={() => { navigator.clipboard.writeText(client.phone!); success("Copié", ""); }} className="opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                <Copy className="w-3.5 h-3.5 text-slate-300 hover:text-slate-500" />
                                            </button>
                                        </div>
                                    ) : <p className="text-sm text-slate-400 italic">Téléphone non renseigné</p>}
                                    {client.bookingUrl && (
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                            </div>
                                            <a href={client.bookingUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline truncate flex-1">{client.bookingUrl}</a>
                                        </div>
                                    )}
                                </div>
                            </Card>

                            {/* Persona / ICP */}
                            <Card className="overflow-hidden border-slate-200 hover:shadow-md transition-shadow duration-200">
                                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <Target className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                        Persona / ICP
                                    </h2>
                                    <button
                                        onClick={() => {
                                            setPersonaValue((client.onboarding?.onboardingData as { icp?: string } | null)?.icp ?? "");
                                            setShowPersonaModal(true);
                                        }}
                                        className="text-xs text-indigo-600 font-semibold hover:text-indigo-700"
                                    >
                                        Modifier
                                    </button>
                                </div>
                                <div className="p-4">
                                    {((client.onboarding?.onboardingData as { icp?: string } | null)?.icp?.trim()) ? (
                                        <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                                            {(client.onboarding?.onboardingData as { icp?: string }).icp}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-slate-400 italic">Persona non renseigné. Cliquez sur Modifier.</p>
                                    )}
                                </div>
                            </Card>

                            {/* Commerciaux — collapsible, compact list */}
                            <Card className="overflow-hidden border-slate-200 hover:shadow-md transition-shadow duration-200">
                                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowInterlocuteurs(!showInterlocuteurs)}
                                        className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left"
                                    >
                                        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                            <Users className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                            Commerciaux
                                            {interlocuteurs.length > 0 && (
                                                <Badge className="text-[10px] bg-indigo-100 text-indigo-700 border-0 ml-1">{interlocuteurs.length}</Badge>
                                            )}
                                        </h2>
                                        {showInterlocuteurs ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setEditingInt(null); setShowIntModal(true); }}
                                        className="text-xs text-indigo-600 font-semibold hover:text-indigo-700 shrink-0"
                                    >
                                        + Ajouter
                                    </button>
                                </div>
                                {showInterlocuteurs && (
                                    <div className="p-3">
                                        {interlocuteurs.length > 0 ? (
                                            <div className="space-y-2">
                                                {interlocuteurs.map((interl) => {
                                                    const primaryEmail = interl.emails.find(e => e.isPrimary) || interl.emails[0];
                                                    const primaryPhone = interl.phones.find(p => p.isPrimary) || interl.phones[0];
                                                    const hash = interl.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
                                                    const avatarColors = [
                                                        "bg-indigo-100 text-indigo-700",
                                                        "bg-rose-100 text-rose-700",
                                                        "bg-emerald-100 text-emerald-700",
                                                        "bg-amber-100 text-amber-700",
                                                        "bg-purple-100 text-purple-700",
                                                        "bg-cyan-100 text-cyan-700",
                                                    ];
                                                    const avatarColor = avatarColors[hash % avatarColors.length];
                                                    return (
                                                        <div key={interl.id} className={cn("group/card rounded-xl border p-3 transition-all", interl.isActive ? "border-slate-200 bg-white hover:shadow-sm" : "border-slate-200 bg-slate-50/50")}>
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2.5 min-w-0">
                                                                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0", avatarColor)}>
                                                                        {interl.firstName[0]}{interl.lastName[0]}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className={cn("text-sm font-semibold text-slate-900 truncate", !interl.isActive && "line-through text-slate-400")}>
                                                                            {interl.firstName} {interl.lastName}
                                                                        </p>
                                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                                            {interl.title && <span className="text-[11px] text-slate-500 truncate">{interl.title}</span>}
                                                                            {primaryEmail && (
                                                                                <span className="text-[11px] text-slate-400 truncate hidden sm:inline">{interl.title ? "·" : ""} {primaryEmail.value}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity">
                                                                    <Badge className={cn("text-[10px] border-0", interl.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                                                                        {interl.isActive ? "Actif" : "Inactif"}
                                                                    </Badge>
                                                                    <button onClick={() => { setEditingInt(interl); setShowIntModal(true); }} className="p-1 text-slate-400 hover:text-indigo-600 rounded">
                                                                        <Edit className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteInterlocuteur(interl.id)}
                                                                        disabled={isDeletingInt === interl.id}
                                                                        className="p-1 text-slate-400 hover:text-red-600 rounded"
                                                                    >
                                                                        {isDeletingInt === interl.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            {(interl.territory || interl.department) && (
                                                                <div className="flex flex-wrap gap-1 mt-2 ml-10">
                                                                    {interl.territory && <Badge className="text-[10px] bg-slate-100 text-slate-600 border-0">{interl.territory}</Badge>}
                                                                    {interl.department && <Badge className="text-[10px] bg-slate-100 text-slate-600 border-0">{interl.department}</Badge>}
                                                                </div>
                                                            )}
                                                            {interl.bookingLinks.length > 0 && (
                                                                <div className="flex flex-wrap gap-1.5 mt-2 ml-10">
                                                                    {interl.bookingLinks.map((bl, idx) => (
                                                                        <button
                                                                            key={idx}
                                                                            onClick={() => { navigator.clipboard.writeText(bl.url); success("Lien copié", bl.label); }}
                                                                            className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg px-2 py-0.5 text-[10px] font-semibold hover:bg-indigo-100 transition-colors"
                                                                        >
                                                                            <Calendar className="w-2.5 h-2.5" />
                                                                            {bl.label} · {bl.durationMinutes}min
                                                                            <Copy className="w-2.5 h-2.5 ml-0.5 opacity-60" />
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div className="mt-2 pt-2 border-t border-slate-100 ml-10">
                                                                {interl.portalUser ? (
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                                                            <ShieldCheck className="w-2.5 h-2.5" /> Portail actif
                                                                        </span>
                                                                        <button
                                                                            onClick={() => handleDeactivatePortal(interl)}
                                                                            disabled={activatingPortalFor === interl.id}
                                                                            className="text-[10px] text-red-400 hover:text-red-600 font-medium"
                                                                            title="Révoquer l'accès portail"
                                                                        >
                                                                            {activatingPortalFor === interl.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Révoquer"}
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => handleActivatePortal(interl)}
                                                                        disabled={activatingPortalFor === interl.id || !interl.isActive}
                                                                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-full transition-colors disabled:opacity-50"
                                                                    >
                                                                        {activatingPortalFor === interl.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />}
                                                                        Activer portail
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-center py-4">
                                                <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                                <p className="text-xs text-slate-500 mb-3">Aucun commercial ajouté</p>
                                                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => { setEditingInt(null); setShowIntModal(true); }}>
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Ajouter un commercial
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card>

                            {/* Accès portail clients */}
                            <Card className="overflow-hidden border-slate-200 hover:shadow-md transition-shadow duration-200">
                                <button
                                    onClick={() => setShowPortalAccess(!showPortalAccess)}
                                    className="w-full px-4 py-3 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between"
                                >
                                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                                        Portail clients
                                        {clientPortalUsers.length > 0 && (
                                            <Badge className="text-[10px] bg-indigo-100 text-indigo-700 border-0 ml-1">{clientPortalUsers.length}</Badge>
                                        )}
                                    </h2>
                                    {showPortalAccess ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                                </button>
                                {showPortalAccess && (
                                    <div className="p-3">
                                        {clientPortalUsers.length > 0 ? (
                                            <div className="space-y-1.5 mb-3">
                                                {clientPortalUsers.map((u) => (
                                                    <button
                                                        key={u.id}
                                                        onClick={() => {
                                                            setShowManageAccessDialog(true);
                                                            setManageAccessMode("view");
                                                            setManageAccessSelectedId(u.id);
                                                            setManageAccessSelectedType("CLIENT_USER");
                                                            setResetPasswordResult(null);
                                                            setAccessNewPassword("");
                                                            void loadAccessUserDetails(u.id);
                                                        }}
                                                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-50 text-left transition-colors"
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-slate-900 truncate flex items-center gap-1.5">
                                                                {u.name}
                                                                {u.isActive === false && (
                                                                    <Badge className="text-[9px] bg-red-100 text-red-700 border-0">Révoqué</Badge>
                                                                )}
                                                            </p>
                                                            <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                                                        </div>
                                                        <ChevronUp className="w-3.5 h-3.5 text-slate-300 rotate-90" />
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-500 mb-3">Aucun accès configuré.</p>
                                        )}
                                        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
                                            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                                                Paramètres du portail client
                                            </p>
                                            <label className="flex items-center justify-between gap-3 text-xs text-slate-700">
                                                <span>Afficher l&apos;historique d&apos;appels</span>
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 accent-indigo-600"
                                                    checked={client.portalShowCallHistory ?? false}
                                                    onChange={(e) => handlePortalVisibilityChange("portalShowCallHistory", e.target.checked)}
                                                    disabled={isSavingPortalSettings}
                                                />
                                            </label>
                                            <label className="flex items-center justify-between gap-3 text-xs text-slate-700">
                                                <span>Afficher la base de données (contacts / entreprises)</span>
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 accent-indigo-600"
                                                    checked={client.portalShowDatabase ?? false}
                                                    onChange={(e) => handlePortalVisibilityChange("portalShowDatabase", e.target.checked)}
                                                    disabled={isSavingPortalSettings}
                                                />
                                            </label>
                                            {isSavingPortalSettings && (
                                                <p className="text-[11px] text-slate-500">Mise à jour en cours...</p>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <Button variant="primary" size="sm" className="w-full gap-1.5 text-xs" onClick={openManageAccessDialog}>
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                Gérer les accès clients
                                            </Button>
                                            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => setShowCreateUserModal(true)}>
                                                <Plus className="w-3.5 h-3.5" />
                                                Nouvel accès rapide
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </Card>

                            {/* Portail commerciaux */}
                            <Card className="overflow-hidden border-slate-200 hover:shadow-md transition-shadow duration-200">
                                <div className="w-full px-4 py-3 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                        <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                                        Portail commerciaux
                                        {commercialPortalUsers.length > 0 && (
                                            <Badge className="text-[10px] bg-indigo-100 text-indigo-700 border-0 ml-1">
                                                {commercialPortalUsers.length}
                                            </Badge>
                                        )}
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={openManageAccessDialog}
                                        className="text-xs text-indigo-600 font-semibold hover:text-indigo-700"
                                    >
                                        Gérer
                                    </button>
                                </div>
                                <div className="p-3">
                                    {commercialPortalUsers.length > 0 ? (
                                        <div className="space-y-1.5">
                                            {commercialPortalUsers.map((interl) => (
                                                <button
                                                    key={interl.id}
                                                    onClick={() => {
                                                        if (!interl.portalUser) return;
                                                        setShowManageAccessDialog(true);
                                                        handleSelectAccessUser(interl.portalUser.id, "COMMERCIAL");
                                                    }}
                                                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-50 text-left transition-colors"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-slate-900 truncate">
                                                            {interl.firstName} {interl.lastName}
                                                        </p>
                                                        <p className="text-[11px] text-slate-500 truncate">
                                                            {interl.portalUser?.email}
                                                        </p>
                                                    </div>
                                                    <Badge className="text-[9px] bg-violet-100 text-violet-700 border-0">
                                                        COMMERCIAL
                                                    </Badge>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-500">
                                            Aucun portail commercial actif. Activez un portail dans la section Commerciaux.
                                        </p>
                                    )}
                                </div>
                            </Card>
                        </div>

                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════
                TAB 2 — MISSIONS & PROSPECTION
            ════════════════════════════════════════════ */}
            {activeTab === "missions" && (
                <div className="space-y-8">
                    {/* Missions */}
                    <Card className="border-slate-200">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <h2 className="font-bold text-slate-900 flex items-center gap-2">
                                <Target className="w-5 h-5 text-indigo-500" />
                                Missions
                            </h2>
                            <Button variant="primary" size="sm" className="gap-2 shadow-sm shadow-indigo-500/20" onClick={() => setShowNewMissionDialog(true)}>
                                    <Plus className="w-4 h-4" />
                                    Nouvelle mission
                            </Button>
                        </div>
                        {client.missions?.length ? (
                            <div className="p-4 space-y-4">
                                {client.missions.map((mission) => (
                                    <div
                                        key={mission.id}
                                        className={cn(
                                            "group block bg-white border rounded-xl p-5 hover:shadow-md transition-all duration-200 border-l-4",
                                            getMissionStatus(mission) === "ACTIVE"
                                                ? "border-slate-200 border-l-indigo-500 hover:border-indigo-300"
                                                : "border-slate-200 border-l-slate-300 hover:border-slate-300"
                                        )}
                                    >
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div className="flex items-start gap-4">
                                                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", getMissionStatus(mission) === "ACTIVE" ? "bg-indigo-50" : "bg-slate-100")}>
                                                    {getMissionStatus(mission) === "ACTIVE"
                                                        ? <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                                                        : <XCircle className="w-5 h-5 text-slate-400" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                                        {mission.name}
                                                        <Badge variant={getMissionStatus(mission) === "ACTIVE" ? "success" : "default"} className="text-xs">
                                                            {MISSION_STATUS_CONFIG[getMissionStatus(mission)].label}
                                                        </Badge>
                                                    </h3>
                                                    <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
                                                        <span className="font-medium text-slate-700">{CHANNEL_LABELS[mission.channel]}</span>
                                                        <span>·</span>
                                                        <span>{mission._count.campaigns} campagne{mission._count.campaigns > 1 ? "s" : ""}</span>
                                                        <span>·</span>
                                                        <span>{mission._count.lists} liste{mission._count.lists > 1 ? "s" : ""}</span>
                                                    </div>
                                                    <div className="mt-3 max-w-xs">
                                                        <ProgressBar value={mission._count.campaigns} max={Math.max(mission._count.campaigns + mission._count.lists, 1)} height="sm" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-sm text-slate-500 sm:text-right shrink-0">
                                                <p>Début : {new Date(mission.startDate).toLocaleDateString("fr-FR")}</p>
                                                {mission.endDate && <p>Fin : {new Date(mission.endDate).toLocaleDateString("fr-FR")}</p>}
                                                <div className="mt-3 flex items-center gap-2 sm:justify-end">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="gap-1.5"
                                                        onClick={() => setEditingMission(mission)}
                                                    >
                                                        <Edit className="w-3.5 h-3.5" />
                                                        Modifier
                                                    </Button>
                                                    <Link href={`/manager/missions/${mission.id}`}>
                                                        <Button variant="ghost" size="sm" className="gap-1.5">
                                                            Ouvrir
                                                            <ArrowUpRight className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16">
                                <Target className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                <p className="text-sm text-slate-500 mb-4">Aucune mission pour ce client</p>
                                <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowNewMissionDialog(true)}>
                                    <Plus className="w-4 h-4" />
                                    Créer une mission
                                </Button>
                            </div>
                        )}
                    </Card>

                    {/* Lists — grouped under their mission */}
                    {client.missions?.some((m) => m.lists?.length) && (
                        <Card className="border-slate-200">
                            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                                <h2 className="font-bold text-slate-900 flex items-center gap-2">
                                    <List className="w-5 h-5 text-indigo-500" />
                                    Listes de prospection
                                </h2>
                            </div>
                            <div className="p-6 space-y-6">
                                {client.missions.map((mission) =>
                                    mission.lists?.length ? (
                                        <div key={mission.id}>
                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                <Target className="w-3.5 h-3.5 text-indigo-400" />
                                                {mission.name}
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                {mission.lists.map((list) => (
                                                    <Link key={list.id} href={`/manager/lists/${list.id}`}
                                                        className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md bg-white transition-all group">
                                                        <div>
                                                            <p className="font-semibold text-slate-900 group-hover:text-indigo-600">{list.name}</p>
                                                            <p className="text-xs text-slate-500 mt-0.5">{list._count.companies} sociétés</p>
                                                        </div>
                                                        <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null
                                )}
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════════
                TAB 3 — SESSIONS & CRs
            ════════════════════════════════════════════ */}
            {activeTab === "sessions" && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Sessions & Comptes Rendus</h2>
                            <p className="text-sm text-slate-500 mt-0.5">Historique des sessions de travail et CRs générés via Leexi</p>
                        </div>
                        <Button variant="primary" className="gap-2 shadow-sm shadow-indigo-500/20" onClick={() => setShowNewSessionModal(true)}>
                            <Sparkles className="w-4 h-4" />
                            Nouvelle session
                        </Button>
                    </div>

                    {/* Session timeline mini-view */}
                    {sessions.length > 1 && (
                        <div className="relative px-2">
                            <div className="absolute top-4 left-6 right-6 h-0.5 bg-slate-200" />
                            <div className="flex justify-between relative">
                                {sessions.slice().reverse().slice(0, 8).map((s, i) => (
                                    <button
                                        key={s.id}
                                        onClick={() => setExpandedSessionId(expandedSessionId === s.id ? null : s.id)}
                                        className={cn(
                                            "flex flex-col items-center gap-1.5 group",
                                            expandedSessionId === s.id && "z-10"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all",
                                            expandedSessionId === s.id
                                                ? "border-indigo-600 bg-indigo-600 text-white scale-110 shadow-lg shadow-indigo-200"
                                                : "border-slate-300 bg-white text-slate-500 hover:border-indigo-400 hover:scale-105"
                                        )}>
                                            {s.type.charAt(0)}
                                        </div>
                                        <span className={cn(
                                            "text-[10px] font-medium whitespace-nowrap",
                                            expandedSessionId === s.id ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
                                        )}>
                                            {new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Search bar + type filter chips */}
                    {sessions.length > 0 && (
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="relative flex-1 min-w-[200px]">
                                <input
                                    type="text"
                                    value={sessionSearch}
                                    onChange={e => setSessionSearch(e.target.value)}
                                    placeholder="Rechercher dans les sessions..."
                                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                    onClick={() => setSessionTypeFilter("all")}
                                    className={cn("px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all",
                                        sessionTypeFilter === "all" ? "bg-indigo-100 text-indigo-700 border-indigo-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                    )}
                                >
                                    Tous
                                </button>
                                {(["Kick-Off", "Onboarding", "Validation", "Reporting", "Suivi", "Autre"] as SessionType[]).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setSessionTypeFilter(sessionTypeFilter === t ? "all" : t)}
                                        className={cn("px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all",
                                            sessionTypeFilter === t ? SESSION_TYPE_COLORS[t] + " shadow-sm" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                        )}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {isLoadingSessions ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                        </div>
                    ) : sessions.length === 0 ? (
                        <Card className="border-slate-200">
                            <div className="text-center py-20">
                                <Mic className="w-14 h-14 text-slate-200 mx-auto mb-4" />
                                <h3 className="font-semibold text-slate-900 mb-1">Aucune session enregistrée</h3>
                                <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                                    Connectez une transcription Leexi pour générer automatiquement le compte rendu et le mail de synthèse.
                                </p>
                                <Button variant="primary" className="gap-2" onClick={() => setShowNewSessionModal(true)}>
                                    <Sparkles className="w-4 h-4" />
                                    Créer la première session
                                </Button>
                            </div>
                        </Card>
                    ) : (() => {
                        const filteredSessions = sessions.filter(s => {
                            if (sessionTypeFilter !== "all" && s.type !== sessionTypeFilter) return false;
                            if (sessionSearch.trim()) {
                                const q = sessionSearch.toLowerCase();
                                return (
                                    s.type.toLowerCase().includes(q) ||
                                    s.crMarkdown?.toLowerCase().includes(q) ||
                                    s.summaryEmail?.toLowerCase().includes(q) ||
                                    s.tasks.some(t => t.label.toLowerCase().includes(q))
                                );
                            }
                            return true;
                        });
                        return filteredSessions.length === 0 ? (
                            <Card className="border-slate-200">
                                <p className="text-sm text-slate-500 text-center py-12">Aucune session ne correspond à votre recherche.</p>
                            </Card>
                        ) : (
                        <div className="space-y-4">
                            {filteredSessions.map((session) => {
                                const isExpanded = expandedSessionId === session.id;
                                const openTasks = session.tasks.filter(t => !t.doneAt);
                                return (
                                    <Card key={session.id} className="border-slate-200 overflow-hidden hover:shadow-md transition-all duration-200">
                                        {/* Session row */}
                                        <button
                                            onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                                            className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors text-left"
                                        >
                                            <div className="flex items-center gap-4">
                                                <Badge className={cn("text-xs border shrink-0", SESSION_TYPE_COLORS[session.type])}>
                                                    {("customTypeLabel" in session && (session as any).customTypeLabel) ? (session as any).customTypeLabel : session.type}
                                                </Badge>
                                                <div>
                                                    <p className="font-semibold text-slate-900 text-sm">
                                                        Session du {new Date(session.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                                                    </p>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        {(session.crMarkdown || session.summaryEmail)
                                                            ? "Rapport complet disponible dans la fenetre dediee"
                                                            : "Aucun rapport disponible"}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0 ml-4">
                                                {session.recordingUrl && (
                                                    <a href={session.recordingUrl} target="_blank" rel="noopener noreferrer"
                                                        onClick={e => e.stopPropagation()}
                                                        className="flex items-center gap-1 text-xs text-indigo-600 hover:underline font-medium">
                                                        <Mic className="w-3.5 h-3.5" /> Enregistrement
                                                    </a>
                                                )}
                                                {session.projectId && session.tasks.length > 0 && (
                                                    <Link
                                                        href={`/manager/projects/${session.projectId}`}
                                                        onClick={e => e.stopPropagation()}
                                                        className="flex items-center gap-1 text-xs text-indigo-600 hover:underline font-medium"
                                                    >
                                                        <Briefcase className="w-3 h-3" />
                                                        Voir le projet
                                                    </Link>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-xs text-slate-500 hover:text-indigo-600 px-2 py-1"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setExtractedTasks([]);
                                                        setEditPreviewMode(false);
                                                        setEditingSession({
                                                            ...session,
                                                            date: session.date.slice(0, 10),
                                                        } as any);
                                                    }}
                                                >
                                                    <PenLine className="w-3.5 h-3.5 mr-1" />
                                                    Éditer
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-xs text-red-500 hover:text-red-600 px-2 py-1"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSessionToDelete(session.id);
                                                    }}
                                                    isLoading={isDeletingSession === session.id}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                                                    Supprimer
                                                </Button>
                                                {openTasks.length > 0 && (
                                                    <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">
                                                        {openTasks.length} tâche{openTasks.length > 1 ? "s" : ""}
                                                    </Badge>
                                                )}
                                                {session.summaryEmail && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigator.clipboard.writeText(session.summaryEmail!);
                                                            success("Copié", "Mail de synthèse copié");
                                                        }}
                                                        className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white hover:border-indigo-300 transition-colors"
                                                    >
                                                        <Copy className="w-3.5 h-3.5" />
                                                        Copier le mail
                                                    </button>
                                                )}
                                                {(session.crMarkdown || session.summaryEmail) && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openSessionReportDialog(session, session.crMarkdown ? "cr" : "email");
                                                        }}
                                                        className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded-lg px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                        Voir le rapport
                                                    </button>
                                                )}
                                                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                            </div>
                                        </button>

                                        {/* Expanded content */}
                                        {isExpanded && (
                                            <div className="border-t border-slate-100 p-5">
                                                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 mb-5">
                                                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                                        <div>
                                                            <p className="text-sm font-semibold text-slate-900">Rapport complet</p>
                                                            <p className="text-sm text-slate-500 mt-1">
                                                                Le compte rendu complet s&apos;ouvre maintenant dans une fenetre dediee.
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            {session.crMarkdown && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="gap-2"
                                                                    onClick={() => openSessionReportDialog(session, "cr")}
                                                                >
                                                                    <Eye className="w-3.5 h-3.5" />
                                                                    Ouvrir le rapport
                                                                </Button>
                                                            )}
                                                            {session.summaryEmail && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="gap-2"
                                                                    onClick={() => openSessionReportDialog(session, "email")}
                                                                >
                                                                    <Mail className="w-3.5 h-3.5" />
                                                                    Voir le mail
                                                                </Button>
                                                            )}
                                                            {(session.crMarkdown || session.summaryEmail) && (
                                                                <Button
                                                                    variant="primary"
                                                                    size="sm"
                                                                    className="gap-2"
                                                                    onClick={() => downloadSessionReportCsv(session)}
                                                                >
                                                                    <Download className="w-3.5 h-3.5" />
                                                                    Export CSV
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Tasks — Enhanced with role badges + toggle */}
                                                <div>
                                                    {session.tasks.length > 0 && (
                                                        <div className="pt-1">
                                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Tâches d'équipe</h4>
                                                            <div className="space-y-2">
                                                                {session.tasks.map((task) => {
                                                                    const roleBadge = ROLE_BADGE_COLORS[task.assigneeRole || "ALWAYS"];
                                                                    const priorityInfo = PRIORITY_INDICATOR[task.priority || "MEDIUM"];
                                                                    return (
                                                                        <div key={task.id} className="flex items-center gap-3 group">
                                                                            <button
                                                                                onClick={() => handleToggleTask(session.id, task.id)}
                                                                                disabled={togglingTaskId === task.id}
                                                                                className={cn("w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all hover:scale-110",
                                                                                    task.doneAt
                                                                                        ? "bg-emerald-500 border-emerald-500 text-white"
                                                                                        : "border-slate-300 hover:border-indigo-400"
                                                                                )}
                                                                            >
                                                                                {task.doneAt && <CheckCircle2 className="w-3 h-3" />}
                                                                                {togglingTaskId === task.id && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                                                                            </button>
                                                                            <span className={cn("text-sm flex-1", task.doneAt ? "line-through text-slate-400" : "text-slate-700")}>
                                                                                {task.label}
                                                                            </span>
                                                                            <span
                                                                                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                                                                style={{ color: roleBadge.color, background: roleBadge.bg }}
                                                                            >
                                                                                {roleBadge.label}
                                                                            </span>
                                                                            <span
                                                                                className="text-[10px] font-medium"
                                                                                style={{ color: priorityInfo.color }}
                                                                            >
                                                                                {priorityInfo.label}
                                                                            </span>
                                                                            {task.dueDate && (
                                                                                <span className="text-[10px] text-slate-400">
                                                                                    <Calendar className="w-3 h-3 inline mr-0.5" />
                                                                                    {new Date(task.dueDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                                                                </span>
                                                                            )}
                                                                            {task.assignee && <span className="text-xs text-slate-400">— {task.assignee}</span>}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </Card>
                                );
                            })}
                        </div>
                        );
                    })()}
                </div>
            )}

            {/* Delete session ConfirmModal */}
            <ConfirmModal
                isOpen={!!sessionToDelete}
                onClose={() => setSessionToDelete(null)}
                onConfirm={async () => {
                    if (sessionToDelete) {
                        await handleDeleteSession(sessionToDelete);
                        setSessionToDelete(null);
                    }
                }}
                title="Supprimer cette session ?"
                message="La session et toutes ses tâches seront définitivement supprimées. Cette action est irréversible."
                confirmText="Supprimer"
                variant="danger"
                isLoading={!!isDeletingSession}
            />

            <Modal
                isOpen={!!reportDialogSession}
                onClose={() => setReportDialogSession(null)}
                title={reportDialogSession ? `Rapport complet — ${getSessionTypeLabel(reportDialogSession)}` : "Rapport complet"}
                description={reportDialogSession ? `Session du ${new Date(reportDialogSession.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : undefined}
                size="xl"
            >
                {reportDialogSession && (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Badge className={cn("text-xs border", SESSION_TYPE_COLORS[reportDialogSession.type])}>
                                        {getSessionTypeLabel(reportDialogSession)}
                                    </Badge>
                                    <span className="text-xs text-slate-500">
                                        {reportDialogSession.tasks.length} tache{reportDialogSession.tasks.length > 1 ? "s" : ""}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                        {reportDialogSession.emailSentAt
                                            ? `Mail envoye le ${new Date(reportDialogSession.emailSentAt).toLocaleDateString("fr-FR")}`
                                            : "Mail non envoye automatiquement"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-2"
                                        onClick={() => downloadSessionReportCsv(reportDialogSession)}
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        Export CSV
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-2"
                                        onClick={() => {
                                            const content = reportDialogTab === "cr"
                                                ? (reportDialogSession.crMarkdown || "")
                                                : (reportDialogSession.summaryEmail || "");
                                            navigator.clipboard.writeText(content);
                                            success("Copie", reportDialogTab === "cr" ? "Rapport copie" : "Mail copie");
                                        }}
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                        Copier
                                    </Button>
                                    {reportDialogTab === "email" && reportDialogSession.summaryEmail && client?.email && (
                                        <a
                                            href={`mailto:${client.email}?subject=Synthèse de notre session ${reportDialogSession.type}&body=${encodeURIComponent(reportDialogSession.summaryEmail)}`}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition-colors"
                                        >
                                            <Send className="w-3.5 h-3.5" />
                                            Ouvrir dans le mail
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
                            <button
                                onClick={() => setReportDialogTab("cr")}
                                className={cn(
                                    "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                                    reportDialogTab === "cr" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600"
                                )}
                            >
                                Compte rendu
                            </button>
                            <button
                                onClick={() => setReportDialogTab("email")}
                                className={cn(
                                    "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                                    reportDialogTab === "email" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600"
                                )}
                            >
                                Mail de synthese
                            </button>
                        </div>

                        <div className="border border-slate-200 rounded-2xl bg-white max-h-[65vh] overflow-y-auto">
                            {reportDialogTab === "cr" ? (
                                reportDialogSession.crMarkdown ? (
                                    <div className="p-6">
                                        <div className={SESSION_MARKDOWN_CLASS}>
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {reportDialogSession.crMarkdown}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-400 italic p-6">Pas de rapport disponible.</p>
                                )
                            ) : reportDialogSession.summaryEmail ? (
                                <div className="p-6">
                                    <div className={SESSION_MARKDOWN_CLASS}>
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {reportDialogSession.summaryEmail}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400 italic p-6">Pas de mail de synthese disponible.</p>
                            )}
                        </div>
                    </div>
                )}
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setReportDialogSession(null)}>
                        Fermer
                    </Button>
                </ModalFooter>
            </Modal>

            {/* ════════════════════════════════════════════
                MODAL — EDIT SESSION
            ════════════════════════════════════════════ */}
            <Modal
                isOpen={!!editingSession}
                onClose={() => { if (!isSavingEdit) setEditingSession(null); }}
                title="Modifier la session"
                description="Ajustez le type, la date, le compte rendu et le mail de synthèse."
                size="xl"
            >
                {editingSession && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-semibold text-slate-700 block mb-1">Type</label>
                                <select
                                    value={editingSession.type}
                                    onChange={(e) =>
                                        setEditingSession((prev) =>
                                            prev ? { ...prev, type: e.target.value as SessionType } : prev
                                        )
                                    }
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {(["Kick-Off", "Onboarding", "Validation", "Reporting", "Suivi", "Autre"] as SessionType[]).map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-slate-700 block mb-1">Date</label>
                                <input
                                    type="date"
                                    value={editingSession.date.slice(0, 10)}
                                    onChange={(e) =>
                                        setEditingSession((prev) =>
                                            prev ? { ...prev, date: e.target.value } : prev
                                        )
                                    }
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-sm font-semibold text-slate-700">Compte rendu (markdown)</label>
                                <button
                                    onClick={() => setEditPreviewMode(!editPreviewMode)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all",
                                        editPreviewMode
                                            ? "bg-indigo-50 text-indigo-600 border-indigo-200"
                                            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                    )}
                                >
                                    <Eye className="w-3 h-3" />
                                    {editPreviewMode ? "Éditer" : "Aperçu"}
                                </button>
                            </div>
                            {editPreviewMode ? (
                                <div className={cn(
                                    "border border-slate-200 rounded-xl p-4 bg-slate-50 min-h-[200px] max-h-80 overflow-y-auto",
                                    SESSION_MARKDOWN_CLASS
                                )}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {editingSession.crMarkdown || ""}
                                    </ReactMarkdown>
                                </div>
                            ) : (
                                <textarea
                                    rows={8}
                                    value={editingSession.crMarkdown || ""}
                                    onChange={(e) =>
                                        setEditingSession((prev) =>
                                            prev ? { ...prev, crMarkdown: e.target.value } : prev
                                        )
                                    }
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                                    placeholder="Modifiez ici le compte rendu..."
                                />
                            )}
                        </div>

                        <div>
                            <label className="text-sm font-semibold text-slate-700 block mb-1">Mail de synthèse</label>
                            <textarea
                                rows={5}
                                value={editingSession.summaryEmail || ""}
                                onChange={(e) =>
                                    setEditingSession((prev) =>
                                        prev ? { ...prev, summaryEmail: e.target.value } : prev
                                    )
                                }
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                                placeholder="Modifiez ici le mail de synthèse..."
                            />
                        </div>

                        {/* ── AI Task Extraction for Editing ── */}
                        {editingSession.crMarkdown && (
                            <div className="border border-slate-200 rounded-xl p-4 bg-white">
                                <AITaskExtractor
                                    content={editingSession.crMarkdown}
                                    clientName={client.name}
                                    sessionType={editingSession.type}
                                    tasks={extractedTasks}
                                    onTasksChange={setExtractedTasks}
                                    compact
                                />
                            </div>
                        )}

                        <ModalFooter>
                            <Button variant="ghost" onClick={() => setEditingSession(null)} disabled={isSavingEdit}>
                                Annuler
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleUpdateSession}
                                isLoading={isSavingEdit}
                                className="gap-2"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                Enregistrer les modifications
                            </Button>
                        </ModalFooter>
                    </div>
                )}
            </Modal>

            {/* ════════════════════════════════════════════
                TAB 4 — ANALYTICS & PERSONA
            ════════════════════════════════════════════ */}
            {activeTab === "analytics" && (
                <div className="space-y-6">
                    {/* Date range picker */}
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <h2 className="font-bold text-slate-900">Performance & Persona</h2>
                        <div className="flex items-center gap-2">
                            <input type="date" value={statsDateRange.from}
                                onChange={(e) => setStatsDateRange(p => ({ ...p, from: e.target.value }))}
                                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
                            <span className="text-slate-400">→</span>
                            <input type="date" value={statsDateRange.to}
                                onChange={(e) => setStatsDateRange(p => ({ ...p, to: e.target.value }))}
                                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
                            <Button variant="ghost" size="sm" onClick={() => { fetchClientStats(); fetchClientPersona(); }} className="gap-1.5">
                                <RefreshCw className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    </div>

                    {/* KPIs */}
                    {isLoadingStats ? (
                        <div className="flex items-center justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-indigo-500" /></div>
                    ) : clientStats ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard
                                label="Appels"
                                value={clientStats.kpis?.totalCalls || 0}
                                icon={Phone}
                                iconBg="bg-indigo-100"
                                iconColor="text-indigo-600"
                            />
                            <StatCard
                                label="RDV"
                                value={clientStats.kpis?.meetings || 0}
                                icon={CalendarCheck}
                                iconBg="bg-emerald-100"
                                iconColor="text-emerald-600"
                            />
                            <StatCard
                                label="Conversion"
                                value={`${clientStats.kpis?.conversionRate || 0}%`}
                                icon={TrendingUp}
                                iconBg="bg-amber-100"
                                iconColor="text-amber-600"
                            />
                            <StatCard
                                label="Temps de parole"
                                value={`${Math.round((clientStats.kpis?.totalTalkTime || 0) / 60)} min`}
                                icon={Clock}
                                iconBg="bg-slate-100"
                                iconColor="text-slate-600"
                            />
                        </div>
                    ) : (
                        <Card className="border-slate-200">
                            <p className="text-slate-500 text-center py-10">Aucune donnée pour cette période.</p>
                        </Card>
                    )}

                    {/* Persona */}
                    <Card className="border-slate-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30">
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                <Zap className="w-4 h-4 text-indigo-500" />
                                Persona — cibles performantes
                            </h3>
                        </div>
                        <div className="p-6">
                            {isLoadingPersona ? (
                                <div className="flex items-center justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-indigo-500" /></div>
                            ) : clientPersona && (clientPersona.byFunction?.length > 0 || clientPersona.bySector?.length > 0) ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    {clientPersona.byFunction?.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Par fonction</h4>
                                            <div className="space-y-2">
                                                {clientPersona.byFunction.slice(0, 8).map((r: any, i: number) => (
                                                    <div key={i} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/80 border border-slate-100 hover:border-slate-200 transition-colors">
                                                        <span className="font-medium text-slate-800 text-sm">{r.value}</span>
                                                        <div className="flex items-center gap-4 text-xs">
                                                            <span className="text-slate-500">{r.calls} appels</span>
                                                            <span className="font-semibold text-emerald-600">{r.meetings} RDV</span>
                                                            <span className="text-indigo-600 font-bold">{r.conversionRate}%</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {clientPersona.bySector?.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Par secteur</h4>
                                            <div className="space-y-2">
                                                {clientPersona.bySector.slice(0, 8).map((r: any, i: number) => (
                                                    <div key={i} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/80 border border-slate-100 hover:border-slate-200 transition-colors">
                                                        <span className="font-medium text-slate-800 text-sm">{r.value}</span>
                                                        <div className="flex items-center gap-4 text-xs">
                                                            <span className="text-slate-500">{r.calls} appels</span>
                                                            <span className="font-semibold text-emerald-600">{r.meetings} RDV</span>
                                                            <span className="text-indigo-600 font-bold">{r.conversionRate}%</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-slate-500 text-center py-10">Pas encore de données persona.</p>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {/* ════════════════════════════════════════════
                MODAL — NOUVELLE SESSION (Leexi → AI CR)
            ════════════════════════════════════════════ */}
            <Modal
                isOpen={showNewSessionModal}
                onClose={() => {
                    if (!isGeneratingCR && !isSavingSession) {
                        setShowNewSessionModal(false);
                        setGeneratedCR(null);
                        setTranscriptMode("leexi");
                        setManualTranscript("");
                        setManualCR("");
                        setManualSummaryEmail("");
                        setSessionDateInput("");
                        setNewSessionForm({ type: "Kick-Off", leexiId: "", notifyByEmail: false, customTypeLabel: "" });
                    }
                }}
                title="Nouvelle session"
                description="Générez un CR et un mail de synthèse à partir d'une transcription Leexi ou d'un texte collé."
                size="xl"
            >
                {!generatedCR ? (
                    <div className="space-y-5">
                        {/* Session type */}
                        <div className="space-y-3">
                            <div>
                                <label className="text-sm font-semibold text-slate-700 block mb-2">Type de session</label>
                                <div className="flex flex-wrap gap-2">
                                    {(["Kick-Off", "Onboarding", "Validation", "Reporting", "Suivi", "Autre"] as SessionType[]).map((t) => (
                                        <button
                                            key={t}
                                            onClick={() =>
                                                setNewSessionForm((p) => ({
                                                    ...p,
                                                    type: t,
                                                    // Clear custom label when leaving "Autre"
                                                    customTypeLabel: t === "Autre" ? p.customTypeLabel : "",
                                                }))
                                            }
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all",
                                                newSessionForm.type === t
                                                    ? SESSION_TYPE_COLORS[t] + " shadow-sm"
                                                    : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                                            )}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {newSessionForm.type === "Autre" && (
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-medium text-slate-600">
                                        Nom de la session (obligatoire pour "Autre")
                                    </label>
                                    <input
                                        type="text"
                                        value={newSessionForm.customTypeLabel}
                                        onChange={(e) =>
                                            setNewSessionForm((p) => ({ ...p, customTypeLabel: e.target.value }))
                                        }
                                        placeholder='Ex. "Atelier produit", "Point hebdo"...'
                                        className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Session date */}
                        <div className="space-y-1">
                            <label className="text-sm font-semibold text-slate-700 block">Date de la session</label>
                            <p className="text-xs text-slate-500 mb-1">
                                Par défaut, on utilise la date de l&apos;enregistrement Leexi (ou la date du jour), mais vous
                                pouvez la modifier ici.
                            </p>
                            <input
                                type="date"
                                value={sessionDateInput}
                                onChange={(e) => setSessionDateInput(e.target.value)}
                                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {/* Transcript / CR source selector + content */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-semibold text-slate-700">Source du contenu</label>
                            </div>
                            <div className="inline-flex rounded-full bg-slate-100 p-1 gap-1">
                                <button
                                    onClick={() => setTranscriptMode("leexi")}
                                    className={cn(
                                        "px-3 py-1.5 text-xs font-medium rounded-full flex items-center gap-1",
                                        transcriptMode === "leexi"
                                            ? "bg-white text-indigo-600 shadow-sm"
                                            : "text-slate-600"
                                    )}
                                >
                                    <Mic className="w-3 h-3" />
                                    Depuis Leexi
                                </button>
                                <button
                                    onClick={() => setTranscriptMode("text")}
                                    className={cn(
                                        "px-3 py-1.5 text-xs font-medium rounded-full flex items-center gap-1",
                                        transcriptMode === "text"
                                            ? "bg-white text-indigo-600 shadow-sm"
                                            : "text-slate-600"
                                    )}
                                >
                                    <FileText className="w-3 h-3" />
                                    Coller une transcription
                                </button>
                                <button
                                    onClick={() => setTranscriptMode("cr")}
                                    className={cn(
                                        "px-3 py-1.5 text-xs font-medium rounded-full flex items-center gap-1",
                                        transcriptMode === "cr"
                                            ? "bg-white text-indigo-600 shadow-sm"
                                            : "text-slate-600"
                                    )}
                                >
                                    <FileText className="w-3 h-3" />
                                    CR déjà rédigé
                                </button>
                            </div>

                            {transcriptMode === "leexi" ? (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-semibold text-slate-700">Transcription Leexi</label>
                                        <button onClick={fetchLeexiTranscriptions} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                                            <RefreshCw className={cn("w-3 h-3", isLoadingLeexi && "animate-spin")} />
                                            Actualiser
                                        </button>
                                    </div>
                                    {isLoadingLeexi ? (
                                        <div className="flex items-center justify-center py-8 border border-slate-200 rounded-xl">
                                            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                                        </div>
                                    ) : leexiTranscriptions.length === 0 ? (
                                        <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl">
                                            <Mic className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                            <p className="text-sm text-slate-500">Aucune transcription trouvée dans Leexi</p>
                                            <p className="text-xs text-slate-400 mt-1">Vérifiez que les enregistrements sont liés à ce client ou utilisez le mode "Coller une transcription".</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {leexiTranscriptions.map((t) => (
                                                <button
                                                    key={t.id}
                                                    onClick={() =>
                                                        setNewSessionForm((p) => ({
                                                            ...p,
                                                            leexiId: t.id,
                                                        })) ||
                                                        setSessionDateInput(
                                                            t.date ? t.date.slice(0, 10) : ""
                                                        )
                                                    }
                                                    className={cn(
                                                        "w-full text-left p-3 rounded-xl border transition-all",
                                                        newSessionForm.leexiId === t.id
                                                            ? "border-indigo-400 bg-indigo-50 shadow-sm"
                                                            : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <Mic className={cn("w-4 h-4 shrink-0", newSessionForm.leexiId === t.id ? "text-indigo-600" : "text-slate-400")} />
                                                            <div className="min-w-0">
                                                                <p className={cn("text-sm font-semibold truncate", newSessionForm.leexiId === t.id ? "text-indigo-900" : "text-slate-900")}>
                                                                    {t.title}
                                                                </p>
                                                                {t.participants.length > 0 && (
                                                                    <p className="text-xs text-slate-500 truncate">{t.participants.join(", ")}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-xs font-medium text-slate-700">
                                                                {new Date(t.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                                            </p>
                                                            <p className="text-xs text-slate-400">
                                                                {Math.round(t.duration / 60)} min
                                                            </p>
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : transcriptMode === "text" ? (
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Transcription (texte)</label>
                                    <textarea
                                        value={manualTranscript}
                                        onChange={(e) => setManualTranscript(e.target.value)}
                                        rows={8}
                                        placeholder="Collez ici la transcription de la session (ou un récap très détaillé)..."
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                                    />
                                    <p className="text-[11px] text-slate-400">
                                        {manualTranscript.length} caractères{" "}
                                        {manualTranscript.length > 0 && manualTranscript.length < 20 && "(minimum 20)"}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-sm font-semibold text-slate-700 block mb-1">
                                            Compte rendu déjà préparé (markdown)
                                        </label>
                                        <textarea
                                            value={manualCR}
                                            onChange={(e) => setManualCR(e.target.value)}
                                            rows={6}
                                            placeholder="Collez ici le compte rendu final (titre, sections, prochaines étapes, etc.)..."
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-semibold text-slate-700 block mb-1">
                                            Mail de synthèse déjà préparé (optionnel)
                                        </label>
                                        <textarea
                                            value={manualSummaryEmail}
                                            onChange={(e) => setManualSummaryEmail(e.target.value)}
                                            rows={4}
                                            placeholder="Collez ici le mail de synthèse si vous l'avez déjà rédigé..."
                                            className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                                        />
                                    </div>
                                    <p className="text-[11px] text-slate-400">
                                        Le CR et le mail seront enregistrés tels quels, sans génération automatique.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Email notification toggle */}
                        <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50">
                            <button
                                onClick={() => {
                                    if (!client?.email) return;
                                    setNewSessionForm(p => ({ ...p, notifyByEmail: !p.notifyByEmail }));
                                }}
                                disabled={!client?.email}
                                className={cn(
                                    "w-10 h-6 rounded-full relative transition-colors shrink-0 mt-0.5",
                                    !client?.email
                                        ? "bg-slate-200 cursor-not-allowed opacity-60"
                                        : newSessionForm.notifyByEmail
                                            ? "bg-indigo-600"
                                            : "bg-slate-300"
                                )}
                            >
                                <span
                                    className={cn(
                                        "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                                        newSessionForm.notifyByEmail ? "translate-x-5" : "translate-x-1"
                                    )}
                                />
                            </button>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">
                                    Envoyer le mail de synthèse automatiquement
                                </p>
                                {client.email ? (
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {newSessionForm.notifyByEmail
                                            ? <>Le mail sera envoyé à <span className="font-medium text-slate-700">{client.email}</span> lors de la sauvegarde.</>
                                            : <>Le mail ne sera pas envoyé. Vous pourrez le copier manuellement depuis la fiche session.</>
                                        }
                                    </p>
                                ) : (
                                    <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" />
                                        Aucun email configuré pour ce client. <button onClick={() => { setShowNewSessionModal(false); setShowEditModal(true); }} className="underline font-medium">Ajouter un email</button>
                                    </p>
                                )}
                            </div>
                        </div>

                        <ModalFooter>
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    if (!isGeneratingCR) {
                                        setShowNewSessionModal(false);
                                    }
                                }}
                                disabled={isGeneratingCR}
                            >
                                Annuler
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleGenerateCR}
                                isLoading={isGeneratingCR}
                                disabled={
                                    isGeneratingCR ||
                                    (transcriptMode === "leexi"
                                        ? !newSessionForm.leexiId
                                        : transcriptMode === "text"
                                            ? manualTranscript.trim().length < 20
                                            : manualCR.trim().length === 0)
                                }
                                className="gap-2"
                            >
                                <Sparkles className="w-4 h-4" />
                                {transcriptMode === "cr" ? "Utiliser ce CR" : "Générer le CR"}
                            </Button>
                        </ModalFooter>
                    </div>
                ) : (
                    /* ── Generated CR preview ── */
                    <div className="space-y-4">
                        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
                            <button
                                onClick={() => setShowCRTab("cr")}
                                className={cn("flex-1 py-2 text-sm font-semibold rounded-md transition-all",
                                    showCRTab === "cr" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600"
                                )}
                            >
                                Compte rendu
                            </button>
                            <button
                                onClick={() => setShowCRTab("email")}
                                className={cn("flex-1 py-2 text-sm font-semibold rounded-md transition-all",
                                    showCRTab === "email" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600"
                                )}
                            >
                                Mail de synthèse
                            </button>
                        </div>

                        <div className="border border-slate-200 rounded-xl p-4 max-h-80 overflow-y-auto bg-slate-50 prose prose-sm prose-slate max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {showCRTab === "cr" ? generatedCR.cr : generatedCR.email}
                            </ReactMarkdown>
                        </div>

                        {/* Notify email info */}
                        <div className={cn(
                            "flex items-center gap-2 p-3 rounded-lg text-sm",
                            newSessionForm.notifyByEmail
                                ? "bg-indigo-50 border border-indigo-200 text-indigo-700"
                                : "bg-slate-50 border border-slate-200 text-slate-600"
                        )}>
                            <Send className="w-4 h-4 shrink-0" />
                            {newSessionForm.notifyByEmail && client.email
                                ? <>Le mail de synthèse sera envoyé automatiquement à <span className="font-semibold">{client.email}</span> lors de la sauvegarde.</>
                                : "Le mail de synthèse ne sera pas envoyé automatiquement — vous pourrez le copier depuis la fiche session."
                            }
                        </div>

                        {/* ── AI Task Extraction ── */}
                        <div className="border border-slate-200 rounded-xl p-4 bg-white">
                            <AITaskExtractor
                                content={generatedCR.cr}
                                clientName={client.name}
                                sessionType={newSessionForm.type}
                                tasks={extractedTasks}
                                onTasksChange={setExtractedTasks}
                            />
                        </div>

                        <ModalFooter>
                            <Button variant="ghost" onClick={() => setGeneratedCR(null)} disabled={isSavingSession}>
                                ← Retour
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(showCRTab === "cr" ? generatedCR.cr : generatedCR.email); success("Copié", ""); }}>
                                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copier
                            </Button>
                            <Button variant="primary" onClick={handleSaveSession} isLoading={isSavingSession} className="gap-2">
                                <CheckCircle2 className="w-4 h-4" />
                                Enregistrer la session
                            </Button>
                        </ModalFooter>
                    </div>
                )}
            </Modal>

            {/* ── EDIT PERSONA / ICP MODAL ── */}
            <Modal
                isOpen={showPersonaModal}
                onClose={() => !isSavingPersona && setShowPersonaModal(false)}
                title="Persona / ICP"
                description="Définir ou modifier le profil cible (Ideal Customer Profile) du client."
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Profil cible (ICP)</label>
                        <textarea
                            className="w-full min-h-[120px] px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="Ex: Directeurs commerciaux en PME B2B, 50–250 employés, secteur industrie ou services..."
                            value={personaValue}
                            onChange={(e) => setPersonaValue(e.target.value)}
                            rows={4}
                        />
                        <p className="text-xs text-slate-500 mt-1">Ce champ alimente le readiness (Persona défini) et peut être utilisé dans les campagnes.</p>
                    </div>
                </div>
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setShowPersonaModal(false)} disabled={isSavingPersona}>Annuler</Button>
                    <Button variant="primary" onClick={handleSavePersona} isLoading={isSavingPersona}>Enregistrer</Button>
                </ModalFooter>
            </Modal>

            {/* ── EDIT CLIENT MODAL ── */}
            <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Modifier le client" description="Mettez à jour les informations du client">
                <div className="space-y-5">
                    <Input label="Nom du client *" value={editFormData.name} onChange={(e) => setEditFormData(p => ({ ...p, name: e.target.value }))} />
                    <Input label="Secteur d'activité" value={editFormData.industry} onChange={(e) => setEditFormData(p => ({ ...p, industry: e.target.value }))} />
                    <Input label="Email de contact" type="email" value={editFormData.email} onChange={(e) => setEditFormData(p => ({ ...p, email: e.target.value }))} icon={<Mail className="w-4 h-4 text-slate-400" />} />
                    <Input label="Téléphone" type="tel" value={editFormData.phone} onChange={(e) => setEditFormData(p => ({ ...p, phone: e.target.value }))} icon={<Phone className="w-4 h-4 text-slate-400" />} />
                    <div>
                        <Input label="URL de réservation (Calendly, etc.)" type="url" value={editFormData.bookingUrl} onChange={(e) => setEditFormData(p => ({ ...p, bookingUrl: e.target.value }))} placeholder="https://calendly.com/client-name" />
                        <p className="text-xs text-slate-500 mt-1">Les SDRs utiliseront cette URL lors des appels pour planifier des RDV</p>
                    </div>
                </div>
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setShowEditModal(false)}>Annuler</Button>
                    <Button variant="primary" onClick={handleUpdate}>Enregistrer</Button>
                </ModalFooter>
            </Modal>

            <NewMissionDialog
                isOpen={showNewMissionDialog}
                onClose={() => setShowNewMissionDialog(false)}
                onCreated={fetchClient}
            />

            <EditMissionDialog
                isOpen={!!editingMission}
                onClose={() => setEditingMission(null)}
                mission={
                    editingMission
                        ? {
                            id: editingMission.id,
                            name: editingMission.name,
                            objective: editingMission.objective,
                            channel: editingMission.channel,
                            channels: editingMission.channels,
                            status: getMissionStatus(editingMission),
                            startDate: editingMission.startDate,
                            endDate: editingMission.endDate,
                            client: client ? { id: client.id, name: client.name } : undefined,
                        }
                        : null
                }
                onSaved={fetchClient}
            />

            {/* ── DELETE CLIENT MODAL ── */}
            <ConfirmModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={handleDelete}
                title="Supprimer le client"
                message={`Êtes-vous sûr de vouloir supprimer "${client.name}" ? Toutes les missions, sessions et données associées seront supprimées. Cette action est irréversible.`}
                confirmText="Supprimer"
                variant="danger"
                isLoading={isDeleting}
            />

            {/* ── REVOKE USER MODAL ── */}
            <ConfirmModal
                isOpen={!!userToDelete}
                onClose={() => !isDeletingUser && setUserToDelete(null)}
                onConfirm={handleDeleteUser}
                title="Révoquer l'accès"
                message={`Êtes-vous sûr de vouloir révoquer l'accès portail de ${userToDelete?.name} ?`}
                confirmText="Révoquer"
                variant="danger"
                isLoading={isDeletingUser}
            />

            {/* ── CREATE PORTAL USER MODAL ── */}
            <Modal
                isOpen={showCreateUserModal}
                onClose={() => !isCreatingUser && setShowCreateUserModal(false)}
                title="Générer un accès Portail Client"
                description="Créez un compte pour permettre à votre client de suivre ses missions."
                size="md"
            >
                {!createdUserCredentials ? (
                    <div className="space-y-5">
                        <Input label="Nom et Prénom *" placeholder="ex: Jean Dupont" value={userFormData.name} onChange={(e) => setUserFormData(p => ({ ...p, name: e.target.value }))} icon={<User className="w-4 h-4 text-slate-400" />} />
                        <Input label="Adresse Email *" type="email" placeholder="jean.dupont@client.com" value={userFormData.email} onChange={(e) => setUserFormData(p => ({ ...p, email: e.target.value }))} icon={<Mail className="w-4 h-4 text-slate-400" />} />
                        <div>
                            <Input label="Mot de passe (optionnel)" type="password" placeholder="Laisser vide pour auto-générer" value={userFormData.password} onChange={(e) => setUserFormData(p => ({ ...p, password: e.target.value }))} icon={<Key className="w-4 h-4 text-slate-400" />} />
                            <p className="text-xs text-slate-500 mt-1.5 ml-1">Si vide, un mot de passe sécurisé sera généré et affiché une seule fois.</p>
                        </div>
                        <ModalFooter>
                            <Button variant="ghost" onClick={() => setShowCreateUserModal(false)} disabled={isCreatingUser}>Annuler</Button>
                            <Button variant="primary" onClick={handleCreateUser} isLoading={isCreatingUser}>Créer l'accès</Button>
                        </ModalFooter>
                    </div>
                ) : (
                    <div className="space-y-5">
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                            <h3 className="text-emerald-800 font-medium flex items-center gap-2 mb-1">
                                <CheckCircle2 className="w-4 h-4" />
                                Accès créé avec succès
                            </h3>
                            <p className="text-sm text-emerald-600">Transmettez ces identifiants de manière sécurisée.</p>
                        </div>
                        {[
                            { label: "Email", value: createdUserCredentials.email, mono: false },
                            { label: "Mot de passe provisoire", value: createdUserCredentials.password || "", mono: true },
                        ].map(({ label, value, mono }) => (
                            <div key={label}>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
                                <div className={cn("flex items-center justify-between p-3 border rounded-lg", mono ? "bg-orange-50 border-orange-200" : "bg-slate-50 border-slate-200")}>
                                    <span className={cn("text-sm font-medium select-all", mono ? "font-mono text-orange-900" : "text-slate-900")}>{value}</span>
                                    <button onClick={() => { navigator.clipboard.writeText(value); success("Copié", ""); }} className={mono ? "text-orange-500 hover:text-orange-700" : "text-slate-400 hover:text-slate-600"}>
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {createdUserCredentials.password && (
                            <p className="text-xs text-orange-600 flex items-center gap-1.5">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Ce mot de passe ne sera plus jamais affiché. Copiez-le maintenant.
                            </p>
                        )}
                        <ModalFooter>
                            <Button variant="primary" onClick={() => { setCreatedUserCredentials(null); setShowCreateUserModal(false); }}>
                                J'ai copié les identifiants
                            </Button>
                        </ModalFooter>
                    </div>
                )}
            </Modal>

            {/* ── PORTAL CREDENTIALS MODAL ── */}
            {portalCredentials && (
                <Modal isOpen={true} onClose={() => setPortalCredentials(null)} title="Portail commercial activé">
                    <div className="space-y-4 p-1">
                        <p className="text-sm text-slate-600">
                            Le compte portail a été créé. Transmettez ces identifiants au commercial.
                        </p>
                        {[
                            { label: "Email", value: portalCredentials.email, mono: false },
                            { label: "Mot de passe temporaire", value: portalCredentials.password, mono: true },
                        ].map(({ label, value, mono }) => (
                            <div key={label}>
                                <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
                                <div className={cn("flex items-center justify-between p-3 border rounded-lg", mono ? "bg-orange-50 border-orange-200" : "bg-slate-50 border-slate-200")}>
                                    <span className={cn("text-sm font-medium select-all", mono ? "font-mono text-orange-900" : "text-slate-900")}>{value}</span>
                                    <button onClick={() => { navigator.clipboard.writeText(value); success("Copié", ""); }} className={mono ? "text-orange-500 hover:text-orange-700" : "text-slate-400 hover:text-slate-600"}>
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        <p className="text-xs text-orange-600 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Ce mot de passe ne sera plus jamais affiché. Copiez-le maintenant.
                        </p>
                        <ModalFooter>
                            <Button variant="primary" onClick={() => setPortalCredentials(null)}>
                                J&apos;ai copié les identifiants
                            </Button>
                        </ModalFooter>
                    </div>
                </Modal>
            )}

            {/* ── MANAGE ACCESS DIALOG ── */}
            <Modal
                isOpen={showManageAccessDialog}
                onClose={closeManageAccessDialog}
                size="xl"
                showCloseButton={false}
                className="!p-0 max-h-[90vh]"
            >
                <div className="-m-6 md:-m-8 flex flex-col h-[80vh]">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-slate-900">Gestion des accès portail</h2>
                                <p className="text-xs text-slate-500">{client.name}</p>
                            </div>
                        </div>
                        <button
                            onClick={closeManageAccessDialog}
                            className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-200 rounded-md transition-colors"
                        >
                            <XCircle className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Body: sidebar + content */}
                    <div className="flex flex-1 min-h-0">
                        {/* ── SIDEBAR ── */}
                        <aside className="w-64 border-r border-slate-200 bg-slate-50/40 flex flex-col">
                            <div className="px-3 py-3 border-b border-slate-200">
                                <button
                                    onClick={handleStartNewAccess}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                                        manageAccessMode === "new"
                                            ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/30"
                                            : "bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600"
                                    )}
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Nouvel accès
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                                <p className="px-2 pt-1 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Portail clients ({clientPortalUsers.length})
                                </p>
                                {clientPortalUsers.length > 0 ? (
                                    <ul className="space-y-1 mb-3">
                                        {clientPortalUsers.map((u) => {
                                            const isSelected =
                                                manageAccessMode === "view" &&
                                                manageAccessSelectedId === u.id &&
                                                manageAccessSelectedType === "CLIENT_USER";
                                            const isInactive = u.isActive === false;
                                            return (
                                                <li key={u.id}>
                                                    <button
                                                        onClick={() => handleSelectAccessUser(u.id, "CLIENT_USER")}
                                                        className={cn(
                                                            "w-full text-left px-3 py-2 rounded-lg transition-all flex items-start gap-2.5",
                                                            isSelected
                                                                ? "bg-white border border-indigo-300 shadow-sm"
                                                                : "hover:bg-white hover:border-slate-200 border border-transparent"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                                                            isInactive ? "bg-slate-200 text-slate-500" : "bg-indigo-100 text-indigo-700"
                                                        )}>
                                                            {u.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className={cn(
                                                                "text-xs font-semibold truncate",
                                                                isSelected ? "text-indigo-700" : "text-slate-900"
                                                            )}>
                                                                {u.name}
                                                            </p>
                                                            <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                                                        </div>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="px-2 py-1 text-[11px] text-slate-500 mb-3">Aucun accès client.</p>
                                )}

                                <p className="px-2 pt-1 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Portail commerciaux ({commercialPortalUsers.length})
                                </p>
                                {commercialPortalUsers.length > 0 ? (
                                    <ul className="space-y-1">
                                        {commercialPortalUsers.map((interl) => {
                                            if (!interl.portalUser) return null;
                                            const isSelected =
                                                manageAccessMode === "view" &&
                                                manageAccessSelectedId === interl.portalUser.id &&
                                                manageAccessSelectedType === "COMMERCIAL";
                                            const isInactive = interl.portalUser.isActive === false;
                                            return (
                                                <li key={interl.portalUser.id}>
                                                    <button
                                                        onClick={() => handleSelectAccessUser(interl.portalUser!.id, "COMMERCIAL")}
                                                        className={cn(
                                                            "w-full text-left px-3 py-2 rounded-lg transition-all flex items-start gap-2.5",
                                                            isSelected
                                                                ? "bg-white border border-violet-300 shadow-sm"
                                                                : "hover:bg-white hover:border-slate-200 border border-transparent"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                                                            isInactive ? "bg-slate-200 text-slate-500" : "bg-violet-100 text-violet-700"
                                                        )}>
                                                            {interl.firstName[0]}{interl.lastName[0]}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className={cn(
                                                                "text-xs font-semibold truncate",
                                                                isSelected ? "text-violet-700" : "text-slate-900"
                                                            )}>
                                                                {interl.firstName} {interl.lastName}
                                                            </p>
                                                            <p className="text-[10px] text-slate-500 truncate">{interl.portalUser.email}</p>
                                                        </div>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="px-2 py-1 text-[11px] text-slate-500">Aucun accès commercial.</p>
                                )}
                            </div>
                        </aside>

                        {/* ── MAIN CONTENT ── */}
                        <section className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-white">
                            {manageAccessMode === "new" ? (
                                /* ─── NEW ACCESS FORM ─── */
                                <div className="max-w-xl">
                                    {!resetPasswordResult ? (
                                        <>
                                            <div className="mb-5">
                                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                    <Plus className="w-4 h-4 text-indigo-500" />
                                                    Créer un nouvel accès
                                                </h3>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    Génère un compte portail pour permettre au client de se connecter.
                                                </p>
                                            </div>
                                            <div className="space-y-4">
                                                <Input
                                                    label="Nom complet *"
                                                    placeholder="ex: Jean Dupont"
                                                    value={manageAccessForm.name}
                                                    onChange={(e) => setManageAccessForm(p => ({ ...p, name: e.target.value }))}
                                                    icon={<User className="w-4 h-4 text-slate-400" />}
                                                />
                                                <Input
                                                    label="Adresse email *"
                                                    type="email"
                                                    placeholder="jean.dupont@client.com"
                                                    value={manageAccessForm.email}
                                                    onChange={(e) => setManageAccessForm(p => ({ ...p, email: e.target.value }))}
                                                    icon={<Mail className="w-4 h-4 text-slate-400" />}
                                                />
                                                <div>
                                                    <Input
                                                        label="Mot de passe (optionnel)"
                                                        type="password"
                                                        placeholder="Laisser vide pour auto-générer"
                                                        value={manageAccessForm.password}
                                                        onChange={(e) => setManageAccessForm(p => ({ ...p, password: e.target.value }))}
                                                        icon={<Key className="w-4 h-4 text-slate-400" />}
                                                    />
                                                    <p className="text-[11px] text-slate-500 mt-1.5">
                                                        Si vide, un mot de passe sécurisé sera généré et affiché.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
                                                <Button variant="ghost" onClick={closeManageAccessDialog} disabled={isSavingAccessUser}>
                                                    Annuler
                                                </Button>
                                                <Button variant="primary" onClick={handleCreateAccessUser} isLoading={isSavingAccessUser}>
                                                    Créer l'accès
                                                </Button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                                                <h3 className="text-emerald-800 font-medium flex items-center gap-2 mb-1">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    Accès créé
                                                </h3>
                                                <p className="text-xs text-emerald-700">Transmettez ces identifiants de manière sécurisée.</p>
                                            </div>
                                            {[
                                                { label: "Email", value: resetPasswordResult.email, mono: false },
                                                { label: "Mot de passe", value: resetPasswordResult.password, mono: true },
                                            ].map(({ label, value, mono }) => (
                                                <div key={label}>
                                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
                                                    <div className={cn("flex items-center justify-between p-3 border rounded-lg", mono ? "bg-orange-50 border-orange-200" : "bg-slate-50 border-slate-200")}>
                                                        <span className={cn("text-sm font-medium select-all", mono ? "font-mono text-orange-900" : "text-slate-900")}>{value}</span>
                                                        <button onClick={() => { navigator.clipboard.writeText(value); success("Copié", ""); }} className={mono ? "text-orange-500 hover:text-orange-700" : "text-slate-400 hover:text-slate-600"}>
                                                            <Copy className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            <p className="text-xs text-orange-600 flex items-center gap-1.5">
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                Ce mot de passe ne sera plus affiché.
                                            </p>
                                            <div className="flex justify-end pt-3">
                                                <Button variant="primary" onClick={() => setResetPasswordResult(null)}>
                                                    J'ai copié les identifiants
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : manageAccessSelectedId && accessUserDetails ? (
                                /* ─── VIEW / EDIT EXISTING USER ─── */
                                <div className="space-y-6">
                                    {/* Header */}
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">
                                                {accessUserDetails.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                    {accessUserDetails.name}
                                                    {accessUserDetails.isActive === false ? (
                                                        <Badge className="text-[10px] bg-red-100 text-red-700 border-0">Révoqué</Badge>
                                                    ) : (
                                                        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">Actif</Badge>
                                                    )}
                                                    <Badge className={cn(
                                                        "text-[10px] border-0",
                                                        manageAccessSelectedType === "COMMERCIAL"
                                                            ? "bg-violet-100 text-violet-700"
                                                            : "bg-indigo-100 text-indigo-700"
                                                    )}>
                                                        {manageAccessSelectedType === "COMMERCIAL" ? "COMMERCIAL" : "CLIENT"}
                                                    </Badge>
                                                </h3>
                                                <p className="text-xs text-slate-500">{accessUserDetails.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleSendRdvTestEmail}
                                                isLoading={isSendingRdvTestEmail}
                                                className="gap-1.5"
                                            >
                                                <Send className="w-3.5 h-3.5" />
                                                Envoyer test RDV confirmé
                                            </Button>
                                            <Button
                                                variant={accessUserDetails.isActive === false ? "primary" : "outline"}
                                                size="sm"
                                                onClick={handleToggleAccessActive}
                                                isLoading={isTogglingAccessActive}
                                                className={cn(
                                                    "gap-1.5",
                                                    accessUserDetails.isActive !== false && "text-red-600 border-red-200 hover:bg-red-50"
                                                )}
                                            >
                                                {accessUserDetails.isActive === false ? (
                                                    <>
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        Réactiver
                                                    </>
                                                ) : (
                                                    <>
                                                        <XCircle className="w-3.5 h-3.5" />
                                                        Révoquer l'accès
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Connection info */}
                                    <div>
                                        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5" />
                                            Informations de connexion
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/40">
                                                <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1">Dernière connexion</p>
                                                <p className="text-sm font-medium text-slate-900">
                                                    {accessUserDetails.lastSignInAt
                                                        ? new Date(accessUserDetails.lastSignInAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
                                                        : <span className="text-slate-400">Jamais connecté</span>}
                                                </p>
                                            </div>
                                            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/40">
                                                <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1">Dernière activité</p>
                                                <p className="text-sm font-medium text-slate-900">
                                                    {accessUserDetails.lastConnectedAt
                                                        ? new Date(accessUserDetails.lastConnectedAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
                                                        : <span className="text-slate-400">—</span>}
                                                </p>
                                            </div>
                                            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/40">
                                                <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1 flex items-center gap-1">
                                                    <Hash className="w-3 h-3" /> Adresse IP
                                                </p>
                                                <p className="text-sm font-mono text-slate-900">
                                                    {accessUserDetails.lastSignInIp || <span className="text-slate-400 font-sans">—</span>}
                                                </p>
                                            </div>
                                            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/40">
                                                <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1 flex items-center gap-1">
                                                    <MapPin className="w-3 h-3" /> Localisation
                                                </p>
                                                <p className="text-sm font-medium text-slate-900">
                                                    {accessUserDetails.lastSignInCountry || <span className="text-slate-400">—</span>}
                                                </p>
                                            </div>
                                            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/40 col-span-2">
                                                <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1">Compte créé le</p>
                                                <p className="text-sm font-medium text-slate-900">
                                                    {new Date(accessUserDetails.createdAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Edit profile */}
                                    <div>
                                        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <PenLine className="w-3.5 h-3.5" />
                                            Modifier le profil
                                        </h4>
                                        <div className="space-y-3 p-4 rounded-lg border border-slate-200">
                                            <Input
                                                label="Nom complet"
                                                value={manageAccessForm.name}
                                                onChange={(e) => setManageAccessForm(p => ({ ...p, name: e.target.value }))}
                                                icon={<User className="w-4 h-4 text-slate-400" />}
                                            />
                                            <Input
                                                label="Email"
                                                type="email"
                                                value={manageAccessForm.email}
                                                onChange={(e) => setManageAccessForm(p => ({ ...p, email: e.target.value }))}
                                                icon={<Mail className="w-4 h-4 text-slate-400" />}
                                            />
                                            <div className="flex justify-end">
                                                <Button variant="primary" size="sm" onClick={handleSaveAccessProfile} isLoading={isSavingAccessUser}>
                                                    Enregistrer
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Reset password */}
                                    <div>
                                        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <Key className="w-3.5 h-3.5" />
                                            Réinitialiser le mot de passe
                                        </h4>
                                        {resetPasswordResult && resetPasswordResult.email === accessUserDetails.email ? (
                                            <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50/40 space-y-3">
                                                <p className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    Nouveau mot de passe — copiez-le maintenant
                                                </p>
                                                <div className="flex items-center justify-between p-3 border border-orange-200 bg-orange-50 rounded-lg">
                                                    <span className="text-sm font-mono font-medium text-orange-900 select-all">
                                                        {resetPasswordResult.password}
                                                    </span>
                                                    <button
                                                        onClick={() => { navigator.clipboard.writeText(resetPasswordResult.password); success("Copié", ""); }}
                                                        className="text-orange-500 hover:text-orange-700"
                                                    >
                                                        <Copy className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="flex justify-end">
                                                    <Button variant="ghost" size="sm" onClick={() => setResetPasswordResult(null)}>
                                                        Fermer
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-4 rounded-lg border border-slate-200 space-y-3">
                                                <Input
                                                    label="Nouveau mot de passe (optionnel)"
                                                    type="password"
                                                    placeholder="Laisser vide pour auto-générer"
                                                    value={accessNewPassword}
                                                    onChange={(e) => setAccessNewPassword(e.target.value)}
                                                    icon={<Key className="w-4 h-4 text-slate-400" />}
                                                />
                                                <p className="text-[11px] text-slate-500">
                                                    Le mot de passe ne pourra plus être récupéré après cette action.
                                                </p>
                                                <div className="flex justify-end">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={handleResetAccessPassword}
                                                        isLoading={isResettingAccessPassword}
                                                        className="gap-1.5"
                                                    >
                                                        <RefreshCw className="w-3.5 h-3.5" />
                                                        Réinitialiser
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Delete (revoke definitively) */}
                                    <div>
                                        <h4 className="text-[11px] font-bold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            Zone de danger
                                        </h4>
                                        <div className="p-4 rounded-lg border border-red-200 bg-red-50/40 flex items-center justify-between gap-4">
                                            <div>
                                                <p className="text-xs font-semibold text-slate-900">Supprimer définitivement</p>
                                                <p className="text-[11px] text-slate-600 mt-0.5">L&apos;utilisateur perdra tout accès et son compte sera supprimé.</p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setUserToDelete({ id: accessUserDetails.id, name: accessUserDetails.name })}
                                                className="text-red-600 border-red-200 hover:bg-red-100 gap-1.5 shrink-0"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                Supprimer
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ) : isLoadingAccessDetails ? (
                                <div className="flex items-center justify-center h-full">
                                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center">
                                    <ShieldCheck className="w-12 h-12 text-slate-200 mb-3" />
                                    <p className="text-sm text-slate-500">Sélectionnez un accès dans la liste</p>
                                    <p className="text-xs text-slate-400 mt-1">ou créez-en un nouveau</p>
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </Modal>

            {/* ── INTERLOCUTEUR MODAL ── */}
            <InterlocuteurModal
                isOpen={showIntModal}
                onClose={() => { setShowIntModal(false); setEditingInt(null); }}
                editing={editingInt}
                isSaving={isSavingInt}
                onSave={(data) => {
                    if (editingInt) {
                        handleUpdateInterlocuteur(editingInt.id, data);
                    } else {
                        handleCreateInterlocuteur(data as Omit<ClientInterlocuteur, "id" | "createdAt">);
                    }
                }}
            />
        </div>
    );
}

// ============================================================
// INTERLOCUTEUR MODAL COMPONENT
// ============================================================

const DURATION_OPTIONS = [15, 30, 45, 60, 90];

const emptyContactEntry = (): ContactEntry => ({ value: "", label: "", isPrimary: false });
const emptyBookingLink = (): IntBookingLink => ({ label: "", url: "", durationMinutes: 30 });

interface IntFormState {
    firstName: string;
    lastName: string;
    title: string;
    department: string;
    territory: string;
    emails: ContactEntry[];
    phones: ContactEntry[];
    bookingLinks: IntBookingLink[];
    notes: string;
    isActive: boolean;
}

function getDefaultIntForm(): IntFormState {
    return {
        firstName: "",
        lastName: "",
        title: "",
        department: "",
        territory: "",
        emails: [{ value: "", label: "Pro", isPrimary: true }],
        phones: [{ value: "", label: "Pro", isPrimary: true }],
        bookingLinks: [],
        notes: "",
        isActive: true,
    };
}

function formFromInterlocuteur(interl: ClientInterlocuteur): IntFormState {
    return {
        firstName: interl.firstName,
        lastName: interl.lastName,
        title: interl.title || "",
        department: interl.department || "",
        territory: interl.territory || "",
        emails: interl.emails.length > 0 ? [...interl.emails] : [{ value: "", label: "Pro", isPrimary: true }],
        phones: interl.phones.length > 0 ? [...interl.phones] : [{ value: "", label: "Pro", isPrimary: true }],
        bookingLinks: interl.bookingLinks.length > 0 ? [...interl.bookingLinks] : [],
        notes: interl.notes || "",
        isActive: interl.isActive,
    };
}

function InterlocuteurModal({
    isOpen,
    onClose,
    editing,
    isSaving,
    onSave,
}: {
    isOpen: boolean;
    onClose: () => void;
    editing: ClientInterlocuteur | null;
    isSaving: boolean;
    onSave: (data: Partial<Omit<ClientInterlocuteur, "id" | "createdAt">>) => void;
}) {
    const [form, setForm] = useState<IntFormState>(getDefaultIntForm);

    useEffect(() => {
        if (isOpen) {
            setForm(editing ? formFromInterlocuteur(editing) : getDefaultIntForm());
        }
    }, [isOpen, editing]);

    const updateEmails = (idx: number, patch: Partial<ContactEntry>) => {
        setForm(prev => {
            const next = [...prev.emails];
            next[idx] = { ...next[idx], ...patch };
            return { ...prev, emails: next };
        });
    };
    const setPrimaryEmail = (idx: number) => {
        setForm(prev => ({
            ...prev,
            emails: prev.emails.map((e, i) => ({ ...e, isPrimary: i === idx })),
        }));
    };
    const removeEmail = (idx: number) => {
        setForm(prev => {
            if (prev.emails.length <= 1) return prev;
            const next = prev.emails.filter((_, i) => i !== idx);
            if (!next.some(e => e.isPrimary) && next.length > 0) next[0].isPrimary = true;
            return { ...prev, emails: next };
        });
    };
    const addEmail = () => {
        setForm(prev => ({ ...prev, emails: [...prev.emails, emptyContactEntry()] }));
    };

    const updatePhones = (idx: number, patch: Partial<ContactEntry>) => {
        setForm(prev => {
            const next = [...prev.phones];
            next[idx] = { ...next[idx], ...patch };
            return { ...prev, phones: next };
        });
    };
    const setPrimaryPhone = (idx: number) => {
        setForm(prev => ({
            ...prev,
            phones: prev.phones.map((p, i) => ({ ...p, isPrimary: i === idx })),
        }));
    };
    const removePhone = (idx: number) => {
        setForm(prev => {
            if (prev.phones.length <= 1) return prev;
            const next = prev.phones.filter((_, i) => i !== idx);
            if (!next.some(p => p.isPrimary) && next.length > 0) next[0].isPrimary = true;
            return { ...prev, phones: next };
        });
    };
    const addPhone = () => {
        setForm(prev => ({ ...prev, phones: [...prev.phones, emptyContactEntry()] }));
    };

    const updateBookingLink = (idx: number, patch: Partial<IntBookingLink>) => {
        setForm(prev => {
            const next = [...prev.bookingLinks];
            next[idx] = { ...next[idx], ...patch };
            return { ...prev, bookingLinks: next };
        });
    };
    const removeBookingLink = (idx: number) => {
        setForm(prev => ({ ...prev, bookingLinks: prev.bookingLinks.filter((_, i) => i !== idx) }));
    };
    const addBookingLink = () => {
        setForm(prev => ({ ...prev, bookingLinks: [...prev.bookingLinks, emptyBookingLink()] }));
    };

    const handleSubmit = () => {
        const cleanEmails = form.emails.filter(e => e.value.trim());
        const cleanPhones = form.phones.filter(p => p.value.trim());
        const cleanLinks = form.bookingLinks.filter(bl => bl.url.trim());
        onSave({
            firstName: form.firstName,
            lastName: form.lastName,
            title: form.title || undefined,
            department: form.department || undefined,
            territory: form.territory || undefined,
            emails: cleanEmails,
            phones: cleanPhones,
            bookingLinks: cleanLinks,
            notes: form.notes || undefined,
            isActive: form.isActive,
        });
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={editing ? "Modifier le commercial" : "Ajouter un commercial"}
            description={editing ? `${editing.firstName} ${editing.lastName}` : "Ajoutez un commercial de votre client"}
            size="lg"
        >
            <div className="space-y-6 max-h-[65vh] overflow-y-auto pr-1">

                {/* Identité */}
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Identité</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <Input label="Prénom *" placeholder="Jean" value={form.firstName} onChange={(e) => setForm(p => ({ ...p, firstName: e.target.value }))} />
                        <Input label="Nom *" placeholder="Dupont" value={form.lastName} onChange={(e) => setForm(p => ({ ...p, lastName: e.target.value }))} />
                    </div>
                    <Input label="Titre / Poste" placeholder="Directeur commercial" value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-3">
                        <Input label="Département" placeholder="Ventes B2B" value={form.department} onChange={(e) => setForm(p => ({ ...p, department: e.target.value }))} />
                        <Input label="Territoire / Périmètre" placeholder="ex: Paris, Île-de-France" value={form.territory} onChange={(e) => setForm(p => ({ ...p, territory: e.target.value }))} />
                    </div>
                </div>

                {/* Emails */}
                <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Emails</h3>
                    {form.emails.map((entry, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                            <input
                                type="email"
                                placeholder="email@exemple.com"
                                value={entry.value}
                                onChange={(e) => updateEmails(idx, { value: e.target.value })}
                                className="flex-1 min-w-0 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                            />
                            <input
                                type="text"
                                placeholder="Pro, Perso…"
                                value={entry.label}
                                onChange={(e) => updateEmails(idx, { label: e.target.value })}
                                className="w-24 h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                            />
                            <button
                                type="button"
                                onClick={() => setPrimaryEmail(idx)}
                                className={cn("shrink-0 text-xs font-semibold px-2 py-1 rounded-md border transition-colors",
                                    entry.isPrimary ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-white text-slate-400 border-slate-200 hover:text-indigo-600"
                                )}
                            >
                                Principal
                            </button>
                            <button type="button" onClick={() => removeEmail(idx)} disabled={form.emails.length <= 1} className="shrink-0 text-slate-400 hover:text-red-500 disabled:opacity-30">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    <button type="button" onClick={addEmail} className="text-xs text-indigo-600 font-semibold hover:text-indigo-700">+ Ajouter un email</button>
                </div>

                {/* Téléphones */}
                <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Téléphones</h3>
                    {form.phones.map((entry, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                            <input
                                type="tel"
                                placeholder="+33 6 12 34 56 78"
                                value={entry.value}
                                onChange={(e) => updatePhones(idx, { value: e.target.value })}
                                className="flex-1 min-w-0 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                            />
                            <input
                                type="text"
                                placeholder="Pro, Perso…"
                                value={entry.label}
                                onChange={(e) => updatePhones(idx, { label: e.target.value })}
                                className="w-24 h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                            />
                            <button
                                type="button"
                                onClick={() => setPrimaryPhone(idx)}
                                className={cn("shrink-0 text-xs font-semibold px-2 py-1 rounded-md border transition-colors",
                                    entry.isPrimary ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-white text-slate-400 border-slate-200 hover:text-indigo-600"
                                )}
                            >
                                Principal
                            </button>
                            <button type="button" onClick={() => removePhone(idx)} disabled={form.phones.length <= 1} className="shrink-0 text-slate-400 hover:text-red-500 disabled:opacity-30">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    <button type="button" onClick={addPhone} className="text-xs text-indigo-600 font-semibold hover:text-indigo-700">+ Ajouter un téléphone</button>
                </div>

                {/* Booking Links */}
                <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Liens de réservation</h3>
                    {form.bookingLinks.map((bl, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                            <input
                                type="text"
                                placeholder="Appel découverte 30min"
                                value={bl.label}
                                onChange={(e) => updateBookingLink(idx, { label: e.target.value })}
                                className="w-40 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                            />
                            <input
                                type="url"
                                placeholder="https://calendly.com/…"
                                value={bl.url}
                                onChange={(e) => updateBookingLink(idx, { url: e.target.value })}
                                className="flex-1 min-w-0 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                            />
                            <select
                                value={bl.durationMinutes}
                                onChange={(e) => updateBookingLink(idx, { durationMinutes: Number(e.target.value) })}
                                className="w-20 h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                            >
                                {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d} min</option>)}
                            </select>
                            <button type="button" onClick={() => removeBookingLink(idx)} className="shrink-0 text-slate-400 hover:text-red-500">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    <button type="button" onClick={addBookingLink} className="text-xs text-indigo-600 font-semibold hover:text-indigo-700">+ Ajouter un lien</button>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes internes</h3>
                    <textarea
                        placeholder="Disponibilités, préférences de contact, contexte…"
                        value={form.notes}
                        onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
                    />
                </div>

                {/* Statut */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
                    <div>
                        <p className="text-sm font-semibold text-slate-900">Statut</p>
                        <p className="text-xs text-slate-500">{form.isActive ? "Ce commercial est actif et visible" : "Ce commercial est masqué"}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}
                        className={cn(
                            "w-11 h-6 rounded-full relative transition-colors shrink-0",
                            form.isActive ? "bg-emerald-500" : "bg-slate-300"
                        )}
                    >
                        <span className={cn(
                            "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
                            form.isActive ? "translate-x-[22px]" : "translate-x-1"
                        )} />
                    </button>
                </div>
            </div>

            <ModalFooter>
                <Button variant="ghost" onClick={onClose} disabled={isSaving}>Annuler</Button>
                <Button
                    variant="primary"
                    onClick={handleSubmit}
                    isLoading={isSaving}
                    disabled={!form.firstName.trim() || !form.lastName.trim() || isSaving}
                >
                    Enregistrer
                </Button>
            </ModalFooter>
        </Modal>
    );
}
