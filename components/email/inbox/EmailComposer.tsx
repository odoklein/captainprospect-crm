"use client";

import React, { useState, useEffect, useRef, useCallback, useId, useMemo } from "react";
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
    FileText,
    ChevronDown,
} from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import { Button, Callout, ConfirmModal, IconButton, Kbd, Spinner } from "@/components/ui";
import { AiEmailDraftDialog } from "@/components/email/AiEmailDraftDialog";
import { fetchJson, htmlToText, type ComposeDraft } from "./inbox-utils";

// Must match SIGNATURE_MARKER in lib/email/services/sending-service.ts: the
// server replaces it with the mailbox signature (above the quoted message).
const SIGNATURE_MARKER = "<!--cp-signature-->";

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const VAR_RE = /\{\{\s*(\w+(?:\.\w+)?)\s*\}\}/g;

// ============================================
// TYPES
// ============================================

interface SendableMailbox {
    id: string;
    email: string;
    displayName: string | null;
    isOwn: boolean;
    isMissionDefault: boolean;
    owner: { id: string; name: string } | null;
}

interface TemplateOption {
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    source: "mission" | "library";
}

export interface ComposerContext {
    contactId?: string | null;
    missionId?: string | null;
    missionName?: string | null;
    contact?: {
        firstName?: string | null;
        lastName?: string | null;
        title?: string | null;
        email?: string | null;
        companyName?: string | null;
    } | null;
}

interface EmailComposerProps {
    draft: ComposeDraft;
    /** Mailbox selected in the inbox (new message default). */
    defaultMailboxId?: string;
    /** Thread's mailbox for replies/forwards (fixed sender). */
    lockedMailbox?: { id: string; email: string; displayName: string | null } | null;
    context?: ComposerContext;
    onClose: () => void;
    onSent: (result: { threadId?: string; emailId?: string }) => void;
}

// ============================================
// RECIPIENT FIELD
// ============================================

