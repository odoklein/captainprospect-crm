"use client";

import React, { useState, useEffect, useRef, useCallback, useId } from "react";
import { cn } from "@/lib/utils";
import {
    X,
    Minus,
    Maximize2,
    Minimize2,
    Send,
    Paperclip,
    Link2,
    Bold,
    Italic,
    Underline,
    List,
    ListOrdered,
    Trash2,
    Loader2,
    Clock,
    FileText,
    AlertCircle,
    CheckCircle2,
} from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import { AiEmailDraftDialog } from "@/components/email/AiEmailDraftDialog";

// ============================================
// COMMON EMAIL DOMAINS (for @ domain completion)
// ============================================

const COMMON_EMAIL_DOMAINS = [
    "gmail.com",
    "google.com",
    "yahoo.com",
    "yahoo.fr",
    "outlook.com",
    "hotmail.com",
    "hotmail.fr",
    "live.com",
    "live.fr",
    "icloud.com",
    "me.com",
    "protonmail.com",
    "proton.me",
    "orange.fr",
    "free.fr",
    "sfr.fr",
    "laposte.net",
    "wanadoo.fr",
    "bbox.fr",
    "aol.com",
    "msn.com",
    "ymail.com",
    "zoho.com",
    "mail.com",
    "gmx.com",
    "gmx.fr",
];

function getDomainSuggestions(domainFragment: string): string[] {
    const lower = domainFragment.toLowerCase().trim();
    if (!lower) return COMMON_EMAIL_DOMAINS.slice(0, 8);
    if (lower.startsWith(".")) {
        return COMMON_EMAIL_DOMAINS
            .filter((d) => d.endsWith(lower))
            .slice(0, 8);
    }
    return COMMON_EMAIL_DOMAINS
        .filter((d) => d.startsWith(lower) || d.includes(lower))
        .slice(0, 8);
}

// ============================================
// TYPES
// ============================================

interface Mailbox {
    id: string;
    email: string;
    displayName: string | null;
    signature: string | null;
    signatureHtml: string | null;
}

interface EmailComposerProps {
    mailboxId?: string;
    replyTo?: {
        threadId: string;
        subject: string;
        to: { email: string; name?: string }[];
        cc?: { email: string; name?: string }[];
        isForward?: boolean;
    } | null;
    onClose: () => void;
    onSent: () => void;
}

// ============================================
// DISCARD CONFIRMATION DIALOG
// ============================================

function DiscardConfirmDialog({
    onDiscard,
    onCancel,
}: {
    onDiscard: () => void;
    onCancel: () => void;
}) {
    return (
        <>
            <div
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60] animate-in fade-in duration-150"
                onClick={onCancel}
            />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-[360px] animate-in zoom-in-95 fade-in duration-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                        <Trash2 className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                        <h3 className="text-[15px] font-semibold text-slate-900">
                            Supprimer le brouillon ?
                        </h3>
                        <p className="text-sm text-slate-500">
                            Votre message sera perdu.
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
                    >
                        Continuer l&apos;édition
                    </button>
                    <button
                        onClick={onDiscard}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors"
                    >
                        Supprimer
                    </button>
                </div>
            </div>
        </>
    );
}

// ============================================
// EMAIL COMPOSER COMPONENT
// ============================================

