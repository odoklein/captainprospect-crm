"use client";

// ============================================
// ACCOUNT PANELS — the personal half of every settings page: identity hero with
// the profile picture, personal info, security (password, devices, sign-in
// history), the SDR's working day, and notifications. Each panel loads what it
// needs, so a page is just a list of sections.
// ============================================

import { useCallback, useState, type DragEvent, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertTriangle, Bell, BellOff, BellRing, Building2, CalendarClock, Camera, Check, ClipboardCheck, Eye, EyeOff,
    Globe, Key, KeyRound, Loader2, Lock, LogIn, LogOut, Mail, MapPin, Monitor, Phone, ShieldCheck,
    Smartphone, Target, Trash2, User,
} from "lucide-react";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { myProfileQueryKey } from "@/lib/query-keys";
import {
    BADGE, EmptyBlock, FOCUS as FOCUS_RING_CLASS, ProgressBar, Shimmer, StatusPill, relativeTime, type AccueilTone,
} from "@/components/accueil/AccueilUI";
import { useSdrPace } from "@/components/sdr/SdrPaceProvider";
import { UserAvatar, useAvatarMutations, useAvatarPicker, useMyAvatar } from "./Avatar";
import { ROLE_LABEL } from "./roles";
import {
    DANGER_BUTTON, Field, FormStatus, INPUT, Notice, PRIMARY_BUTTON, SECONDARY_BUTTON, SaveBar, SettingRow, SettingsCard, SettingsList, Toggle,
} from "./SettingsUI";
import { useBrand } from "@/lib/brand/client";
import { useNotificationPermission, type NotificationPermissionState } from "@/components/telephony/useNotificationPermission";

// ── Profile data ────────────────────────────────────────────────────────────

export interface ProfileData {
    name: string;
    email: string;
    role: string;
    clientName: string | null;
    createdAt: string;
    lastSignInAt: string | null;
    alloPhoneNumber: string | null;
    phone: string;
    timezone: string;
    preferences: {
        notifications: Record<string, boolean>;
        sdrFeedback?: { promptTime?: string; requiredDaily?: boolean };
    };
}

export function useProfile() {
    const { data: session } = useSession();
    const userId = session?.user?.id;
    return useQuery({
        queryKey: myProfileQueryKey(userId),
        enabled: Boolean(userId),
        queryFn: async (): Promise<ProfileData> => {
            const res = await fetch("/api/users/me/profile");
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Profil indisponible");
            return json.data as ProfileData;
        },
    });
}

// ── Identity ────────────────────────────────────────────────────────────────

/** Light profile card: the photo (click or drop to change it), name and role. The e-mail lives in the form below. */
export function ProfileHero() {
    const { data: profile, isLoading } = useProfile();
    const { data: avatar } = useMyAvatar();
    const { remove } = useAvatarMutations();
    const toast = useToast();
    const [dragging, setDragging] = useState(false);
    const [removing, setRemoving] = useState(false);

    const onPickError = useCallback((message: string) => toast.error("Photo de profil", message), [toast]);
    const picker = useAvatarPicker({
        onError: onPickError,
        onSaved: () => toast.success("Photo mise à jour", "Elle apparaît déjà dans la barre latérale."),
    });

    if (isLoading || !profile) return <Shimmer className="h-[112px] rounded-3xl" />;

    const hasPhoto = Boolean(avatar?.url);
    const onDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragging(false);
        void picker.pick(e.dataTransfer.files?.[0]);
    };
    const removePhoto = async () => {
        setRemoving(true);
        try {
            await remove();
            toast.success("Photo retirée", "Vos initiales la remplacent.");
        } catch (e) {
            toast.error("Photo de profil", e instanceof Error ? e.message : "Suppression impossible");
        } finally {
            setRemoving(false);
        }
    };

    return (
        <section
            className={cn(
                "bg-surface rounded-3xl border shadow-card p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-colors",
                dragging ? "border-emerald-400 bg-emerald-50/40" : "border-line",
            )}
            onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
        >
            {picker.element}
            <button
                type="button"
                onClick={picker.open}
                aria-label={hasPhoto ? "Changer la photo de profil" : "Ajouter une photo de profil"}
                className={cn("group relative self-start sm:self-center rounded-2xl flex-shrink-0", FOCUS_RING_CLASS)}
            >
                <UserAvatar name={profile.name} src={avatar?.url} className="w-16 h-16 rounded-2xl text-lg ring-1 ring-line" />
                <span
                    aria-hidden
                    className={cn(
                        "absolute inset-0 rounded-2xl bg-zinc-950/55 flex items-center justify-center text-white transition-opacity",
                        dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                    )}
                >
                    <Camera className="w-5 h-5" />
                </span>
            </button>

            <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold tracking-tight text-ink truncate">{profile.name}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-ink-3">
                    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-lg bg-surface-2 text-ink-2">
                        <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
                        {ROLE_LABEL[profile.role] ?? profile.role}
                    </span>
                    {profile.clientName && (
                        <span className="inline-flex items-center gap-1 h-6 px-2 rounded-lg bg-surface-2 text-ink-2">
                            <Building2 className="w-3.5 h-3.5" aria-hidden />
                            {profile.clientName}
                        </span>
                    )}
                </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
                {hasPhoto && (
                    <button type="button" onClick={removePhoto} disabled={removing} className={DANGER_BUTTON}>
                        {removing ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden /> : <Trash2 className="w-3.5 h-3.5" aria-hidden />}
                        Retirer
                    </button>
                )}
                <button type="button" onClick={picker.open} className={SECONDARY_BUTTON}>
                    <Camera className="w-3.5 h-3.5" aria-hidden />
                    {hasPhoto ? "Changer la photo" : "Ajouter une photo"}
                </button>
            </div>
        </section>
    );
}

