"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { User, Bell, Moon, Lock, Loader2, Camera, Check, Shield, Palette } from "lucide-react";

// ============================================
// CHANGE PASSWORD FORM
// ============================================

function ChangePasswordForm() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess(false);
        if (newPassword !== confirmPassword) {
            setError("Les mots de passe ne correspondent pas.");
            return;
        }
        if (newPassword.length < 6) {
            setError("Le nouveau mot de passe doit contenir au moins 6 caractères.");
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch("/api/users/me/password", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const json = await res.json();
            if (json.success) {
                setSuccess(true);
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setTimeout(() => setSuccess(false), 3000);
            } else {
                setError(json.error ?? "Impossible de modifier le mot de passe.");
            }
        } catch {
            setError("Erreur lors de la modification.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Mot de passe actuel</label>
                <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="dev-input"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nouveau mot de passe</label>
                <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    className="dev-input"
                />
                <p className="text-xs text-slate-400 mt-1">Minimum 6 caractères</p>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmer le nouveau mot de passe</label>
                <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="dev-input"
                />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm rounded-xl flex items-center gap-3">
                    <Check className="w-5 h-5" />
                    Mot de passe modifié.
                </div>
            )}
            <button
                type="submit"
                disabled={isLoading}
                className="dev-btn-primary h-11 px-6 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
                {isLoading ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Modification...
                    </>
                ) : (
                    "Modifier le mot de passe"
                )}
            </button>
        </form>
    );
}

