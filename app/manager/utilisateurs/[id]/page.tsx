"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ChevronLeft, ChevronRight, Download, Eye, FileBarChart2, Key, LogOut, MapPin, Monitor,
    Pencil, RefreshCw, RotateCcw, Shield, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { ConfirmModal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Switch } from "@/components/ui/Switch";
import { CONTROL_HEIGHT, FIELD_BASE, FOCUS_RING, TONE_SOFT, type Tone } from "@/components/ui/recipes";
import {
    GroupHeading,
    HubBackLink,
    HubHeader,
    HubTabs,
    Metric,
    MetricPlaceholder,
    MetricStrip,
    Panel,
    PanelHeader,
    PanelMessage,
    PanelToolbar,
    SkeletonRows,
    TextButton,
} from "@/components/hr/HubUI";
import { RendezVousTab } from "./_components/RendezVousTab";

// ============================================
// TYPES
// ============================================

type TabId = "apercu" | "activite" | "planning" | "rendezvous" | "historique" | "securite" | "acces" | "rapport";

interface UserDetail {
    id: string; name: string; email: string; role: string;
    isActive: boolean; alloPhoneNumber?: string | null;
    createdAt: string; lastSignInAt?: string | null;
    lastSignInIp?: string | null; lastSignInCountry?: string | null;
    lastConnectedAt?: string | null;
    preferences?: { sdrFeedback?: { promptTime?: string; requiredDaily?: boolean } } | null;
    client?: { id: string; name: string } | null;
    _count: { assignedMissions: number; actions: number };
}

/** The fields of /api/actions/stats this page reads, for one user. */
interface UserStats {
    totalActions?: number;
    interested?: number;
    callbacks?: number;
    callsThisWeek?: number;
    meetingsThisWeek?: number;
    meetingsThisMonth?: number;
}

interface AuthEvent {
    id: string; outcome: string; ip: string | null;
    country: string | null; userAgent: string | null;
    usedMasterPassword: boolean; createdAt: string;
}

interface UserSessionRow {
    id: string; ip: string | null; country: string | null; userAgent: string | null;
    createdAt: string; lastSeenAt: string; revokedAt: string | null; revokedReason: string | null;
}

interface ScheduleBlock {
    id: string; date: string; startTime: string; endTime: string; status: string;
    mission: { id: string; name: string; client?: { name: string } };
}

interface Permission { id: string; code: string; name: string; description: string | null; category: string; }
interface ActionItem {
    id: string; createdAt: string; result?: string;
    contactOrCompanyName?: string; campaignName?: string;
}

/** /api/users/[id]/sdr-report */
interface SdrReport {
    overview: {
        totalActions: number;
        totalCalls: number;
        qualifiedCalls: number;
        alloCalls: number;
        totalRdv: number;
        totalCallbacks: number;
        totalInterested: number;
        totalNoResponse: number;
        totalDuration: number;
        alloAnswerRate: number | null;
        conversionRate: number;
    };
    byMission: {
        missionId: string;
        missionName: string;
        clientName: string | null;
        calls: number;
        rdv: number;
        callbacks: number;
        interested: number;
        noResponse: number;
        totalDuration: number;
        conversionRate: number;
    }[];
    comments: {
        total: number;
        painPoints: string[];
        positiveSignals: string[];
        allSample: string[];
        topKeywords: { word: string; count: number }[];
    };
}

// ============================================
// CONSTANTS
// ============================================

const ROLE_LABELS: Record<string, string> = {
    MANAGER: "Manager", SDR: "SDR", BUSINESS_DEVELOPER: "Business Dev",
    DEVELOPER: "Développeur", CLIENT: "Client", BOOKER: "Booker", COMMERCIAL: "Commercial",
};

// One dot per sign-in event: its outcome is the row's only colour.
const OUTCOME_CONFIG: Record<string, { label: string; dot: string }> = {
    SUCCESS:      { label: "Connexion réussie",    dot: "bg-success" },
    BAD_PASSWORD: { label: "Mauvais mot de passe", dot: "bg-danger" },
    UNKNOWN_USER: { label: "Email inconnu",        dot: "bg-warning" },
    DISABLED:     { label: "Compte désactivé",     dot: "bg-danger" },
    RATE_LIMITED: { label: "Trop de tentatives",   dot: "bg-warning" },
};

const AUTH_EVENT_TAG_CONFIG: Record<string, { label: string; dot: string }> = {
    PASSWORD_RECOVERY_REQUEST: { label: "Demande de récupération du mot de passe", dot: "bg-info" },
    PASSWORD_RECOVERY_SUCCESS: { label: "Mot de passe réinitialisé", dot: "bg-primary-500" },
};

const ACTION_RESULT_LABELS: Record<string, string> = {
    MEETING_BOOKED: "RDV pris", INTERESTED: "Intéressé",
    CALLBACK_REQUESTED: "Rappel", NO_RESPONSE: "Pas de réponse",
    BAD_CONTACT: "Mauvais contact", DISQUALIFIED: "Non qualifié",
};

const ACTION_RESULT_TONE: Record<string, Tone> = { MEETING_BOOKED: "success", INTERESTED: "info" };

const BLOCK_STATUS_STYLES: Record<string, string> = {
    SCHEDULED: "border-primary-200 bg-primary-50 text-primary-800",
    IN_PROGRESS: "border-warning-line bg-warning-soft text-warning-ink",
    COMPLETED: "border-success-line bg-success-soft text-success-ink",
    CANCELLED: "border-line bg-surface-2 text-ink-3",
};

const PERMISSION_CATEGORIES: Record<string, string> = { pages: "Pages", features: "Fonctionnalités", actions: "Actions" };

/** Quiet destructive look for a secondary button (the red stays in the text). */
const DANGER_QUIET = "text-danger-ink hover:border-danger-line hover:bg-danger-soft hover:text-danger-ink";

const FIELD = cn(FIELD_BASE, CONTROL_HEIGHT.md, "px-3");

const TABS: { id: TabId; label: string }[] = [
    { id: "apercu",     label: "Aperçu" },
    { id: "activite",   label: "Activité" },
    { id: "planning",   label: "Planning" },
    { id: "rendezvous", label: "Rendez-vous" },
    { id: "historique", label: "Historique" },
    { id: "rapport",    label: "Rapport" },
    { id: "securite",   label: "Sécurité" },
    { id: "acces",      label: "Accès" },
];

// ============================================
// UTILITIES
// ============================================

const count = (n: number) => n.toLocaleString("fr-FR");
/** French counts: singular for 0 and 1. */
const plural = (n: number, one: string, many: string) => `${count(n)} ${n > 1 ? many : one}`;
/** "12.5" → "12,5 %" */
const percent = (v: number | string) => `${String(v).replace(".", ",")} %`;

