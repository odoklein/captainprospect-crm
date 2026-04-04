"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    Camera,
    Save,
    Shield,
    Activity,
    User as UserIcon,
    Lock,
    Clock,
    Globe,
    Phone,
    Mail,
    MapPin,
    Calendar,
    Briefcase,
    Zap,
    RotateCcw,
    UserCheck,
    UserX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer } from "@/components/ui/Drawer";
import { Tabs } from "@/components/ui/Tabs";
import { ConfirmModal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui";

interface UserFull {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    avatar?: string | null;
    phone?: string | null;
    timezone?: string | null;
    createdAt: string;
    lastSignInAt?: string | null;
    lastSignInIp?: string | null;
    lastSignInCountry?: string | null;
    lastConnectedAt?: string | null;
    client?: { id: string; name: string } | null;
    _count: {
        assignedMissions: number;
        actions: number;
    };
}

interface Permission {
    id: string;
    code: string;
    name: string;
    description: string | null;
    category: string;
}

interface UserProfileDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    user: UserFull | null;
    clients: { id: string; name: string }[];
    onUserUpdated: (u: UserFull) => void;
}

const ROLE_COLORS: Record<string, string> = {
    MANAGER: "bg-indigo-100 text-indigo-700",
    SDR: "bg-blue-100 text-blue-700",
    BUSINESS_DEVELOPER: "bg-emerald-100 text-emerald-700",
    DEVELOPER: "bg-purple-100 text-purple-700",
    CLIENT: "bg-slate-100 text-slate-700",
};

const ROLE_LABELS: Record<string, string> = {
    MANAGER: "Manager",
    SDR: "SDR",
    BUSINESS_DEVELOPER: "Business Dev",
    DEVELOPER: "Développeur",
    CLIENT: "Client",
};

const ROLE_GRADIENTS: Record<string, string> = {
    MANAGER: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    SDR: "linear-gradient(135deg, #3b82f6, #60a5fa)",
    BUSINESS_DEVELOPER: "linear-gradient(135deg, #10b981, #34d399)",
    DEVELOPER: "linear-gradient(135deg, #a855f7, #c084fc)",
    CLIENT: "linear-gradient(135deg, #94a3b8, #cbd5e1)",
};

const TIMEZONES = [
    "Europe/Paris",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Madrid",
    "Europe/Rome",
    "Europe/Brussels",
    "Europe/Zurich",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Africa/Casablanca",
    "Africa/Tunis",
    "Africa/Algiers",
    "Africa/Dakar",
];

function formatDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function TimelineItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div className="flex items-start gap-3 py-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-slate-500" />
            </div>
            <div className="min-w-0">
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className="text-sm text-slate-900 truncate">{value}</p>
            </div>
        </div>
    );
}

