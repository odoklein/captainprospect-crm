"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, Loader2, Phone, Calendar, Target, Activity,
    Clock, TrendingUp, LogIn, AlertTriangle, Shield, Key,
    MapPin, Monitor, ChevronLeft, ChevronRight, Check, X,
    UserCheck, UserX, Trash2, Pencil, RotateCcw, BriefcaseBusiness,
    FolderKanban, LayoutGrid, CalendarDays, Mail, Globe, Info,
    AlertCircle, RefreshCw, Star, Zap, FileBarChart2, Download,
    MessageSquare, ThumbsUp, ThumbsDown, Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { ConfirmModal } from "@/components/ui/Modal";

// ============================================
// TYPES
// ============================================

type TabId = "apercu" | "activite" | "planning" | "historique" | "securite" | "acces" | "rapport";

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

interface AuthEvent {
    id: string; outcome: string; ip: string | null;
    country: string | null; userAgent: string | null;
    usedMasterPassword: boolean; createdAt: string;
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

// ============================================
// CONSTANTS
// ============================================

const ROLE_LABELS: Record<string, string> = {
    MANAGER: "Manager", SDR: "SDR", BUSINESS_DEVELOPER: "Business Dev",
    DEVELOPER: "Développeur", CLIENT: "Client", BOOKER: "Booker", COMMERCIAL: "Commercial",
};

const ROLE_GRADIENTS: Record<string, string> = {
    MANAGER: "from-indigo-500 to-indigo-700", SDR: "from-blue-500 to-blue-700",
    BUSINESS_DEVELOPER: "from-emerald-500 to-emerald-700", DEVELOPER: "from-purple-500 to-purple-700",
    CLIENT: "from-sky-500 to-sky-700", BOOKER: "from-blue-400 to-blue-600", COMMERCIAL: "from-teal-500 to-teal-700",
};

const ROLE_STRIPE: Record<string, string> = {
    MANAGER: "bg-indigo-600", SDR: "bg-blue-600", BUSINESS_DEVELOPER: "bg-emerald-600",
    DEVELOPER: "bg-purple-600", CLIENT: "bg-sky-600", BOOKER: "bg-blue-500", COMMERCIAL: "bg-teal-600",
};

const OUTCOME_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
    SUCCESS:      { label: "Connexion réussie",   cls: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
    BAD_PASSWORD: { label: "Mauvais mot de passe", cls: "bg-rose-50 border-rose-200",   dot: "bg-rose-500" },
    UNKNOWN_USER: { label: "Email inconnu",        cls: "bg-orange-50 border-orange-200", dot: "bg-orange-400" },
    DISABLED:     { label: "Compte désactivé",     cls: "bg-rose-50 border-rose-200",   dot: "bg-rose-600" },
    RATE_LIMITED: { label: "Trop de tentatives",   cls: "bg-amber-50 border-amber-200",  dot: "bg-amber-500" },
};

const AUTH_EVENT_TAG_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
    PASSWORD_RECOVERY_REQUEST: {
        label: "Demande de recuperation du mot de passe",
        cls: "bg-indigo-50 border-indigo-200",
        dot: "bg-indigo-500",
    },
    PASSWORD_RECOVERY_SUCCESS: {
        label: "Mot de passe reinitialise",
        cls: "bg-violet-50 border-violet-200",
        dot: "bg-violet-500",
    },
};

const ACTION_RESULT_LABELS: Record<string, string> = {
    MEETING_BOOKED: "RDV pris", INTERESTED: "Intéressé",
    CALLBACK_REQUESTED: "Rappel", NO_RESPONSE: "Pas de réponse",
    BAD_CONTACT: "Mauvais contact", DISQUALIFIED: "Non qualifié",
};

// ============================================
// UTILITIES
// ============================================

