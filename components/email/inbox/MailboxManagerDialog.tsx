"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
    Mail,
    Plus,
    Settings,
    Trash2,
    RefreshCw,
    CheckCircle,
    AlertCircle,
    Loader2,
    ArrowRight,
    Server,
    X,
} from "lucide-react";

// ============================================
// TYPES
// ============================================

interface Mailbox {
    id: string;
    provider: "GMAIL" | "OUTLOOK" | "CUSTOM" | "REACHINBOX";
    email: string;
    displayName: string | null;
    type: string;
    syncStatus: string;
    warmupStatus: string;
    healthScore: number;
    dailySendLimit: number;
    sentToday: number;
    lastSyncAt: string | null;
    lastError: string | null;
    isActive: boolean;
    createdAt: string;
    _count: {
        threads: number;
        emails: number;
    };
}

// ============================================
// ADD MAILBOX VIEW
// ============================================

interface AddMailboxViewProps {
    onCancel: () => void;
    onSuccess: () => void;
    onMailboxAdded?: () => void;
}

function AddMailboxView({ onCancel, onSuccess, onMailboxAdded }: AddMailboxViewProps) {
    const [step, setStep] = useState<'select' | 'imap' | 'reachinbox'>('select');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [imapForm, setImapForm] = useState({
        email: '',
        password: '',
        displayName: '',
        imapHost: '',
        imapPort: '993',
        smtpHost: '',
        smtpPort: '587',
    });
    const [reachInboxForm, setReachInboxForm] = useState({
        email: '',
        displayName: '',
        apiKey: '',
    });

    const providers = [
        {
            id: 'gmail',
            name: 'Gmail',
            description: 'Connexion sécurisée via Google OAuth',
            color: 'from-red-500 to-orange-500',
            bgColor: 'bg-red-50 hover:bg-red-100',
            borderColor: 'border-red-200',
        },
        {
            id: 'outlook',
            name: 'Outlook / Microsoft 365',
            description: 'Connexion sécurisée via Microsoft OAuth',
            color: 'from-blue-500 to-cyan-500',
            bgColor: 'bg-blue-50 hover:bg-blue-100',
            borderColor: 'border-blue-200',
        },
        {
            id: 'imap',
            name: 'IMAP / SMTP',
            description: 'Configuration manuelle pour tout fournisseur',
            color: 'from-slate-500 to-slate-600',
            bgColor: 'bg-slate-50 hover:bg-slate-100',
            borderColor: 'border-slate-200',
        },
        {
            id: 'reachinbox',
            name: 'ReachInbox',
            description: 'Connexion via clÃ© API ReachInbox',
            color: 'from-emerald-500 to-teal-500',
            bgColor: 'bg-emerald-50 hover:bg-emerald-100',
            borderColor: 'border-emerald-200',
        },
    ];

    const handleProviderSelect = (providerId: string) => {
        if (providerId === 'gmail') {
            window.location.href = '/api/email/oauth/gmail/connect';
        } else if (providerId === 'outlook') {
            window.location.href = '/api/email/oauth/outlook/connect';
        } else if (providerId === 'imap') {
            setStep('imap');
        } else if (providerId === 'reachinbox') {
            setStep('reachinbox');
        }
    };

    const handleImapSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/email/mailboxes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: 'CUSTOM',
                    email: imapForm.email,
                    displayName: imapForm.displayName || imapForm.email.split('@')[0],
                    password: imapForm.password,
                    imapHost: imapForm.imapHost,
                    imapPort: parseInt(imapForm.imapPort),
                    smtpHost: imapForm.smtpHost,
                    smtpPort: parseInt(imapForm.smtpPort),
                }),
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Erreur lors de la connexion');
            }

            onMailboxAdded?.();
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur lors de la connexion');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReachInboxSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/email/mailboxes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: 'REACHINBOX',
                    email: reachInboxForm.email,
                    displayName: reachInboxForm.displayName || reachInboxForm.email.split('@')[0],
                    apiKey: reachInboxForm.apiKey,
                }),
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Erreur lors de la connexion ReachInbox');
            }

            onMailboxAdded?.();
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur lors de la connexion ReachInbox');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
                {step !== 'select' && (
                    <button
                        onClick={() => setStep('select')}
                        className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <ArrowRight className="w-4 h-4 rotate-180 text-slate-500" />
                    </button>
                )}
                <h2 className="text-lg font-semibold text-slate-900">
                    {step === 'select'
                        ? 'Ajouter une boîte mail'
                        : step === 'reachinbox'
                            ? 'Connexion ReachInbox'
                            : 'Configuration IMAP/SMTP'}
                </h2>
            </div>

            {step === 'select' ? (
                <div className="space-y-3">
                    {providers.map((provider) => (
                        <button
                            key={provider.id}
                            onClick={() => handleProviderSelect(provider.id)}
                            className={cn(
                                "w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all",
                                provider.bgColor,
                                provider.borderColor,
                                "hover:shadow-md"
                            )}
                        >
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-lg",
                                provider.color
                            )}>
                                {provider.id === 'imap' || provider.id === 'reachinbox' ? (
                                    <Server className="w-6 h-6 text-white" />
                                ) : (
                                    <Mail className="w-6 h-6 text-white" />
                                )}
                            </div>
                            <div className="flex-1">
                                <h3 className="font-semibold text-slate-900">{provider.name}</h3>
                                <p className="text-sm text-slate-500">{provider.description}</p>
                            </div>
                            <ArrowRight className="w-5 h-5 text-slate-400" />
                        </button>
                    ))}
                    <button
                        onClick={onCancel}
                        className="w-full p-2 text-sm text-slate-500 hover:text-slate-700 mt-2"
                    >
                        Annuler
                    </button>
                </div>
            ) : step === 'reachinbox' ? (
                <form onSubmit={handleReachInboxSubmit} className="space-y-4">
                    {error && (
                        <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Adresse email *
                            </label>
                            <input
                                type="email"
                                required
                                value={reachInboxForm.email}
                                onChange={(e) => setReachInboxForm({ ...reachInboxForm, email: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                placeholder="vous@example.com"
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Nom d&apos;affichage
                            </label>
                            <input
                                type="text"
                                value={reachInboxForm.displayName}
                                onChange={(e) => setReachInboxForm({ ...reachInboxForm, displayName: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                placeholder="Equipe Captain Prospect"
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Cle API ReachInbox *
                            </label>
                            <input
                                type="password"
                                required
                                value={reachInboxForm.apiKey}
                                onChange={(e) => setReachInboxForm({ ...reachInboxForm, apiKey: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                placeholder="ri_..."
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isLoading}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors disabled:opacity-50"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-medium text-sm hover:from-emerald-400 hover:to-teal-500 transition-all disabled:opacity-50"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Connexion...
                                </>
                            ) : (
                                'Connecter'
                            )}
                        </button>
                    </div>
                </form>
            ) : (
                <form onSubmit={handleImapSubmit} className="space-y-4">
                    {error && (
                        <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Adresse email *
                            </label>
                            <input
                                type="email"
                                required
                                value={imapForm.email}
                                onChange={(e) => setImapForm({ ...imapForm, email: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                placeholder="vous@example.com"
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Nom d&apos;affichage
                            </label>
                            <input
                                type="text"
                                value={imapForm.displayName}
                                onChange={(e) => setImapForm({ ...imapForm, displayName: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                placeholder="John Doe"
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Mot de passe / App Password *
                            </label>
                            <input
                                type="password"
                                required
                                value={imapForm.password}
                                onChange={(e) => setImapForm({ ...imapForm, password: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                placeholder="••••••••"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Serveur IMAP *
                            </label>
                            <input
                                type="text"
                                required
                                value={imapForm.imapHost}
                                onChange={(e) => setImapForm({ ...imapForm, imapHost: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                placeholder="imap.example.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Port IMAP *
                            </label>
                            <input
                                type="text"
                                required
                                value={imapForm.imapPort}
                                onChange={(e) => setImapForm({ ...imapForm, imapPort: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                placeholder="993"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Serveur SMTP *
                            </label>
                            <input
                                type="text"
                                required
                                value={imapForm.smtpHost}
                                onChange={(e) => setImapForm({ ...imapForm, smtpHost: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                placeholder="smtp.example.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Port SMTP *
                            </label>
                            <input
                                type="text"
                                required
                                value={imapForm.smtpPort}
                                onChange={(e) => setImapForm({ ...imapForm, smtpPort: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-sm"
                                placeholder="587"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isLoading}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition-colors disabled:opacity-50"
                        >
                            Annuler
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white font-medium text-sm hover:from-indigo-400 hover:to-indigo-500 transition-all disabled:opacity-50"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Connexion...
                                </>
                            ) : (
                                'Connecter'
                            )}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

// ============================================
// MAILBOX MANAGER DIALOG
// ============================================

interface MailboxManagerDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onMailboxAdded?: () => void;
}

export function MailboxManagerDialog({ isOpen, onClose, onMailboxAdded }: MailboxManagerDialogProps) {
    const [view, setView] = useState<'list' | 'add'>('list');
    const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [syncingMailboxes, setSyncingMailboxes] = useState<Set<string>>(new Set());

    const fetchMailboxes = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/email/mailboxes?includeShared=true", { cache: "no-store" });
            const json = await res.json();
            if (json.success) {
                setMailboxes(json.data);
            }
        } catch (error) {
            console.error("Failed to fetch mailboxes:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchMailboxes();
            setView('list');
        }
    }, [isOpen]);

    const handleSync = async (mailboxId: string) => {
        setSyncingMailboxes(prev => new Set([...prev, mailboxId]));
        try {
            const res = await fetch(`/api/email/mailboxes/${mailboxId}/sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ maxThreads: 100 }),
            });
            const json = await res.json();

            if (json.success) {
                // Refresh list to update status if needed
                fetchMailboxes();
            }
        } catch (error) {
            console.error("Sync failed:", error);
        } finally {
            setSyncingMailboxes(prev => {
                const next = new Set(prev);
                next.delete(mailboxId);
                return next;
            });
        }
    };

    const handleDelete = async (mailboxId: string) => {
        if (!confirm("Êtes-vous sûr de vouloir supprimer cette boîte mail ?")) return;

        try {
            await fetch(`/api/email/mailboxes/${mailboxId}`, { method: "DELETE" });
            setMailboxes(prev => prev.filter(m => m.id !== mailboxId));
        } catch (error) {
            console.error("Delete failed:", error);
        }
    };

    const getProviderColor = (provider: string) => {
        switch (provider) {
            case "GMAIL":
                return "#EA4335";
            case "OUTLOOK":
                return "#0078D4";
            case "REACHINBOX":
                return "#10B981";
            default:
                return "#6366F1";
        }
    };

    const getSyncStatusBadge = (status: string) => {
        switch (status) {
            case "SYNCED":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
                        <CheckCircle className="w-3 h-3" />
                        Sync
                    </span>
                );
            case "SYNCING":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Sync...
                    </span>
                );
            case "ERROR":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
                        <AlertCircle className="w-3 h-3" />
                        Erreur
                    </span>
                );
            default:
                return null;
        }
    };

    if (!isOpen) return null;

    return (
        <React.Fragment>
            {/* Overlay */}
            <div className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" onClick={onClose} />

            {/* Dialog */}
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <h2 className="text-xl font-bold text-slate-900">
                        Gestion des boîtes mails
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto email-scrollbar">
                    {view === 'add' ? (
                        <AddMailboxView
                            onCancel={() => setView('list')}
                            onSuccess={() => {
                                setView('list');
                                fetchMailboxes();
                            }}
                            onMailboxAdded={onMailboxAdded}
                        />
                    ) : (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <p className="text-sm text-slate-500">
                                    {mailboxes.length} boîte{mailboxes.length > 1 ? 's' : ''} connectée{mailboxes.length > 1 ? 's' : ''}
                                </p>
                                <button
                                    onClick={() => setView('add')}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                    Ajouter une boîte
                                </button>
                            </div>

                            {isLoading ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[1, 2].map(i => (
                                        <div key={i} className="border border-slate-200 rounded-2xl overflow-hidden">
                                            <div className="h-1.5 w-full skeleton-shimmer" />
                                            <div className="p-4 space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl skeleton-shimmer" />
                                                    <div className="space-y-2 flex-1">
                                                        <div className="h-4 w-32 skeleton-shimmer rounded" />
                                                        <div className="h-3 w-48 skeleton-shimmer rounded" />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {[1, 2, 3].map(j => (
                                                        <div key={j} className="h-14 skeleton-shimmer rounded-lg" />
                                                    ))}
                                                </div>
                                                <div className="flex gap-2">
                                                    <div className="h-9 flex-1 skeleton-shimmer rounded-xl" />
                                                    <div className="h-9 flex-1 skeleton-shimmer rounded-xl" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : mailboxes.length === 0 ? (
                                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4 shadow-sm">
                                        <Mail className="w-8 h-8 text-slate-400" />
                                    </div>
                                    <h3 className="text-lg font-medium text-slate-900 mb-1">
                                        Aucune boîte mail
                                    </h3>
                                    <p className="text-sm text-slate-500 mb-6">
                                        Connectez une boîte mail pour commencer
                                    </p>
                                    <button
                                        onClick={() => setView('add')}
                                        className="text-indigo-600 font-medium hover:underline"
                                    >
                                        Connecter une boîte
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {mailboxes.map((mailbox) => (
                                        <div
                                            key={mailbox.id}
                                            className="group relative bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/10 transition-all"
                                        >
                                            {/* Status Header */}
                                            <div className="h-1.5 w-full" style={{ backgroundColor: getProviderColor(mailbox.provider) }} />

                                            <div className="p-4">
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm"
                                                            style={{ backgroundColor: getProviderColor(mailbox.provider) }}
                                                        >
                                                            {mailbox.email[0].toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <h3 className="font-semibold text-slate-900 truncate max-w-[150px]">
                                                                {mailbox.displayName || mailbox.email}
                                                            </h3>
                                                            <p className="text-xs text-slate-500 truncate max-w-[150px]">
                                                                {mailbox.email}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {getSyncStatusBadge(mailbox.syncStatus)}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDelete(mailbox.id);
                                                            }}
                                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-3 gap-2 mb-4">
                                                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                                                        <span className="block text-lg font-bold text-slate-900">{mailbox._count.threads}</span>
                                                        <span className="text-[10px] text-slate-500 uppercase tracking-wide">Threads</span>
                                                    </div>
                                                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                                                        <span className="block text-lg font-bold text-slate-900">{mailbox.sentToday}</span>
                                                        <span className="text-[10px] text-slate-500 uppercase tracking-wide">Envoyés</span>
                                                    </div>
                                                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                                                        <span className={cn(
                                                            "block text-lg font-bold",
                                                            mailbox.healthScore > 80 ? "text-emerald-500" :
                                                                mailbox.healthScore > 50 ? "text-amber-500" : "text-red-500"
                                                        )}>{mailbox.healthScore}%</span>
                                                        <span className="text-[10px] text-slate-500 uppercase tracking-wide">Santé</span>
                                                    </div>
                                                </div>

                                                {/* Health Score Bar */}
                                                <div className="mb-3">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Santé du compte</span>
                                                        <span className={cn(
                                                            "text-[11px] font-bold",
                                                            mailbox.healthScore > 80 ? "text-emerald-500" :
                                                                mailbox.healthScore > 50 ? "text-amber-500" : "text-red-500"
                                                        )}>{mailbox.healthScore}%</span>
                                                    </div>
                                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={cn(
                                                                "h-full rounded-full transition-all duration-500",
                                                                mailbox.healthScore > 80 ? "bg-emerald-400" :
                                                                    mailbox.healthScore > 50 ? "bg-amber-400" : "bg-red-400"
                                                            )}
                                                            style={{ width: `${mailbox.healthScore}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                {mailbox.lastError && (
                                                    <div className="p-2 mb-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100 flex items-start gap-2">
                                                        <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                                        <span className="line-clamp-2">{mailbox.lastError}</span>
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleSync(mailbox.id)}
                                                        disabled={syncingMailboxes.has(mailbox.id)}
                                                        className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
                                                    >
                                                        {syncingMailboxes.has(mailbox.id) ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <RefreshCw className="w-4 h-4" />
                                                        )}
                                                        Sync
                                                    </button>
                                                    <a
                                                        href={`/manager/email/mailboxes/${mailbox.id}`}
                                                        className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-medium rounded-xl transition-colors"
                                                    >
                                                        <Settings className="w-4 h-4" />
                                                        Config
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </React.Fragment>
    );
}

export default MailboxManagerDialog;