export function EmailComposer({
    mailboxId,
    replyTo,
    onClose,
    onSent,
}: EmailComposerProps) {
    // State
    const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
    const [selectedMailboxId, setSelectedMailboxId] = useState(mailboxId);
    const [to, setTo] = useState<string[]>(replyTo?.to.map(t => t.email) || []);
    const [cc, setCc] = useState<string[]>(replyTo?.cc?.map(c => c.email) || []);
    const [bcc, setBcc] = useState<string[]>([]);
    const [subject, setSubject] = useState(replyTo?.subject || "");
    const [attachments, setAttachments] = useState<File[]>([]);

    const [showCc, setShowCc] = useState((replyTo?.cc?.length ?? 0) > 0);
    const [showBcc, setShowBcc] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [sendSuccess, setSendSuccess] = useState(false);
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);

    const [toInput, setToInput] = useState("");
    const [ccInput, setCcInput] = useState("");
    const [bccInput, setBccInput] = useState("");
    const [showAiDraftDialog, setShowAiDraftDialog] = useState(false);

    // Domain suggestion dropdown (for @ completion)
    const [domainSuggestionsField, setDomainSuggestionsField] = useState<"to" | "cc" | "bcc" | null>(null);
    const [domainSuggestions, setDomainSuggestions] = useState<string[]>([]);
    const [domainSuggestionsIndex, setDomainSuggestionsIndex] = useState(0);

    const editorRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fileInputId = useId();
    const hasContentRef = useRef(false);

    // Track if composer has content (for discard warning)
    const checkHasContent = useCallback(() => {
        const bodyContent = editorRef.current?.textContent?.trim() || "";
        hasContentRef.current = !!(to.length > 0 || subject.trim() || bodyContent || attachments.length > 0);
    }, [to, subject, attachments]);

    // Fetch mailboxes
    useEffect(() => {
        let cancelled = false;
        const fetchMailboxes = async () => {
            try {
                const res = await fetch("/api/email/mailboxes");
                const json = await res.json();
                if (cancelled) return;
                if (json.success) {
                    setMailboxes(json.data);
                    if (!selectedMailboxId && json.data.length > 0) {
                        setSelectedMailboxId(json.data[0].id);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch mailboxes:", error);
            }
        };
        fetchMailboxes();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Insert signature on mailbox change
    useEffect(() => {
        const mailbox = mailboxes.find(m => m.id === selectedMailboxId);
        if (mailbox?.signatureHtml && editorRef.current) {
            if (!editorRef.current.innerHTML.trim()) {
                editorRef.current.innerHTML = `<br><br>${mailbox.signatureHtml}`;
            }
        }
    }, [selectedMailboxId, mailboxes]);

    // Update domain suggestions when typing after @
    const updateDomainSuggestions = useCallback((field: "to" | "cc" | "bcc", value: string) => {
        const atIndex = value.indexOf("@");
        if (atIndex === -1) {
            setDomainSuggestionsField(null);
            return;
        }
        const fragment = value.slice(atIndex + 1);
        const suggestions = getDomainSuggestions(fragment);
        if (suggestions.length === 0) {
            setDomainSuggestionsField(null);
            return;
        }
        setDomainSuggestionsField(field);
        setDomainSuggestions(suggestions);
        setDomainSuggestionsIndex(0);
    }, []);

    const applyDomainSuggestion = useCallback((
        field: "to" | "cc" | "bcc",
        domain: string,
        currentValue: string,
        setter: React.Dispatch<React.SetStateAction<string>>,
        listSetter: React.Dispatch<React.SetStateAction<string[]>>
    ) => {
        const atIndex = currentValue.indexOf("@");
        const localPart = (atIndex === -1 ? currentValue : currentValue.slice(0, atIndex)).trim();
        const fullEmail = localPart + "@" + domain;
        if (fullEmail.includes("@") && localPart) {
            listSetter(prev => [...prev, fullEmail]);
            setter("");
        } else {
            setter(fullEmail);
        }
        setDomainSuggestionsField(null);
    }, []);

    // Handle email input
    const handleEmailInput = (
        value: string,
        setter: React.Dispatch<React.SetStateAction<string>>,
        listSetter: React.Dispatch<React.SetStateAction<string[]>>,
        field: "to" | "cc" | "bcc"
    ) => {
        if (value.endsWith(",") || value.endsWith(" ")) {
            const email = value.slice(0, -1).trim();
            if (email && email.includes("@")) {
                listSetter(prev => [...prev, email]);
                setter("");
                setDomainSuggestionsField(null);
            }
        } else {
            setter(value);
            updateDomainSuggestions(field, value);
        }
    };

    const handleEmailKeyDown = (
        e: React.KeyboardEvent,
        value: string,
        setter: React.Dispatch<React.SetStateAction<string>>,
        listSetter: React.Dispatch<React.SetStateAction<string[]>>,
        field: "to" | "cc" | "bcc"
    ) => {
        if (domainSuggestionsField === field && domainSuggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setDomainSuggestionsIndex((i) => (i + 1) % domainSuggestions.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setDomainSuggestionsIndex((i) => (i - 1 + domainSuggestions.length) % domainSuggestions.length);
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                const domain = domainSuggestions[domainSuggestionsIndex];
                applyDomainSuggestion(field, domain, value, setter, listSetter);
                return;
            }
            if (e.key === "Escape") {
                setDomainSuggestionsField(null);
                return;
            }
        }
        if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            const email = value.trim();
            if (email && email.includes("@")) {
                listSetter(prev => [...prev, email]);
                setter("");
                setDomainSuggestionsField(null);
            }
        } else if (e.key === "Backspace" && !value) {
            listSetter(prev => prev.slice(0, -1));
        }
    };

    // Handle attachment (native label + input so file picker opens reliably)
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            // Capture file list synchronously; clearing input below can invalidate it before React runs the state updater
            const toAdd = Array.from(files);
            setAttachments(prev => [...prev, ...toAdd]);
        }
        e.target.value = "";
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    // Format commands
    const execCommand = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
    };

    // Close with unsaved changes check
    const handleClose = useCallback(() => {
        checkHasContent();
        if (hasContentRef.current) {
            setShowDiscardConfirm(true);
        } else {
            onClose();
        }
    }, [checkHasContent, onClose]);

    // Ctrl+Enter to send
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                if (!isSending && selectedMailboxId && to.length > 0) {
                    handleSend();
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSending, selectedMailboxId, to]);

    // Send email
    const handleSend = async () => {
        if (!selectedMailboxId || to.length === 0) return;

        setSendError(null);
        setIsSending(true);

        try {
            const bodyHtml = editorRef.current?.innerHTML || "";
            const bodyText = editorRef.current?.textContent || "";

            const formData = new FormData();
            formData.append("mailboxId", selectedMailboxId);
            formData.append("to", JSON.stringify(to.map(email => ({ email }))));
            if (cc.length > 0) formData.append("cc", JSON.stringify(cc.map(email => ({ email }))));
            if (bcc.length > 0) formData.append("bcc", JSON.stringify(bcc.map(email => ({ email }))));
            formData.append("subject", subject);
            formData.append("bodyHtml", bodyHtml);
            formData.append("bodyText", bodyText);
            if (replyTo?.threadId) formData.append("threadId", replyTo.threadId);

            attachments.forEach((file, index) => {
                formData.append(`attachment_${index}`, file);
            });

            const res = await fetch("/api/email/send", {
                method: "POST",
                body: formData,
            });

            const json = await res.json();

            if (json.success) {
                setSendSuccess(true);
                // Brief success animation before closing
                setTimeout(() => {
                    onSent();
                }, 800);
            } else {
                setSendError(json.error || "Erreur lors de l'envoi. Veuillez réessayer.");
            }
        } catch (error) {
            console.error("Failed to send email:", error);
            setSendError("Erreur de connexion. Vérifiez votre réseau et réessayez.");
        } finally {
            setIsSending(false);
        }
    };

    const selectedMailbox = mailboxes.find(m => m.id === selectedMailboxId);

    // Total attachment size
    const totalAttachmentSize = attachments.reduce((sum, f) => sum + f.size, 0);
    const isOverLimit = totalAttachmentSize > 25 * 1024 * 1024; // 25MB limit

    return (
        <>
            {/* Backdrop for fullscreen */}
            {isFullscreen && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-in fade-in duration-200" />
            )}

            <div
                className={cn(
                    "fixed z-50 bg-white flex flex-col transition-all duration-300 ease-in-out",
                    isMinimized
                        ? "bottom-0 right-4 w-80 h-10 rounded-t-xl shadow-lg border border-slate-200"
                        : isFullscreen
                            ? "inset-6 rounded-2xl shadow-2xl border border-slate-200"
                            : "bottom-0 right-4 w-[620px] max-w-[calc(100vw-2rem)] h-[520px] rounded-t-2xl shadow-2xl border border-slate-200 border-b-0"
                )}
            >
                {/* Header */}
                <div className={cn(
                    "h-11 px-4 flex items-center justify-between flex-shrink-0 transition-colors cursor-default",
                    sendSuccess
                        ? "bg-emerald-600 rounded-t-2xl"
                        : isMinimized
                            ? "bg-slate-800 rounded-t-xl"
                            : "bg-slate-900 rounded-t-2xl"
                )}>
                    <div className="flex items-center gap-2 min-w-0">
                        {sendSuccess ? (
                            <>
                                <CheckCircle2 className="w-4 h-4 text-white" />
                                <span className="text-sm font-medium text-white">Message envoyé</span>
                            </>
                        ) : (
                            <>
                                <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                                <span className="text-sm font-medium text-white truncate">
                                    {replyTo?.isForward ? "Transférer" : replyTo ? "Répondre" : "Nouveau message"}
                                </span>
                                {isMinimized && subject && (
                                    <span className="text-xs text-slate-400 truncate ml-1">
                                        — {subject}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                    {!sendSuccess && (
                        <div className="flex items-center gap-0.5">
                            <button
                                onClick={() => setIsMinimized(!isMinimized)}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                                title={isMinimized ? "Restaurer" : "Minimiser"}
                            >
                                <Minus className="w-3.5 h-3.5 text-slate-300" />
                            </button>
                            <button
                                onClick={() => { setIsFullscreen(!isFullscreen); setIsMinimized(false); }}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                                title={isFullscreen ? "Réduire" : "Plein écran"}
                            >
                                {isFullscreen ? (
                                    <Minimize2 className="w-3.5 h-3.5 text-slate-300" />
                                ) : (
                                    <Maximize2 className="w-3.5 h-3.5 text-slate-300" />
                                )}
                            </button>
                            <button
                                onClick={handleClose}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                                title="Fermer"
                            >
                                <X className="w-3.5 h-3.5 text-slate-300" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Content */}
                {!isMinimized && !sendSuccess && (
                    <>
                        {/* From */}
                        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                            <span className="text-[13px] text-slate-400 w-10 flex-shrink-0 font-medium">De</span>
                            <select
                                value={selectedMailboxId || ""}
                                onChange={(e) => setSelectedMailboxId(e.target.value)}
                                className="flex-1 text-[13px] bg-white text-slate-800 focus:outline-none cursor-pointer font-medium"
                            >
                                {mailboxes.map((mb) => (
                                    <option key={mb.id} value={mb.id} className="text-slate-900 bg-white">
                                        {mb.displayName ? `${mb.displayName} <${mb.email}>` : mb.email}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* To */}
                        <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 flex-wrap min-h-[40px]">
                            <span className="text-[13px] text-slate-400 w-10 flex-shrink-0 font-medium">À</span>
                            {to.map((email, i) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-[12px] rounded-lg font-medium border border-primary-100"
                                >
                                    {email}
                                    <button
                                        onClick={() => setTo(prev => prev.filter((_, idx) => idx !== i))}
                                        className="text-primary-400 hover:text-primary-600 ml-0.5"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                            <div className="relative flex-1 min-w-[100px]">
                                <input
                                    type="email"
                                    value={toInput}
                                    onChange={(e) => handleEmailInput(e.target.value, setToInput, setTo, "to")}
                                    onKeyDown={(e) => handleEmailKeyDown(e, toInput, setToInput, setTo, "to")}
                                    onFocus={() => toInput.includes("@") && updateDomainSuggestions("to", toInput)}
                                    onBlur={() => setTimeout(() => setDomainSuggestionsField(null), 150)}
                                    placeholder={to.length === 0 ? "Destinataires" : ""}
                                    className="w-full text-[13px] bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none"
                                    autoFocus={replyTo?.isForward}
                                />
                                {domainSuggestionsField === "to" && domainSuggestions.length > 0 && (
                                    <ul
                                        className="absolute left-0 top-full z-[100] mt-0.5 min-w-[180px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
                                        role="listbox"
                                    >
                                        {domainSuggestions.map((domain, i) => (
                                            <li
                                                key={domain}
                                                role="option"
                                                aria-selected={i === domainSuggestionsIndex}
                                                className={cn(
                                                    "cursor-pointer px-3 py-2 text-[13px] font-medium",
                                                    i === domainSuggestionsIndex
                                                        ? "bg-primary-50 text-primary-700"
                                                        : "text-slate-700 hover:bg-slate-50"
                                                )}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    applyDomainSuggestion("to", domain, toInput, setToInput, setTo);
                                                }}
                                            >
                                                {domain}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[12px] text-slate-400 flex-shrink-0">
                                {!showCc && (
                                    <button onClick={() => setShowCc(true)} className="hover:text-primary-600 font-medium">
                                        Cc
                                    </button>
                                )}
                                {!showBcc && (
                                    <button onClick={() => setShowBcc(true)} className="hover:text-primary-600 font-medium">
                                        Cci
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Cc */}
                        {showCc && (
                            <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 flex-wrap min-h-[40px]">
                                <span className="text-[13px] text-slate-400 w-10 flex-shrink-0 font-medium">Cc</span>
                                {cc.map((email, i) => (
                                    <span
                                        key={i}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 text-[12px] rounded-lg font-medium"
                                    >
                                        {email}
                                        <button
                                            onClick={() => setCc(prev => prev.filter((_, idx) => idx !== i))}
                                            className="text-slate-400 hover:text-slate-600 ml-0.5"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                                <div className="relative flex-1 min-w-[100px]">
                                    <input
                                        type="email"
                                        value={ccInput}
                                        onChange={(e) => handleEmailInput(e.target.value, setCcInput, setCc, "cc")}
                                        onKeyDown={(e) => handleEmailKeyDown(e, ccInput, setCcInput, setCc, "cc")}
                                        onFocus={() => ccInput.includes("@") && updateDomainSuggestions("cc", ccInput)}
                                        onBlur={() => setTimeout(() => setDomainSuggestionsField(null), 150)}
                                        placeholder="Ajouter en Cc"
                                        className="w-full text-[13px] bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none"
                                    />
                                    {domainSuggestionsField === "cc" && domainSuggestions.length > 0 && (
                                        <ul className="absolute left-0 top-full z-[100] mt-0.5 min-w-[180px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
                                            {domainSuggestions.map((domain, i) => (
                                                <li
                                                    key={domain}
                                                    role="option"
                                                    aria-selected={i === domainSuggestionsIndex}
                                                    className={cn(
                                                        "cursor-pointer px-3 py-2 text-[13px] font-medium",
                                                        i === domainSuggestionsIndex ? "bg-primary-50 text-primary-700" : "text-slate-700 hover:bg-slate-50"
                                                    )}
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        applyDomainSuggestion("cc", domain, ccInput, setCcInput, setCc);
                                                    }}
                                                >
                                                    {domain}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Bcc */}
                        {showBcc && (
                            <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 flex-wrap min-h-[40px]">
                                <span className="text-[13px] text-slate-400 w-10 flex-shrink-0 font-medium">Cci</span>
                                {bcc.map((email, i) => (
                                    <span
                                        key={i}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 text-[12px] rounded-lg font-medium"
                                    >
                                        {email}
                                        <button
                                            onClick={() => setBcc(prev => prev.filter((_, idx) => idx !== i))}
                                            className="text-slate-400 hover:text-slate-600 ml-0.5"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                                <div className="relative flex-1 min-w-[100px]">
                                    <input
                                        type="email"
                                        value={bccInput}
                                        onChange={(e) => handleEmailInput(e.target.value, setBccInput, setBcc, "bcc")}
                                        onKeyDown={(e) => handleEmailKeyDown(e, bccInput, setBccInput, setBcc, "bcc")}
                                        onFocus={() => bccInput.includes("@") && updateDomainSuggestions("bcc", bccInput)}
                                        onBlur={() => setTimeout(() => setDomainSuggestionsField(null), 150)}
                                        placeholder="Ajouter en Cci"
                                        className="w-full text-[13px] bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none"
                                    />
                                    {domainSuggestionsField === "bcc" && domainSuggestions.length > 0 && (
                                        <ul className="absolute left-0 top-full z-[100] mt-0.5 min-w-[180px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
                                            {domainSuggestions.map((domain, i) => (
                                                <li
                                                    key={domain}
                                                    role="option"
                                                    aria-selected={i === domainSuggestionsIndex}
                                                    className={cn(
                                                        "cursor-pointer px-3 py-2 text-[13px] font-medium",
                                                        i === domainSuggestionsIndex ? "bg-primary-50 text-primary-700" : "text-slate-700 hover:bg-slate-50"
                                                    )}
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        applyDomainSuggestion("bcc", domain, bccInput, setBccInput, setBcc);
                                                    }}
                                                >
                                                    {domain}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Subject */}
                        <div className="px-4 py-2.5 border-b border-slate-100">
                            <input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="Objet"
                                className="w-full text-[14px] bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none font-medium"
                            />
                        </div>

                        {/* Formatting toolbar */}
                        <div className="px-3 py-1.5 border-b border-slate-100 flex items-center gap-0.5 bg-slate-50/50">
                            {[
                                { cmd: "bold", icon: Bold, title: "Gras (Ctrl+B)" },
                                { cmd: "italic", icon: Italic, title: "Italique (Ctrl+I)" },
                                { cmd: "underline", icon: Underline, title: "Souligné (Ctrl+U)" },
                            ].map(({ cmd, icon: Icon, title }) => (
                                <button
                                    key={cmd}
                                    onClick={() => execCommand(cmd)}
                                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                                    title={title}
                                >
                                    <Icon className="w-4 h-4" />
                                </button>
                            ))}
                            <div className="w-px h-4 bg-slate-200 mx-0.5" />
                            <button
                                onClick={() => execCommand("insertUnorderedList")}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                                title="Liste à puces"
                            >
                                <List className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => execCommand("insertOrderedList")}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                                title="Liste numérotée"
                            >
                                <ListOrdered className="w-4 h-4" />
                            </button>
                            <div className="w-px h-4 bg-slate-200 mx-0.5" />
                            <button
                                onClick={() => {
                                    const url = prompt("URL du lien:");
                                    if (url) execCommand("createLink", url);
                                }}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                                title="Insérer un lien"
                            >
                                <Link2 className="w-4 h-4" />
                            </button>
                            <div className="w-px h-4 bg-slate-200 mx-0.5" />
                            <button
                                onClick={() => setShowAiDraftDialog(true)}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-primary-50 text-primary-600 transition-colors"
                                title="Rédaction assistée par IA"
                            >
                                <AiMark className="w-4 h-4" />
                                <span className="text-[11px] font-bold">IA</span>
                            </button>
                        </div>

                        {/* Editor */}
                        <div
                            ref={editorRef}
                            contentEditable
                            data-placeholder="Rédigez votre message..."
                            className="flex-1 px-4 py-3 text-[14px] text-slate-800 overflow-y-auto focus:outline-none bg-white leading-relaxed email-scrollbar"
                            style={{ minHeight: "150px" }}
                            onInput={checkHasContent}
                        />

                        {/* Send Error */}
                        {sendError && (
                            <div className="mx-4 mb-2 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] text-red-700 font-medium">{sendError}</p>
                                </div>
                                <button
                                    onClick={() => setSendError(null)}
                                    className="text-red-400 hover:text-red-600 flex-shrink-0"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}

                        {/* Attachments */}
                        {attachments.length > 0 && (
                            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                        {attachments.length} pièce{attachments.length > 1 ? "s" : ""} jointe{attachments.length > 1 ? "s" : ""}
                                    </span>
                                    <span className={cn(
                                        "text-[11px]",
                                        isOverLimit ? "text-red-500 font-semibold" : "text-slate-400"
                                    )}>
                                        {(totalAttachmentSize / (1024 * 1024)).toFixed(1)} MB
                                        {isOverLimit && " (limite 25 MB)"}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {attachments.map((file, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl group"
                                        >
                                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="text-[12px] text-slate-600 truncate max-w-[120px] font-medium">
                                                {file.name}
                                            </span>
                                            <button
                                                onClick={() => removeAttachment(i)}
                                                className="text-slate-400 hover:text-red-500 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between bg-white rounded-b-2xl">
                            <div className="flex items-center gap-0.5">
                                <input
                                    ref={fileInputRef}
                                    id={fileInputId}
                                    type="file"
                                    multiple
                                    className="sr-only"
                                    onChange={handleFileSelect}
                                    accept="*/*"
                                />
                                <label
                                    htmlFor={fileInputId}
                                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer inline-flex"
                                    title="Joindre un fichier"
                                >
                                    <Paperclip className="w-4 h-4" />
                                </label>
                                <button
                                    onClick={() => setShowSchedule(!showSchedule)}
                                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                                    title="Programmer l'envoi"
                                >
                                    <Clock className="w-4 h-4" />
                                </button>
                                <div className="w-px h-4 bg-slate-200 mx-1" />
                                <button
                                    onClick={handleClose}
                                    className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                                    title="Supprimer le brouillon"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-slate-400 hidden sm:inline">
                                    Ctrl+Entrée pour envoyer
                                </span>
                                <button
                                    onClick={handleSend}
                                    disabled={isSending || !selectedMailboxId || to.length === 0 || isOverLimit}
                                    className={cn(
                                        "flex items-center gap-2 px-5 py-2 text-white text-sm font-semibold rounded-xl transition-all duration-200",
                                        isSending || !selectedMailboxId || to.length === 0 || isOverLimit
                                            ? "bg-slate-300 cursor-not-allowed"
                                            : "bg-primary-600 hover:bg-primary-500"
                                    )}
                                >
                                    {isSending ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4" />
                                    )}
                                    {isSending ? "Envoi..." : "Envoyer"}
                                </button>
                            </div>
                        </div>
                    </>
                )}

                <AiEmailDraftDialog
                    open={showAiDraftDialog}
                    onClose={() => setShowAiDraftDialog(false)}
                    subject={subject}
                    onInsert={(html) => {
                        if (editorRef.current) {
                            const current = editorRef.current.innerHTML || "";
                            editorRef.current.innerHTML = current + html;
                            editorRef.current.focus();
                        }
                        setShowAiDraftDialog(false);
                    }}
                />
            </div>

            {/* Discard Confirmation */}
            {showDiscardConfirm && (
                <DiscardConfirmDialog
                    onDiscard={onClose}
                    onCancel={() => setShowDiscardConfirm(false)}
                />
            )}
        </>
    );
}

export default EmailComposer;
