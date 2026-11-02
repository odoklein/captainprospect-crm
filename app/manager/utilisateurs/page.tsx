"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { Check, ChevronRight, Copy, KeyRound, LayoutGrid, List, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CONTROL_HEIGHT, FIELD_BASE, FIELD_ERROR, FOCUS_RING } from "@/components/ui/recipes";
import {
    HubHeader,
    HubTabs,
    Panel,
    PanelMessage,
    PanelToolbar,
    RefreshBar,
    SearchField,
    SkeletonRows,
    TextButton,
    ToolbarScroller,
    useSlashFocus,
} from "@/components/hr/HubUI";

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

type StatusFilter = "all" | "active" | "inactive";
type View = "list" | "cards";

// ============================================
// CONSTANTS
// ============================================

const ROLES = ["MANAGER", "SDR", "BOOKER", "BUSINESS_DEVELOPER", "DEVELOPER", "CLIENT", "COMMERCIAL"];

const ROLE_LABELS: Record<string, string> = {
    MANAGER: "Manager", SDR: "SDR", BUSINESS_DEVELOPER: "BD",
    DEVELOPER: "Dev", CLIENT: "Client", BOOKER: "Booker", COMMERCIAL: "Commercial",
};

/** Tab labels: the role as a group of people. */
const ROLE_TABS: Record<string, string> = {
    MANAGER: "Managers", SDR: "SDR", BUSINESS_DEVELOPER: "BD",
    DEVELOPER: "Dev", CLIENT: "Clients", BOOKER: "Bookers", COMMERCIAL: "Commerciaux",
};

// The full roster comes in one request and is filtered here: the API pages at
// 30 by default, which silently hid every account past the 30th.
const ROSTER_LIMIT = 2000;
const VIEW_PREF = "users.view";

const EMPTY_FORM = {
    name: "", email: "", password: "", role: "SDR",
    clientId: "", alloPhoneNumber: "", sdrFeedbackPromptTime: "15:45", sdrFeedbackRequiredDaily: true,
};

// ============================================
// UTILITIES
// ============================================

