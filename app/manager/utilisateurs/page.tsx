"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    Users, Plus, Search, LayoutGrid, List, Loader2,
    UserCheck, UserX, ChevronRight, Phone, Calendar,
    Shield, Globe, LogIn, MoreHorizontal, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { Modal, ModalFooter, ConfirmModal } from "@/components/ui/Modal";

// ============================================
// TYPES
// ============================================

interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    alloPhoneNumber?: string | null;
    createdAt: string;
    lastSignInAt?: string | null;
    lastSignInIp?: string | null;
    lastSignInCountry?: string | null;
    lastConnectedAt?: string | null;
    preferences?: { sdrFeedback?: { promptTime?: string; requiredDaily?: boolean } } | null;
    client?: { id: string; name: string } | null;
    _count: { assignedMissions: number; actions: number };
}

// ============================================
// CONSTANTS
// ============================================

const ROLE_LABELS: Record<string, string> = {
    MANAGER: "Manager", SDR: "SDR", BUSINESS_DEVELOPER: "BD",
    DEVELOPER: "Dev", CLIENT: "Client", BOOKER: "Booker", COMMERCIAL: "Commercial",
};

const ROLE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
    MANAGER:           { bg: "bg-primary-50",  text: "text-primary-700",  dot: "bg-primary-500" },
    SDR:               { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500" },
    BUSINESS_DEVELOPER:{ bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
    DEVELOPER:         { bg: "bg-accent-50",  text: "text-accent-700",  dot: "bg-accent-500" },
    CLIENT:            { bg: "bg-sky-50",     text: "text-sky-700",     dot: "bg-sky-500" },
    BOOKER:            { bg: "bg-blue-50",    text: "text-blue-600",    dot: "bg-blue-400" },
    COMMERCIAL:        { bg: "bg-teal-50",    text: "text-teal-700",    dot: "bg-teal-500" },
};

const ROLE_AVATAR_BG: Record<string, string> = {
    MANAGER:           "bg-primary-600",
    SDR:               "bg-blue-600",
    BUSINESS_DEVELOPER:"bg-emerald-600",
    DEVELOPER:         "bg-accent-600",
    CLIENT:            "bg-sky-600",
    BOOKER:            "bg-blue-500",
    COMMERCIAL:        "bg-teal-600",
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
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function isOnline(user: User): boolean {
    const ts = user.lastConnectedAt;
    if (!ts) return false;
    return Date.now() - new Date(ts).getTime() < 5 * 60 * 1000;
}

// ============================================
// ROLE DISTRIBUTION BAR
// ============================================

function RoleDistributionBar({ users }: { users: User[] }) {
    const total = users.length;
    if (total === 0) return null;

    const counts = users.reduce<Record<string, number>>((acc, u) => {
        acc[u.role] = (acc[u.role] ?? 0) + 1;
        return acc;
    }, {});

    const roles = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    return (
        <div className="flex items-center gap-3">
            <div className="flex-1 flex h-2 rounded-full overflow-hidden gap-px">
                {roles.map(([role, count]) => (
                    <div
                        key={role}
                        className={cn("transition-all", ROLE_COLORS[role]?.dot ?? "bg-slate-400")}
                        style={{ width: `${(count / total) * 100}%` }}
                        title={`${ROLE_LABELS[role] ?? role}: ${count}`}
                    />
                ))}
            </div>
            <div className="flex items-center gap-3 shrink-0">
                {roles.slice(0, 4).map(([role, count]) => (
                    <div key={role} className="flex items-center gap-1.5 text-xs text-slate-500">
                        <div className={cn("w-2 h-2 rounded-full", ROLE_COLORS[role]?.dot ?? "bg-slate-400")} />
                        <span>{ROLE_LABELS[role] ?? role} {count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================
// USER CARD (grid view)
// ============================================

function UserCard({ user, onClick }: { user: User; onClick: () => void }) {
    const role = ROLE_COLORS[user.role] ?? { bg: "bg-slate-50", text: "text-slate-700", dot: "bg-slate-400" };
    const avatarBg = ROLE_AVATAR_BG[user.role] ?? "bg-slate-500";
    const online = isOnline(user);

    return (
        <button
            onClick={onClick}
            className="w-full text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-primary-300 hover:shadow-md transition-all duration-200 group"
        >
            <div className="flex items-start gap-3 mb-4">
                {/* Avatar */}
                <div className="relative shrink-0">
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm", avatarBg)}>
                        {getInitials(user.name)}
                    </div>
                    <span className={cn(
                        "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white",
                        online ? "bg-emerald-500" : user.isActive ? "bg-slate-300" : "bg-rose-400"
                    )} />
                </div>
                {/* Name + role */}
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate group-hover:text-primary-700 transition-colors">
                        {user.name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{user.email}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", role.bg, role.text)}>
                            {ROLE_LABELS[user.role] ?? user.role}
                        </span>
                        {!user.isActive && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">
                                Inactif
                            </span>
                        )}
                    </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary-400 transition-colors shrink-0 mt-1" />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-slate-900">{user._count.actions}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Actions</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-slate-900">{user._count.assignedMissions}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Missions</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-sm font-semibold text-slate-600 truncate">{timeAgo(user.lastSignInAt)}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Connexion</p>
                </div>
            </div>

            {/* Online indicator */}
            {online && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    En session maintenant
                </div>
            )}
        </button>
    );
}

// ============================================
// USER ROW (list view)
// ============================================

function UserRow({ user, onClick }: { user: User; onClick: () => void }) {
    const role = ROLE_COLORS[user.role] ?? { bg: "bg-slate-50", text: "text-slate-700", dot: "bg-slate-400" };
    const avatarBg = ROLE_AVATAR_BG[user.role] ?? "bg-slate-500";
    const online = isOnline(user);

    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-4 px-4 py-3 hover:bg-primary-50/40 transition-colors group text-left border-b border-slate-100 last:border-0"
        >
            {/* Avatar */}
            <div className="relative shrink-0">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-white font-semibold text-xs", avatarBg)}>
                    {getInitials(user.name)}
                </div>
                <span className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-[1.5px] border-white",
                    online ? "bg-emerald-500" : user.isActive ? "bg-slate-300" : "bg-rose-400"
                )} />
            </div>

            {/* Name + email */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-primary-700 transition-colors">
                    {user.name}
                </p>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>

            {/* Role */}
            <span className={cn("hidden sm:inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0", role.bg, role.text)}>
                {ROLE_LABELS[user.role] ?? user.role}
            </span>

            {/* Status */}
            <span className={cn(
                "hidden md:inline-flex items-center gap-1.5 text-xs font-medium shrink-0",
                user.isActive ? "text-emerald-600" : "text-rose-500"
            )}>
                {user.isActive ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                {user.isActive ? "Actif" : "Inactif"}
            </span>

            {/* Last login */}
            <span className="hidden lg:block text-xs text-slate-400 shrink-0 w-28 text-right">
                {timeAgo(user.lastSignInAt)}
            </span>

            {/* Missions */}
            <span className="hidden lg:block text-xs text-slate-500 shrink-0 w-16 text-center">
                {user._count.assignedMissions} miss.
            </span>

            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary-400 transition-colors shrink-0" />
        </button>
    );
}

// ============================================
// INLINE USER FORM
// ============================================

function UserFormFields({
    data,
    errors,
    clients,
    onChange,
}: {
    data: {
        name: string; email: string; password: string; role: string;
        clientId: string; alloPhoneNumber: string;
        sdrFeedbackPromptTime: string; sdrFeedbackRequiredDaily: boolean;
    };
    errors: Record<string, string>;
    clients: { id: string; name: string }[];
    onChange: (patch: Partial<typeof data>) => void;
}) {
    const fieldClass = "w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 text-slate-900 placeholder:text-slate-400";
    const labelClass = "block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5";

    return (
        <div className="space-y-4">
            {errors.general && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{errors.general}</div>
            )}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>Nom</label>
                    <input className={cn(fieldClass, errors.name && "border-red-300")} value={data.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Jean Dupont" />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>
                <div>
                    <label className={labelClass}>Rôle</label>
                    <select className={fieldClass} value={data.role} onChange={(e) => onChange({ role: e.target.value, clientId: e.target.value === "CLIENT" ? data.clientId : "" })}>
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
            <div>
                <label className={labelClass}>Email</label>
                <input className={cn(fieldClass, errors.email && "border-red-300")} type="email" value={data.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="jean@example.com" />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>Mot de passe <span className="text-slate-400 normal-case font-normal">(optionnel)</span></label>
                    <input className={fieldClass} type="password" value={data.password} onChange={(e) => onChange({ password: e.target.value })} placeholder="Généré auto" />
                </div>
                <div>
                    <label className={labelClass}>Numéro Allo <span className="text-slate-400 normal-case font-normal">(optionnel)</span></label>
                    <input className={fieldClass} value={data.alloPhoneNumber} onChange={(e) => onChange({ alloPhoneNumber: e.target.value })} placeholder="+33612345678" />
                </div>
            </div>
            {data.role === "CLIENT" && (
                <div>
                    <label className={labelClass}>Client <span className="text-red-500">*</span></label>
                    <select className={cn(fieldClass, errors.clientId && "border-red-300")} value={data.clientId} onChange={(e) => onChange({ clientId: e.target.value })}>
                        <option value="">Sélectionner un client</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {errors.clientId && <p className="text-red-500 text-xs mt-1">{errors.clientId}</p>}
                </div>
            )}
            {(data.role === "SDR" || data.role === "BOOKER") && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Feedback SDR</p>
                    <div className="grid grid-cols-2 gap-3 items-end">
                        <div>
                            <label className={labelClass}>Heure d'affichage</label>
                            <input type="time" className={fieldClass} value={data.sdrFeedbackPromptTime} onChange={(e) => onChange({ sdrFeedbackPromptTime: e.target.value })} />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-700 pb-2.5 cursor-pointer">
                            <input type="checkbox" checked={data.sdrFeedbackRequiredDaily} onChange={(e) => onChange({ sdrFeedbackRequiredDaily: e.target.checked })} className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                            Obligatoire chaque jour
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================
// MAIN PAGE
// ============================================

const EMPTY_FORM = {
    name: "", email: "", password: "", role: "SDR",
    clientId: "", alloPhoneNumber: "", sdrFeedbackPromptTime: "15:45", sdrFeedbackRequiredDaily: true,
};

export default function UtilisateursPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [users, setUsers]         = useState<User[]>([]);
    const [loading, setLoading]     = useState(true);
    const [view, setView]           = useState<"cards" | "list">("cards");
    const [search, setSearch]       = useState("");
    const [roleFilter, setRoleFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    const [showCreate, setShowCreate] = useState(false);
    const [formData, setFormData]   = useState(EMPTY_FORM);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [formLoading, setFormLoading] = useState(false);
    const [clients, setClients]     = useState<{ id: string; name: string }[]>([]);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams();
            if (search) p.set("search", search);
            if (roleFilter) p.set("role", roleFilter);
            if (statusFilter !== "all") p.set("status", statusFilter);
            p.set("excludeSelf", "false");
            const res = await fetch(`/api/users?${p}`);
            const json = await res.json();
            if (json.success) setUsers(json.data.users ?? json.data ?? []);
        } finally {
            setLoading(false);
        }
    }, [search, roleFilter, statusFilter]);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    useEffect(() => {
        fetch("/api/clients").then(r => r.json()).then(j => {
            const list = j.data?.clients ?? j.data ?? [];
            setClients(Array.isArray(list) ? list : []);
        }).catch(() => {});
    }, []);

    const handleCreate = async () => {
        setFormErrors({});
        if (!formData.name.trim()) { setFormErrors({ name: "Nom requis" }); return; }
        if (!formData.email.trim()) { setFormErrors({ email: "Email requis" }); return; }
        if (formData.role === "CLIENT" && !formData.clientId) { setFormErrors({ clientId: "Sélectionnez un client" }); return; }

        setFormLoading(true);
        try {
            const payload: Record<string, unknown> = {
                name: formData.name, email: formData.email,
                password: formData.password || undefined,
                role: formData.role,
                alloPhoneNumber: formData.alloPhoneNumber.trim() || undefined,
            };
            if (formData.role === "CLIENT" && formData.clientId) payload.clientId = formData.clientId;

            const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const json = await res.json();
            if (!json.success) { setFormErrors({ general: json.error }); return; }

            setShowCreate(false);
            setFormData(EMPTY_FORM);
            await fetchUsers();
            success("Utilisateur créé", `${formData.name} a rejoint l'équipe.`);
        } catch {
            setFormErrors({ general: "Erreur lors de la création" });
        } finally {
            setFormLoading(false);
        }
    };

    // Derived stats
    const stats = useMemo(() => {
        const total     = users.length;
        const active    = users.filter(u => u.isActive).length;
        const sdrCount  = users.filter(u => u.role === "SDR" || u.role === "BOOKER").length;
        const inactive  = total - active;
        const online    = users.filter(isOnline).length;
        return { total, active, sdrCount, inactive, online };
    }, [users]);

    const ROLES = ["MANAGER", "SDR", "BOOKER", "BUSINESS_DEVELOPER", "DEVELOPER", "CLIENT", "COMMERCIAL"];

    return (
        <div className="min-h-full bg-slate-50 p-6 space-y-5">

            {/* ── Header ── */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Utilisateurs</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Gérez votre équipe et leurs accès</p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Nouvel utilisateur
                </button>
            </div>

            {/* ── Role distribution bar ── */}
            {!loading && users.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 px-5 py-3">
                    <RoleDistributionBar users={users} />
                </div>
            )}

            {/* ── Stats row ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                    { label: "Total", value: stats.total, color: "text-slate-900", bg: "bg-white border-slate-200" },
                    { label: "Actifs", value: stats.active, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
                    { label: "SDR / Booker", value: stats.sdrCount, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
                    { label: "Inactifs", value: stats.inactive, color: "text-rose-600", bg: "bg-rose-50 border-rose-200" },
                    { label: "En ligne", value: stats.online, color: "text-primary-700", bg: "bg-primary-50 border-primary-200" },
                ].map((s) => (
                    <div key={s.label} className={cn("rounded-2xl border px-4 py-3", s.bg)}>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.label}</p>
                        <p className={cn("text-2xl font-extrabold mt-1", s.color)}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* ── Filter bar ── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                            <X className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                    )}
                </div>

                {/* Role pills */}
                <div className="flex items-center gap-1 flex-wrap">
                    <button
                        onClick={() => setRoleFilter("")}
                        className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors", !roleFilter ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
                    >Tous</button>
                    {ROLES.map((r) => (
                        <button
                            key={r}
                            onClick={() => setRoleFilter(roleFilter === r ? "" : r)}
                            className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                                roleFilter === r
                                    ? cn(ROLE_COLORS[r]?.bg, ROLE_COLORS[r]?.text, "ring-1 ring-current/20")
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}
                        >{ROLE_LABELS[r] ?? r}</button>
                    ))}
                </div>

                {/* Status toggle */}
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                >
                    <option value="all">Tous les statuts</option>
                    <option value="active">Actifs</option>
                    <option value="inactive">Inactifs</option>
                </select>

                {/* View toggle */}
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5 ml-auto">
                    <button onClick={() => setView("cards")} className={cn("p-1.5 rounded-md transition-colors", view === "cards" ? "bg-white shadow-sm text-slate-900" : "text-slate-400 hover:text-slate-600")}>
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button onClick={() => setView("list")} className={cn("p-1.5 rounded-md transition-colors", view === "list" ? "bg-white shadow-sm text-slate-900" : "text-slate-400 hover:text-slate-600")}>
                        <List className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ── Content ── */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-7 h-7 text-primary-500 animate-spin" />
                </div>
            ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                        <Users className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="font-semibold text-slate-700">Aucun utilisateur trouvé</p>
                    <p className="text-sm text-slate-400 mt-1">Modifiez vos filtres ou créez un nouveau compte.</p>
                </div>
            ) : view === "cards" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {users.map((u) => (
                        <UserCard key={u.id} user={u} onClick={() => router.push(`/manager/utilisateurs/${u.id}`)} />
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="hidden lg:grid grid-cols-[auto_1fr_120px_90px_110px_80px_40px] items-center gap-4 px-4 py-2 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                        <div className="w-9" />
                        <div>Utilisateur</div>
                        <div>Rôle</div>
                        <div>Statut</div>
                        <div className="text-right">Connexion</div>
                        <div className="text-center">Missions</div>
                        <div />
                    </div>
                    {users.map((u) => (
                        <UserRow key={u.id} user={u} onClick={() => router.push(`/manager/utilisateurs/${u.id}`)} />
                    ))}
                </div>
            )}

            {/* ── Create modal ── */}
            <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); setFormData(EMPTY_FORM); setFormErrors({}); }} title="Nouvel utilisateur" size="md">
                <UserFormFields data={formData} errors={formErrors} clients={clients} onChange={(p) => setFormData((d) => ({ ...d, ...p }))} />
                <ModalFooter>
                    <button onClick={() => { setShowCreate(false); setFormData(EMPTY_FORM); setFormErrors({}); }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                        Annuler
                    </button>
                    <button onClick={handleCreate} disabled={formLoading} className="px-4 py-2 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50">
                        {formLoading ? "Création…" : "Créer l'utilisateur"}
                    </button>
                </ModalFooter>
            </Modal>
        </div>
    );
}