// ── Personal information ────────────────────────────────────────────────────

const TIMEZONES: { value: string; label: string }[] = [
    { value: "Europe/Paris", label: "Paris (UTC+1/+2)" },
    { value: "Europe/Brussels", label: "Bruxelles (UTC+1/+2)" },
    { value: "Europe/Zurich", label: "Zurich (UTC+1/+2)" },
    { value: "Europe/Luxembourg", label: "Luxembourg (UTC+1/+2)" },
    { value: "Europe/London", label: "Londres (UTC+0/+1)" },
    { value: "Europe/Lisbon", label: "Lisbonne (UTC+0/+1)" },
    { value: "Africa/Casablanca", label: "Casablanca (UTC+1)" },
    { value: "Africa/Algiers", label: "Alger (UTC+1)" },
    { value: "Africa/Tunis", label: "Tunis (UTC+1)" },
    { value: "Africa/Dakar", label: "Dakar (UTC+0)" },
    { value: "Indian/Reunion", label: "La Réunion (UTC+4)" },
    { value: "America/Martinique", label: "Martinique (UTC−4)" },
    { value: "America/Guadeloupe", label: "Guadeloupe (UTC−4)" },
    { value: "America/Montreal", label: "Montréal (UTC−5/−4)" },
    { value: "UTC", label: "UTC" },
];

interface PersonalForm {
    name: string;
    phone: string;
    timezone: string;
}

export function PersonalInfoCard() {
    const { data: profile } = useProfile();
    if (!profile) return <Shimmer className="h-[300px] rounded-3xl" />;
    // Keyed by account: the form owns its draft from here on.
    return <PersonalInfoForm key={profile.email} profile={profile} />;
}

