"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { MailboxSwitcher, type MailboxData } from "./MailboxSwitcher";
import { FolderNav } from "./FolderNav";
import { ThreadList } from "./ThreadList";
import { ThreadView } from "./ThreadView";
import { EmailComposer } from "./EmailComposer";
import { EmailOnboarding } from "./EmailOnboarding";
import {
    PanelLeftClose,
    PanelLeftOpen,
    Pencil,
    Loader2,
    ArrowLeft,
    RefreshCw,
    Keyboard,
    CheckCircle2,
    AlertCircle,
    X,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";

// ============================================
// TYPES
// ============================================

export interface InboxLayoutProps {
    initialMailboxId?: string;
    initialFolder?: string;
    showTeamInbox?: boolean;
    className?: string;
    standalone?: boolean;
}

export interface SelectedThread {
    id: string;
    subject: string;
    mailboxId: string;
}

// ============================================
// TOAST SYSTEM
// ============================================

interface Toast {
    id: string;
    type: "success" | "error" | "info";
    message: string;
}

function ToastContainer({
    toasts,
    onDismiss,
}: {
    toasts: Toast[];
    onDismiss: (id: string) => void;
}) {
    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium animate-in slide-in-from-right-5 fade-in duration-300",
                        toast.type === "success" && "bg-emerald-50 border-emerald-200 text-emerald-800",
                        toast.type === "error" && "bg-red-50 border-red-200 text-red-800",
                        toast.type === "info" && "bg-primary-50 border-primary-200 text-primary-800"
                    )}
                >
                    {toast.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                    {toast.type === "error" && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    {toast.type === "info" && <RefreshCw className="w-4 h-4 text-primary-500 flex-shrink-0" />}
                    <span className="flex-1">{toast.message}</span>
                    <button
                        onClick={() => onDismiss(toast.id)}
                        className="p-0.5 rounded-md hover:bg-black/5 transition-colors flex-shrink-0"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}
        </div>
    );
}

// ============================================
// INBOX LAYOUT COMPONENT
// ============================================