export default function SettingsPage() {
    const { data: session } = useSession();
    const [isLoading, setIsLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const [activeTab, setActiveTab] = useState("profile");

    // Profile State
    const [profile, setProfile] = useState({
        name: session?.user?.name || "",
        email: session?.user?.email || "",
    });

    // Preferences State
    const [notifications, setNotifications] = useState({
        email: true,
        push: true,
        projectUpdates: true,
        taskAssignments: true,
    });

    const [darkMode, setDarkMode] = useState(false);

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setSuccessMessage("");

        setTimeout(() => {
            setIsLoading(false);
            setSuccessMessage("Profil mis à jour");
            setTimeout(() => setSuccessMessage(""), 3000);
        }, 1000);
    };

    const tabs = [
        { id: "profile", label: "Mon Profil", icon: User },
        { id: "notifications", label: "Notifications", icon: Bell },
        { id: "appearance", label: "Apparence", icon: Palette },
        { id: "security", label: "Sécurité", icon: Lock },
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Premium Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Gérez vos préférences et informations personnelles
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Premium Sidebar Navigation */}
                <div className="space-y-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === tab.id
                                    ? "bg-blue-50 text-blue-700 shadow-sm"
                                    : "text-slate-600 hover:bg-slate-100"
                                }`}
                        >
                            <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-blue-600' : 'text-slate-400'}`} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="md:col-span-3 space-y-6">
                    {/* Profile Section */}
                    {activeTab === "profile" && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                            <h2 className="text-lg font-semibold text-slate-900 mb-6">Informations personnelles</h2>

                            <form onSubmit={handleProfileUpdate} className="space-y-6">
                                {/* Avatar Section */}
                                <div className="flex items-center gap-6 pb-6 border-b border-slate-100">
                                    <div className="relative group">
                                        <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center text-2xl font-bold text-white">
                                            {profile.name.charAt(0).toUpperCase()}
                                        </div>
                                        <button
                                            type="button"
                                            className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                        >
                                            <Camera className="w-6 h-6 text-white" />
                                        </button>
                                    </div>
                                    <div>
                                        <button type="button" className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
                                            Changer l'avatar
                                        </button>
                                        <p className="text-xs text-slate-400 mt-1">JPG, GIF ou PNG. Max 1MB.</p>
                                    </div>
                                </div>

                                {/* Form Fields */}
                                <div className="grid grid-cols-1 gap-5">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            Nom complet
                                        </label>
                                        <input
                                            type="text"
                                            value={profile.name}
                                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                                            className="dev-input"
                                            placeholder="Votre nom"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            Adresse email
                                        </label>
                                        <input
                                            type="email"
                                            value={profile.email}
                                            disabled
                                            className="dev-input bg-slate-50 cursor-not-allowed text-slate-500"
                                        />
                                        <p className="text-xs text-slate-400 mt-1.5">
                                            L'email ne peut pas être modifié
                                        </p>
                                    </div>
                                </div>

                                {/* Success Message */}
                                {successMessage && (
                                    <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm rounded-xl flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                            <Check className="w-5 h-5" />
                                        </div>
                                        {successMessage}
                                    </div>
                                )}

                                <div className="pt-4 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="dev-btn-primary h-11 px-6 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Enregistrement...
                                            </>
                                        ) : (
                                            "Enregistrer les modifications"
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Notifications Section */}
                    {activeTab === "notifications" && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                            <h2 className="text-lg font-semibold text-slate-900 mb-2">Préférences de notification</h2>
                            <p className="text-sm text-slate-500 mb-6">Configurez comment vous souhaitez être notifié</p>

                            <div className="space-y-4">
                                <NotificationToggle
                                    title="Notifications par email"
                                    description="Recevoir des mises à jour sur vos tâches par email"
                                    checked={notifications.email}
                                    onChange={(c) => setNotifications({ ...notifications, email: c })}
                                />
                                <NotificationToggle
                                    title="Notifications push"
                                    description="Recevoir des notifications dans le navigateur"
                                    checked={notifications.push}
                                    onChange={(c) => setNotifications({ ...notifications, push: c })}
                                />
                                <NotificationToggle
                                    title="Mises à jour de projet"
                                    description="Être notifié des changements importants dans vos projets"
                                    checked={notifications.projectUpdates}
                                    onChange={(c) => setNotifications({ ...notifications, projectUpdates: c })}
                                />
                                <NotificationToggle
                                    title="Assignations de tâches"
                                    description="Recevoir une notification quand une tâche vous est assignée"
                                    checked={notifications.taskAssignments}
                                    onChange={(c) => setNotifications({ ...notifications, taskAssignments: c })}
                                />
                            </div>
                        </div>
                    )}

                    {/* Appearance Section */}
                    {activeTab === "appearance" && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                            <h2 className="text-lg font-semibold text-slate-900 mb-2">Apparence</h2>
                            <p className="text-sm text-slate-500 mb-6">Personnalisez l'apparence de l'application</p>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center">
                                            <Moon className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">Mode sombre</p>
                                            <p className="text-xs text-slate-500">Utiliser un thème sombre pour l'interface</p>
                                        </div>
                                    </div>
                                    <Toggle
                                        checked={darkMode}
                                        onChange={setDarkMode}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Security Section */}
                    {activeTab === "security" && (
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                            <h2 className="text-lg font-semibold text-slate-900 mb-2">Sécurité</h2>
                            <p className="text-sm text-slate-500 mb-6">Gérez la sécurité de votre compte</p>

                            <div className="space-y-6">
                                <div className="p-4 rounded-xl border border-slate-200">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                                            <Shield className="w-6 h-6 text-blue-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">Mot de passe</p>
                                            <p className="text-xs text-slate-500">Modifiez votre mot de passe pour sécuriser votre compte</p>
                                        </div>
                                    </div>
                                    <ChangePasswordForm />
                                </div>

                                <div className="p-4 rounded-xl border border-slate-200">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                                            <Lock className="w-6 h-6 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">Authentification à deux facteurs</p>
                                            <p className="text-xs text-slate-500">Ajoutez une couche de sécurité supplémentaire (à venir)</p>
                                        </div>
                                    </div>
                                    <button disabled className="w-full h-10 px-4 text-sm font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed">
                                        Activer la 2FA (bientôt disponible)
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Premium Notification Toggle Component
function NotificationToggle({
    title,
    description,
    checked,
    onChange
}: {
    title: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
            <div>
                <p className="text-sm font-medium text-slate-900">{title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            </div>
            <Toggle checked={checked} onChange={onChange} />
        </div>
    );
}

// Premium Toggle Switch Component
function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${checked
                    ? "bg-blue-600"
                    : "bg-slate-200"
                }`}
        >
            <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-300 ease-in-out ${checked ? "translate-x-5" : "translate-x-0.5"
                    }`}
                style={{ marginTop: '2px' }}
            />
        </button>
    );
}