export function UserProfileDrawer({ isOpen, onClose, user, clients, onUserUpdated }: UserProfileDrawerProps) {
    const { success, error: showError } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [activeTab, setActiveTab] = useState("profil");
    const [localAvatar, setLocalAvatar] = useState<string | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);

    // Profile form
    const [profileForm, setProfileForm] = useState({
        name: "",
        email: "",
        phone: "",
        timezone: "",
        role: "",
        clientId: "",
    });
    const [profileSaving, setProfileSaving] = useState(false);

    // Security
    const [newPassword, setNewPassword] = useState("");
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [showStatusConfirm, setShowStatusConfirm] = useState(false);
    const [statusSaving, setStatusSaving] = useState(false);

    // Permissions
    const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
    const [userPermissions, setUserPermissions] = useState<Set<string>>(new Set());
    const [permissionsLoading, setPermissionsLoading] = useState(false);
    const [permissionsLoaded, setPermissionsLoaded] = useState(false);

    // Reset state when user changes
    useEffect(() => {
        if (user) {
            setLocalAvatar(user.avatar ?? null);
            setProfileForm({
                name: user.name,
                email: user.email,
                phone: user.phone ?? "",
                timezone: user.timezone ?? "Europe/Paris",
                role: user.role,
                clientId: user.client?.id ?? "",
            });
            setNewPassword("");
            setActiveTab("profil");
            setPermissionsLoaded(false);
        }
    }, [user]);

    // Lazy-load permissions when tab opens
    useEffect(() => {
        if (activeTab === "permissions" && user && !permissionsLoaded) {
            loadPermissions(user.id);
        }
    }, [activeTab, user, permissionsLoaded]);

    const loadPermissions = async (userId: string) => {
        try {
            setPermissionsLoading(true);
            const [permRes, userPermRes] = await Promise.all([
                fetch("/api/permissions"),
                fetch(`/api/users/${userId}/permissions`),
            ]);
            const [permJson, userPermJson] = await Promise.all([permRes.json(), userPermRes.json()]);
            if (permJson.success) setAllPermissions(permJson.data.permissions);
            if (userPermJson.success) setUserPermissions(new Set(userPermJson.data));
            setPermissionsLoaded(true);
        } catch {
            showError("Erreur", "Impossible de charger les permissions");
        } finally {
            setPermissionsLoading(false);
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        try {
            setAvatarUploading(true);
            const formData = new FormData();
            formData.append("file", file);

            const uploadRes = await fetch("/api/files/upload", { method: "POST", body: formData });
            const uploadJson = await uploadRes.json();
            if (!uploadJson.success) throw new Error(uploadJson.error);

            const avatarUrl = uploadJson.data.url;
            const patchRes = await fetch(`/api/users/${user.id}/avatar`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ avatarUrl }),
            });
            const patchJson = await patchRes.json();
            if (!patchJson.success) throw new Error(patchJson.error);

            setLocalAvatar(avatarUrl);
            onUserUpdated({ ...user, avatar: avatarUrl });
            success("Avatar mis à jour", "La photo de profil a été changée.");
        } catch (err: any) {
            showError("Erreur", err?.message || "Impossible de mettre à jour l'avatar");
        } finally {
            setAvatarUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleProfileSave = async () => {
        if (!user) return;
        try {
            setProfileSaving(true);
            const res = await fetch(`/api/users/${user.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: profileForm.name,
                    email: profileForm.email,
                    phone: profileForm.phone || null,
                    timezone: profileForm.timezone,
                    role: profileForm.role,
                    clientId: profileForm.role === "CLIENT" ? profileForm.clientId || null : null,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);

            onUserUpdated({
                ...user,
                name: profileForm.name,
                email: profileForm.email,
                phone: profileForm.phone || null,
                timezone: profileForm.timezone,
                role: profileForm.role,
            });
            success("Profil mis à jour", "Les informations ont été enregistrées.");
        } catch (err: any) {
            showError("Erreur", err?.message || "Impossible de sauvegarder");
        } finally {
            setProfileSaving(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!user || !newPassword) return;
        try {
            setPasswordSaving(true);
            const res = await fetch(`/api/users/${user.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: newPassword }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            setNewPassword("");
            success("Mot de passe modifié", "Le nouveau mot de passe est actif.");
        } catch (err: any) {
            showError("Erreur", err?.message || "Impossible de modifier le mot de passe");
        } finally {
            setPasswordSaving(false);
        }
    };

    const handleStatusToggle = async () => {
        if (!user) return;
        try {
            setStatusSaving(true);
            const res = await fetch(`/api/users/${user.id}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !user.isActive }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            onUserUpdated({ ...user, isActive: !user.isActive });
            setShowStatusConfirm(false);
            success(
                user.isActive ? "Utilisateur désactivé" : "Utilisateur activé",
                `${user.name} a été ${user.isActive ? "désactivé" : "réactivé"}.`
            );
        } catch (err: any) {
            showError("Erreur", err?.message || "Erreur lors du changement de statut");
        } finally {
            setStatusSaving(false);
        }
    };

    const handlePermissionToggle = async (code: string) => {
        if (!user) return;
        const newPermissions = new Set(userPermissions);
        const granted = !newPermissions.has(code);
        if (granted) newPermissions.add(code); else newPermissions.delete(code);
        setUserPermissions(newPermissions);

        try {
            await fetch(`/api/users/${user.id}/permissions`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ permissions: [{ code, granted }] }),
            });
        } catch {
            // Revert on error
            if (granted) newPermissions.delete(code); else newPermissions.add(code);
            setUserPermissions(new Set(newPermissions));
        }
    };

    const handleResetPermissions = async () => {
        if (!user) return;
        try {
            setPermissionsLoading(true);
            const res = await fetch(`/api/users/${user.id}/reset-permissions`, { method: "POST" });
            const json = await res.json();
            if (json.success) {
                success("Permissions réinitialisées", "Les permissions par défaut ont été assignées.");
                const permRes = await fetch(`/api/users/${user.id}/permissions`);
                const permJson = await permRes.json();
                if (permJson.success) setUserPermissions(new Set(permJson.data));
            } else {
                showError("Erreur", json.error || "Impossible de réinitialiser");
            }
        } catch {
            showError("Erreur", "Impossible de réinitialiser les permissions");
        } finally {
            setPermissionsLoading(false);
        }
    };

    const groupedPermissions = allPermissions.reduce((acc, perm) => {
        if (!acc[perm.category]) acc[perm.category] = [];
        acc[perm.category].push(perm);
        return acc;
    }, {} as Record<string, Permission[]>);

    const categoryLabels: Record<string, string> = {
        pages: "Pages",
        features: "Fonctionnalités",
        actions: "Actions",
    };

    const isOnline = user?.lastConnectedAt
        ? (Date.now() - new Date(user.lastConnectedAt).getTime()) < 5 * 60 * 1000
        : false;

    const tabs = [
        { id: "profil", label: "Profil", icon: <UserIcon className="w-4 h-4" /> },
        { id: "securite", label: "Sécurité", icon: <Lock className="w-4 h-4" /> },
        { id: "permissions", label: "Permissions", icon: <Shield className="w-4 h-4" /> },
        { id: "activite", label: "Activité", icon: <Activity className="w-4 h-4" /> },
    ];

    if (!user) return null;

    const initials = user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

    return (
        <>
            <Drawer isOpen={isOpen} onClose={onClose} size="xl" side="right">
                {/* Header */}
                <div
                    className="-mx-6 -mt-6 mb-6 px-6 pt-8 pb-6 border-b border-slate-200"
                    style={{ background: "linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%)" }}
                >
                    <div className="flex items-center gap-5">
                        {/* Avatar */}
                        <div className="relative group">
                            <div className="w-20 h-20 rounded-full user-avatar-ring overflow-hidden flex-shrink-0">
                                {avatarUploading ? (
                                    <div className="w-full h-full flex items-center justify-center bg-slate-100">
                                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : localAvatar ? (
                                    <img src={localAvatar} alt={user.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div
                                        className="w-full h-full flex items-center justify-center text-white text-xl font-bold"
                                        style={{ background: ROLE_GRADIENTS[user.role] || ROLE_GRADIENTS.CLIENT }}
                                    >
                                        {initials}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute bottom-0 right-0 w-7 h-7 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:bg-indigo-50 hover:border-indigo-300 transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <Camera className="w-3.5 h-3.5 text-slate-600" />
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleAvatarUpload}
                            />
                        </div>

                        <div className="min-w-0">
                            <h2 className="text-xl font-bold text-slate-900 truncate">{user.name}</h2>
                            <p className="text-sm text-slate-500 truncate">{user.email}</p>
                            <div className="flex items-center gap-2 mt-2">
                                <span className={cn(
                                    "inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium",
                                    ROLE_COLORS[user.role] || "bg-slate-100 text-slate-700"
                                )}>
                                    {ROLE_LABELS[user.role] || user.role}
                                </span>
                                <span className={cn(
                                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium",
                                    isOnline ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                                )}>
                                    <span className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        isOnline ? "bg-emerald-500" : "bg-slate-400"
                                    )} />
                                    {isOnline ? "En ligne" : "Hors ligne"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} variant="pills" />

                <div className="mt-6">
                    {/* Profil Tab */}
                    {activeTab === "profil" && (
                        <div className="space-y-5">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">Nom</label>
                                <input
                                    type="text"
                                    value={profileForm.name}
                                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">Email</label>
                                <input
                                    type="email"
                                    value={profileForm.email}
                                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">Téléphone</label>
                                    <input
                                        type="tel"
                                        value={profileForm.phone}
                                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                        placeholder="+33 6 12 34 56 78"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">Fuseau horaire</label>
                                    <select
                                        value={profileForm.timezone}
                                        onChange={(e) => setProfileForm({ ...profileForm, timezone: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                    >
                                        {TIMEZONES.map((tz) => (
                                            <option key={tz} value={tz}>{tz.replace("_", " ")}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">Rôle</label>
                                <select
                                    value={profileForm.role}
                                    onChange={(e) => setProfileForm({ ...profileForm, role: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                >
                                    <option value="SDR">SDR</option>
                                    <option value="BUSINESS_DEVELOPER">Business Developer</option>
                                    <option value="MANAGER">Manager</option>
                                    <option value="DEVELOPER">Développeur</option>
                                    <option value="CLIENT">Client</option>
                                </select>
                            </div>
                            {profileForm.role === "CLIENT" && (
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">Client</label>
                                    <select
                                        value={profileForm.clientId}
                                        onChange={(e) => setProfileForm({ ...profileForm, clientId: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                    >
                                        <option value="">Aucun client</option>
                                        {clients.map((c) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <button
                                onClick={handleProfileSave}
                                disabled={profileSaving}
                                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                {profileSaving ? "Enregistrement..." : "Enregistrer"}
                            </button>
                        </div>
                    )}

                    {/* Sécurité Tab */}
                    {activeTab === "securite" && (
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                                    Réinitialiser le mot de passe
                                </h3>
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">Nouveau mot de passe</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                        placeholder="Minimum 6 caractères"
                                    />
                                </div>
                                <button
                                    onClick={handlePasswordReset}
                                    disabled={passwordSaving || newPassword.length < 6}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
                                >
                                    <Lock className="w-4 h-4" />
                                    {passwordSaving ? "Modification..." : "Modifier le mot de passe"}
                                </button>
                            </div>

                            <div className="border-t border-slate-200 pt-6 space-y-4">
                                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                                    Statut du compte
                                </h3>
                                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                                    <div className="flex items-center gap-3">
                                        {user.isActive ? (
                                            <UserCheck className="w-5 h-5 text-emerald-500" />
                                        ) : (
                                            <UserX className="w-5 h-5 text-red-500" />
                                        )}
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">
                                                {user.isActive ? "Compte actif" : "Compte désactivé"}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {user.isActive
                                                    ? "L'utilisateur peut se connecter"
                                                    : "L'utilisateur ne peut plus se connecter"}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowStatusConfirm(true)}
                                        className={cn(
                                            "px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                                            user.isActive
                                                ? "text-red-600 hover:bg-red-50 border border-red-200"
                                                : "text-emerald-600 hover:bg-emerald-50 border border-emerald-200"
                                        )}
                                    >
                                        {user.isActive ? "Désactiver" : "Activer"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Permissions Tab */}
                    {activeTab === "permissions" && (
                        <div className="space-y-4">
                            {permissionsLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm text-slate-500">
                                            Activez ou désactivez les permissions. Modifications auto-enregistrées.
                                        </p>
                                        <button
                                            onClick={handleResetPermissions}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            Réinitialiser
                                        </button>
                                    </div>
                                    <div className="space-y-5 max-h-[50vh] overflow-y-auto pr-1">
                                        {Object.entries(groupedPermissions).map(([category, perms]) => (
                                            <div key={category}>
                                                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                                    {categoryLabels[category] || category}
                                                </h3>
                                                <div className="space-y-1.5">
                                                    {perms.map((perm) => {
                                                        const isEnabled = userPermissions.has(perm.code);
                                                        return (
                                                            <div
                                                                key={perm.id}
                                                                className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                                                            >
                                                                <div>
                                                                    <p className="text-sm font-medium text-slate-900">{perm.name}</p>
                                                                    {perm.description && (
                                                                        <p className="text-xs text-slate-500">{perm.description}</p>
                                                                    )}
                                                                </div>
                                                                <button
                                                                    onClick={() => handlePermissionToggle(perm.code)}
                                                                    className={cn(
                                                                        "relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0",
                                                                        isEnabled ? "bg-indigo-600" : "bg-slate-300"
                                                                    )}
                                                                    style={{ width: 44, height: 24 }}
                                                                >
                                                                    <span
                                                                        className={cn(
                                                                            "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                                                                            isEnabled && "translate-x-5"
                                                                        )}
                                                                    />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Activité Tab */}
                    {activeTab === "activite" && (
                        <div className="space-y-1">
                            <TimelineItem icon={Calendar} label="Compte créé" value={formatDate(user.createdAt)} />
                            <TimelineItem icon={Clock} label="Dernière connexion" value={formatDate(user.lastConnectedAt)} />
                            <TimelineItem icon={Clock} label="Dernier login" value={formatDate(user.lastSignInAt)} />
                            <TimelineItem icon={Globe} label="Adresse IP" value={user.lastSignInIp || "—"} />
                            <TimelineItem icon={MapPin} label="Pays" value={user.lastSignInCountry || "—"} />
                            <TimelineItem icon={Briefcase} label="Missions assignées" value={String(user._count.assignedMissions)} />
                            <TimelineItem icon={Zap} label="Actions totales" value={String(user._count.actions)} />
                            {user.client && (
                                <TimelineItem icon={UserIcon} label="Client" value={user.client.name} />
                            )}
                        </div>
                    )}
                </div>
            </Drawer>

            <ConfirmModal
                isOpen={showStatusConfirm}
                onClose={() => setShowStatusConfirm(false)}
                onConfirm={handleStatusToggle}
                title={user.isActive ? "Désactiver l'utilisateur" : "Activer l'utilisateur"}
                message={
                    user.isActive
                        ? `Êtes-vous sûr de vouloir désactiver "${user.name}" ? L'utilisateur ne pourra plus se connecter.`
                        : `Êtes-vous sûr de vouloir réactiver "${user.name}" ?`
                }
                confirmText={user.isActive ? "Désactiver" : "Activer"}
                variant={user.isActive ? "warning" : "default"}
                isLoading={statusSaving}
            />
        </>
    );
}