export function InboxLayout({
    initialMailboxId,
    initialFolder = "inbox",
    showTeamInbox = false,
    className,
    standalone = false,
}: InboxLayoutProps) {
    // Mailbox state (single source of truth)
    const [mailboxes, setMailboxes] = useState<MailboxData[]>([]);
    const [isLoadingMailboxes, setIsLoadingMailboxes] = useState(true);
    const [mailboxError, setMailboxError] = useState<string | null>(null);

    // Navigation state
    const [selectedMailboxId, setSelectedMailboxId] = useState<string | undefined>(initialMailboxId);
    const [selectedFolder, setSelectedFolder] = useState(initialFolder);
    const [selectedThread, setSelectedThread] = useState<SelectedThread | null>(null);

    // Composer state
    const [isComposerOpen, setIsComposerOpen] = useState(false);
    const [composerReplyTo, setComposerReplyTo] = useState<{
        threadId: string;
        subject: string;
        to: { email: string; name?: string }[];
        cc?: { email: string; name?: string }[];
        isForward?: boolean;
    } | null>(null);

    // Panel visibility
    const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);

    // Mobile state
    const [isMobileThreadOpen, setIsMobileThreadOpen] = useState(false);

    // Thread list refresh trigger
    const [refreshKey, setRefreshKey] = useState(0);

    // Toast notifications
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = useRef(0);

    const hasTriggeredSync = useRef(false);

    // Toast helpers
    const addToast = useCallback((type: Toast["type"], message: string) => {
        const id = `toast-${++toastIdRef.current}`;
        setToasts(prev => [...prev, { id, type, message }]);
        // Auto-dismiss after 4 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Fetch mailboxes (single source of truth)
    const fetchMailboxes = useCallback(async () => {
        try {
            setIsLoadingMailboxes(true);
            setMailboxError(null);
            const response = await fetch('/api/email/mailboxes?includeShared=true', { cache: 'no-store' });
            const result = await response.json();

            if (result.success) {
                const data = result.data || [];
                setMailboxes(data);
                if (!selectedMailboxId && data.length > 0) {
                    setSelectedMailboxId(data[0].id);
                }
            } else {
                setMailboxError(result.error || "Impossible de charger les boîtes mail");
            }
        } catch {
            setMailboxError('Erreur de connexion au serveur');
        } finally {
            setIsLoadingMailboxes(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetchMailboxes();
    }, [fetchMailboxes]);

    // Auto-sync on mount (once mailboxes are loaded)
    useEffect(() => {
        if (mailboxes.length > 0 && !hasTriggeredSync.current) {
            hasTriggeredSync.current = true;
            fetch('/api/email/sync', { method: 'POST' }).catch(() => { });
        }
    }, [mailboxes.length]);

    // Manual sync
    const handleSync = useCallback(async () => {
        setIsSyncing(true);
        try {
            const res = await fetch('/api/email/sync', { method: 'POST' });
            if (!res.ok) throw new Error();
            setRefreshKey(k => k + 1);
            addToast("success", "Synchronisation terminée");
        } catch {
            addToast("error", "Échec de la synchronisation");
        } finally {
            setTimeout(() => setIsSyncing(false), 800);
        }
    }, [addToast]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            if (e.key === 'c' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                handleCompose();
            } else if (e.key === 'Escape') {
                if (isComposerOpen) {
                    // Let composer handle its own close (with discard check)
                } else if (selectedThread) {
                    handleCloseThread();
                }
            } else if (e.key === 'r' && !e.metaKey && !e.ctrlKey && selectedThread) {
                e.preventDefault();
                handleReply({
                    threadId: selectedThread.id,
                    subject: selectedThread.subject.startsWith("Re:") ? selectedThread.subject : `Re: ${selectedThread.subject}`,
                    to: [], // Will be filled by ThreadView
                });
            } else if (e.key === '?' && e.shiftKey) {
                e.preventDefault();
                setShowShortcuts(s => !s);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isComposerOpen, selectedThread]);

    // Handlers
    const handleSelectMailbox = useCallback((mailboxId: string | undefined) => {
        setSelectedMailboxId(mailboxId);
        setSelectedThread(null);
        setIsMobileThreadOpen(false);
    }, []);

    const handleSelectFolder = useCallback((folder: string) => {
        setSelectedFolder(folder);
        setSelectedThread(null);
        setIsMobileThreadOpen(false);
    }, []);

    const handleSelectThread = useCallback((thread: SelectedThread) => {
        setSelectedThread(thread);
        setIsMobileThreadOpen(true); // On mobile, show thread view
    }, []);

    const handleCloseThread = useCallback(() => {
        setSelectedThread(null);
        setIsMobileThreadOpen(false);
    }, []);

    const handleCompose = useCallback(() => {
        setComposerReplyTo(null);
        setIsComposerOpen(true);
    }, []);

    const handleReply = useCallback((replyData: {
        threadId: string;
        subject: string;
        to: { email: string; name?: string }[];
        cc?: { email: string; name?: string }[];
        isForward?: boolean;
    }) => {
        setComposerReplyTo(replyData);
        setIsComposerOpen(true);
    }, []);

    const handleCloseComposer = useCallback(() => {
        setIsComposerOpen(false);
        setComposerReplyTo(null);
    }, []);

    const handleEmailSent = useCallback(() => {
        setIsComposerOpen(false);
        setComposerReplyTo(null);
        setRefreshKey(k => k + 1);
        addToast("success", "Email envoyé avec succès");
    }, [addToast]);

    const handleMailboxConnected = useCallback(() => {
        fetchMailboxes();
        addToast("success", "Boîte mail connectée");
    }, [fetchMailboxes, addToast]);

    const containerHeight = standalone ? "h-screen" : "h-[calc(100vh-8rem)]";

    // Folder label map
    const folderLabels: Record<string, string> = {
        inbox: "Boîte de réception",
        sent: "Envoyés",
        drafts: "Brouillons",
        archive: "Archives",
        trash: "Corbeille",
        starred: "Favoris",
        unread: "Non lus",
    };

    // Loading state
    if (isLoadingMailboxes) {
        return (
            <div className={cn(containerHeight, "flex items-center justify-center bg-white", !standalone && "rounded-2xl border border-slate-200 shadow-sm", className)}>
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <div className="w-14 h-14 rounded-2xl bg-primary-600 flex items-center justify-center">
                            <Loader2 className="w-7 h-7 text-white animate-spin" />
                        </div>
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-slate-700">Chargement de vos emails</p>
                        <p className="text-xs text-slate-400 mt-1">Connexion aux boîtes mail...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Error state for mailbox loading
    if (mailboxError && mailboxes.length === 0) {
        return (
            <div className={cn(containerHeight, "flex items-center justify-center bg-white", !standalone && "rounded-2xl border border-slate-200 shadow-sm", className)}>
                <div className="flex flex-col items-center gap-4 text-center p-8">
                    <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
                        <AlertCircle className="w-7 h-7 text-red-400" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-800 mb-1">Impossible de charger vos emails</p>
                        <p className="text-xs text-slate-400">{mailboxError}</p>
                    </div>
                    <button
                        onClick={fetchMailboxes}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-xl transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Réessayer
                    </button>
                </div>
            </div>
        );
    }

    // No mailboxes - show onboarding
    if (mailboxes.length === 0) {
        return (
            <div className={cn(containerHeight, "bg-white overflow-hidden flex flex-col", !standalone && "rounded-2xl border border-slate-200 shadow-sm", className)}>
                {standalone && (
                    <header className="h-14 flex-shrink-0 flex items-center gap-4 px-5 border-b border-slate-100 bg-white/80 backdrop-blur-xl">
                        <Link href={showTeamInbox ? "/manager/dashboard" : "/sdr"} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors">
                            <ArrowLeft className="w-4 h-4" />
                            <span className="text-sm font-medium">Retour</span>
                        </Link>
                        <div className="flex-1 flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-inverse flex items-center justify-center">
                                <BrandLogo variant="mark" tone="inverse" height={18} />
                            </div>
                            <span className="font-semibold text-slate-800 text-[15px]">Email Hub</span>
                        </div>
                    </header>
                )}
                <div className="flex-1 overflow-auto">
                    <EmailOnboarding onMailboxConnected={handleMailboxConnected} />
                </div>
            </div>
        );
    }

    return (
        <div className={cn(containerHeight, "flex flex-col bg-white overflow-hidden", !standalone && "rounded-2xl border border-slate-200 shadow-sm", className)}>
            {/* Top Header Bar */}
            <header className="h-[52px] flex-shrink-0 flex items-center gap-3 px-4 border-b border-slate-100 bg-white/80 backdrop-blur-xl z-10">
                {/* Left: Back / Logo */}
                <div className="flex items-center gap-3 min-w-0">
                    {/* Mobile: Back button when thread is open */}
                    {isMobileThreadOpen && selectedThread ? (
                        <button
                            onClick={handleCloseThread}
                            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 transition-colors lg:hidden"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    ) : standalone ? (
                        <Link href={showTeamInbox ? "/manager/dashboard" : "/sdr"} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 transition-colors">
                            <ArrowLeft className="w-4 h-4" />
                        </Link>
                    ) : null}
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-inverse flex items-center justify-center">
                            <BrandLogo variant="mark" tone="inverse" height={18} />
                        </div>
                        <span className="font-semibold text-slate-800 text-[15px] hidden sm:inline">Email Hub</span>
                    </div>
                </div>

                {/* Center: Folder name & toggle */}
                <div className="flex-1 flex items-center justify-center">
                    <button
                        onClick={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors mr-2 hidden lg:flex"
                        title={isLeftPanelCollapsed ? "Afficher les dossiers" : "Masquer les dossiers"}
                    >
                        {isLeftPanelCollapsed ? (
                            <PanelLeftOpen className="w-4 h-4" />
                        ) : (
                            <PanelLeftClose className="w-4 h-4" />
                        )}
                    </button>
                    <h1 className="text-sm font-semibold text-slate-700">
                        {isMobileThreadOpen && selectedThread
                            ? (selectedThread.subject || "(Sans objet)")
                            : (folderLabels[selectedFolder] || selectedFolder)}
                    </h1>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                        title="Synchroniser"
                    >
                        <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
                    </button>
                    <button
                        onClick={() => setShowShortcuts(s => !s)}
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors hidden sm:flex"
                        title="Raccourcis clavier (Shift+?)"
                    >
                        <Keyboard className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex flex-1 min-h-0">
                {/* Left Panel - Folders & Mailboxes (hidden on mobile) */}
                <div
                    className={cn(
                        "border-r border-slate-100 flex-col bg-slate-50/30 transition-all duration-300 ease-in-out flex-shrink-0 overflow-hidden hidden lg:flex",
                        isLeftPanelCollapsed ? "w-0" : "w-[240px]"
                    )}
                >
                    {/* Compose Button */}
                    <div className="p-3 pb-1">
                        <button
                            onClick={handleCompose}
                            className="w-full flex items-center justify-center gap-2.5 h-11 px-4 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-500 transition-colors duration-200"
                        >
                            <Pencil className="w-4 h-4" />
                            Nouveau message
                        </button>
                    </div>

                    {/* Mailbox Switcher */}
                    <div className="px-3 py-2">
                        <MailboxSwitcher
                            mailboxes={mailboxes}
                            selectedMailboxId={selectedMailboxId}
                            onSelectMailbox={handleSelectMailbox}
                            onMailboxAdded={fetchMailboxes}
                            showTeamInbox={showTeamInbox}
                        />
                    </div>

                    {/* Folder Navigation */}
                    <div className="flex-1 overflow-y-auto pb-3 email-scrollbar">
                        <FolderNav
                            selectedFolder={selectedFolder}
                            onSelectFolder={handleSelectFolder}
                            mailboxId={selectedMailboxId}
                        />
                    </div>
                </div>

                {/* Center Panel - Thread List / Thread View */}
                <div className="flex-1 flex min-w-0">
                    {/* Thread List - hide on mobile when thread is open */}
                    <div
                        className={cn(
                            "flex flex-col transition-all duration-300 ease-in-out border-r border-slate-100",
                            selectedThread
                                ? "w-[360px] flex-shrink-0 hidden lg:flex"
                                : "flex-1",
                            isMobileThreadOpen && "hidden lg:flex"
                        )}
                    >
                        {/* Mobile compose button (visible only on small screens when left panel is hidden) */}
                        <div className="p-3 pb-0 lg:hidden">
                            <button
                                onClick={handleCompose}
                                className="w-full flex items-center justify-center gap-2.5 h-11 px-4 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-500 transition-colors duration-200"
                            >
                                <Pencil className="w-4 h-4" />
                                Nouveau message
                            </button>
                        </div>

                        <ThreadList
                            mailboxId={selectedMailboxId}
                            folder={selectedFolder}
                            selectedThreadId={selectedThread?.id}
                            onSelectThread={handleSelectThread}
                            refreshKey={refreshKey}
                        />
                    </div>

                    {/* Thread View */}
                    {selectedThread && (
                        <div className={cn(
                            "flex-1 flex flex-col min-w-0 bg-slate-50/50",
                            !isMobileThreadOpen && "hidden lg:flex"
                        )}>
                            <ThreadView
                                threadId={selectedThread.id}
                                mailboxId={selectedThread.mailboxId}
                                onClose={handleCloseThread}
                                onReply={handleReply}
                            />
                        </div>
                    )}

                    {/* No thread selected placeholder (desktop only) */}
                    {!selectedThread && (
                        <div className="flex-1 hidden lg:flex flex-col items-center justify-center bg-slate-50/30">
                            <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                                <BrandLogo variant="mark" height={34} className="opacity-40 grayscale" />
                            </div>
                            <p className="text-sm text-slate-400 font-medium">Sélectionnez un email pour le lire</p>
                            <p className="text-xs text-slate-300 mt-1">ou appuyez sur C pour rédiger un nouveau message</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Composer Modal */}
            {isComposerOpen && (
                <EmailComposer
                    mailboxId={selectedMailboxId}
                    replyTo={composerReplyTo}
                    onClose={handleCloseComposer}
                    onSent={handleEmailSent}
                />
            )}

            {/* Keyboard Shortcuts Overlay */}
            {showShortcuts && (
                <>
                    <div
                        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 animate-in fade-in duration-200"
                        onClick={() => setShowShortcuts(false)}
                    />
                    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-[380px] max-w-[calc(100vw-2rem)] animate-in zoom-in-95 fade-in duration-200">
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">Raccourcis clavier</h3>
                        <div className="space-y-3">
                            {[
                                { key: "C", desc: "Nouveau message" },
                                { key: "Esc", desc: "Fermer / Retour" },
                                { key: "R", desc: "Répondre (dans un thread)" },
                                { key: "Ctrl+Enter", desc: "Envoyer le message" },
                                { key: "Shift + ?", desc: "Afficher les raccourcis" },
                            ].map(s => (
                                <div key={s.key} className="flex items-center justify-between">
                                    <span className="text-sm text-slate-600">{s.desc}</span>
                                    <kbd className="px-2 py-1 text-xs font-mono font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-md">
                                        {s.key}
                                    </kbd>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => setShowShortcuts(false)}
                            className="w-full mt-5 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors"
                        >
                            Fermer
                        </button>
                    </div>
                </>
            )}

            {/* Toast Notifications */}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        </div>
    );
}

export default InboxLayout;