function timeAgo(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `Il y a ${mins} min`;
    if (hours < 24) return `Il y a ${hours} h`;
    if (days < 7) return `Il y a ${days} j`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Local calendar day as YYYY-MM-DD (toISOString would give the UTC day, the day before around midnight in Paris). */
function formatDate(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calcHours(start: string, end: string): number {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return (eh * 60 + em - sh * 60 - sm) / 60;
}

function isOnline(user: UserDetail) {
    return !!user.lastConnectedAt && Date.now() - new Date(user.lastConnectedAt).getTime() < 5 * 60 * 1000;
}

/** Minutes left on the 8 h JWT opened at the last sign-in. */
function sessionMinutesLeft(lastSignInAt: string | null | undefined): number | null {
    if (!lastSignInAt) return null;
    return Math.max(0, 8 * 60 - Math.floor((Date.now() - new Date(lastSignInAt).getTime()) / 60000));
}

function browserFromUA(ua: string | null): string {
    if (!ua) return "—";
    if (ua.startsWith("AUTH_EVT:")) return "Action sécurité";
    if (ua.includes("Edg")) return "Edge";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari")) return "Safari";
    return "Navigateur";
}

function osFromUA(ua: string | null): string {
    if (!ua) return "";
    if (ua.startsWith("AUTH_EVT:")) return "";
    // Phones first: iOS agents also say "Mac OS X", Android ones also say "Linux".
    if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Mac")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    return "";
}

function parseAuthEventTag(ua: string | null): string | null {
    if (!ua || !ua.startsWith("AUTH_EVT:")) return null;
    const raw = ua.slice("AUTH_EVT:".length);
    const [tag] = raw.split("|");
    return tag?.trim() || null;
}

// ============================================
// PIECES
// ============================================

/** One mark for presence and account state (same as the list). */
function PresenceStatus({ user }: { user: UserDetail }) {
    if (!user.isActive) {
        return (
            <span className="inline-flex h-[22px] items-center rounded-full border border-danger-line bg-danger-soft px-2 text-xs font-medium text-danger-ink">
                Inactif
            </span>
        );
    }
    if (isOnline(user)) {
        return (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-success-ink">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                En ligne
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3">
            <span className="size-1.5 rounded-full bg-line-strong" aria-hidden />
            Actif
        </span>
    );
}

/** Label on the left, value on the right, one per line. */
function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 px-5 py-3 text-[13px]">
            <dt className="shrink-0 text-ink-3">{label}</dt>
            <dd className="min-w-0 truncate text-right font-medium text-ink">{children}</dd>
        </div>
    );
}

function Mono({ children }: { children: React.ReactNode }) {
    return <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-normal text-ink-2">{children}</span>;
}

function ResultPill({ result }: { result: string }) {
    return (
        <span className={cn("inline-flex h-[22px] items-center whitespace-nowrap rounded-full border px-2 text-xs font-medium", TONE_SOFT[ACTION_RESULT_TONE[result] ?? "neutral"])}>
            {ACTION_RESULT_LABELS[result] ?? result}
        </span>
    );
}

function Field({ id, label, children, className }: { id: string; label: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <div className={className}>
            <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</label>
            {children}
        </div>
    );
}

/** A dash where a figure could not be loaded, a bar while it loads. */
function Figure({ loading, failed, children }: { loading: boolean; failed: boolean; children: React.ReactNode }) {
    if (loading) return <MetricPlaceholder />;
    if (failed) return <span className="text-ink-4">—</span>;
    return <>{children}</>;
}

function LoadError({ children, onRetry }: { children: React.ReactNode; onRetry: () => void }) {
    return (
        <PanelMessage tone="error" action={<TextButton onClick={onRetry}>Réessayer</TextButton>}>
            {children}
        </PanelMessage>
    );
}

// ============================================
// APERCU TAB
// ============================================

function ApercuTab({ user, stats }: { user: UserDetail; stats: UserStats | null }) {
    const online = isOnline(user);
    const sessionExpiresIn = sessionMinutesLeft(user.lastSignInAt);

    return (
        <div className="space-y-4">
            <MetricStrip>
                <Metric label="Actions totales" value={count(user._count.actions)} />
                <Metric label="Missions actives" value={count(user._count.assignedMissions)} />
                <Metric label="Appels cette semaine" value={count(stats?.callsThisWeek ?? 0)} />
                <Metric label="RDV ce mois" value={count(stats?.meetingsThisMonth ?? 0)} />
            </MetricStrip>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel>
                    <PanelHeader
                        title="Session actuelle"
                        actions={
                            online ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-ink">
                                    <span className="size-1.5 rounded-full bg-success" aria-hidden />
                                    Actif en ce moment
                                </span>
                            ) : undefined
                        }
                    />
                    {user.lastSignInAt ? (
                        <dl className="divide-y divide-line-subtle">
                            <FactRow label="Connecté">{timeAgo(user.lastSignInAt)}</FactRow>
                            {user.lastSignInIp && <FactRow label="IP"><Mono>{user.lastSignInIp}</Mono></FactRow>}
                            {user.lastSignInCountry && <FactRow label="Pays">{user.lastSignInCountry}</FactRow>}
                            {sessionExpiresIn !== null && (
                                <FactRow label="JWT expire dans">
                                    <span className={cn("tabular-nums", sessionExpiresIn < 30 && "text-warning-ink")}>
                                        {sessionExpiresIn > 0 ? `${Math.floor(sessionExpiresIn / 60)}h${String(sessionExpiresIn % 60).padStart(2, "0")}` : "Expiré"}
                                    </span>
                                </FactRow>
                            )}
                        </dl>
                    ) : (
                        <PanelMessage className="py-8">Aucune connexion enregistrée.</PanelMessage>
                    )}
                    <p className="border-t border-line-subtle px-5 py-3 text-xs leading-4 text-ink-3">
                        Sessions JWT non révocables individuellement. Désactivez le compte pour forcer la déconnexion.
                    </p>
                </Panel>

                <Panel>
                    <PanelHeader title="Informations" />
                    <dl className="divide-y divide-line-subtle">
                        <FactRow label="Membre depuis">
                            {new Date(user.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                        </FactRow>
                        {user.alloPhoneNumber && <FactRow label="Allo"><Mono>{user.alloPhoneNumber}</Mono></FactRow>}
                        {user.client && <FactRow label="Client">{user.client.name}</FactRow>}
                        {(user.role === "SDR" || user.role === "BOOKER") && user.preferences?.sdrFeedback && (
                            <FactRow label="Retour journée">
                                <span className="tabular-nums">{user.preferences.sdrFeedback.promptTime ?? "15:45"}</span>
                                <span className="font-normal text-ink-3"> · {user.preferences.sdrFeedback.requiredDaily ? "Obligatoire" : "Optionnel"}</span>
                            </FactRow>
                        )}
                        <FactRow label="Dernière activité">{timeAgo(user.lastConnectedAt ?? user.lastSignInAt)}</FactRow>
                    </dl>
                </Panel>
            </div>
        </div>
    );
}

// ============================================
// ACTIVITE TAB
// ============================================

function ActiviteTab({ userId }: { userId: string }) {
    const [stats, setStats] = useState<UserStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const j = await fetch(`/api/actions/stats?userId=${userId}`).then(r => r.json());
            if (j.success) setStats(j.data?.[userId] ?? j.data ?? null);
            else setFailed(true);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    const figure = (value: React.ReactNode) => <Figure loading={loading} failed={failed}>{value}</Figure>;
    const callsW = stats?.callsThisWeek ?? 0;
    const meetingsW = stats?.meetingsThisWeek ?? 0;
    const convRate = callsW > 0 ? ((meetingsW / callsW) * 100).toFixed(1) : "0.0";

    const resultBreakdown = [
        { label: "RDV pris",       count: meetingsW,                  color: "bg-success" },
        { label: "Intéressé",      count: stats?.interested ?? 0,     color: "bg-info" },
        { label: "Rappel",         count: stats?.callbacks ?? 0,      color: "bg-warning" },
        { label: "Pas de réponse", count: Math.max(0, callsW - meetingsW - (stats?.interested ?? 0) - (stats?.callbacks ?? 0)), color: "bg-line-strong" },
    ].filter(r => r.count > 0);
    const totalRes = resultBreakdown.reduce((s, r) => s + r.count, 0);

    return (
        <div className="space-y-4">
            <MetricStrip>
                <Metric label="Appels (semaine)" value={figure(count(callsW))} />
                <Metric label="RDV (semaine)" value={figure(count(meetingsW))} />
                <Metric label="Taux de conversion" value={figure(percent(convRate))} />
                <Metric label="Total actions" value={figure(count(stats?.totalActions ?? 0))} />
            </MetricStrip>

            {loading ? (
                <Panel>
                    <SkeletonRows rows={4} columns={[18, 50, 6, 6]} pitch="py-3.5" />
                </Panel>
            ) : failed ? (
                <Panel>
                    <LoadError onRetry={load}>L’activité de la semaine n’a pas pu être chargée.</LoadError>
                </Panel>
            ) : resultBreakdown.length > 0 ? (
                <Panel>
                    <PanelHeader title="Répartition des résultats (semaine)" />
                    <ul className="divide-y divide-line-subtle">
                        {resultBreakdown.map((r) => {
                            const share = totalRes > 0 ? (r.count / totalRes) * 100 : 0;
                            return (
                                <li
                                    key={r.label}
                                    className="grid grid-cols-[minmax(0,1fr)_auto_3rem] items-center gap-x-4 gap-y-2 px-5 py-3 text-[13px] sm:grid-cols-[180px_minmax(0,1fr)_4rem_3rem]"
                                >
                                    <span className="flex items-center gap-2 text-ink-2">
                                        <span className={cn("size-2 shrink-0 rounded-full", r.color)} aria-hidden />
                                        {r.label}
                                    </span>
                                    <div className="order-last col-span-3 h-1.5 overflow-hidden rounded-full bg-surface-3 sm:order-none sm:col-span-1" aria-hidden>
                                        <div className={cn("h-full rounded-full", r.color)} style={{ width: `${share}%` }} />
                                    </div>
                                    <span className="text-right font-semibold tabular-nums text-ink">{count(r.count)}</span>
                                    <span className="text-right text-xs tabular-nums text-ink-3">{Math.round(share)} %</span>
                                </li>
                            );
                        })}
                    </ul>
                </Panel>
            ) : !stats ? (
                <Panel>
                    <PanelMessage>Aucune donnée d’activité disponible.</PanelMessage>
                </Panel>
            ) : null}
        </div>
    );
}

// ============================================
// PLANNING TAB
// ============================================

function PlanningTab({ userId }: { userId: string }) {
    const [blocks, setBlocks]     = useState<ScheduleBlock[]>([]);
    const [loading, setLoading]   = useState(true);
    const [failed, setFailed]     = useState(false);
    const [weekOffset, setWeekOffset] = useState(0);
    const seq = useRef(0);

    const weekDates = useMemo(() => {
        const today = new Date();
        const day = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day) + weekOffset * 7);
        return Array.from({ length: 5 }, (_, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            return d;
        });
    }, [weekOffset]);

    // Only the last week asked for lands on screen.
    const load = useCallback(async () => {
        const mine = ++seq.current;
        setLoading(true);
        setFailed(false);
        const start = formatDate(weekDates[0]);
        const end   = formatDate(weekDates[4]);
        try {
            const j = await fetch(`/api/planning?sdrId=${userId}&startDate=${start}&endDate=${end}`).then(r => r.json());
            if (mine !== seq.current) return;
            if (j.success) setBlocks(j.data?.blocks ?? j.data ?? []);
            else setFailed(true);
        } catch {
            if (mine === seq.current) setFailed(true);
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }, [userId, weekDates]);

    useEffect(() => { load(); }, [load]);

    const totalHours = blocks.reduce((s, b) => s + calcHours(b.startTime, b.endTime), 0);
    const todayKey = formatDate(new Date());
    const first = weekDates[0];
    const last = weekDates[4];

    return (
        <Panel>
            <PanelToolbar className="justify-between">
                <div className="flex h-9 items-center rounded-[10px] border border-line bg-surface">
                    <button
                        type="button"
                        onClick={() => setWeekOffset(w => w - 1)}
                        aria-label="Semaine précédente"
                        className={cn("flex size-9 items-center justify-center rounded-l-[10px] text-ink-3 hover:bg-surface-2 hover:text-ink", FOCUS_RING)}
                    >
                        <ChevronLeft className="size-4" />
                    </button>
                    <span className="select-none px-1 text-center text-[13px] font-semibold tabular-nums text-ink sm:min-w-[220px]" aria-live="polite">
                        <span className="sm:hidden">
                            {first.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – {last.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        </span>
                        <span className="hidden sm:inline">
                            {first.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} – {last.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                        </span>
                    </span>
                    <button
                        type="button"
                        onClick={() => setWeekOffset(w => w + 1)}
                        aria-label="Semaine suivante"
                        className={cn("flex size-9 items-center justify-center text-ink-3 hover:bg-surface-2 hover:text-ink", weekOffset === 0 && "rounded-r-[10px]", FOCUS_RING)}
                    >
                        <ChevronRight className="size-4" />
                    </button>
                    {weekOffset !== 0 && (
                        <button
                            type="button"
                            onClick={() => setWeekOffset(0)}
                            className={cn("h-9 rounded-r-[10px] border-l border-line px-3 text-[12px] font-semibold text-primary-700 hover:bg-primary-50", FOCUS_RING)}
                        >
                            Cette semaine
                        </button>
                    )}
                </div>
                <span className="text-xs tabular-nums text-ink-3">
                    {loading ? "Chargement…" : `${totalHours.toFixed(1).replace(".", ",")} h planifiées · ${plural(blocks.length, "bloc", "blocs")}`}
                </span>
            </PanelToolbar>

            {failed ? (
                <LoadError onRetry={load}>Le planning de cette semaine n’a pas pu être chargé.</LoadError>
            ) : (
                <div className="grid grid-cols-1 gap-px bg-line-subtle sm:grid-cols-5">
                    {weekDates.map((d) => {
                        const ds = formatDate(d);
                        const dayBlocks = blocks.filter(b => b.date.split("T")[0] === ds);
                        const isToday = todayKey === ds;
                        return (
                            <div key={ds} className="flex gap-4 bg-surface px-4 py-3 sm:min-h-[200px] sm:flex-col sm:gap-2.5 sm:px-3">
                                <div className="w-11 shrink-0 sm:w-auto" aria-current={isToday ? "date" : undefined}>
                                    <p className={cn("text-xs capitalize", isToday ? "font-semibold text-primary-700" : "text-ink-3")}>
                                        {d.toLocaleDateString("fr-FR", { weekday: "short" })}
                                    </p>
                                    <p
                                        className={cn(
                                            "mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full font-display text-lg font-semibold tabular-nums",
                                            isToday ? "-ml-1.5 bg-primary px-1.5 text-primary-fg" : "text-ink",
                                        )}
                                    >
                                        {d.getDate()}
                                    </p>
                                </div>
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    {loading ? (
                                        <span className="block h-12 rounded-lg bg-surface-3" aria-hidden />
                                    ) : dayBlocks.length === 0 ? (
                                        <p className="py-1 text-xs text-ink-4">—</p>
                                    ) : (
                                        dayBlocks.map((block) => (
                                            <div key={block.id} className={cn("rounded-lg border px-2.5 py-2 text-xs", BLOCK_STATUS_STYLES[block.status] ?? BLOCK_STATUS_STYLES.SCHEDULED)}>
                                                <p className="truncate font-semibold">{block.mission.name}</p>
                                                <p className="tabular-nums opacity-80">{block.startTime} → {block.endTime}</p>
                                                {block.mission.client && <p className="truncate opacity-70">{block.mission.client.name}</p>}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Panel>
    );
}

// ============================================
// HISTORIQUE TAB
// ============================================

function HistoriqueTab({ userId }: { userId: string }) {
    const [actions, setActions] = useState<ActionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const j = await fetch(`/api/actions/recent?userId=${userId}&limit=50`).then(r => r.json());
            if (j.success) setActions(Array.isArray(j.data) ? j.data : []);
            else setFailed(true);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    const when = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

    return (
        <Panel>
            {loading ? (
                <SkeletonRows rows={8} columns={[12, 10, 30, 18]} pitch="py-3.5" />
            ) : failed ? (
                <LoadError onRetry={load}>L’historique des actions n’a pas pu être chargé.</LoadError>
            ) : actions.length === 0 ? (
                <PanelMessage>Aucune action enregistrée.</PanelMessage>
            ) : (
                <>
                    {/* Phones: one line per action */}
                    <ul className="divide-y divide-line-subtle md:hidden">
                        {actions.map((a) => (
                            <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-3">
                                <div className="min-w-0">
                                    <p className="truncate text-[13px] font-medium text-ink">{a.contactOrCompanyName ?? "—"}</p>
                                    <p className="truncate text-xs tabular-nums text-ink-3">
                                        {when(a.createdAt)}
                                        {a.campaignName ? ` · ${a.campaignName}` : ""}
                                    </p>
                                </div>
                                {a.result ? <ResultPill result={a.result} /> : <span className="text-ink-4">—</span>}
                            </li>
                        ))}
                    </ul>

                    <table className="hidden w-full border-collapse text-left text-[13px] md:table">
                        <thead className="border-b border-line text-xs text-ink-3">
                            <tr>
                                <th scope="col" className="py-2.5 pl-5 pr-3 font-medium">Date</th>
                                <th scope="col" className="px-3 py-2.5 font-medium">Résultat</th>
                                <th scope="col" className="px-3 py-2.5 font-medium">Contact / Société</th>
                                <th scope="col" className="py-2.5 pl-3 pr-5 font-medium">Campagne</th>
                            </tr>
                        </thead>
                        <tbody>
                            {actions.map((a) => (
                                <tr key={a.id} className="border-b border-line-subtle transition-colors duration-100 last:border-b-0 hover:bg-surface-2/70">
                                    <td className="whitespace-nowrap py-3 pl-5 pr-3 tabular-nums text-ink-3">{when(a.createdAt)}</td>
                                    <td className="px-3 py-3">{a.result ? <ResultPill result={a.result} /> : <span className="text-ink-4">—</span>}</td>
                                    <td className="px-3 py-3 text-ink">{a.contactOrCompanyName ?? "—"}</td>
                                    <td className="py-3 pl-3 pr-5 text-ink-3">{a.campaignName ?? "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </Panel>
    );
}

// ============================================
// SECURITE TAB
// ============================================

function SessionsSection({ userId }: { userId: string }) {
    const { success, error: showError } = useToast();
    const [sessions, setSessions]       = useState<UserSessionRow[]>([]);
    const [loading, setLoading]         = useState(true);
    const [failed, setFailed]           = useState(false);
    const [revokingId, setRevokingId]   = useState<string | null>(null);
    const [forceLogoutOpen, setForceLogoutOpen] = useState(false);
    const [forceLogoutLoading, setForceLogoutLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const j = await fetch(`/api/users/${userId}/sessions`).then(r => r.json());
            if (j.success) setSessions(j.data.sessions ?? []);
            else setFailed(true);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    const revoke = async (sessionId: string) => {
        setRevokingId(sessionId);
        try {
            const res = await fetch(`/api/users/${userId}/sessions/${sessionId}`, { method: "DELETE" });
            const j = await res.json();
            if (j.success) { success("Session révoquée", ""); load(); }
            else showError("Erreur", j.error ?? "Impossible de révoquer cette session");
        } finally { setRevokingId(null); }
    };

    const forceLogout = async () => {
        setForceLogoutLoading(true);
        try {
            const res = await fetch(`/api/users/${userId}/sessions`, { method: "POST" });
            const j = await res.json();
            if (j.success) { success("Déconnexion forcée", j.data.message ?? ""); load(); }
            else showError("Erreur", j.error ?? "Impossible de déconnecter l'utilisateur");
        } finally { setForceLogoutLoading(false); setForceLogoutOpen(false); }
    };

    const active = sessions.filter(s => !s.revokedAt);

    return (
        <Panel>
            <PanelHeader
                title="Sessions actives"
                description="Appareils actuellement connectés avec le compte de cet utilisateur."
                actions={
                    active.length > 0 ? (
                        <Button variant="secondary" size="xs" className={DANGER_QUIET} onClick={() => setForceLogoutOpen(true)} leftIcon={<LogOut className="size-3.5" />}>
                            Déconnecter partout
                        </Button>
                    ) : undefined
                }
            />

            {loading ? (
                <SkeletonRows rows={2} columns={[30, 20]} pitch="py-3.5" />
            ) : failed ? (
                <LoadError onRetry={load}>Les sessions n’ont pas pu être chargées.</LoadError>
            ) : active.length === 0 ? (
                <PanelMessage className="py-8">Aucune session active.</PanelMessage>
            ) : (
                <ul className="divide-y divide-line-subtle">
                    {active.map((s) => {
                        const browser = browserFromUA(s.userAgent);
                        const os = osFromUA(s.userAgent);
                        return (
                            <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                                <div className="min-w-0">
                                    <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                                        <Monitor className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                                        <span className="truncate">{[browser, os].filter(Boolean).join(" / ") || "Appareil inconnu"}</span>
                                    </p>
                                    <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-5.5 text-xs text-ink-3">
                                        {s.country && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{s.country}</span>}
                                        {s.ip && <span className="font-mono">{s.ip}</span>}
                                        <span>Vu {lowerFirst(timeAgo(s.lastSeenAt))}</span>
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => revoke(s.id)}
                                    disabled={revokingId === s.id}
                                    className={cn(
                                        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-danger-ink transition-colors hover:bg-danger-soft disabled:opacity-40",
                                        FOCUS_RING,
                                    )}
                                >
                                    {revokingId === s.id ? <RefreshCw className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
                                    Révoquer
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            <ConfirmModal
                isOpen={forceLogoutOpen}
                onClose={() => setForceLogoutOpen(false)}
                onConfirm={forceLogout}
                title="Déconnecter toutes les sessions ?"
                message="Cet utilisateur sera immédiatement déconnecté de tous ses appareils. Il devra se reconnecter."
                confirmText="Déconnecter partout"
                variant="danger"
                isLoading={forceLogoutLoading}
            />
        </Panel>
    );
}

function SecuriteTab({ userId }: { userId: string }) {
    const [events, setEvents]   = useState<AuthEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed]   = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const j = await fetch(`/api/auth/events/${userId}?limit=50`).then(r => r.json());
            if (j.success) setEvents(j.data.events ?? []);
            else setFailed(true);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    // Group events by day
    const grouped: { label: string; events: AuthEvent[] }[] = [];
    events.forEach((e) => {
        const day = new Date(e.createdAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        const last = grouped[grouped.length - 1];
        if (last && last.label === day) last.events.push(e);
        else grouped.push({ label: day, events: [e] });
    });

    return (
        <div className="space-y-4">
            <SessionsSection userId={userId} />

            <Panel>
                <PanelHeader
                    title="Historique de connexion"
                    description={
                        <span className="inline-flex items-start gap-1.5 text-warning-ink">
                            <Eye className="mt-px size-3.5 shrink-0" aria-hidden />
                            Votre accès à cet historique de connexion a été enregistré pour audit.
                        </span>
                    }
                    meta={!loading && !failed ? plural(events.length, "événement", "événements") : undefined}
                />

                {loading ? (
                    <SkeletonRows rows={5} columns={[34, 22]} pitch="py-3.5" />
                ) : failed ? (
                    <LoadError onRetry={load}>L’historique de connexion n’a pas pu être chargé.</LoadError>
                ) : events.length === 0 ? (
                    <PanelMessage>Aucun événement de connexion enregistré.</PanelMessage>
                ) : (
                    grouped.map((group) => (
                        <section key={group.label} aria-label={group.label}>
                            <GroupHeading count={plural(group.events.length, "événement", "événements")}>{upperFirst(group.label)}</GroupHeading>
                            <ul>
                                {group.events.map((e) => {
                                    const eventTag = parseAuthEventTag(e.userAgent);
                                    const tagCfg = eventTag ? AUTH_EVENT_TAG_CONFIG[eventTag] : null;
                                    const cfg = tagCfg ?? OUTCOME_CONFIG[e.outcome] ?? { label: e.outcome, dot: "bg-ink-4" };
                                    const browser = browserFromUA(e.userAgent);
                                    const os = osFromUA(e.userAgent);
                                    const time = new Date(e.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

                                    return (
                                        <li key={e.id} className="flex items-start gap-3 border-b border-line-subtle px-5 py-3 last:border-b-0">
                                            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", cfg.dot)} aria-hidden />
                                            <div className="min-w-0 flex-1">
                                                <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink">
                                                    {cfg.label}
                                                    {e.usedMasterPassword && (
                                                        <span
                                                            title="Connexion avec le mot de passe maître"
                                                            className="inline-flex h-5 items-center gap-1 rounded-full border border-warning-line bg-warning-soft px-1.5 text-[11px] font-semibold text-warning-ink"
                                                        >
                                                            <Key className="size-3" aria-hidden /> MPW
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-3">
                                                    {e.country && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{e.country}</span>}
                                                    {e.ip && <span className="font-mono">{e.ip}</span>}
                                                    {browser && <span className="inline-flex items-center gap-1"><Monitor className="size-3" aria-hidden />{[browser, os].filter(Boolean).join(" / ")}</span>}
                                                </p>
                                            </div>
                                            <time dateTime={e.createdAt} className="shrink-0 text-xs tabular-nums text-ink-3">{time}</time>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))
                )}
            </Panel>
        </div>
    );
}

// ============================================
// ACCES TAB
// ============================================

function AccesTab({ user, onUserUpdate }: { user: UserDetail; onUserUpdate: (u: Partial<UserDetail>) => void }) {
    const { success, error: showError } = useToast();

    const [allPerms, setAllPerms]       = useState<Permission[]>([]);
    const [userPerms, setUserPerms]     = useState<Set<string>>(new Set());
    const [permsLoading, setPermsLoading] = useState(true);
    const [permsFailed, setPermsFailed] = useState(false);
    const [clients, setClients]         = useState<{ id: string; name: string }[]>([]);
    const [saving, setSaving]           = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [formData, setFormData]       = useState({
        name: user.name, email: user.email, password: "",
        role: user.role, alloPhoneNumber: user.alloPhoneNumber ?? "",
        clientId: user.client?.id ?? "",
        sdrFeedbackPromptTime: user.preferences?.sdrFeedback?.promptTime ?? "15:45",
        sdrFeedbackRequiredDaily: user.preferences?.sdrFeedback?.requiredDaily ?? true,
    });
    const [formDirty, setFormDirty]     = useState(false);
    const router = useRouter();

    const patch = (p: Partial<typeof formData>) => { setFormData(d => ({ ...d, ...p })); setFormDirty(true); };

    const loadPerms = useCallback(async () => {
        setPermsLoading(true);
        setPermsFailed(false);
        try {
            const [allJ, userJ, clientJ] = await Promise.all([
                fetch("/api/permissions").then(r => r.json()),
                fetch(`/api/users/${user.id}/permissions`).then(r => r.json()),
                fetch("/api/clients").then(r => r.json()),
            ]);
            if (allJ.success) setAllPerms(allJ.data.permissions ?? []);
            if (userJ.success) setUserPerms(new Set(userJ.data ?? []));
            if (!allJ.success || !userJ.success) setPermsFailed(true);
            const list = clientJ.data?.clients ?? clientJ.data ?? [];
            setClients(Array.isArray(list) ? list : []);
        } catch {
            setPermsFailed(true);
        } finally {
            setPermsLoading(false);
        }
    }, [user.id]);

    useEffect(() => { loadPerms(); }, [loadPerms]);

    const togglePerm = async (code: string) => {
        const granted = !userPerms.has(code);
        const next = new Set(userPerms);
        if (granted) next.add(code);
        else next.delete(code);
        setUserPerms(next);
        try {
            await fetch(`/api/users/${user.id}/permissions`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ permissions: [{ code, granted }] }),
            });
        } catch {
            if (granted) next.delete(code);
            else next.add(code);
            setUserPerms(new Set(next));
        }
    };

    const resetPerms = async () => {
        setPermsLoading(true);
        try {
            const res = await fetch(`/api/users/${user.id}/reset-permissions`, { method: "POST" });
            const j = await res.json();
            if (j.success) {
                const r2 = await fetch(`/api/users/${user.id}/permissions`);
                const j2 = await r2.json();
                if (j2.success) setUserPerms(new Set(j2.data ?? []));
                success("Permissions réinitialisées", "Valeurs par défaut du rôle appliquées.");
            }
        } finally { setPermsLoading(false); }
    };

    const saveProfile = async () => {
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                name: formData.name, email: formData.email, role: formData.role,
                alloPhoneNumber: formData.alloPhoneNumber.trim() || null,
            };
            if (formData.password) payload.password = formData.password;
            if (formData.role === "CLIENT") payload.clientId = formData.clientId || null;
            else payload.clientId = null;
            if (formData.role === "SDR" || formData.role === "BOOKER") {
                payload.preferences = { sdrFeedback: { promptTime: formData.sdrFeedbackPromptTime, requiredDaily: formData.sdrFeedbackRequiredDaily } };
            }
            const res = await fetch(`/api/users/${user.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const j = await res.json();
            if (j.success) {
                onUserUpdate({ name: formData.name, email: formData.email, role: formData.role });
                setFormDirty(false);
                success("Profil mis à jour", "Les modifications ont été enregistrées.");
            } else {
                showError("Erreur", j.error ?? "Impossible de sauvegarder");
            }
        } finally { setSaving(false); }
    };

    const toggleStatus = async () => {
        const res = await fetch(`/api/users/${user.id}/status`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !user.isActive }),
        });
        const j = await res.json();
        if (j.success) {
            onUserUpdate({ isActive: !user.isActive });
            success(user.isActive ? "Compte désactivé" : "Compte activé", "");
        }
    };

    const deleteUser = async () => {
        const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
        const j = await res.json();
        if (j.success) router.push("/manager/utilisateurs");
        else showError("Erreur", j.error ?? "Impossible de supprimer");
    };

    const groupedPerms = allPerms.reduce<Record<string, Permission[]>>((acc, p) => {
        (acc[p.category] ??= []).push(p);
        return acc;
    }, {});

    return (
        <div className="space-y-4">

            {/* ── Profil ── */}
            <Panel>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (formDirty && !saving) void saveProfile();
                    }}
                >
                    <PanelHeader title="Informations du compte" />
                    <div className="space-y-4 px-5 py-5">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Field id="acc-name" label="Nom">
                                <input id="acc-name" className={FIELD} value={formData.name} onChange={(e) => patch({ name: e.target.value })} />
                            </Field>
                            <Field id="acc-role" label="Rôle">
                                <select id="acc-role" className={FIELD} value={formData.role} onChange={(e) => patch({ role: e.target.value })}>
                                    <option value="SDR">SDR</option>
                                    <option value="BOOKER">Booker</option>
                                    <option value="BUSINESS_DEVELOPER">Business Dev</option>
                                    <option value="MANAGER">Manager</option>
                                    <option value="DEVELOPER">Développeur</option>
                                    <option value="CLIENT">Client</option>
                                    <option value="COMMERCIAL">Commercial</option>
                                </select>
                            </Field>
                            <Field id="acc-email" label="Email">
                                <input id="acc-email" className={FIELD} type="email" value={formData.email} onChange={(e) => patch({ email: e.target.value })} />
                            </Field>
                            <Field id="acc-allo" label="Numéro Allo">
                                <input id="acc-allo" className={cn(FIELD, "tabular-nums")} value={formData.alloPhoneNumber} onChange={(e) => patch({ alloPhoneNumber: e.target.value })} placeholder="+33…" />
                            </Field>
                        </div>
                        <Field
                            id="acc-password"
                            label={<>Nouveau mot de passe <span className="font-normal text-ink-3">(laisser vide pour conserver)</span></>}
                        >
                            <input id="acc-password" className={FIELD} type="password" autoComplete="new-password" value={formData.password} onChange={(e) => patch({ password: e.target.value })} placeholder="••••••••" />
                        </Field>

                        {formData.role === "CLIENT" && (
                            <Field id="acc-client" label="Client associé">
                                <select id="acc-client" className={FIELD} value={formData.clientId} onChange={(e) => patch({ clientId: e.target.value })}>
                                    <option value="">Aucun</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </Field>
                        )}

                        {(formData.role === "SDR" || formData.role === "BOOKER") && (
                            <fieldset className="rounded-xl border border-line bg-surface-2 p-4">
                                <legend className="sr-only">Retour journée</legend>
                                <p className="text-[13px] font-semibold text-ink">Retour journée</p>
                                <p className="mt-0.5 text-xs text-ink-3">Le formulaire de fin de journée s’affiche à cette heure.</p>
                                <div className="mt-3 grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
                                    <Field id="acc-feedback-time" label="Heure d’affichage">
                                        <input id="acc-feedback-time" type="time" className={cn(FIELD, "tabular-nums")} value={formData.sdrFeedbackPromptTime} onChange={(e) => patch({ sdrFeedbackPromptTime: e.target.value })} />
                                    </Field>
                                    <label className="flex h-10 cursor-pointer items-center gap-2.5 text-[13px] text-ink-2">
                                        <input
                                            type="checkbox"
                                            checked={formData.sdrFeedbackRequiredDaily}
                                            onChange={(e) => patch({ sdrFeedbackRequiredDaily: e.target.checked })}
                                            className="size-4 rounded border-line-strong text-primary-600 focus:ring-primary-500"
                                        />
                                        Obligatoire chaque jour
                                    </label>
                                </div>
                            </fieldset>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle bg-surface-2/60 px-5 py-3">
                        <span className="inline-flex items-center gap-2 text-[13px] text-ink-2">
                            <span className={cn("size-1.5 rounded-full", user.isActive ? "bg-success" : "bg-danger")} aria-hidden />
                            Compte {user.isActive ? "actif" : "désactivé"}
                        </span>
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="secondary" size="sm" onClick={toggleStatus} className={user.isActive ? DANGER_QUIET : undefined}>
                                {user.isActive ? "Désactiver" : "Activer"}
                            </Button>
                            <Button type="submit" size="sm" disabled={!formDirty} isLoading={saving}>
                                {saving ? "Sauvegarde…" : "Sauvegarder"}
                            </Button>
                        </div>
                    </div>
                </form>
            </Panel>

            {/* ── Permissions ── */}
            <Panel>
                <PanelHeader
                    title="Permissions"
                    description="Les modifications sont enregistrées automatiquement."
                    actions={
                        <TextButton onClick={resetPerms} disabled={permsLoading}>
                            <RotateCcw className="size-3.5" aria-hidden /> Réinitialiser aux défauts du rôle
                        </TextButton>
                    }
                />

                {permsLoading ? (
                    <SkeletonRows rows={6} columns={[30, 44]} pitch="py-3.5" />
                ) : permsFailed && allPerms.length === 0 ? (
                    <LoadError onRetry={loadPerms}>Les permissions n’ont pas pu être chargées.</LoadError>
                ) : allPerms.length === 0 ? (
                    <PanelMessage>Aucune permission à régler.</PanelMessage>
                ) : (
                    Object.entries(groupedPerms).map(([category, perms]) => {
                        const label = PERMISSION_CATEGORIES[category] ?? category;
                        const on = perms.filter((p) => userPerms.has(p.code)).length;
                        return (
                            <section key={category} aria-label={label}>
                                <GroupHeading count={`${on} / ${perms.length}`}>{label}</GroupHeading>
                                <ul className="grid grid-cols-1 lg:grid-cols-2">
                                    {perms.map((perm) => (
                                        <li key={perm.id} className="flex items-center justify-between gap-4 border-b border-line-subtle px-5 py-3 lg:odd:border-r">
                                            <div className="min-w-0">
                                                <p className="truncate text-[13px] font-medium text-ink">{perm.name}</p>
                                                {perm.description && <p className="truncate text-xs text-ink-3" title={perm.description}>{perm.description}</p>}
                                            </div>
                                            <Switch size="sm" checked={userPerms.has(perm.code)} onChange={() => togglePerm(perm.code)} ariaLabel={perm.name} />
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        );
                    })
                )}
            </Panel>

            {/* ── Danger zone ── */}
            <Panel className="border-danger-line">
                <PanelHeader
                    className="border-b-0"
                    title={<span className="text-danger-ink">Zone dangereuse</span>}
                    description="La suppression est irréversible. Toutes les données associées seront perdues."
                    actions={
                        <Button variant="secondary" size="sm" className={DANGER_QUIET} onClick={() => setDeleteConfirm(true)} leftIcon={<Trash2 className="size-4" />}>
                            Supprimer ce compte
                        </Button>
                    }
                />
            </Panel>

            <ConfirmModal
                isOpen={deleteConfirm}
                onClose={() => setDeleteConfirm(false)}
                onConfirm={deleteUser}
                title="Supprimer le compte"
                message={`Êtes-vous sûr de vouloir supprimer "${user.name}" ? Cette action est irréversible et supprime toutes les données associées.`}
                confirmText="Supprimer définitivement"
                variant="danger"
                isLoading={false}
            />
        </div>
    );
}

// ============================================
// RAPPORT TAB
// ============================================

function fmtDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
    return `${m}m${String(s).padStart(2, "0")}s`;
}

function exportCsv(data: SdrReport, userName: string, from: string, to: string) {
    const rows: string[][] = [];

    rows.push(["Rapport SDR", userName]);
    rows.push(["Période", `${from} → ${to}`]);
    rows.push([]);
    rows.push(["=== VUE D'ENSEMBLE ==="]);
    rows.push(["Total actions", String(data.overview.totalActions)]);
    rows.push(["Total appels", String(data.overview.totalCalls)]);
    rows.push(["Total RDV", String(data.overview.totalRdv)]);
    rows.push(["Taux de conversion", `${data.overview.conversionRate}%`]);
    rows.push(["Rappels/Intéressés", String(data.overview.totalCallbacks + data.overview.totalInterested)]);
    rows.push(["Pas de réponse", String(data.overview.totalNoResponse)]);
    rows.push(["Temps de communication", fmtDuration(data.overview.totalDuration)]);
    rows.push([]);
    rows.push(["=== APPELS PAR MISSION ==="]);
    rows.push(["Mission", "Client", "Appels", "RDV", "Taux conv.", "Rappels", "Intéressés", "Pas de réponse", "Durée totale"]);
    for (const m of data.byMission) {
        rows.push([
            m.missionName, m.clientName ?? "", String(m.calls), String(m.rdv),
            `${m.conversionRate}%`, String(m.callbacks), String(m.interested),
            String(m.noResponse), fmtDuration(m.totalDuration),
        ]);
    }
    rows.push([]);
    rows.push(["=== MOTS-CLÉS FRÉQUENTS ==="]);
    rows.push(["Mot", "Occurrences"]);
    for (const kw of data.comments.topKeywords) {
        rows.push([kw.word, String(kw.count)]);
    }
    rows.push([]);
    rows.push(["=== POINTS DE FRICTION (extraits de commentaires) ==="]);
    for (const note of data.comments.painPoints) {
        rows.push([note.replace(/"/g, '""')]);
    }
    rows.push([]);
    rows.push(["=== SIGNAUX POSITIFS (extraits de commentaires) ==="]);
    for (const note of data.comments.positiveSignals) {
        rows.push([note.replace(/"/g, '""')]);
    }

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-sdr-${userName.replace(/\s+/g, "-")}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

const DATE_FIELD =
    "h-9 rounded-[10px] border border-line bg-surface px-3 text-[13px] tabular-nums text-ink transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-500/12";

/** Extracts from comments, one per line. */
function NotesPanel({ title, dot, notes, empty }: { title: string; dot: string; notes: string[]; empty: string }) {
    return (
        <Panel>
            <PanelHeader
                title={
                    <span className="inline-flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", dot)} aria-hidden />
                        {title}
                    </span>
                }
                meta={plural(notes.length, "extrait", "extraits")}
            />
            {notes.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-ink-3">{empty}</p>
            ) : (
                <ul className="max-h-48 divide-y divide-line-subtle overflow-y-auto">
                    {notes.map((note, i) => (
                        <li key={i} className="px-5 py-2.5 text-[13px] leading-5 text-ink-2">{note}</li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}

function RapportTab({ userId, userName }: { userId: string; userName: string }) {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [from, setFrom] = useState(formatDate(firstOfMonth));
    const [to, setTo]     = useState(formatDate(today));
    const [data, setData] = useState<SdrReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/users/${userId}/sdr-report?from=${from}&to=${to}`);
            const j = await res.json();
            if (j.success) setData(j.data);
            else setError(j.error ?? "Erreur lors du chargement");
        } catch {
            setError("Erreur réseau");
        } finally {
            setLoading(false);
        }
    }, [userId, from, to]);

    // Load on mount
    useEffect(() => { load(); }, [load]);

    return (
        <div className="space-y-4">

            {/* Period */}
            <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-[13px] text-ink-3">
                    Du
                    <input type="date" className={DATE_FIELD} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="inline-flex items-center gap-2 text-[13px] text-ink-3">
                    Au
                    <input type="date" className={DATE_FIELD} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                </label>
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                    {data && (
                        <Button variant="secondary" size="sm" onClick={() => exportCsv(data, userName, from, to)} leftIcon={<Download className="size-4" />}>
                            Exporter CSV
                        </Button>
                    )}
                    <Button size="sm" onClick={load} isLoading={loading} leftIcon={<FileBarChart2 className="size-4" />}>
                        Générer le rapport
                    </Button>
                </div>
            </div>

            {error && (
                <div
                    role="alert"
                    className="flex flex-col gap-2 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-[13px] text-danger-ink sm:flex-row sm:items-center sm:justify-between"
                >
                    <span>
                        {error}
                        {data && " Le rapport affiché est celui de la période précédente."}
                    </span>
                    <Button variant="secondary" size="xs" onClick={load} className="self-start sm:self-auto">
                        Réessayer
                    </Button>
                </div>
            )}

            {loading && !data && (
                <>
                    <MetricStrip>
                        {["Total appels", "RDV pris", "Taux de conversion", "Temps de comm."].map((label) => (
                            <Metric key={label} label={label} value={<MetricPlaceholder />} />
                        ))}
                    </MetricStrip>
                    <Panel>
                        <SkeletonRows rows={5} columns={[24, 14, 8, 8, 8, 8]} pitch="py-3.5" />
                    </Panel>
                </>
            )}

            {data && (
                <div className={cn("space-y-4 transition-opacity duration-150", loading && "opacity-60")}>
                    <MetricStrip>
                        <Metric
                            label="Total appels"
                            value={count(data.overview.totalCalls)}
                            hint={
                                data.overview.alloCalls && data.overview.qualifiedCalls && data.overview.alloCalls !== data.overview.qualifiedCalls
                                    ? `${count(data.overview.qualifiedCalls)} qualifiés CRM`
                                    : undefined
                            }
                        />
                        <Metric label="RDV pris" value={count(data.overview.totalRdv)} />
                        <Metric label="Taux de conversion" value={percent(data.overview.conversionRate)} />
                        <Metric
                            label="Temps de comm."
                            value={fmtDuration(data.overview.totalDuration)}
                            hint={
                                data.overview.alloAnswerRate != null && data.overview.alloAnswerRate > 0
                                    ? `${percent(data.overview.alloAnswerRate)} décrochés`
                                    : undefined
                            }
                        />
                    </MetricStrip>

                    <MetricStrip className="grid-cols-3">
                        <Metric className="px-4 sm:px-5" label="Rappels" value={count(data.overview.totalCallbacks)} />
                        <Metric className="px-4 sm:px-5" label="Intéressés" value={count(data.overview.totalInterested)} />
                        <Metric className="px-4 sm:px-5" label="Pas de réponse" value={count(data.overview.totalNoResponse)} />
                    </MetricStrip>

                    {data.overview.totalActions === 0 && (
                        <Panel>
                            <PanelMessage className="py-8">Aucune activité enregistrée sur cette période.</PanelMessage>
                        </Panel>
                    )}

                    {/* Per mission */}
                    <Panel>
                        <PanelHeader title="Appels par mission" meta={plural(data.byMission.length, "mission", "missions")} />
                        {data.byMission.length === 0 ? (
                            <PanelMessage className="py-10">Aucune mission sur cette période.</PanelMessage>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
                                    <thead className="border-b border-line text-xs text-ink-3">
                                        <tr>
                                            <th scope="col" className="py-2.5 pl-5 pr-3 font-medium">Mission</th>
                                            <th scope="col" className="px-3 py-2.5 font-medium">Client</th>
                                            <th scope="col" className="px-3 py-2.5 text-right font-medium">Appels</th>
                                            <th scope="col" className="px-3 py-2.5 text-right font-medium">RDV</th>
                                            <th scope="col" className="px-3 py-2.5 text-right font-medium">Conv.</th>
                                            <th scope="col" className="px-3 py-2.5 text-right font-medium">Rappels</th>
                                            <th scope="col" className="px-3 py-2.5 text-right font-medium">Intéressés</th>
                                            <th scope="col" className="py-2.5 pl-3 pr-5 text-right font-medium">Durée</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.byMission.map((m) => (
                                            <tr key={m.missionId} className="border-b border-line-subtle transition-colors duration-100 last:border-b-0 hover:bg-surface-2/70">
                                                <td className="max-w-[240px] truncate py-3 pl-5 pr-3 font-medium text-ink" title={m.missionName}>{m.missionName}</td>
                                                <td className="px-3 py-3 text-ink-3">{m.clientName ?? "—"}</td>
                                                <td className="px-3 py-3 text-right font-medium tabular-nums text-ink">{count(m.calls)}</td>
                                                <td className={cn("px-3 py-3 text-right tabular-nums", m.rdv > 0 ? "font-semibold text-success-ink" : "text-ink-4")}>{m.rdv}</td>
                                                <td className="px-3 py-3 text-right tabular-nums text-ink-2">{percent(m.conversionRate)}</td>
                                                <td className="px-3 py-3 text-right tabular-nums text-ink-2">{m.callbacks}</td>
                                                <td className="px-3 py-3 text-right tabular-nums text-ink-2">{m.interested}</td>
                                                <td className="py-3 pl-3 pr-5 text-right tabular-nums text-ink-3">{fmtDuration(m.totalDuration)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Panel>

                    {/* Comments analysis */}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <Panel>
                            <PanelHeader title="Mots-clés fréquents" meta={plural(data.comments.total, "commentaire", "commentaires")} />
                            {data.comments.topKeywords.length === 0 ? (
                                <PanelMessage className="py-8">Pas assez de commentaires.</PanelMessage>
                            ) : (
                                <ul className="py-2">
                                    {data.comments.topKeywords.map((kw) => {
                                        const max = data.comments.topKeywords[0]?.count ?? 1;
                                        const pct = Math.round((kw.count / max) * 100);
                                        return (
                                            <li key={kw.word} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3 px-5 py-1.5 text-[13px]">
                                                <span className="truncate font-medium text-ink-2">{kw.word}</span>
                                                <span className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                                                    <span className="block h-full rounded-full bg-primary-400" style={{ width: `${pct}%` }} />
                                                </span>
                                                <span className="text-right text-xs tabular-nums text-ink-3">{kw.count}×</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </Panel>

                        <div className="space-y-4">
                            <NotesPanel title="Points de friction" dot="bg-danger" notes={data.comments.painPoints} empty="Aucun commentaire négatif sur la période." />
                            <NotesPanel title="Signaux positifs" dot="bg-success" notes={data.comments.positiveSignals} empty="Aucun commentaire positif sur la période." />
                        </div>
                    </div>

                    {data.comments.allSample.length > 0 && (
                        <Panel>
                            <PanelHeader title="Échantillon de commentaires" meta="50 derniers" />
                            <ul className="grid max-h-72 grid-cols-1 overflow-y-auto sm:grid-cols-2">
                                {data.comments.allSample.map((note, i) => (
                                    <li key={i} className="border-b border-line-subtle px-5 py-3 text-[13px] leading-5 text-ink-2 sm:odd:border-r">
                                        {note}
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================
// MAIN PAGE
// ============================================

function DetailSkeleton() {
    return (
        <div className="space-y-4 pb-2" aria-busy="true" aria-label="Chargement">
            <span className="block h-4 w-36 rounded bg-surface-3" />
            <div className="flex items-center gap-4">
                <span className="size-11 shrink-0 rounded-full bg-surface-3" />
                <div className="min-w-0 space-y-2">
                    <span className="block h-6 w-48 rounded bg-surface-3" />
                    <span className="block h-3.5 w-72 max-w-[60vw] rounded bg-surface-3" />
                </div>
            </div>
            <div className="flex gap-6 border-b border-line pb-3">
                {[52, 60, 58, 84, 70].map((w) => (
                    <span key={w} className="h-3.5 shrink-0 rounded bg-surface-3" style={{ width: w }} />
                ))}
            </div>
            <MetricStrip>
                {[0, 1, 2, 3].map((i) => (
                    <Metric key={i} label={<span className="h-3 w-24 rounded bg-surface-3" />} value={<MetricPlaceholder />} />
                ))}
            </MetricStrip>
        </div>
    );
}

export default function UtilisateurDetailPage() {
    const params = useParams();

    const userId = params.id as string;
    const [user, setUser]         = useState<UserDetail | null>(null);
    const [stats, setStats]       = useState<UserStats | null>(null);
    const [loading, setLoading]   = useState(true);
    const [loadError, setLoadError] = useState<{ message: string; retry: boolean } | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>("apercu");

    const fetchUser = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [userRes, statsRes] = await Promise.all([
                fetch(`/api/users/${userId}`),
                fetch(`/api/actions/stats?userId=${userId}`),
            ]);
            const userJson  = await userRes.json().catch(() => ({}));
            const statsJson = await statsRes.json().catch(() => ({}));
            if (userJson.success) setUser(userJson.data);
            else if (userRes.status === 404) setLoadError({ message: "Utilisateur introuvable.", retry: false });
            else setLoadError({ message: userJson.error || "Impossible de charger l'utilisateur.", retry: true });
            if (statsJson.success) setStats(statsJson.data?.[userId] ?? statsJson.data ?? null);
        } catch {
            setLoadError({ message: "Impossible de charger l'utilisateur.", retry: true });
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { fetchUser(); }, [fetchUser]);

    const backLink = <HubBackLink href="/manager/utilisateurs">Utilisateurs & accès</HubBackLink>;

    if (loading && !user) return <DetailSkeleton />;

    if (!user) return (
        <div className="space-y-4 pb-2">
            {backLink}
            <Panel>
                <PanelMessage
                    tone={loadError?.retry ? "error" : "neutral"}
                    action={loadError?.retry ? <TextButton onClick={fetchUser}>Réessayer</TextButton> : undefined}
                >
                    {loadError?.message ?? "Utilisateur introuvable."}
                </PanelMessage>
            </Panel>
        </div>
    );

    const tabs = TABS
        .filter((tab) => tab.id !== "rendezvous" || ["SDR", "BOOKER", "BUSINESS_DEVELOPER"].includes(user.role))
        .map((tab) => ({ value: tab.id, label: tab.label }));
    const current = tabs.find((t) => t.value === activeTab);

    return (
        <div className="space-y-4 pb-2">
            {backLink}

            {/* ── Identity ── */}
            <div className="flex items-start gap-4">
                <Avatar name={user.name} size="lg" shape="circle" className={cn("mt-0.5", !user.isActive && "opacity-50")} />
                <HubHeader
                    className="min-w-0 flex-1"
                    title={user.name}
                    beside={<PresenceStatus user={user} />}
                    finding={
                        <>
                            {ROLE_LABELS[user.role] ?? user.role}
                            {user.client && ` · ${user.client.name}`}
                            {" · "}
                            <span className="break-all">{user.email}</span>
                            {" · "}Membre depuis {new Date(user.createdAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                        </>
                    }
                    actions={
                        <>
                            <Button variant="secondary" size="sm" onClick={() => setActiveTab("acces")} leftIcon={<Pencil className="size-4" />}>
                                Modifier
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setActiveTab("securite")} leftIcon={<Shield className="size-4" />}>
                                Sécurité
                            </Button>
                        </>
                    }
                />
            </div>

            {/* ── Sections ── */}
            <div className="border-b border-line">
                <HubTabs ariaLabel="Sections de la fiche" tabs={tabs} value={activeTab} onChange={setActiveTab} className="-ml-3" />
            </div>

            <div role="tabpanel" aria-label={current?.label}>
                {activeTab === "apercu" && <ApercuTab user={user} stats={stats} />}
                {activeTab === "activite" && <ActiviteTab userId={userId} />}
                {activeTab === "planning" && <PlanningTab userId={userId} />}
                {activeTab === "rendezvous" && <RendezVousTab userId={userId} userName={user.name} />}
                {activeTab === "historique" && <HistoriqueTab userId={userId} />}
                {activeTab === "rapport" && <RapportTab userId={userId} userName={user.name} />}
                {activeTab === "securite" && <SecuriteTab userId={userId} />}
                {activeTab === "acces" && <AccesTab user={user} onUserUpdate={(patch) => setUser(u => u ? { ...u, ...patch } : u)} />}
            </div>
        </div>
    );
}