function timeAgo(iso: string | null | undefined): string {
    if (!iso) return "Jamais";
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `Il y a ${mins} min`;
    if (hours < 24) return `Il y a ${hours} h`;
    if (days < 7) return `Il y a ${days} j`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function signInTitle(user: User): string | undefined {
    if (!user.lastSignInAt) return undefined;
    const when = new Date(user.lastSignInAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
    const where = [user.lastSignInCountry, user.lastSignInIp].filter(Boolean).join(" · ");
    return where ? `Dernière connexion le ${when} (${where})` : `Dernière connexion le ${when}`;
}

function isOnline(user: User): boolean {
    const ts = user.lastConnectedAt;
    if (!ts) return false;
    return Date.now() - new Date(ts).getTime() < 5 * 60 * 1000;
}

function readView(): View {
    try {
        return window.localStorage.getItem(VIEW_PREF) === "cards" ? "cards" : "list";
    } catch {
        return "list";
    }
}

const count = (n: number) => n.toLocaleString("fr-FR");
/** French counts: singular for 0 and 1. */
const plural = (n: number, one: string, many: string) => `${count(n)} ${n > 1 ? many : one}`;

// ============================================
// PIECES
// ============================================

function RolePill({ user }: { user: User }) {
    return (
        <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
            <span className="inline-flex h-[22px] shrink-0 items-center rounded-full border border-line bg-surface-2 px-2 text-xs font-medium text-ink-2">
                {ROLE_LABELS[user.role] ?? user.role}
            </span>
            {user.role === "CLIENT" && user.client?.name && <span className="truncate text-xs text-ink-3">{user.client.name}</span>}
        </span>
    );
}

/** One mark for presence and account state. */
function PresenceStatus({ user }: { user: User }) {
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

const LIST_GRID =
    "grid grid-cols-[minmax(0,1fr)_auto_20px] md:grid-cols-[minmax(0,1fr)_150px_96px_20px] lg:grid-cols-[minmax(0,1fr)_170px_110px_130px_84px_96px_20px] items-center gap-x-4";

function UserRow({ user }: { user: User }) {
    return (
        <Link
            href={`/manager/utilisateurs/${user.id}`}
            className={cn(
                LIST_GRID,
                "group border-b border-line-subtle px-5 py-3 transition-colors duration-100 last:border-b-0 hover:bg-surface-2/70",
                FOCUS_RING,
                "focus-visible:ring-inset focus-visible:ring-offset-0",
            )}
        >
            <div className="flex min-w-0 items-center gap-3">
                <Avatar name={user.name} size="sm" shape="circle" className={cn(!user.isActive && "opacity-50")} />
                <div className="min-w-0">
                    <p className={cn("truncate text-sm font-semibold group-hover:text-primary-700", user.isActive ? "text-ink" : "text-ink-3")}>{user.name}</p>
                    <p className="truncate text-xs text-ink-3">{user.email}</p>
                </div>
            </div>
            <div className="hidden min-w-0 md:block">
                <RolePill user={user} />
            </div>
            <div className="text-right md:text-left">
                <PresenceStatus user={user} />
            </div>
            <span className="hidden text-right text-[13px] tabular-nums text-ink-2 lg:block" title={signInTitle(user)}>
                {timeAgo(user.lastSignInAt)}
            </span>
            <span className={cn("hidden text-right text-[13px] tabular-nums lg:block", user._count.assignedMissions ? "text-ink" : "text-ink-4")}>
                {count(user._count.assignedMissions)}
            </span>
            <span className={cn("hidden text-right text-[13px] tabular-nums lg:block", user._count.actions ? "text-ink" : "text-ink-4")}>
                {count(user._count.actions)}
            </span>
            <ChevronRight className="size-4 text-ink-4 transition-colors group-hover:text-ink-2" aria-hidden />
        </Link>
    );
}

function UserCard({ user }: { user: User }) {
    return (
        <Link
            href={`/manager/utilisateurs/${user.id}`}
            className={cn(
                "group flex flex-col rounded-xl border border-line bg-surface p-4 transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-xs",
                FOCUS_RING,
            )}
        >
            <div className="flex items-start gap-3">
                <Avatar name={user.name} size="md" shape="circle" className={cn(!user.isActive && "opacity-50")} />
                <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-semibold group-hover:text-primary-700", user.isActive ? "text-ink" : "text-ink-3")}>{user.name}</p>
                    <p className="truncate text-xs text-ink-3">{user.email}</p>
                </div>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-4 transition-colors group-hover:text-ink-2" aria-hidden />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
                <RolePill user={user} />
                <PresenceStatus user={user} />
            </div>
            <dl className="mt-4 grid grid-cols-3 border-t border-line-subtle pt-3 text-xs">
                <div>
                    <dt className="text-ink-3">Actions</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">{count(user._count.actions)}</dd>
                </div>
                <div>
                    <dt className="text-ink-3">Missions</dt>
                    <dd className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">{count(user._count.assignedMissions)}</dd>
                </div>
                <div className="text-right" title={signInTitle(user)}>
                    <dt className="text-ink-3">Connexion</dt>
                    <dd className="mt-0.5 truncate text-[13px] font-medium text-ink-2">{timeAgo(user.lastSignInAt)}</dd>
                </div>
            </dl>
        </Link>
    );
}

// ============================================
// CREATE FORM
// ============================================

type FormData = typeof EMPTY_FORM;

function UserFormFields({
    data,
    errors,
    clients,
    onChange,
}: {
    data: FormData;
    errors: Record<string, string>;
    clients: { id: string; name: string }[];
    onChange: (patch: Partial<FormData>) => void;
}) {
    const field = (error?: string) => cn(FIELD_BASE, CONTROL_HEIGHT.md, "px-3", error && FIELD_ERROR);
    const label = "mb-1.5 block text-[13px] font-medium text-ink-2";
    const optional = <span className="font-normal text-ink-3"> (optionnel)</span>;
    const errorLine = (msg?: string) => (msg ? <p role="alert" className="mt-1.5 text-xs font-medium text-danger-ink">{msg}</p> : null);

    return (
        <div className="space-y-4">
            {errors.general && (
                <div role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2.5 text-[13px] text-danger-ink">
                    {errors.general}
                </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="nu-name" className={label}>Nom</label>
                    <input id="nu-name" autoFocus className={field(errors.name)} value={data.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Jean Dupont" />
                    {errorLine(errors.name)}
                </div>
                <div>
                    <label htmlFor="nu-role" className={label}>Rôle</label>
                    <select id="nu-role" className={field()} value={data.role} onChange={(e) => onChange({ role: e.target.value, clientId: e.target.value === "CLIENT" ? data.clientId : "" })}>
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
                <label htmlFor="nu-email" className={label}>Email</label>
                <input id="nu-email" className={field(errors.email)} type="email" value={data.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="jean@example.com" />
                {errorLine(errors.email)}
            </div>
            {data.role === "CLIENT" && (
                <div>
                    <label htmlFor="nu-client" className={label}>Client <span className="text-accent" aria-hidden>*</span></label>
                    <select id="nu-client" className={field(errors.clientId)} value={data.clientId} onChange={(e) => onChange({ clientId: e.target.value })}>
                        <option value="">Sélectionner un client</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {errorLine(errors.clientId)}
                </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="nu-password" className={label}>Mot de passe{optional}</label>
                    <input id="nu-password" className={field()} type="password" autoComplete="new-password" value={data.password} onChange={(e) => onChange({ password: e.target.value })} placeholder="Généré automatiquement" />
                </div>
                <div>
                    <label htmlFor="nu-allo" className={label}>Numéro Allo{optional}</label>
                    <input id="nu-allo" className={cn(field(), "tabular-nums")} value={data.alloPhoneNumber} onChange={(e) => onChange({ alloPhoneNumber: e.target.value })} placeholder="+33612345678" />
                </div>
            </div>
            {(data.role === "SDR" || data.role === "BOOKER") && (
                <fieldset className="rounded-xl border border-line bg-surface-2 p-4">
                    <legend className="sr-only">Retour journée</legend>
                    <p className="text-[13px] font-semibold text-ink">Retour journée</p>
                    <p className="mt-0.5 text-xs text-ink-3">Le formulaire de fin de journée s’affiche à cette heure.</p>
                    <div className="mt-3 grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
                        <div>
                            <label htmlFor="nu-time" className={label}>Heure d’affichage</label>
                            <input id="nu-time" type="time" className={cn(field(), "tabular-nums")} value={data.sdrFeedbackPromptTime} onChange={(e) => onChange({ sdrFeedbackPromptTime: e.target.value })} />
                        </div>
                        <label className="flex h-10 cursor-pointer items-center gap-2.5 text-[13px] text-ink-2">
                            <input
                                type="checkbox"
                                checked={data.sdrFeedbackRequiredDaily}
                                onChange={(e) => onChange({ sdrFeedbackRequiredDaily: e.target.checked })}
                                className="size-4 rounded border-line-strong text-primary-600 focus:ring-primary-500"
                            />
                            Obligatoire chaque jour
                        </label>
                    </div>
                </fieldset>
            )}
        </div>
    );
}

/** Shown once after creation when the password was generated: it is not sent anywhere else. */
function CreatedAccount({ name, email, password }: { name: string; email: string; password: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(`${email}\n${password}`);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard unavailable: the text stays selectable */ }
    };
    return (
        <div className="space-y-4 text-[13px]">
            <p className="leading-relaxed text-ink-2">
                Le compte de <strong className="text-ink">{name}</strong> est créé. Transmettez-lui ces identifiants : le mot de passe ne sera plus affiché.
            </p>
            <div className="divide-y divide-line-subtle rounded-xl border border-line">
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <span className="text-ink-3">Email</span>
                    <span className="truncate font-medium text-ink">{email}</span>
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <span className="flex items-center gap-1.5 text-ink-3"><KeyRound className="size-3.5" aria-hidden />Mot de passe</span>
                    <span className="select-all font-mono text-[13px] font-medium text-ink">{password}</span>
                </div>
            </div>
            <Button variant="secondary" size="sm" onClick={copy} leftIcon={copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}>
                {copied ? "Copié" : "Copier les identifiants"}
            </Button>
        </div>
    );
}

// ============================================
// MAIN PAGE
// ============================================

export default function UtilisateursPage() {
    const { success, error: showError } = useToast();

    const [users, setUsers] = useState<User[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [view, setViewState] = useState<View>("list");
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("ALL");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [onlineOnly, setOnlineOnly] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    const [showCreate, setShowCreate] = useState(false);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [formLoading, setFormLoading] = useState(false);
    const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);
    const [clients, setClients] = useState<{ id: string; name: string }[]>([]);

    useSlashFocus(searchRef);

    // The view is a per-viewer convenience: read it after mount.
    useEffect(() => setViewState(readView()), []);
    const setView = (next: View) => {
        setViewState(next);
        try {
            window.localStorage.setItem(VIEW_PREF, next);
        } catch { /* storage unavailable */ }
    };

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch(`/api/users?excludeSelf=false&limit=${ROSTER_LIMIT}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) throw new Error(json.error || "Impossible de charger les utilisateurs.");
            setUsers(json.data.users ?? json.data ?? []);
            setLoaded(true);
        } catch (err) {
            setLoadError((err as Error).message || "Impossible de charger les utilisateurs.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    useEffect(() => {
        fetch("/api/clients").then(r => r.json()).then(j => {
            const list = j.data?.clients ?? j.data ?? [];
            setClients(Array.isArray(list) ? list : []);
        }).catch(() => {});
    }, []);

    const closeCreate = () => {
        setShowCreate(false);
        setFormData(EMPTY_FORM);
        setFormErrors({});
        setCreated(null);
    };

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

            // The create route has no preferences field: the end-of-day report
            // settings chosen in the form are saved right after.
            if ((formData.role === "SDR" || formData.role === "BOOKER") && json.data?.id) {
                const prefs = await fetch(`/api/users/${json.data.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        preferences: { sdrFeedback: { promptTime: formData.sdrFeedbackPromptTime, requiredDaily: formData.sdrFeedbackRequiredDaily } },
                    }),
                }).then((r) => r.ok).catch(() => false);
                if (!prefs) showError("Retour journée non enregistré", "Le compte est créé ; réglez l’heure depuis sa fiche.");
            }

            await fetchUsers();
            if (json.data?.generatedPassword) {
                setCreated({ name: formData.name, email: formData.email, password: json.data.generatedPassword });
            } else {
                closeCreate();
                success("Utilisateur créé", `${formData.name} a rejoint l'équipe.`);
            }
        } catch {
            setFormErrors({ general: "Erreur lors de la création" });
        } finally {
            setFormLoading(false);
        }
    };

    // ── Filtering: every count follows the other filters ──────────────
    const q = search.trim().toLowerCase();
    const matchSearch = useCallback((u: User) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q), [q]);
    const matchStatus = useCallback(
        (u: User) => (statusFilter === "all" || (statusFilter === "active" ? u.isActive : !u.isActive)) && (!onlineOnly || isOnline(u)),
        [statusFilter, onlineOnly],
    );
    const matchRole = useCallback((u: User) => roleFilter === "ALL" || u.role === roleFilter, [roleFilter]);

    const visible = useMemo(() => users.filter((u) => matchSearch(u) && matchStatus(u) && matchRole(u)), [users, matchSearch, matchStatus, matchRole]);

    const roleTabs = useMemo(() => {
        const scoped = users.filter((u) => matchSearch(u) && matchStatus(u));
        const byRole = new Map<string, number>();
        scoped.forEach((u) => byRole.set(u.role, (byRole.get(u.role) ?? 0) + 1));
        const present = ROLES.filter((r) => users.some((u) => u.role === r));
        return [
            { value: "ALL", label: "Tous", count: scoped.length },
            ...present.map((r) => ({ value: r, label: ROLE_TABS[r] ?? r, count: byRole.get(r) ?? 0 })),
        ];
    }, [users, matchSearch, matchStatus]);

    const statusCounts = useMemo(() => {
        const scoped = users.filter((u) => matchSearch(u) && matchRole(u) && (!onlineOnly || isOnline(u)));
        const active = scoped.filter((u) => u.isActive).length;
        return { all: scoped.length, active, inactive: scoped.length - active };
    }, [users, matchSearch, matchRole, onlineOnly]);

    const onlineCount = useMemo(() => users.filter((u) => matchSearch(u) && matchRole(u) && isOnline(u)).length, [users, matchSearch, matchRole]);

    const totals = useMemo(() => {
        const active = users.filter((u) => u.isActive).length;
        return { total: users.length, active, inactive: users.length - active, online: users.filter(isOnline).length };
    }, [users]);

    const filtersActive = q !== "" || roleFilter !== "ALL" || statusFilter !== "all" || onlineOnly;
    const resetFilters = () => {
        setSearch("");
        setRoleFilter("ALL");
        setStatusFilter("all");
        setOnlineOnly(false);
    };

    const finding = !loaded
        ? loadError ? "La liste n’a pas pu être chargée." : "Chargement des comptes…"
        : `${plural(totals.total, "compte", "comptes")} · ${plural(totals.active, "actif", "actifs")}${totals.inactive ? ` · ${plural(totals.inactive, "inactif", "inactifs")}` : ""} · ${count(totals.online)} en ligne maintenant`;

    return (
        <div className="space-y-4 pb-2">
            <HubHeader
                title="Utilisateurs & accès"
                finding={finding}
                actions={
                    <Button size="sm" onClick={() => setShowCreate(true)} leftIcon={<Plus className="size-4" />}>
                        Nouvel utilisateur
                    </Button>
                }
            />

            <Panel>
                <RefreshBar active={loading && loaded} />

                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line px-2 pt-2">
                    <HubTabs ariaLabel="Filtrer par rôle" tabs={roleTabs} value={roleFilter} onChange={setRoleFilter} />
                    <SegmentedControl<View>
                        className="mb-2 mr-2 hidden sm:inline-flex"
                        size="sm"
                        ariaLabel="Affichage"
                        value={view}
                        onChange={setView}
                        options={[
                            { value: "list", label: "", icon: List, ariaLabel: "Liste" },
                            { value: "cards", label: "", icon: LayoutGrid, ariaLabel: "Cartes" },
                        ]}
                    />
                </div>

                <PanelToolbar>
                    <SearchField ref={searchRef} value={search} onChange={setSearch} placeholder="Rechercher un nom ou un email…" className="sm:max-w-md" />
                    <ToolbarScroller>
                        <SegmentedControl<StatusFilter>
                            size="sm"
                            ariaLabel="Statut du compte"
                            value={statusFilter}
                            onChange={setStatusFilter}
                            options={[
                                { value: "all", label: "Tous" },
                                { value: "active", label: "Actifs", count: statusCounts.active },
                                { value: "inactive", label: "Inactifs", count: statusCounts.inactive },
                            ]}
                        />
                        <button
                            type="button"
                            aria-pressed={onlineOnly}
                            onClick={() => setOnlineOnly((v) => !v)}
                            className={cn(
                                "inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-medium transition-colors duration-150",
                                FOCUS_RING,
                                onlineOnly ? "border-success-line bg-success-soft text-success-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
                            )}
                        >
                            <span className={cn("size-1.5 rounded-full", onlineCount ? "bg-success" : "bg-line-strong")} aria-hidden />
                            En ligne
                            <span className="tabular-nums text-ink-3">{onlineCount}</span>
                        </button>
                        {filtersActive && <TextButton onClick={resetFilters}>Réinitialiser</TextButton>}
                    </ToolbarScroller>
                    <span className="ml-auto hidden text-xs tabular-nums text-ink-3 sm:block">
                        {plural(visible.length, "utilisateur", "utilisateurs")}
                    </span>
                </PanelToolbar>

                {!loaded && loading ? (
                    <SkeletonRows rows={8} columns={[26, 10, 8, 10, 5, 6]} pitch="py-3.5" />
                ) : loadError && !loaded ? (
                    <PanelMessage tone="error" action={<TextButton onClick={fetchUsers}>Réessayer</TextButton>}>
                        {loadError}
                    </PanelMessage>
                ) : visible.length === 0 ? (
                    users.length === 0 ? (
                        <PanelMessage action={<TextButton onClick={() => setShowCreate(true)}><Plus className="size-3.5" />Créer le premier compte</TextButton>}>
                            Aucun compte pour le moment.
                        </PanelMessage>
                    ) : (
                        <PanelMessage action={<TextButton onClick={resetFilters}>Réinitialiser les filtres</TextButton>}>
                            Personne ne correspond à ces filtres.
                        </PanelMessage>
                    )
                ) : view === "cards" ? (
                    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {visible.map((u) => <UserCard key={u.id} user={u} />)}
                    </div>
                ) : (
                    <div role="table" aria-label="Utilisateurs">
                        <div role="row" className={cn(LIST_GRID, "border-b border-line px-5 py-2.5 text-xs font-medium text-ink-3")}>
                            <span role="columnheader">Utilisateur</span>
                            <span role="columnheader" className="hidden md:block">Rôle</span>
                            <span role="columnheader" className="text-right md:text-left">Statut</span>
                            <span role="columnheader" className="hidden text-right lg:block">Dernière connexion</span>
                            <span role="columnheader" className="hidden text-right lg:block">Missions</span>
                            <span role="columnheader" className="hidden text-right lg:block">Actions</span>
                            <span aria-hidden />
                        </div>
                        {visible.map((u) => <UserRow key={u.id} user={u} />)}
                    </div>
                )}
            </Panel>

            {/* ── Create modal ── */}
            <Modal
                isOpen={showCreate}
                onClose={closeCreate}
                title={created ? "Compte créé" : "Nouvel utilisateur"}
                description={created ? undefined : "Le compte peut se connecter dès sa création."}
                size="md"
            >
                {created ? (
                    <>
                        <CreatedAccount {...created} />
                        <ModalFooter>
                            <Button size="sm" onClick={() => { const name = created.name; closeCreate(); success("Utilisateur créé", `${name} a rejoint l'équipe.`); }}>
                                Terminé
                            </Button>
                        </ModalFooter>
                    </>
                ) : (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleCreate();
                        }}
                    >
                        <UserFormFields data={formData} errors={formErrors} clients={clients} onChange={(p) => setFormData((d) => ({ ...d, ...p }))} />
                        <ModalFooter>
                            <Button type="button" variant="ghost" size="sm" onClick={closeCreate}>
                                Annuler
                            </Button>
                            <Button type="submit" size="sm" isLoading={formLoading}>
                                {formLoading ? "Création…" : "Créer l'utilisateur"}
                            </Button>
                        </ModalFooter>
                    </form>
                )}
            </Modal>
        </div>
    );
}