function PersonalInfoForm({ profile }: { profile: ProfileData }) {
    const toast = useToast();
    const { data: session, update } = useSession();
    const queryClient = useQueryClient();
    const initial: PersonalForm = { name: profile.name, phone: profile.phone ?? "", timezone: profile.timezone || "Europe/Paris" };
    const [baseline, setBaseline] = useState<PersonalForm>(initial);
    const [form, setForm] = useState<PersonalForm>(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const dirty = form.name !== baseline.name || form.phone !== baseline.phone || form.timezone !== baseline.timezone;
    const zones = TIMEZONES.some((z) => z.value === form.timezone) ? TIMEZONES : [{ value: form.timezone, label: form.timezone }, ...TIMEZONES];

    const set = (patch: Partial<PersonalForm>) => {
        setForm((f) => ({ ...f, ...patch }));
        setError(null);
    };

    const save = async (e?: FormEvent) => {
        e?.preventDefault();
        if (!dirty) return;
        const name = form.name.trim();
        if (!name) {
            setError("Le nom ne peut pas être vide.");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch("/api/users/me/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, phone: form.phone.trim() || null, timezone: form.timezone }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Enregistrement impossible");
            const next = { ...form, name, phone: form.phone.trim() };
            setForm(next);
            setBaseline(next);
            await queryClient.invalidateQueries({ queryKey: myProfileQueryKey(session?.user?.id) });
            if (name !== baseline.name) await update(); // refresh the name shown in the sidebar
            toast.success("Profil mis à jour", "Vos informations ont été enregistrées.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Enregistrement impossible");
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <SettingsCard icon={User} title="Informations personnelles" subtitle="Visibles par votre équipe et vos interlocuteurs">
                <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
                    <Field label="Nom complet" icon={User}>
                        {(id) => (
                            <input id={id} value={form.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" maxLength={200} placeholder="Prénom Nom" className={cn(INPUT, "pl-10")} />
                        )}
                    </Field>
                    <Field label="Téléphone" icon={Phone} hint="Votre numéro direct, pour qu'on puisse vous joindre.">
                        {(id) => (
                            <input id={id} value={form.phone} onChange={(e) => set({ phone: e.target.value })} type="tel" autoComplete="tel" maxLength={50} placeholder="+33 6 00 00 00 00" className={cn(INPUT, "pl-10")} />
                        )}
                    </Field>
                    <Field
                        label="Adresse email"
                        icon={Mail}
                        hint="Identifiant de connexion — un manager peut la modifier si besoin."
                        trailing={
                            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full", BADGE.slate)}>
                                <Lock className="w-2.5 h-2.5" aria-hidden /> Verrouillé
                            </span>
                        }
                    >
                        {(id) => <input id={id} value={profile.email} disabled readOnly className={cn(INPUT, "pl-10")} />}
                    </Field>
                    <Field label="Fuseau horaire" icon={Globe}>
                        {(id) => (
                            <select id={id} value={form.timezone} onChange={(e) => set({ timezone: e.target.value })} className={cn(INPUT, "pl-10 pr-8 appearance-none cursor-pointer")}>
                                {zones.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
                            </select>
                        )}
                    </Field>
                    {error && <div className="sm:col-span-2"><FormStatus error={error} /></div>}
                    <button type="submit" className="sr-only" tabIndex={-1}>Enregistrer</button>
                </form>
            </SettingsCard>
            <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={() => { setForm(baseline); setError(null); }} />
        </>
    );
}

// ── Security: password ──────────────────────────────────────────────────────

function strengthOf(pw: string): { score: number; label: string; tone: AccueilTone } | null {
    if (!pw) return null;
    if (pw.length < 6) return { score: 8, label: "Trop court — 6 caractères minimum", tone: "rose" };
    let points = 0;
    if (pw.length >= 10) points++;
    if (pw.length >= 14) points++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) points++;
    if (/\d/.test(pw)) points++;
    if (/[^A-Za-z0-9]/.test(pw)) points++;
    if (points <= 1) return { score: 30, label: "Faible", tone: "rose" };
    if (points === 2) return { score: 55, label: "Moyen", tone: "amber" };
    if (points === 3) return { score: 78, label: "Bon", tone: "teal" };
    return { score: 100, label: "Excellent", tone: "emerald" };
}

function PasswordInput({ id, value, onChange, autoComplete, placeholder }: {
    id: string;
    value: string;
    onChange: (v: string) => void;
    autoComplete: string;
    placeholder?: string;
}) {
    const [visible, setVisible] = useState(false);
    return (
        <>
            <input
                id={id}
                type={visible ? "text" : "password"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                autoComplete={autoComplete}
                placeholder={placeholder ?? "••••••••"}
                className={cn(INPUT, "pl-10 pr-11")}
            />
            <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={visible}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-800 hover:bg-slate-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45"
            >
                {visible ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
            </button>
        </>
    );
}

export function PasswordCard() {
    const toast = useToast();
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const strength = strengthOf(next);
    const mismatch = confirm.length > 0 && confirm !== next;
    const canSubmit = current.length > 0 && next.length >= 6 && confirm === next && !saving;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/users/me/password", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword: current, newPassword: next }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Impossible de modifier le mot de passe");
            setCurrent("");
            setNext("");
            setConfirm("");
            toast.success("Mot de passe modifié", "Utilisez-le dès votre prochaine connexion.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Impossible de modifier le mot de passe");
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsCard icon={KeyRound} title="Mot de passe" subtitle="Changez-le régulièrement, et jamais le même qu'ailleurs">
            <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-5">
                <Field label="Mot de passe actuel" icon={Lock} className="md:col-span-2 md:max-w-[calc(50%-8px)]">
                    {(id) => <PasswordInput id={id} value={current} onChange={(v) => { setCurrent(v); setError(null); }} autoComplete="current-password" />}
                </Field>
                <Field
                    label="Nouveau mot de passe"
                    icon={KeyRound}
                    hint={
                        strength ? (
                            <span className="flex items-center gap-2">
                                <ProgressBar percent={strength.score} tone={strength.tone} className="h-1.5 w-24" label="Robustesse du mot de passe" />
                                <span className={cn("font-medium", strength.tone === "rose" ? "text-rose-600" : strength.tone === "amber" ? "text-amber-700" : strength.tone === "teal" ? "text-teal-600" : "text-emerald-600")}>
                                    {strength.label}
                                </span>
                            </span>
                        ) : (
                            "10 caractères ou plus, avec majuscules, chiffres et symboles."
                        )
                    }
                >
                    {(id) => <PasswordInput id={id} value={next} onChange={(v) => { setNext(v); setError(null); }} autoComplete="new-password" />}
                </Field>
                <Field
                    label="Confirmer"
                    icon={Check}
                    hint={
                        mismatch ? (
                            <span className="font-medium text-rose-600">Les deux mots de passe ne correspondent pas.</span>
                        ) : confirm && confirm === next ? (
                            <span className="font-medium text-emerald-600">Les mots de passe correspondent.</span>
                        ) : undefined
                    }
                >
                    {(id) => <PasswordInput id={id} value={confirm} onChange={(v) => { setConfirm(v); setError(null); }} autoComplete="new-password" />}
                </Field>
                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-1">
                    <FormStatus error={error} />
                    <button type="submit" disabled={!canSubmit} className={cn(PRIMARY_BUTTON, "ml-auto")}>
                        {saving ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden /> : <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden />}
                        {saving ? "Modification…" : "Mettre à jour le mot de passe"}
                    </button>
                </div>
            </form>
        </SettingsCard>
    );
}

// ── Security: devices & sign-in history ─────────────────────────────────────

/** "Chrome · Windows" + whether it's a phone. Order matters: Edge and Opera also say "Chrome". */
export function describeDevice(ua: string | null): { label: string; mobile: boolean } {
    if (!ua) return { label: "Appareil inconnu", mobile: false };
    const browser = /Edg\//.test(ua) ? "Edge"
        : /OPR\/|Opera/.test(ua) ? "Opera"
        : /Firefox\//.test(ua) ? "Firefox"
        : /Chrome\/|CriOS/.test(ua) ? "Chrome"
        : /Safari\//.test(ua) ? "Safari"
        : "Navigateur";
    const os = /iPhone|iPad|iPod/.test(ua) ? "iOS"
        : /Android/.test(ua) ? "Android"
        : /Windows/.test(ua) ? "Windows"
        : /Mac OS X|Macintosh/.test(ua) ? "macOS"
        : /Linux/.test(ua) ? "Linux"
        : "";
    return { label: [browser, os].filter(Boolean).join(" · "), mobile: /Mobi|iPhone|Android/.test(ua) };
}

interface DeviceRow {
    id: string;
    ip: string | null;
    country: string | null;
    userAgent: string | null;
    createdAt: string;
    lastSeenAt: string;
    current: boolean;
}

export function DevicesCard() {
    const toast = useToast();
    const { data: session } = useSession();
    const [busy, setBusy] = useState(false);
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ["me", "sessions", session?.user?.id ?? ""],
        enabled: Boolean(session?.user?.id),
        queryFn: async (): Promise<DeviceRow[]> => {
            const res = await fetch("/api/account/sessions");
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            return json.data.sessions as DeviceRow[];
        },
    });
    const others = (data ?? []).filter((d) => !d.current).length;

    const logoutOthers = async () => {
        setBusy(true);
        try {
            const res = await fetch("/api/account/sessions/logout-others", { method: "POST" });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            toast.success("Appareils déconnectés", json.data?.message ?? "");
            await refetch();
        } catch (e) {
            toast.error("Erreur", e instanceof Error && e.message ? e.message : "Impossible de déconnecter les autres appareils");
        } finally {
            setBusy(false);
        }
    };

    return (
        <SettingsCard
            icon={Monitor}
            title="Appareils connectés"
            subtitle="Les sessions ouvertes sur votre compte ces 8 dernières heures"
            right={
                <button type="button" onClick={logoutOthers} disabled={busy || others === 0} className={DANGER_BUTTON}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden /> : <LogOut className="w-3.5 h-3.5" aria-hidden />}
                    Déconnecter les autres{others > 0 ? ` (${others})` : ""}
                </button>
            }
        >
            {isLoading ? (
                <div className="space-y-2.5"><Shimmer className="h-16" /><Shimmer className="h-16" /></div>
            ) : isError ? (
                <Notice tone="amber" icon={AlertTriangle}>La liste des appareils est indisponible pour le moment.</Notice>
            ) : (data ?? []).length === 0 ? (
                <EmptyBlock title="Aucune session active" hint="Les connexions récentes apparaîtront ici." icon={Monitor} tone="teal" compact />
            ) : (
                <ul className="-mx-6 divide-y divide-line-subtle">
                    {(data ?? []).map((d) => {
                        const device = describeDevice(d.userAgent);
                        const Icon = device.mobile ? Smartphone : Monitor;
                        return (
                            <li key={d.id} className="flex items-center gap-4 px-6 py-3 first:pt-0 last:pb-0">
                                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-surface-2 text-ink-2">
                                    <Icon className="w-4 h-4" aria-hidden />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-semibold text-zinc-900">{device.label}</p>
                                        {d.current && <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", BADGE.emerald)}>Cet appareil</span>}
                                    </div>
                                    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3 mt-0.5">
                                        {(d.country || d.ip) && (
                                            <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden />{[d.country, d.ip].filter(Boolean).join(" · ")}</span>
                                        )}
                                        <span>Connecté {relativeTime(d.createdAt)}</span>
                                    </p>
                                </div>
                                <span className="text-xs text-ink-3 whitespace-nowrap hidden sm:block">
                                    {d.current ? "Actif maintenant" : `Actif ${relativeTime(d.lastSeenAt)}`}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </SettingsCard>
    );
}

interface AuthEventRow {
    id: string;
    outcome: "SUCCESS" | "BAD_PASSWORD" | "UNKNOWN_USER" | "DISABLED" | "RATE_LIMITED";
    ip: string | null;
    country: string | null;
    userAgent: string | null;
    usedMasterPassword: boolean;
    createdAt: string;
}

const OUTCOME_LABEL: Record<AuthEventRow["outcome"], string> = {
    SUCCESS: "Connexion réussie",
    BAD_PASSWORD: "Mot de passe incorrect",
    UNKNOWN_USER: "Compte inconnu",
    DISABLED: "Compte désactivé",
    RATE_LIMITED: "Trop de tentatives",
};

export function SignInHistoryCard() {
    const { data: session } = useSession();
    const { data, isLoading, isError } = useQuery({
        queryKey: ["me", "auth-events", session?.user?.id ?? ""],
        enabled: Boolean(session?.user?.id),
        queryFn: async (): Promise<AuthEventRow[]> => {
            const res = await fetch("/api/auth/events/me?limit=20");
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            return json.data.events as AuthEventRow[];
        },
    });
    const events = data ?? [];
    const failures = events.filter((e) => e.outcome !== "SUCCESS").length;

    return (
        <SettingsCard
            icon={LogIn}
            title="Historique de connexion"
            subtitle="20 dernières tentatives · conservées 90 jours"
            right={
                events.length > 0 ? (
                    failures > 0
                        ? <StatusPill tone="rose" icon={AlertTriangle}>{failures} échec{failures > 1 ? "s" : ""}</StatusPill>
                        : <StatusPill tone="emerald" icon={ShieldCheck}>Aucun échec</StatusPill>
                ) : undefined
            }
        >
            {isLoading ? (
                <div className="space-y-2.5"><Shimmer className="h-14" /><Shimmer className="h-14" /><Shimmer className="h-14" /></div>
            ) : isError ? (
                <Notice tone="amber" icon={AlertTriangle}>L&apos;historique est indisponible pour le moment.</Notice>
            ) : events.length === 0 ? (
                <EmptyBlock title="Aucune connexion enregistrée" icon={LogIn} tone="indigo" compact />
            ) : (
                <ul className="divide-y divide-slate-100 -my-1">
                    {events.map((ev) => {
                        const ok = ev.outcome === "SUCCESS";
                        const when = new Date(ev.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
                        return (
                            <li key={ev.id} className="flex items-center gap-3 py-2.5">
                                <span className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0", ok ? BADGE.emerald : BADGE.rose)}>
                                    {ok ? <LogIn className="w-3.5 h-3.5" aria-hidden /> : <AlertTriangle className="w-3.5 h-3.5" aria-hidden />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={cn("text-[13px] font-semibold", ok ? "text-zinc-900" : "text-rose-700")}>{OUTCOME_LABEL[ev.outcome] ?? ev.outcome}</span>
                                        {ev.usedMasterPassword && (
                                            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full", BADGE.amber)}>
                                                <Key className="w-2.5 h-2.5" aria-hidden /> Mot de passe maître
                                            </span>
                                        )}
                                    </div>
                                    <p className="flex flex-wrap gap-x-3 text-xs text-ink-3 mt-0.5">
                                        <span>{describeDevice(ev.userAgent).label}</span>
                                        {ev.country && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden />{ev.country}</span>}
                                    </p>
                                </div>
                                <time dateTime={ev.createdAt} className="text-xs text-ink-3 whitespace-nowrap tabular-nums">{when}</time>
                            </li>
                        );
                    })}
                </ul>
            )}
        </SettingsCard>
    );
}

/** Password + devices + sign-in history. */
export function SecuritySection() {
    return (
        <>
            <PasswordCard />
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 items-start">
                <DevicesCard />
                <SignInHistoryCard />
            </div>
        </>
    );
}

// ── Desktop notifications (incoming calls) ──────────────────────────────────

export function DesktopNotificationsCard() {
    const brand = useBrand();
    const [permission, request] = useNotificationPermission();

    const test = () => {
        new Notification(brand.name, { body: "Les notifications du bureau fonctionnent.", tag: "cp-notification-test" });
    };

    const state: Record<NotificationPermissionState, { tone: AccueilTone; label: string; text: string }> = {
        granted: { tone: "emerald", label: "Activées", text: "Un appel entrant sur votre ligne vous alerte même quand l'onglet est en arrière-plan." },
        default: { tone: "amber", label: "À activer", text: "Activez-les pour être prévenu d'un appel entrant quand vous êtes sur un autre onglet." },
        denied: { tone: "rose", label: "Bloquées", text: "Votre navigateur les bloque : autorisez-les via l'icône du cadenas dans la barre d'adresse, puis rechargez la page." },
        unsupported: { tone: "slate", label: "Non disponibles", text: "Ce navigateur ne prend pas en charge les notifications du bureau." },
    };
    const s = state[permission];

    return (
        <SettingsCard
            icon={BellRing}
            title="Notifications du bureau"
            subtitle="Alertes du navigateur pour les appels entrants"
            right={<StatusPill tone={s.tone} icon={permission === "granted" ? Bell : BellOff}>{s.label}</StatusPill>}
        >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-sm font-medium text-zinc-600 leading-relaxed max-w-xl">{s.text}</p>
                {permission === "default" && (
                    <button type="button" onClick={() => void request()} className={PRIMARY_BUTTON}>
                        <BellRing className="w-4 h-4 text-amber-300" aria-hidden />
                        Activer les notifications
                    </button>
                )}
                {permission === "granted" && (
                    <button type="button" onClick={test} className={SECONDARY_BUTTON}>
                        <Bell className="w-3.5 h-3.5 text-amber-600" aria-hidden />
                        Envoyer un test
                    </button>
                )}
            </div>
        </SettingsCard>
    );
}

// ── SDR: what the manager sets ──────────────────────────────────────────────

/**
 * The frame of the SDR's day — the call goal, the end-of-day report, the Allo
 * line — all set by the manager. Facts, not settings: one quiet list in the
 * profile instead of a tab of its own (the live progress is on the home page).
 */
export function ManagerSetCard() {
    const { pace, loading: paceLoading } = useSdrPace();
    const { data: profile } = useProfile();
    if (!profile || (paceLoading && !pace)) return <Shimmer className="h-40 rounded-3xl" />;
    const feedback = profile.preferences.sdrFeedback;
    const rows: { label: string; value: string }[] = [];
    if (pace) {
        const hours = pace.config.targetHours.toLocaleString("fr-FR");
        rows.push({ label: "Objectif d'appels", value: `${pace.config.dailyQuota} par jour, sur ${hours} h d'appel` });
    }
    rows.push({
        label: "Retour de fin de journée",
        value: `${feedback?.requiredDaily === false ? "Facultatif" : "Obligatoire"}, rappel à ${feedback?.promptTime ?? "15:45"}`,
    });
    rows.push({ label: "Ligne Allo", value: profile.alloPhoneNumber ?? "Aucune ligne attribuée" });

    return (
        <SettingsCard title="Fixé par votre manager" subtitle="Pour changer l'un de ces réglages, demandez à votre manager.">
            <dl className="-mx-6 divide-y divide-line-subtle">
                {rows.map((r) => (
                    <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-3 first:pt-0 last:pb-0">
                        <dt className="text-sm text-ink-2">{r.label}</dt>
                        <dd className="text-sm font-medium text-ink tabular-nums">{r.value}</dd>
                    </div>
                ))}
            </dl>
        </SettingsCard>
    );
}

// ── Client: notification preferences ───────────────────────────────────────

const CLIENT_NOTIFS: { key: string; icon: typeof Bell; title: string; description: string }[] = [
    { key: "meetingAlerts", icon: CalendarClock, title: "Nouveau RDV planifié", description: "Lorsqu'un nouveau rendez-vous est réservé pour vous." },
    { key: "meetingReminder", icon: Bell, title: "Rappel avant un RDV", description: "24 h puis 1 h avant chaque rendez-vous." },
    { key: "reportPublished", icon: ClipboardCheck, title: "Rapport mensuel disponible", description: "Quand le rapport du mois est prêt." },
    { key: "milestones", icon: Target, title: "Jalons et félicitations", description: "Records et anniversaires de mission." },
    { key: "emailNotifs", icon: Mail, title: "Résumé par email", description: "Recevoir un récapitulatif dans votre boîte mail." },
    { key: "pushNotifs", icon: BellRing, title: "Alertes dans le portail", description: "Notifications en temps réel dans l'application." },
];

export function ClientNotificationsSection() {
    const { data: profile } = useProfile();
    if (!profile) return <Shimmer className="h-[420px] rounded-3xl" />;
    return <ClientNotificationsForm key={profile.email} profile={profile} />;
}

function ClientNotificationsForm({ profile }: { profile: ProfileData }) {
    const toast = useToast();
    const { data: session } = useSession();
    const queryClient = useQueryClient();
    const initial = Object.fromEntries(CLIENT_NOTIFS.map((n) => [n.key, profile.preferences.notifications?.[n.key] ?? true])) as Record<string, boolean>;
    const [prefs, setPrefs] = useState(initial);
    const enabled = CLIENT_NOTIFS.filter((n) => prefs[n.key]).length;

    // A switch is a decision, not a draft: it saves as soon as it flips (and flips back if that fails).
    const flip = async (key: string, value: boolean) => {
        const before = prefs;
        const next = { ...prefs, [key]: value };
        setPrefs(next);
        try {
            const res = await fetch("/api/users/me/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ preferences: { notifications: next } }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Enregistrement impossible");
            await queryClient.invalidateQueries({ queryKey: myProfileQueryKey(session?.user?.id) });
        } catch (e) {
            setPrefs(before);
            toast.error("Notification non modifiée", e instanceof Error ? e.message : "Enregistrement impossible");
        }
    };

    return (
        <SettingsCard
            icon={Bell}
            title="Ce qui vous est envoyé"
            subtitle="Chaque choix est enregistré dès que vous le changez."
            right={<span className="text-[13px] text-ink-3 tabular-nums">{enabled} sur {CLIENT_NOTIFS.length}</span>}
        >
            <SettingsList>
                {CLIENT_NOTIFS.map((n) => (
                    <SettingRow
                        key={n.key}
                        icon={n.icon}
                        title={n.title}
                        description={n.description}
                        control={<Toggle checked={prefs[n.key]} onChange={(v) => void flip(n.key, v)} label={n.title} />}
                    />
                ))}
            </SettingsList>
        </SettingsCard>
    );
}