function getInitials(name: string) {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function timeAgo(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `Il y a ${mins} min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function formatDate(date: Date) { return date.toISOString().split("T")[0]; }

function calcHours(start: string, end: string): number {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return (eh * 60 + em - sh * 60 - sm) / 60;
}

function isOnline(user: UserDetail) {
    return !!user.lastConnectedAt && Date.now() - new Date(user.lastConnectedAt).getTime() < 5 * 60 * 1000;
}

function browserFromUA(ua: string | null): string {
    if (!ua) return "—";
    if (ua.startsWith("AUTH_EVT:")) return "Action securite";
    if (ua.includes("Edg")) return "Edge";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari")) return "Safari";
    return "Navigateur";
}

function osFromUA(ua: string | null): string {
    if (!ua) return "";
    if (ua.startsWith("AUTH_EVT:")) return "";
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Mac")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
    return "";
}

function parseAuthEventTag(ua: string | null): string | null {
    if (!ua || !ua.startsWith("AUTH_EVT:")) return null;
    const raw = ua.slice("AUTH_EVT:".length);
    const [tag] = raw.split("|");
    return tag?.trim() || null;
}

// ============================================
// TOGGLE SWITCH
// ============================================

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={cn("relative w-11 h-6 rounded-full transition-colors", checked ? "bg-indigo-600" : "bg-slate-300")}
        >
            <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform", checked && "translate-x-5")} />
        </button>
    );
}

// ============================================
// TABS CONFIG
// ============================================

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "apercu",     label: "Aperçu",      icon: Activity },
    { id: "activite",   label: "Activité",    icon: TrendingUp },
    { id: "planning",   label: "Planning",    icon: Calendar },
    { id: "historique", label: "Historique",  icon: Clock },
    { id: "rapport",    label: "Rapport",     icon: FileBarChart2 },
    { id: "securite",   label: "Sécurité",    icon: Shield },
    { id: "acces",      label: "Accès",       icon: Key },
];

// ============================================
// APERCU TAB
// ============================================

function ApercuTab({ user, stats }: { user: UserDetail; stats: any }) {
    const online = isOnline(user);
    const sessionExpiresIn = user.lastSignInAt
        ? Math.max(0, 8 * 60 - Math.floor((Date.now() - new Date(user.lastSignInAt).getTime()) / 60000))
        : null;

    return (
        <div className="space-y-5">
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: "Actions totales", value: user._count.actions, icon: Phone, color: "indigo" as const },
                    { label: "Missions actives", value: user._count.assignedMissions, icon: Target, color: "emerald" as const },
                    { label: "Appels cette semaine", value: stats?.callsThisWeek ?? 0, icon: Activity, color: "blue" as const },
                    { label: "RDV ce mois", value: stats?.meetingsThisMonth ?? 0, icon: Star, color: "amber" as const },
                ].map((kpi) => (
                    <div key={kpi.label} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 mb-1">{kpi.label}</p>
                                <p className="text-3xl font-bold text-slate-900">{kpi.value}</p>
                            </div>
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center",
                                kpi.color === "indigo" ? "bg-indigo-100 text-indigo-600" :
                                kpi.color === "emerald" ? "bg-emerald-100 text-emerald-600" :
                                kpi.color === "blue" ? "bg-blue-100 text-blue-600" :
                                "bg-amber-100 text-amber-600"
                            )}>
                                <kpi.icon className="w-5 h-5" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Session card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                            <LogIn className="w-4 h-4 text-indigo-600" />
                        </div>
                        <p className="font-semibold text-slate-900">Session actuelle</p>
                    </div>
                    {user.lastSignInAt ? (
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">Connecté</span>
                                <span className="font-medium text-slate-900">{timeAgo(user.lastSignInAt)}</span>
                            </div>
                            {user.lastSignInIp && (
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">IP</span>
                                    <span className="font-mono text-xs text-slate-700 bg-slate-50 px-2 py-0.5 rounded">{user.lastSignInIp}</span>
                                </div>
                            )}
                            {user.lastSignInCountry && (
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">Pays</span>
                                    <span className="font-medium text-slate-900">{user.lastSignInCountry}</span>
                                </div>
                            )}
                            {sessionExpiresIn !== null && (
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">JWT expire dans</span>
                                    <span className={cn("font-medium", sessionExpiresIn < 30 ? "text-amber-600" : "text-slate-900")}>
                                        {sessionExpiresIn > 0 ? `${Math.floor(sessionExpiresIn / 60)}h${String(sessionExpiresIn % 60).padStart(2, "0")}` : "Expiré"}
                                    </span>
                                </div>
                            )}
                            {online && (
                                <div className="flex items-center gap-2 pt-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-xs text-emerald-600 font-medium">Actif en ce moment</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-400">Aucune connexion enregistrée.</p>
                    )}
                    <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-2">
                        Sessions JWT non révocables individuellement. Désactivez le compte pour forcer la déconnexion.
                    </p>
                </div>

                {/* Profile quick info */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                            <Globe className="w-4 h-4 text-slate-500" />
                        </div>
                        <p className="font-semibold text-slate-900">Informations</p>
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500">Membre depuis</span>
                            <span className="font-medium text-slate-900">
                                {new Date(user.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                            </span>
                        </div>
                        {user.alloPhoneNumber && (
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">Allo</span>
                                <span className="font-mono text-xs bg-slate-50 px-2 py-0.5 rounded text-slate-700">{user.alloPhoneNumber}</span>
                            </div>
                        )}
                        {user.client && (
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">Client</span>
                                <span className="font-medium text-slate-900">{user.client.name}</span>
                            </div>
                        )}
                        {(user.role === "SDR" || user.role === "BOOKER") && user.preferences?.sdrFeedback && (
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">Feedback SDR</span>
                                <span className="text-slate-700">
                                    {user.preferences.sdrFeedback.promptTime ?? "15:45"} —
                                    {user.preferences.sdrFeedback.requiredDaily ? " Obligatoire" : " Optionnel"}
                                </span>
                            </div>
                        )}
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500">Dernière activité</span>
                            <span className="font-medium text-slate-900">{timeAgo(user.lastConnectedAt ?? user.lastSignInAt)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================
// ACTIVITE TAB
// ============================================

function ActiviteTab({ userId }: { userId: string }) {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/actions/stats?userId=${userId}`)
            .then(r => r.json())
            .then(j => { if (j.success) setStats(j.data?.[userId] ?? j.data ?? null); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [userId]);

    if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div>;

    const callsW = stats?.callsThisWeek ?? 0;
    const meetingsW = stats?.meetingsThisWeek ?? 0;
    const convRate = callsW > 0 ? ((meetingsW / callsW) * 100).toFixed(1) : "0.0";

    const resultBreakdown = [
        { label: "RDV pris",       count: meetingsW,                  color: "bg-emerald-500" },
        { label: "Intéressé",      count: stats?.interested ?? 0,     color: "bg-blue-500" },
        { label: "Rappel",         count: stats?.callbacks ?? 0,      color: "bg-amber-500" },
        { label: "Pas de réponse", count: Math.max(0, callsW - meetingsW - (stats?.interested ?? 0) - (stats?.callbacks ?? 0)), color: "bg-slate-300" },
    ].filter(r => r.count > 0);
    const totalRes = resultBreakdown.reduce((s, r) => s + r.count, 0);

    return (
        <div className="space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: "Appels (semaine)", value: callsW },
                    { label: "RDV (semaine)", value: meetingsW },
                    { label: "Taux de conversion", value: `${convRate}%` },
                    { label: "Total actions", value: stats?.totalActions ?? 0 },
                ].map((k) => (
                    <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4">
                        <p className="text-xs text-slate-500 mb-1">{k.label}</p>
                        <p className="text-3xl font-bold text-slate-900">{k.value}</p>
                    </div>
                ))}
            </div>

            {/* Result breakdown */}
            {resultBreakdown.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <p className="font-semibold text-slate-900 mb-4">Répartition des résultats (semaine)</p>
                    <div className="space-y-3">
                        {resultBreakdown.map((r) => (
                            <div key={r.label} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("w-3 h-3 rounded-full", r.color)} />
                                        <span className="text-slate-700">{r.label}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="font-semibold text-slate-900">{r.count}</span>
                                        <span className="text-xs text-slate-400 w-10 text-right">
                                            {totalRes > 0 ? Math.round((r.count / totalRes) * 100) : 0}%
                                        </span>
                                    </div>
                                </div>
                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={cn("h-full rounded-full transition-all", r.color)} style={{ width: `${totalRes > 0 ? (r.count / totalRes) * 100 : 0}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!stats && (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                    <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">Aucune donnée d'activité disponible.</p>
                </div>
            )}
        </div>
    );
}

// ============================================
// PLANNING TAB
// ============================================

function PlanningTab({ userId }: { userId: string }) {
    const [blocks, setBlocks]     = useState<ScheduleBlock[]>([]);
    const [loading, setLoading]   = useState(true);
    const [weekOffset, setWeekOffset] = useState(0);

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

    useEffect(() => {
        setLoading(true);
        const start = formatDate(weekDates[0]);
        const end   = formatDate(weekDates[4]);
        fetch(`/api/planning?sdrId=${userId}&startDate=${start}&endDate=${end}`)
            .then(r => r.json())
            .then(j => { if (j.success) setBlocks(j.data?.blocks ?? j.data ?? []); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [userId, weekDates]);

    const STATUS_COLORS: Record<string, string> = {
        SCHEDULED: "bg-indigo-100 text-indigo-700 border-indigo-200",
        IN_PROGRESS: "bg-amber-100 text-amber-700 border-amber-200",
        COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-200",
        CANCELLED: "bg-slate-100 text-slate-500 border-slate-200",
    };

    const totalHours = blocks.reduce((s, b) => s + calcHours(b.startTime, b.endTime), 0);

    return (
        <div className="space-y-4">
            {/* Week navigator */}
            <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-5 py-3">
                <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                    <ChevronLeft className="w-4 h-4 text-slate-500" />
                </button>
                <div className="text-center">
                    <p className="font-semibold text-slate-900">
                        {weekDates[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} —{" "}
                        {weekDates[4].toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {totalHours.toFixed(1)}h planifiées · {blocks.length} blocs
                    </p>
                </div>
                <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    {weekDates.map((d) => {
                        const ds = formatDate(d);
                        const dayBlocks = blocks.filter(b => b.date.split("T")[0] === ds);
                        const isToday = formatDate(new Date()) === ds;
                        return (
                            <div key={ds} className={cn("rounded-2xl border bg-white p-3 space-y-2", isToday && "border-indigo-300 ring-1 ring-indigo-200/50")}>
                                <div className="text-center">
                                    <p className={cn("text-xs font-semibold uppercase tracking-wide", isToday ? "text-indigo-600" : "text-slate-400")}>
                                        {d.toLocaleDateString("fr-FR", { weekday: "short" })}
                                    </p>
                                    <p className={cn("text-lg font-bold", isToday ? "text-indigo-700" : "text-slate-800")}>
                                        {d.getDate()}
                                    </p>
                                </div>
                                {dayBlocks.length === 0 ? (
                                    <p className="text-[11px] text-slate-300 text-center py-2">—</p>
                                ) : (
                                    dayBlocks.map((block) => (
                                        <div key={block.id} className={cn("rounded-lg border p-2 text-[11px]", STATUS_COLORS[block.status] ?? STATUS_COLORS.SCHEDULED)}>
                                            <p className="font-semibold truncate">{block.mission.name}</p>
                                            <p className="opacity-70">{block.startTime} → {block.endTime}</p>
                                            {block.mission.client && <p className="opacity-60 truncate">{block.mission.client.name}</p>}
                                        </div>
                                    ))
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ============================================
// HISTORIQUE TAB
// ============================================

function HistoriqueTab({ userId }: { userId: string }) {
    const [actions, setActions] = useState<ActionItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/actions/recent?userId=${userId}&limit=50`)
            .then(r => r.json())
            .then(j => { if (j.success) setActions(Array.isArray(j.data) ? j.data : []); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [userId]);

    if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div>;

    if (actions.length === 0) return (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Aucune action enregistrée.</p>
        </div>
    );

    return (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Date</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Résultat</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Contact / Société</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Campagne</th>
                    </tr>
                </thead>
                <tbody>
                    {actions.map((a) => (
                        <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                                {new Date(a.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="py-3 px-4">
                                {a.result ? (
                                    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full",
                                        a.result === "MEETING_BOOKED" ? "bg-emerald-100 text-emerald-700" :
                                        a.result === "INTERESTED" ? "bg-blue-100 text-blue-700" :
                                        "bg-slate-100 text-slate-600"
                                    )}>
                                        {ACTION_RESULT_LABELS[a.result] ?? a.result}
                                    </span>
                                ) : "—"}
                            </td>
                            <td className="py-3 px-4 text-slate-700">{a.contactOrCompanyName ?? "—"}</td>
                            <td className="py-3 px-4 text-slate-500 text-xs">{a.campaignName ?? "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ============================================
// SECURITE TAB
// ============================================

function SecuriteTab({ userId }: { userId: string }) {
    const [events, setEvents]   = useState<AuthEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/auth/events/${userId}?limit=50`)
            .then(r => r.json())
            .then(j => { if (j.success) setEvents(j.data.events ?? []); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [userId]);

    if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div>;

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
            {/* Accountability notice */}
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                    Votre accès à cet historique de connexion a été enregistré pour audit.
                </p>
            </div>

            {events.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                    <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">Aucun événement de connexion enregistré.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {grouped.map((group) => (
                        <div key={group.label}>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-px flex-1 bg-slate-200" />
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{group.label}</span>
                                <div className="h-px flex-1 bg-slate-200" />
                            </div>
                            <div className="relative space-y-2 pl-6">
                                {/* Connecting line */}
                                <div className="absolute left-2 top-3 bottom-3 w-px bg-slate-200" />
                                {group.events.map((e) => {
                                    const eventTag = parseAuthEventTag(e.userAgent);
                                    const tagCfg = eventTag ? AUTH_EVENT_TAG_CONFIG[eventTag] : null;
                                    const cfg = tagCfg ?? OUTCOME_CONFIG[e.outcome] ?? { label: e.outcome, cls: "bg-slate-50 border-slate-200", dot: "bg-slate-400" };
                                    const isSuccess = tagCfg ? true : e.outcome === "SUCCESS";
                                    const browser = browserFromUA(e.userAgent);
                                    const os = osFromUA(e.userAgent);
                                    const time = new Date(e.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

                                    return (
                                        <div key={e.id} className="relative flex items-start gap-3">
                                            {/* Dot on timeline */}
                                            <div className={cn("absolute -left-4 mt-2.5 w-3 h-3 rounded-full border-2 border-white", cfg.dot)} />

                                            <div className={cn("flex-1 rounded-xl border p-3", cfg.cls)}>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className={cn("text-sm font-semibold", isSuccess ? "text-emerald-800" : "text-rose-800")}>
                                                                {isSuccess ? "✓" : "✗"} {cfg.label}
                                                            </span>
                                                            {e.usedMasterPassword && (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                                                    <Key className="w-2.5 h-2.5" /> MPW
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-slate-500">
                                                            {e.country && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{e.country}</span>}
                                                            {e.ip && <span className="font-mono">{e.ip}</span>}
                                                            {browser && <span className="flex items-center gap-1"><Monitor className="w-3 h-3" />{[browser, os].filter(Boolean).join(" / ")}</span>}
                                                        </div>
                                                    </div>
                                                    <span className="text-xs text-slate-400 shrink-0">{time}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
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
    const [clients, setClients]         = useState<{ id: string; name: string }[]>([]);
    const [saving, setSaving]           = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [deleteInput, setDeleteInput] = useState("");
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

    useEffect(() => {
        Promise.all([
            fetch("/api/permissions").then(r => r.json()),
            fetch(`/api/users/${user.id}/permissions`).then(r => r.json()),
            fetch("/api/clients").then(r => r.json()),
        ]).then(([allJ, userJ, clientJ]) => {
            if (allJ.success) setAllPerms(allJ.data.permissions ?? []);
            if (userJ.success) setUserPerms(new Set(userJ.data ?? []));
            const list = clientJ.data?.clients ?? clientJ.data ?? [];
            setClients(Array.isArray(list) ? list : []);
        }).finally(() => setPermsLoading(false));
    }, [user.id]);

    const togglePerm = async (code: string) => {
        const granted = !userPerms.has(code);
        const next = new Set(userPerms);
        granted ? next.add(code) : next.delete(code);
        setUserPerms(next);
        try {
            await fetch(`/api/users/${user.id}/permissions`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ permissions: [{ code, granted }] }),
            });
        } catch {
            granted ? next.delete(code) : next.add(code);
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

    const fieldClass = "w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900";
    const labelClass = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

    return (
        <div className="space-y-6">

            {/* ── Profil section ── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                <p className="font-semibold text-slate-900 text-sm">Informations du compte</p>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Nom</label>
                        <input className={fieldClass} value={formData.name} onChange={(e) => patch({ name: e.target.value })} />
                    </div>
                    <div>
                        <label className={labelClass}>Rôle</label>
                        <select className={fieldClass} value={formData.role} onChange={(e) => patch({ role: e.target.value })}>
                            <option value="SDR">SDR</option>
                            <option value="BOOKER">Booker</option>
                            <option value="BUSINESS_DEVELOPER">Business Dev</option>
                            <option value="MANAGER">Manager</option>
                            <option value="DEVELOPER">Développeur</option>
                            <option value="CLIENT">Client</option>
                            <option value="COMMERCIAL">Commercial</option>
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Email</label>
                        <input className={fieldClass} type="email" value={formData.email} onChange={(e) => patch({ email: e.target.value })} />
                    </div>
                    <div>
                        <label className={labelClass}>Numéro Allo</label>
                        <input className={fieldClass} value={formData.alloPhoneNumber} onChange={(e) => patch({ alloPhoneNumber: e.target.value })} placeholder="+33…" />
                    </div>
                </div>
                <div>
                    <label className={labelClass}>Nouveau mot de passe <span className="text-slate-400 normal-case font-normal">(laisser vide pour conserver)</span></label>
                    <input className={fieldClass} type="password" value={formData.password} onChange={(e) => patch({ password: e.target.value })} placeholder="••••••••" />
                </div>

                {formData.role === "CLIENT" && (
                    <div>
                        <label className={labelClass}>Client associé</label>
                        <select className={fieldClass} value={formData.clientId} onChange={(e) => patch({ clientId: e.target.value })}>
                            <option value="">Aucun</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                )}

                {(formData.role === "SDR" || formData.role === "BOOKER") && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Configuration Feedback SDR</p>
                        <div className="grid grid-cols-2 gap-3 items-end">
                            <div>
                                <label className={labelClass}>Heure d'affichage</label>
                                <input type="time" className={fieldClass} value={formData.sdrFeedbackPromptTime} onChange={(e) => patch({ sdrFeedbackPromptTime: e.target.value })} />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-700 pb-2.5 cursor-pointer">
                                <input type="checkbox" checked={formData.sdrFeedbackRequiredDaily} onChange={(e) => patch({ sdrFeedbackRequiredDaily: e.target.checked })} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                                Feedback obligatoire
                            </label>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className={cn("w-2.5 h-2.5 rounded-full", user.isActive ? "bg-emerald-500" : "bg-rose-500")} />
                        <span className="text-sm text-slate-600">Compte {user.isActive ? "actif" : "désactivé"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleStatus}
                            className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                                user.isActive ? "text-rose-600 bg-rose-50 hover:bg-rose-100" : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                            )}
                        >
                            {user.isActive ? "Désactiver" : "Activer"}
                        </button>
                        <button
                            onClick={saveProfile}
                            disabled={saving || !formDirty}
                            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
                        >
                            {saving ? "Sauvegarde…" : "Sauvegarder"}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Permissions section ── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900 text-sm">Permissions</p>
                    <button onClick={resetPerms} disabled={permsLoading} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-40">
                        <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser aux défauts du rôle
                    </button>
                </div>
                <p className="text-xs text-slate-400">Les modifications sont enregistrées automatiquement.</p>

                {permsLoading ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-indigo-500 animate-spin" /></div>
                ) : (
                    <div className="space-y-5">
                        {Object.entries(groupedPerms).map(([category, perms]) => (
                            <div key={category}>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                                    {{ pages: "Pages", features: "Fonctionnalités", actions: "Actions" }[category] ?? category}
                                </p>
                                <div className="space-y-1">
                                    {perms.map((perm) => {
                                        const enabled = userPerms.has(perm.code);
                                        return (
                                            <div key={perm.id} className={cn("flex items-center justify-between p-3 rounded-xl transition-colors", enabled ? "bg-indigo-50 border border-indigo-100" : "bg-slate-50 border border-transparent hover:border-slate-200")}>
                                                <div className="min-w-0 mr-4">
                                                    <p className="text-sm font-medium text-slate-900 truncate">{perm.name}</p>
                                                    {perm.description && <p className="text-xs text-slate-400 truncate">{perm.description}</p>}
                                                </div>
                                                <Toggle checked={enabled} onChange={() => togglePerm(perm.code)} />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Danger zone ── */}
            <div className="bg-white rounded-2xl border border-rose-200 p-5 space-y-3">
                <p className="font-semibold text-rose-700 text-sm">Zone dangereuse</p>
                <p className="text-xs text-slate-500">La suppression est irréversible. Toutes les données associées seront perdues.</p>
                <button onClick={() => setDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-sm font-semibold transition-colors border border-rose-200">
                    <Trash2 className="w-4 h-4" /> Supprimer ce compte
                </button>
            </div>

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

const ACTION_RESULT_FR: Record<string, string> = {
    MEETING_BOOKED: "RDV pris",
    CALLBACK_REQUESTED: "Rappel",
    INTERESTED: "Intéressé",
    NO_RESPONSE: "Pas de réponse",
    BAD_CONTACT: "Mauvais contact",
    DISQUALIFIED: "Non qualifié",
    NOT_INTERESTED: "Pas intéressé",
    MEETING_CANCELLED: "RDV annulé",
    VOICEMAIL: "Messagerie",
    WRONG_NUMBER: "Mauvais numéro",
};

function fmtDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
    return `${m}m${String(s).padStart(2, "0")}s`;
}

function exportCsv(data: any, userName: string, from: string, to: string) {
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

function RapportTab({ userId, userName }: { userId: string; userName: string }) {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [from, setFrom] = useState(firstOfMonth.toISOString().split("T")[0]);
    const [to, setTo]     = useState(today.toISOString().split("T")[0]);
    const [data, setData] = useState<any>(null);
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

    const fieldCls = "px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-900";

    return (
        <div className="space-y-5">

            {/* Date range bar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
                <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Du</p>
                    <input type="date" className={fieldCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Au</p>
                    <input type="date" className={fieldCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileBarChart2 className="w-4 h-4" />}
                    Générer le rapport
                </button>
                {data && (
                    <button
                        onClick={() => exportCsv(data, userName, from, to)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-semibold transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Exporter CSV
                    </button>
                )}
            </div>

            {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700">{error}</div>
            )}

            {loading && !data && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                </div>
            )}

            {data && (
                <>
                    {/* Overview KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: "Total appels", value: data.overview.totalCalls, icon: Phone, color: "indigo" },
                            { label: "RDV pris", value: data.overview.totalRdv, icon: Calendar, color: "emerald" },
                            { label: "Taux de conversion", value: `${data.overview.conversionRate}%`, icon: TrendingUp, color: "blue" },
                            { label: "Temps de comm.", value: fmtDuration(data.overview.totalDuration), icon: Clock, color: "amber" },
                        ].map((kpi) => (
                            <div key={kpi.label} className="bg-white rounded-2xl border border-slate-200 p-4">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-xs font-medium text-slate-500 mb-1">{kpi.label}</p>
                                        <p className="text-3xl font-bold text-slate-900">{kpi.value}</p>
                                    </div>
                                    <div className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center",
                                        kpi.color === "indigo" ? "bg-indigo-100 text-indigo-600" :
                                        kpi.color === "emerald" ? "bg-emerald-100 text-emerald-600" :
                                        kpi.color === "blue" ? "bg-blue-100 text-blue-600" :
                                        "bg-amber-100 text-amber-600"
                                    )}>
                                        <kpi.icon className="w-5 h-5" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Secondary KPIs */}
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { label: "Rappels", value: data.overview.totalCallbacks, color: "bg-amber-100 text-amber-700" },
                            { label: "Intéressés", value: data.overview.totalInterested, color: "bg-blue-100 text-blue-700" },
                            { label: "Pas de réponse", value: data.overview.totalNoResponse, color: "bg-slate-100 text-slate-600" },
                        ].map((k) => (
                            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                                <span className="text-sm text-slate-600">{k.label}</span>
                                <span className={cn("text-sm font-bold px-3 py-1 rounded-full", k.color)}>{k.value}</span>
                            </div>
                        ))}
                    </div>

                    {/* Per-mission table */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                            <Target className="w-4 h-4 text-indigo-500" />
                            <p className="font-semibold text-slate-900">Appels par mission</p>
                            <span className="ml-auto text-xs text-slate-400">{data.byMission.length} mission(s)</span>
                        </div>
                        {data.byMission.length === 0 ? (
                            <div className="p-10 text-center text-slate-400 text-sm">Aucune mission sur cette période.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Mission</th>
                                            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                                            <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Appels</th>
                                            <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">RDV</th>
                                            <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Conv.</th>
                                            <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rappels</th>
                                            <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Intéressés</th>
                                            <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Durée</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.byMission.map((m: any) => (
                                            <tr key={m.missionId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                                                <td className="py-3 px-4 font-medium text-slate-900 max-w-[180px] truncate">{m.missionName}</td>
                                                <td className="py-3 px-4 text-slate-500 text-xs">{m.clientName ?? "—"}</td>
                                                <td className="py-3 px-4 text-center font-semibold text-slate-900">{m.calls}</td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className={cn("font-semibold px-2 py-0.5 rounded-full text-xs", m.rdv > 0 ? "bg-emerald-100 text-emerald-700" : "text-slate-400")}>
                                                        {m.rdv}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-center text-xs font-medium text-slate-600">{m.conversionRate}%</td>
                                                <td className="py-3 px-4 text-center text-amber-600 font-medium">{m.callbacks}</td>
                                                <td className="py-3 px-4 text-center text-blue-600 font-medium">{m.interested}</td>
                                                <td className="py-3 px-4 text-center text-xs text-slate-500">{fmtDuration(m.totalDuration)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Comments analysis */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                        {/* Top keywords */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <Hash className="w-4 h-4 text-indigo-500" />
                                <p className="font-semibold text-slate-900">Mots-clés fréquents</p>
                                <span className="ml-auto text-xs text-slate-400">{data.comments.total} commentaires</span>
                            </div>
                            {data.comments.topKeywords.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">Pas assez de commentaires.</p>
                            ) : (
                                <div className="space-y-2">
                                    {data.comments.topKeywords.map((kw: any) => {
                                        const max = data.comments.topKeywords[0]?.count ?? 1;
                                        const pct = Math.round((kw.count / max) * 100);
                                        return (
                                            <div key={kw.word} className="space-y-0.5">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-slate-700 font-medium">{kw.word}</span>
                                                    <span className="text-xs text-slate-400">{kw.count}×</span>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Pain points + positive signals */}
                        <div className="space-y-4">
                            <div className="bg-white rounded-2xl border border-rose-100 p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <ThumbsDown className="w-4 h-4 text-rose-500" />
                                    <p className="font-semibold text-slate-900">Points de friction</p>
                                    <span className="ml-auto text-xs text-slate-400">{data.comments.painPoints.length} extrait(s)</span>
                                </div>
                                {data.comments.painPoints.length === 0 ? (
                                    <p className="text-xs text-slate-400">Aucun commentaire négatif sur la période.</p>
                                ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {data.comments.painPoints.map((note: string, i: number) => (
                                            <div key={i} className="flex items-start gap-2 text-xs text-slate-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                                                <span className="text-rose-400 shrink-0 mt-0.5">•</span>
                                                <span>{note}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="bg-white rounded-2xl border border-emerald-100 p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <ThumbsUp className="w-4 h-4 text-emerald-500" />
                                    <p className="font-semibold text-slate-900">Signaux positifs</p>
                                    <span className="ml-auto text-xs text-slate-400">{data.comments.positiveSignals.length} extrait(s)</span>
                                </div>
                                {data.comments.positiveSignals.length === 0 ? (
                                    <p className="text-xs text-slate-400">Aucun commentaire positif sur la période.</p>
                                ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {data.comments.positiveSignals.map((note: string, i: number) => (
                                            <div key={i} className="flex items-start gap-2 text-xs text-slate-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                                                <span className="text-emerald-500 shrink-0 mt-0.5">•</span>
                                                <span>{note}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* All comments sample */}
                    {data.comments.allSample.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <MessageSquare className="w-4 h-4 text-slate-500" />
                                <p className="font-semibold text-slate-900">Échantillon de commentaires</p>
                                <span className="ml-auto text-xs text-slate-400">50 derniers</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                                {data.comments.allSample.map((note: string, i: number) => (
                                    <div key={i} className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 leading-relaxed">
                                        {note}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {data.overview.totalActions === 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                            <FileBarChart2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500">Aucune activité enregistrée sur cette période.</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ============================================
// MAIN PAGE
// ============================================

export default function UtilisateurDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { error: showError } = useToast();

    const userId = params.id as string;
    const [user, setUser]         = useState<UserDetail | null>(null);
    const [stats, setStats]       = useState<any>(null);
    const [loading, setLoading]   = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>("apercu");

    const fetchUser = useCallback(async () => {
        try {
            const [userRes, statsRes] = await Promise.all([
                fetch(`/api/users/${userId}`),
                fetch(`/api/actions/stats?userId=${userId}`),
            ]);
            const userJson  = await userRes.json();
            const statsJson = await statsRes.json();
            if (userJson.success)  setUser(userJson.data);
            if (statsJson.success) setStats(statsJson.data?.[userId] ?? statsJson.data ?? null);
        } catch {
            showError("Erreur", "Impossible de charger l'utilisateur");
        } finally {
            setLoading(false);
        }
    }, [userId, showError]);

    useEffect(() => { fetchUser(); }, [fetchUser]);

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
    );

    if (!user) return (
        <div className="p-8 text-center">
            <p className="text-slate-500">Utilisateur introuvable.</p>
            <button onClick={() => router.push("/manager/utilisateurs")} className="mt-4 text-indigo-600 hover:underline text-sm">
                ← Retour aux utilisateurs
            </button>
        </div>
    );

    const grad = ROLE_GRADIENTS[user.role] ?? "from-slate-400 to-slate-600";
    const stripe = ROLE_STRIPE[user.role] ?? "bg-slate-500";
    const online = isOnline(user);

    return (
        <div className="min-h-full bg-gradient-to-br from-slate-50 to-slate-100/50">

            {/* ── Back button ── */}
            <div className="px-6 pt-5">
                <button
                    onClick={() => router.push("/manager/utilisateurs")}
                    className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" /> Utilisateurs
                </button>
            </div>

            {/* ── Hero header ── */}
            <div className="mx-6 mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex">
                    {/* Role color stripe */}
                    <div className={cn("w-1.5 shrink-0", stripe)} />

                    <div className="flex-1 p-5 flex items-center gap-5">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                            <div className={cn("w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-xl shadow-lg", grad)}>
                                {getInitials(user.name)}
                            </div>
                            <span className={cn(
                                "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm",
                                online ? "bg-emerald-500" : user.isActive ? "bg-slate-300" : "bg-rose-400"
                            )} />
                        </div>

                        {/* Identity */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-xl font-bold text-slate-900">{user.name}</h1>
                                <span className={cn(
                                    "text-xs font-bold px-2.5 py-0.5 rounded-full",
                                    user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"
                                )}>
                                    {user.isActive ? "Actif" : "Inactif"}
                                </span>
                                {online && (
                                    <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        En ligne
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-slate-500 mt-0.5">{user.email}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {ROLE_LABELS[user.role] ?? user.role}
                                {user.client && ` · ${user.client.name}`}
                                {" · "}Membre depuis {new Date(user.createdAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                            </p>
                        </div>

                        {/* Quick actions */}
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => setActiveTab("acces")}
                                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                            >
                                <Pencil className="w-3.5 h-3.5" /> Modifier
                            </button>
                            <button
                                onClick={() => setActiveTab("securite")}
                                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold transition-colors"
                            >
                                <Shield className="w-3.5 h-3.5" /> Sécurité
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Tab navigation ── */}
            <div className="mx-6 mt-4 flex items-center gap-1 bg-white rounded-2xl border border-slate-200 p-1 shadow-sm overflow-x-auto">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                            activeTab === tab.id
                                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20"
                                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                        )}
                    >
                        <tab.icon className="w-4 h-4" />
                        <span className="hidden sm:block">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* ── Tab content ── */}
            <div className="mx-6 mt-4 pb-8">
                {activeTab === "apercu" && <ApercuTab user={user} stats={stats} />}
                {activeTab === "activite" && <ActiviteTab userId={userId} />}
                {activeTab === "planning" && <PlanningTab userId={userId} />}
                {activeTab === "historique" && <HistoriqueTab userId={userId} />}
                {activeTab === "rapport" && <RapportTab userId={userId} userName={user.name} />}
                {activeTab === "securite" && <SecuriteTab userId={userId} />}
                {activeTab === "acces" && <AccesTab user={user} onUserUpdate={(patch) => setUser(u => u ? { ...u, ...patch } : u)} />}
            </div>
        </div>
    );
}
