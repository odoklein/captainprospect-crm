"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
    Mail,
    Plus,
    Trash2,
    Check,
    X,
    Loader2,
    AlertCircle,
    ExternalLink,
    Shield,
    Inbox,
    Server,
} from "lucide-react";
import { brand } from "@/lib/brand";

interface EmailAccount {
    id: string;
    provider: "GMAIL" | "OUTLOOK" | "CUSTOM";
    email: string;
    displayName: string | null;
    isActive: boolean;
    lastSyncAt: string | null;
    syncError: string | null;
    createdAt: string;
    source?: "account" | "mailbox";
}

const PROVIDER_INFO = {
    GMAIL: {
        name: "Gmail",
        color: "text-red-600",
        bg: "bg-red-50",
        border: "border-red-200",
        icon: Mail,
    },
    OUTLOOK: {
        name: "Outlook",
        color: "text-blue-600",
        bg: "bg-blue-50",
        border: "border-blue-200",
        icon: Inbox,
    },
    CUSTOM: {
        name: "SMTP/IMAP",
        color: "text-slate-600",
        bg: "bg-slate-50",
        border: "border-slate-200",
        icon: Server,
    },
};

export default function IntegrationsPage() {
    const { data: session } = useSession();
    const [accounts, setAccounts] = useState<EmailAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addType, setAddType] = useState<"GMAIL" | "OUTLOOK" | "CUSTOM" | null>(null);
    const [customForm, setCustomForm] = useState({
        email: "",
        displayName: "",
        smtpHost: "",
        smtpPort: "",
        imapHost: "",
        imapPort: "",
        password: "",
    });
    const [isAdding, setIsAdding] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        loadAccounts();
    }, []);

    // Handle OAuth return (success/error in URL)
    useEffect(() => {
        if (typeof window === "undefined" || !window.location?.search) return;
        const params = new URLSearchParams(window.location.search);
        const success = params.get("success");
        const error = params.get("error");
        if (success === "connected" || success === "reconnected") {
            loadAccounts();
            const clean = window.location.pathname;
            window.history.replaceState({}, "", clean);
        }
        if (error) {
            const clean = window.location.pathname;
            window.history.replaceState({}, "", clean);
        }
    }, []);

    const loadAccounts = async () => {
        try {
            const res = await fetch("/api/email/accounts");
            const json = await res.json();
            if (json.success) {
                setAccounts(json.data);
            }
        } catch (error) {
            console.error("Failed to load accounts:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddCustom = async () => {
        if (!customForm.email.trim()) return;

        setIsAdding(true);
        try {
            const res = await fetch("/api/email/accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...customForm,
                    smtpPort: customForm.smtpPort ? parseInt(customForm.smtpPort) : null,
                    imapPort: customForm.imapPort ? parseInt(customForm.imapPort) : null,
                }),
            });
            const json = await res.json();
            if (json.success) {
                setAccounts([json.data, ...accounts]);
                setShowAddModal(false);
                setAddType(null);
                setCustomForm({ email: "", displayName: "", smtpHost: "", smtpPort: "", imapHost: "", imapPort: "", password: "" });
            }
        } catch (error) {
            console.error("Failed to add account:", error);
        } finally {
            setIsAdding(false);
        }
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch(`/api/email/accounts/${id}`, { method: "DELETE" });
            const json = await res.json();
            if (json.success) {
                setAccounts(accounts.filter((a) => a.id !== id));
            }
        } catch (error) {
            console.error("Failed to delete account:", error);
        } finally {
            setDeletingId(null);
        }
    };

    const handleConnectOAuth = (provider: "GMAIL" | "OUTLOOK") => {
        const returnUrl = typeof window !== "undefined" ? `${window.location.origin}/developer/integrations` : "/developer/integrations";
        const encoded = encodeURIComponent(returnUrl);
        if (provider === "GMAIL") {
            window.location.href = `/api/email/oauth/gmail/connect?returnUrl=${encoded}`;
        } else {
            window.location.href = `/api/email/oauth/outlook/connect?returnUrl=${encoded}`;
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm text-slate-500">Chargement des intégrations...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Premium Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Intégrations Email</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Connectez vos comptes email pour envoyer des emails depuis {brand.name}
                </p>
            </div>

            {/* Premium Add Account Cards */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                        <Plus className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Ajouter un compte</h2>
                        <p className="text-sm text-slate-500">Choisissez votre fournisseur email</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Gmail Card */}
                    <button
                        onClick={() => handleConnectOAuth("GMAIL")}
                        className="dev-integration-card dev-integration-gmail group text-left"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
                                <Mail className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <p className="font-semibold text-slate-900">Gmail</p>
                                <p className="text-xs text-slate-500">Connexion OAuth sécurisée</p>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                            <Shield className="w-3 h-3" />
                            <span>Authentification Google</span>
                        </div>
                    </button>

                    {/* Outlook Card */}
                    <button
                        onClick={() => handleConnectOAuth("OUTLOOK")}
                        className="dev-integration-card dev-integration-outlook group text-left"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
                                <Inbox className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <p className="font-semibold text-slate-900">Outlook</p>
                                <p className="text-xs text-slate-500">Connexion OAuth sécurisée</p>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                            <Shield className="w-3 h-3" />
                            <span>Authentification Microsoft</span>
                        </div>
                    </button>

                    {/* Custom SMTP Card */}
                    <button
                        onClick={() => { setShowAddModal(true); setAddType("CUSTOM"); }}
                        className="dev-integration-card group text-left"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                                <Server className="w-6 h-6 text-slate-600" />
                            </div>
                            <div>
                                <p className="font-semibold text-slate-900">SMTP/IMAP</p>
                                <p className="text-xs text-slate-500">Configuration manuelle</p>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                            <Mail className="w-3 h-3" />
                            <span>Serveur personnalisé</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* Premium Connected Accounts */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <Check className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Comptes connectés</h2>
                            <p className="text-sm text-slate-500">{accounts.length} compte{accounts.length !== 1 ? 's' : ''} actif{accounts.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                </div>

                {accounts.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                            <Mail className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Aucun compte connecté</h3>
                        <p className="text-sm text-slate-500 mb-6">Ajoutez votre premier compte email pour commencer</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {accounts.map((account) => {
                            const provider = PROVIDER_INFO[account.provider];
                            return (
                                <div key={account.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl ${provider.bg} flex items-center justify-center`}>
                                            <provider.icon className={`w-5 h-5 ${provider.color}`} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">{account.email}</p>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${provider.bg} ${provider.color} font-medium`}>
                                                    {provider.name}
                                                </span>
                                                {account.isActive ? (
                                                    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                        Actif
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-xs text-slate-500">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                                        Inactif
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(account.id)}
                                        disabled={deletingId === account.id}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                        {deletingId === account.id ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-5 h-5" />
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Premium Add Custom SMTP Modal */}
            {showAddModal && addType === "CUSTOM" && (
                <div className="fixed inset-0 dev-modal-overlay z-50 flex items-center justify-center p-4">
                    <div className="dev-modal w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                                <Server className="w-5 h-5 text-slate-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Configuration SMTP/IMAP</h2>
                                <p className="text-sm text-slate-500">Configurez votre serveur email</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Email *</label>
                                    <input
                                        type="email"
                                        value={customForm.email}
                                        onChange={(e) => setCustomForm({ ...customForm, email: e.target.value })}
                                        placeholder="email@example.com"
                                        className="dev-input"
                                        autoFocus
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Nom affiché</label>
                                    <input
                                        type="text"
                                        value={customForm.displayName}
                                        onChange={(e) => setCustomForm({ ...customForm, displayName: e.target.value })}
                                        placeholder="John Doe"
                                        className="dev-input"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-200">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">SMTP (Envoi)</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2">
                                        <input
                                            type="text"
                                            value={customForm.smtpHost}
                                            onChange={(e) => setCustomForm({ ...customForm, smtpHost: e.target.value })}
                                            placeholder="smtp.example.com"
                                            className="dev-input"
                                        />
                                    </div>
                                    <div>
                                        <input
                                            type="number"
                                            value={customForm.smtpPort}
                                            onChange={(e) => setCustomForm({ ...customForm, smtpPort: e.target.value })}
                                            placeholder="587"
                                            className="dev-input"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-200">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">IMAP (Réception)</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2">
                                        <input
                                            type="text"
                                            value={customForm.imapHost}
                                            onChange={(e) => setCustomForm({ ...customForm, imapHost: e.target.value })}
                                            placeholder="imap.example.com"
                                            className="dev-input"
                                        />
                                    </div>
                                    <div>
                                        <input
                                            type="number"
                                            value={customForm.imapPort}
                                            onChange={(e) => setCustomForm({ ...customForm, imapPort: e.target.value })}
                                            placeholder="993"
                                            className="dev-input"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Mot de passe</label>
                                <input
                                    type="password"
                                    value={customForm.password}
                                    onChange={(e) => setCustomForm({ ...customForm, password: e.target.value })}
                                    placeholder="••••••••"
                                    className="dev-input"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
                            <button
                                onClick={() => { setShowAddModal(false); setAddType(null); }}
                                className="h-10 px-5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleAddCustom}
                                disabled={!customForm.email.trim() || isAdding}
                                className="dev-btn-primary h-10 px-5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isAdding ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Ajout...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4" />
                                        Ajouter
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