function RecipientField({
    label,
    values,
    onChange,
    autoFocus,
    trailing,
}: {
    label: string;
    values: string[];
    onChange: (v: string[]) => void;
    autoFocus?: boolean;
    trailing?: React.ReactNode;
}) {
    const [input, setInput] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const commit = (raw: string) => {
        const parts = raw.split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean);
        if (parts.length === 0) return;
        const next = [...values];
        for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
        onChange(next);
        setInput("");
    };

    return (
        <div className="flex min-h-9 flex-wrap items-center gap-1.5 border-b border-line px-3 py-1" onClick={() => inputRef.current?.focus()}>
            <span className="w-8 shrink-0 text-xs text-ink-4">{label}</span>
            {values.map((email, i) => {
                const valid = EMAIL_RE.test(email);
                return (
                    <span
                        key={`${email}-${i}`}
                        className={cn(
                            "inline-flex h-6 items-center gap-1 rounded-chip border pl-2 pr-0.5 text-xs",
                            valid ? "border-line bg-surface-2 text-ink" : "border-danger-line bg-danger-soft text-danger-ink",
                        )}
                        title={valid ? email : "Adresse invalide"}
                    >
                        {email}
                        <button
                            type="button"
                            aria-label={`Retirer ${email}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange(values.filter((_, idx) => idx !== i));
                            }}
                            className="flex size-5 items-center justify-center rounded-full text-ink-4 hover:bg-surface-3 hover:text-ink"
                        >
                            <X className="size-3" aria-hidden />
                        </button>
                    </span>
                );
            })}
            <input
                ref={inputRef}
                type="text"
                value={input}
                autoFocus={autoFocus}
                onChange={(e) => {
                    const v = e.target.value;
                    if (/[,;]$/.test(v)) commit(v.slice(0, -1));
                    else setInput(v);
                }}
                onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    if (/[,;\s]/.test(text.trim())) {
                        e.preventDefault();
                        commit(text);
                    }
                }}
                onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === "Tab") && input.trim()) {
                        e.preventDefault();
                        commit(input);
                    } else if (e.key === "Backspace" && !input && values.length > 0) {
                        onChange(values.slice(0, -1));
                    }
                }}
                onBlur={() => input.trim() && commit(input)}
                aria-label={label === "À" ? "Destinataires" : label}
                className="h-7 min-w-[120px] flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
                placeholder={values.length === 0 ? "adresse@entreprise.fr" : ""}
            />
            {trailing}
        </div>
    );
}

// ============================================
// EMAIL COMPOSER
// ============================================

export function EmailComposer({ draft, defaultMailboxId, lockedMailbox, context, onClose, onSent }: EmailComposerProps) {
    const isReply = draft.mode !== "new";
    const [mailboxes, setMailboxes] = useState<SendableMailbox[]>([]);
    const [mailboxesLoading, setMailboxesLoading] = useState(!lockedMailbox);
    const [mailboxId, setMailboxId] = useState<string | undefined>(lockedMailbox?.id ?? draft.mailboxId);
    const [to, setTo] = useState<string[]>(draft.to);
    const [cc, setCc] = useState<string[]>(draft.cc);
    const [bcc, setBcc] = useState<string[]>([]);
    const [showCc, setShowCc] = useState(draft.cc.length > 0);
    const [showBcc, setShowBcc] = useState(false);
    const [subject, setSubject] = useState(draft.subject);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [templateId, setTemplateId] = useState<string | null>(null);
    const [templates, setTemplates] = useState<TemplateOption[] | null>(null);
    const [showTemplates, setShowTemplates] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [confirmUnresolved, setConfirmUnresolved] = useState(false);
    const [showAi, setShowAi] = useState(false);
    const [bodyVersion, setBodyVersion] = useState(0);

    const editorRef = useRef<HTMLDivElement>(null);
    const templatesRef = useRef<HTMLDivElement>(null);
    const fileInputId = useId();

    // ---- Editor initial content (blank line, signature slot, quote) ------
    useEffect(() => {
        if (!editorRef.current) return;
        editorRef.current.innerHTML =
            `<div><br></div>${SIGNATURE_MARKER}` +
            (draft.quotedHtml ? `<div><br></div>${draft.quotedHtml}` : "");
        if (isReply && draft.mode !== "forward") {
            // Caret at the top, ready to type
            const range = document.createRange();
            range.setStart(editorRef.current.firstChild ?? editorRef.current, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            editorRef.current.focus();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- Sendable mailboxes (new message) --------------------------------
    useEffect(() => {
        if (lockedMailbox) return;
        let cancelled = false;
        const mission = context?.missionId ? `&missionId=${encodeURIComponent(context.missionId)}` : "";
        fetchJson<SendableMailbox[]>(`/api/email/mailboxes?scope=sendable${mission}`)
            .then((list) => {
                if (cancelled) return;
                setMailboxes(list);
                setMailboxId((current) => {
                    if (current && list.some((m) => m.id === current)) return current;
                    if (defaultMailboxId && list.some((m) => m.id === defaultMailboxId)) return defaultMailboxId;
                    return list.find((m) => m.isMissionDefault)?.id ?? list[0]?.id;
                });
            })
            .catch(() => !cancelled && setMailboxes([]))
            .finally(() => !cancelled && setMailboxesLoading(false));
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lockedMailbox?.id, context?.missionId]);

    // ---- Templates (lazy, on first open) ---------------------------------
    useEffect(() => {
        if (!showTemplates || templates) return;
        const missionId = context?.missionId;
        Promise.allSettled([
            missionId
                ? fetchJson<{ template: { id: string; name: string; subject: string; bodyHtml: string } }[]>(`/api/missions/${missionId}/templates`)
                : Promise.resolve([]),
            fetchJson<{ id: string; name: string; subject: string; bodyHtml: string }[]>("/api/email/templates"),
        ]).then(([m, lib]) => {
            const out: TemplateOption[] = [];
            const seen = new Set<string>();
            if (m.status === "fulfilled") {
                for (const mt of m.value) {
                    if (!mt.template || seen.has(mt.template.id)) continue;
                    seen.add(mt.template.id);
                    out.push({ ...mt.template, source: "mission" });
                }
            }
            if (lib.status === "fulfilled") {
                for (const t of lib.value) {
                    if (seen.has(t.id)) continue;
                    seen.add(t.id);
                    out.push({ id: t.id, name: t.name, subject: t.subject, bodyHtml: t.bodyHtml, source: "library" });
                }
            }
            setTemplates(out);
        });
    }, [showTemplates, templates, context?.missionId]);

    useEffect(() => {
        if (!showTemplates) return;
        const onDown = (e: MouseEvent) => {
            if (templatesRef.current && !templatesRef.current.contains(e.target as Node)) setShowTemplates(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [showTemplates]);

    // ---- Variables -------------------------------------------------------
    const variables = useMemo(() => {
        const c = context?.contact;
        const v: Record<string, string> = {};
        const set = (k: string, val?: string | null) => {
            if (val && val.trim()) v[k] = val.trim();
        };
        set("firstName", c?.firstName);
        set("lastName", c?.lastName);
        set("fullName", [c?.firstName, c?.lastName].filter(Boolean).join(" "));
        set("title", c?.title);
        set("email", c?.email);
        set("company", c?.companyName);
        set("companyName", c?.companyName);
        const now = new Date();
        v.currentDate = now.toLocaleDateString("fr-FR");
        v.currentDay = now.toLocaleDateString("fr-FR", { weekday: "long" });
        v.currentMonth = now.toLocaleDateString("fr-FR", { month: "long" });
        v.currentYear = String(now.getFullYear());
        return v;
    }, [context?.contact]);

    const substitute = useCallback(
        (text: string) => text.replace(VAR_RE, (m, name: string) => variables[name] ?? m),
        [variables],
    );

    const unresolved = useMemo(() => {
        void bodyVersion;
        const text = `${subject} ${editorRef.current?.innerHTML ?? ""}`;
        const names = new Set<string>();
        for (const m of text.matchAll(VAR_RE)) names.add(m[1]);
        return Array.from(names);
    }, [subject, bodyVersion]);

    // ---- Editor helpers --------------------------------------------------
    const insertAtTop = (html: string) => {
        const el = editorRef.current;
        if (!el) return;
        const first = el.firstElementChild;
        const isBlankFirst = first && first.tagName === "DIV" && first.innerHTML.replace(/<br\s*\/?>/gi, "").trim() === "";
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        if (isBlankFirst) first.replaceWith(wrapper);
        else el.insertBefore(wrapper, el.firstChild);
        setBodyVersion((n) => n + 1);
        el.focus();
    };

    const applyTemplate = (t: TemplateOption) => {
        setTemplateId(t.id);
        if (!isReply || !subject.trim()) setSubject(substitute(t.subject));
        insertAtTop(substitute(t.bodyHtml));
        setShowTemplates(false);
        setConfirmUnresolved(false);
    };

    const exec = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
    };

    const hasContent = () => {
        const text = editorRef.current?.innerText?.trim() ?? "";
        const quotedText = draft.quotedHtml ? htmlToText(draft.quotedHtml) : "";
        return (
            attachments.length > 0 ||
            (draft.mode === "new" && (to.length > 0 || subject.trim().length > 0)) ||
            text.replace(quotedText, "").trim().length > 0
        );
    };

    const requestClose = () => {
        if (hasContent()) setConfirmDiscard(true);
        else onClose();
    };

    // ---- Send ------------------------------------------------------------
    const invalidRecipients = [...to, ...cc, ...bcc].filter((e) => !EMAIL_RE.test(e));
    const totalSize = attachments.reduce((s, f) => s + f.size, 0);
    const overLimit = totalSize > 25 * 1024 * 1024;
    const canSend = !!mailboxId && to.length > 0 && invalidRecipients.length === 0 && !overLimit && !isSending;

    const handleSend = async () => {
        if (!canSend || !editorRef.current) return;
        if (unresolved.length > 0 && !confirmUnresolved && !context?.contactId) {
            setConfirmUnresolved(true);
            return;
        }
        setSendError(null);
        setIsSending(true);
        try {
            const bodyHtml = editorRef.current.innerHTML;
            const bodyText = htmlToText(bodyHtml.replace(SIGNATURE_MARKER, ""));

            const form = new FormData();
            form.append("mailboxId", mailboxId!);
            form.append("to", JSON.stringify(to.map((email) => ({ email }))));
            if (cc.length) form.append("cc", JSON.stringify(cc.map((email) => ({ email }))));
            if (bcc.length) form.append("bcc", JSON.stringify(bcc.map((email) => ({ email }))));
            form.append("subject", subject.trim() || "(Sans objet)");
            form.append("bodyHtml", bodyHtml);
            form.append("bodyText", bodyText);
            if (draft.threadId) form.append("threadId", draft.threadId);
            if (context?.contactId) form.append("contactId", context.contactId);
            if (context?.missionId) form.append("missionId", context.missionId);
            if (templateId) form.append("templateId", templateId);
            attachments.forEach((file, i) => form.append(`attachment_${i}`, file));

            const result = await fetchJson<{ threadId?: string; emailId?: string }>("/api/email/send", {
                method: "POST",
                body: form,
            });
            onSent(result);
        } catch (e) {
            setSendError(e instanceof Error ? e.message : "Erreur lors de l'envoi. Réessayez.");
        } finally {
            setIsSending(false);
        }
    };

    // Ctrl/Cmd+Enter sends, Escape closes (inside the composer only)
    const onComposerKeyDown = (e: React.KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            handleSend();
        } else if (e.key === "Escape" && !showTemplates && !showAi) {
            e.preventDefault();
            e.stopPropagation();
            requestClose();
        }
    };

    const title = draft.mode === "forward" ? "Transférer" : draft.mode === "new" ? "Nouveau message" : draft.mode === "replyAll" ? "Répondre à tous" : "Répondre";
    const fromMailbox = lockedMailbox ?? mailboxes.find((m) => m.id === mailboxId) ?? null;

    return (
        <>
            {isExpanded && !isMinimized && <div className="fixed inset-0 z-40 bg-ink/20" onClick={() => setIsExpanded(false)} aria-hidden />}

            <div
                role="dialog"
                aria-label={title}
                onKeyDown={onComposerKeyDown}
                className={cn(
                    "fixed z-50 flex flex-col overflow-hidden border border-line-strong bg-surface shadow-lg",
                    isMinimized
                        ? "bottom-0 right-4 h-10 w-72 rounded-t-panel"
                        : isExpanded
                            ? "inset-4 rounded-panel sm:inset-10"
                            : "bottom-0 right-0 h-[min(600px,calc(100vh-4rem))] w-full rounded-t-panel sm:right-4 sm:w-[600px]",
                )}
            >
                {/* Header */}
                <div
                    className="flex h-10 shrink-0 cursor-default items-center gap-2 border-b border-line bg-surface-2 pl-3 pr-1"
                    onDoubleClick={() => setIsMinimized((v) => !v)}
                >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                        {title}
                        {isMinimized && subject && <span className="font-normal text-ink-3"> — {subject}</span>}
                    </span>
                    <IconButton size="xs" icon={Minus} label={isMinimized ? "Restaurer" : "Réduire"} onClick={() => setIsMinimized((v) => !v)} />
                    <IconButton
                        size="xs"
                        icon={isExpanded ? Minimize2 : Maximize2}
                        label={isExpanded ? "Taille normale" : "Agrandir"}
                        onClick={() => {
                            setIsExpanded((v) => !v);
                            setIsMinimized(false);
                        }}
                        className="hidden sm:inline-flex"
                    />
                    <IconButton size="xs" icon={X} label="Fermer (Échap)" onClick={requestClose} />
                </div>

                <div className={cn("flex min-h-0 flex-1 flex-col", isMinimized && "hidden")}>
                    {/* From */}
                    <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line px-3">
                        <span className="w-8 shrink-0 text-xs text-ink-4">De</span>
                        {lockedMailbox ? (
                            <span className="truncate text-[13px] text-ink">
                                {lockedMailbox.displayName ? `${lockedMailbox.displayName} <${lockedMailbox.email}>` : lockedMailbox.email}
                            </span>
                        ) : mailboxesLoading ? (
                            <Spinner className="text-ink-4" />
                        ) : mailboxes.length === 0 ? (
                            <span className="text-[13px] text-danger-ink">Aucune boîte d&apos;envoi disponible</span>
                        ) : (
                            <select
                                value={mailboxId ?? ""}
                                onChange={(e) => setMailboxId(e.target.value)}
                                aria-label="Boîte d'envoi"
                                className="h-7 min-w-0 flex-1 cursor-pointer truncate bg-transparent text-[13px] text-ink outline-none"
                            >
                                {mailboxes.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.displayName ? `${m.displayName} <${m.email}>` : m.email}
                                        {m.isMissionDefault ? " — boîte de la mission" : !m.isOwn && m.owner ? ` — ${m.owner.name}` : ""}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <RecipientField
                        label="À"
                        values={to}
                        onChange={setTo}
                        autoFocus={draft.mode === "forward" || (draft.mode === "new" && to.length === 0)}
                        trailing={
                            <span className="ml-auto flex shrink-0 gap-1 text-xs">
                                {!showCc && <button type="button" onClick={() => setShowCc(true)} className="rounded px-1 text-ink-3 hover:text-ink">Cc</button>}
                                {!showBcc && <button type="button" onClick={() => setShowBcc(true)} className="rounded px-1 text-ink-3 hover:text-ink">Cci</button>}
                            </span>
                        }
                    />
                    {showCc && <RecipientField label="Cc" values={cc} onChange={setCc} />}
                    {showBcc && <RecipientField label="Cci" values={bcc} onChange={setBcc} />}

                    <input
                        type="text"
                        value={subject}
                        onChange={(e) => {
                            setSubject(e.target.value);
                            setConfirmUnresolved(false);
                        }}
                        placeholder="Objet"
                        aria-label="Objet"
                        className="h-9 shrink-0 border-b border-line bg-transparent px-3 text-[13px] font-medium text-ink outline-none placeholder:text-ink-4"
                    />

                    {/* Toolbar */}
                    <div className="flex shrink-0 items-center gap-0.5 border-b border-line px-2 py-1">
                        <IconButton size="xs" icon={Bold} label="Gras (Ctrl+B)" onClick={() => exec("bold")} />
                        <IconButton size="xs" icon={Italic} label="Italique (Ctrl+I)" onClick={() => exec("italic")} />
                        <IconButton size="xs" icon={Underline} label="Souligné (Ctrl+U)" onClick={() => exec("underline")} />
                        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
                        <IconButton size="xs" icon={List} label="Liste à puces" onClick={() => exec("insertUnorderedList")} />
                        <IconButton size="xs" icon={ListOrdered} label="Liste numérotée" onClick={() => exec("insertOrderedList")} />
                        <IconButton
                            size="xs"
                            icon={Link2}
                            label="Insérer un lien"
                            onClick={() => {
                                const url = window.prompt("Adresse du lien :", "https://");
                                if (url && /^(https?:|mailto:)/i.test(url)) exec("createLink", url);
                            }}
                        />
                        <span className="mx-1 h-4 w-px bg-line" aria-hidden />

                        <div className="relative" ref={templatesRef}>
                            <Button
                                size="xs"
                                variant="ghost"
                                leftIcon={<FileText className="size-3.5" />}
                                rightIcon={<ChevronDown className="size-3" />}
                                onClick={() => setShowTemplates((v) => !v)}
                                aria-expanded={showTemplates}
                            >
                                Modèles
                            </Button>
                            {showTemplates && (
                                <div className="absolute bottom-full left-0 z-10 mb-1 max-h-72 w-72 overflow-y-auto rounded-panel border border-line bg-surface py-1 shadow-lg sm:bottom-auto sm:top-full sm:mb-0 sm:mt-1">
                                    {templates === null ? (
                                        <p className="flex items-center gap-2 px-3 py-2 text-xs text-ink-3"><Spinner /> Chargement des modèles…</p>
                                    ) : templates.length === 0 ? (
                                        <p className="px-3 py-2 text-xs text-ink-3">Aucun modèle. Créez-en depuis l&apos;onglet Modèles de l&apos;Email Hub.</p>
                                    ) : (
                                        (["mission", "library"] as const).map((src) => {
                                            const items = templates.filter((t) => t.source === src);
                                            if (items.length === 0) return null;
                                            return (
                                                <div key={src}>
                                                    <p className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-ink-4">
                                                        {src === "mission" ? `Mission${context?.missionName ? ` · ${context.missionName}` : ""}` : "Bibliothèque"}
                                                    </p>
                                                    {items.map((t) => (
                                                        <button
                                                            key={t.id}
                                                            type="button"
                                                            onClick={() => applyTemplate(t)}
                                                            className="block w-full px-3 py-1.5 text-left hover:bg-surface-2"
                                                        >
                                                            <span className="block truncate text-[13px] font-medium text-ink">{t.name}</span>
                                                            <span className="block truncate text-2xs text-ink-4">{t.subject}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>

                        <Button size="xs" variant="ghost" leftIcon={<AiMark className="size-3.5" />} onClick={() => setShowAi(true)}>
                            Rédiger avec l&apos;IA
                        </Button>
                    </div>

                    {/* Editor */}
                    <div
                        ref={editorRef}
                        contentEditable
                        suppressContentEditableWarning
                        role="textbox"
                        aria-multiline="true"
                        aria-label="Message"
                        onInput={() => {
                            setBodyVersion((n) => n + 1);
                            setConfirmUnresolved(false);
                        }}
                        className="min-h-[140px] flex-1 overflow-y-auto px-3 py-2.5 text-sm leading-relaxed text-ink outline-none email-scrollbar [&_a]:text-primary-700 [&_a]:underline [&_blockquote]:text-ink-3"
                    />

                    {/* Notices */}
                    <div className="shrink-0 space-y-2 px-3 empty:hidden">
                        {unresolved.length > 0 && (
                            <Callout tone="warning" className="py-2">
                                Variables non remplacées : {unresolved.map((n) => `{{${n}}}`).join(", ")}.
                                {context?.contactId
                                    ? " Elles seront complétées avec la fiche du contact à l'envoi."
                                    : " Aucun contact n'est lié : elles partiront vides."}
                            </Callout>
                        )}
                        {invalidRecipients.length > 0 && (
                            <p className="text-xs text-danger-ink">Adresse invalide : {invalidRecipients.join(", ")}</p>
                        )}
                        {sendError && (
                            <Callout tone="danger" className="py-2">{sendError}</Callout>
                        )}
                    </div>

                    {/* Attachments */}
                    {attachments.length > 0 && (
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
                            {attachments.map((file, i) => (
                                <span key={`${file.name}-${i}`} className="inline-flex h-7 max-w-[200px] items-center gap-1.5 rounded-chip border border-line bg-surface-2 pl-2 pr-0.5 text-xs text-ink-2">
                                    <Paperclip className="size-3 shrink-0 text-ink-4" aria-hidden />
                                    <span className="truncate">{file.name}</span>
                                    <button
                                        type="button"
                                        aria-label={`Retirer ${file.name}`}
                                        onClick={() => setAttachments((a) => a.filter((_, idx) => idx !== i))}
                                        className="flex size-5 items-center justify-center rounded-full text-ink-4 hover:bg-surface-3 hover:text-ink"
                                    >
                                        <X className="size-3" aria-hidden />
                                    </button>
                                </span>
                            ))}
                            <span className={cn("ml-auto text-2xs tabular-nums", overLimit ? "font-semibold text-danger-ink" : "text-ink-4")}>
                                {(totalSize / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo{overLimit && " — limite 25 Mo"}
                            </span>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2">
                        <Button
                            size="sm"
                            onClick={handleSend}
                            disabled={!canSend}
                            isLoading={isSending}
                            leftIcon={!isSending ? <Send className="size-3.5" /> : undefined}
                            variant={confirmUnresolved ? "danger" : "primary"}
                        >
                            {confirmUnresolved ? "Envoyer quand même" : "Envoyer"}
                        </Button>
                        <span className="hidden items-center gap-1 text-2xs text-ink-4 sm:inline-flex">
                            <Kbd>Ctrl</Kbd><Kbd>Entrée</Kbd>
                        </span>
                        <div className="flex-1" />
                        <input
                            id={fileInputId}
                            type="file"
                            multiple
                            className="sr-only"
                            onChange={(e) => {
                                const files = e.target.files ? Array.from(e.target.files) : [];
                                if (files.length) setAttachments((a) => [...a, ...files]);
                                e.target.value = "";
                            }}
                        />
                        <label
                            htmlFor={fileInputId}
                            title="Joindre un fichier"
                            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                        >
                            <Paperclip className="size-3.5" aria-hidden />
                            <span className="sr-only">Joindre un fichier</span>
                        </label>
                        <IconButton size="xs" variant="danger" icon={Trash2} label="Abandonner le brouillon" onClick={requestClose} />
                    </div>
                    {fromMailbox && (
                        <p className="shrink-0 px-3 pb-2 text-3xs text-ink-4">La signature de {fromMailbox.email} est ajoutée à l&apos;envoi.</p>
                    )}
                </div>
            </div>

            <AiEmailDraftDialog
                open={showAi}
                onClose={() => setShowAi(false)}
                subject={subject}
                context={{
                    mode: draft.mode === "forward" ? "forward" : isReply ? "reply" : "new",
                    lastMessage: draft.lastMessageText,
                    lastMessageFrom: draft.lastMessageFrom,
                    recipientName: [context?.contact?.firstName, context?.contact?.lastName].filter(Boolean).join(" ") || undefined,
                    recipientTitle: context?.contact?.title ?? undefined,
                    companyName: context?.contact?.companyName ?? undefined,
                    missionName: context?.missionName ?? undefined,
                    senderName: fromMailbox?.displayName ?? undefined,
                }}
                onInsert={(html) => {
                    insertAtTop(html);
                    setShowAi(false);
                }}
            />

            <ConfirmModal
                isOpen={confirmDiscard}
                onClose={() => setConfirmDiscard(false)}
                onConfirm={() => {
                    setConfirmDiscard(false);
                    onClose();
                }}
                title="Abandonner ce message ?"
                message="Le brouillon n'est pas enregistré : son contenu sera perdu."
                confirmText="Abandonner"
                cancelText="Continuer l'édition"
                variant="danger"
            />
        </>
    );
}

export default EmailComposer;
