"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
    ArrowLeft,
    Star,
    Archive,
    ArchiveRestore,
    Trash2,
    Reply,
    ReplyAll,
    Forward,
    Download,
    FileImage,
    FileText,
    FileSpreadsheet,
    FileArchive,
    Paperclip,
    PanelRightOpen,
    PanelRightClose,
    RefreshCw,
    Eye,
    MoreHorizontal,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { AiMark } from "@/components/ui/AiMark";
import { Avatar, Badge, Button, Callout, IconButton, Kbd, Skeleton, Spinner } from "@/components/ui";
import {
    displayName,
    formatFileSize,
    formatFullDate,
    messageDate,
    messagePlainText,
    sanitizeEmailHtml,
    type ComposeMode,
    type EmailMessage,
    type ThreadDetail,
} from "./inbox-utils";

// ============================================
// TYPES
// ============================================

interface ThreadViewProps {
    thread: ThreadDetail | null;
    isLoading: boolean;
    error: string | null;
    onRetry: () => void;
    onClose: () => void;
    onCompose: (mode: Exclude<ComposeMode, "new">) => void;
    onStar: () => void;
    onArchive: () => void;
    onTrash: () => void;
    isContextOpen: boolean;
    onToggleContext: () => void;
}

// ============================================
// HELPERS
// ============================================

function FileTypeIcon({ mimeType }: { mimeType: string }) {
    const Icon = mimeType.startsWith("image/")
        ? FileImage
        : mimeType === "application/pdf" || mimeType.includes("word") || mimeType.includes("document")
            ? FileText
            : mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")
                ? FileSpreadsheet
                : mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("compressed")
                    ? FileArchive
                    : Paperclip;
    return <Icon className="size-4 shrink-0 text-ink-3" aria-hidden />;
}

/** Split a message at its quoted history (Gmail, Outlook, Apple Mail, plain blockquote). */
function splitQuoted(html: string): { main: string; quoted: string | null } {
    const markers = [
        /<div[^>]+class="[^"]*gmail_quote/i,
        /<div[^>]+id="(divRplyFwdMsg|appendonsend)"/i,
        /<blockquote[^>]+type="cite"/i,
        /<blockquote/i,
    ];
    for (const re of markers) {
        const m = re.exec(html);
        if (m && m.index > 40) return { main: html.slice(0, m.index), quoted: html.slice(m.index) };
    }
    return { main: html, quoted: null };
}

// ============================================
// THREAD VIEW
// ============================================

export function ThreadView({
    thread,
    isLoading,
    error,
    onRetry,
    onClose,
    onCompose,
    onStar,
    onArchive,
    onTrash,
    isContextOpen,
    onToggleContext,
}: ThreadViewProps) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [recaps, setRecaps] = useState<Record<string, { text?: string; loading?: boolean; error?: string }>>({});
    const endRef = useRef<HTMLDivElement>(null);
    const threadId = thread?.id;

    // Expand the last message and every unread-looking inbound one (last 2)
    useEffect(() => {
        if (!thread) return;
        const ids = thread.emails.map((e) => e.id);
        setExpanded(new Set(ids.slice(-1)));
        setRecaps({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId]);

    useEffect(() => {
        if (thread && endRef.current) endRef.current.scrollIntoView({ block: "end" });
    }, [threadId, thread?.emails.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = (id: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const requestRecap = useCallback(async (email: EmailMessage) => {
        const text = messagePlainText(email);
        if (!text) return;
        setRecaps((r) => ({ ...r, [email.id]: { loading: true } }));
        try {
            const res = await fetch("/api/ai/mistral/email-recap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emailBodyText: text.slice(0, 15000) }),
            });
            const json = await res.json();
            setRecaps((r) => ({
                ...r,
                [email.id]: json.success && json.data?.recap ? { text: json.data.recap } : { error: json.error || "Résumé indisponible" },
            }));
        } catch {
            setRecaps((r) => ({ ...r, [email.id]: { error: "Résumé indisponible" } }));
        }
    }, []);

    // ---- Loading ------------------------------------------------------
    if (isLoading && !thread) {
        return (
            <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
                <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
                    <Skeleton className="h-7 w-7" />
                    <Skeleton className="h-7 w-7" />
                    <Skeleton className="h-7 w-7" />
                </div>
                <div className="space-y-4 p-6">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-3 w-40" />
                    <div className="space-y-3 rounded-panel border border-line bg-surface p-4">
                        <div className="flex items-center gap-3">
                            <Skeleton className="size-9 rounded-xl" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-3.5 w-40" />
                                <Skeleton className="h-3 w-56" />
                            </div>
                        </div>
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-11/12" />
                        <Skeleton className="h-3 w-3/4" />
                    </div>
                </div>
            </div>
        );
    }

    // ---- Error --------------------------------------------------------
    if (error || !thread) {
        return (
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex h-11 shrink-0 items-center border-b border-line px-3">
                    <IconButton size="sm" icon={ArrowLeft} label="Retour à la liste (Échap)" onClick={onClose} />
                </div>
                <div className="p-6">
                    <Callout
                        tone="danger"
                        title="Impossible d'ouvrir cette conversation"
                        action={
                            <div className="flex gap-2">
                                <Button size="sm" variant="secondary" leftIcon={<RefreshCw className="size-3.5" />} onClick={onRetry}>Réessayer</Button>
                                <Button size="sm" variant="ghost" onClick={onClose}>Retour à la liste</Button>
                            </div>
                        }
                    >
                        {error || "Conversation introuvable."}
                    </Callout>
                </div>
            </div>
        );
    }

    const messageCount = thread.emails.length;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {/* Toolbar */}
            <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
                <IconButton size="sm" icon={ArrowLeft} label="Retour à la liste (Échap)" onClick={onClose} className="lg:hidden" />
                <IconButton
                    size="sm"
                    icon={thread.isArchived ? ArchiveRestore : Archive}
                    label={thread.isArchived ? "Remettre en boîte de réception (E)" : "Archiver (E)"}
                    onClick={onArchive}
                />
                {thread.permissions.canDelete && !thread.isTrashed && (
                    <IconButton size="sm" variant="danger" icon={Trash2} label="Mettre à la corbeille (#)" onClick={onTrash} />
                )}
                <IconButton
                    size="sm"
                    icon={Star}
                    label={thread.isStarred ? "Retirer des favoris (S)" : "Ajouter aux favoris (S)"}
                    active={thread.isStarred}
                    onClick={onStar}
                />
                <div className="flex-1" />
                {isLoading && <Spinner className="mr-2 text-ink-4" label="Actualisation" />}
                <IconButton
                    size="sm"
                    icon={isContextOpen ? PanelRightClose : PanelRightOpen}
                    label={isContextOpen ? "Masquer le contexte CRM (I)" : "Afficher le contexte CRM (I)"}
                    active={isContextOpen}
                    onClick={onToggleContext}
                    className="hidden xl:inline-flex"
                />
            </div>

            {/* Messages */}
            <div className="min-h-0 flex-1 overflow-y-auto email-scrollbar">
                <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
                    <h2 className="text-lg font-semibold leading-snug tracking-tight text-ink">
                        {thread.subject || "(Sans objet)"}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                        <span>{messageCount} message{messageCount > 1 ? "s" : ""}</span>
                        <span aria-hidden>·</span>
                        <span title={thread.mailbox.email}>
                            via {thread.mailbox.displayName || thread.mailbox.email}
                            {thread.mailbox.owner && ` (${thread.mailbox.owner.name})`}
                        </span>
                        {thread.isTrashed && <Badge size="sm" variant="danger">Corbeille</Badge>}
                        {thread.isArchived && !thread.isTrashed && <Badge size="sm">Archivée</Badge>}
                        {thread.labels.map((l) => <Badge key={l} size="sm" variant="primary">{l}</Badge>)}
                    </div>

                    <div className="mt-5 space-y-2.5">
                        {thread.emails.map((email, index) => (
                            <MessageCard
                                key={email.id}
                                email={email}
                                isExpanded={expanded.has(email.id)}
                                isLast={index === messageCount - 1}
                                onToggle={() => toggle(email.id)}
                                recap={recaps[email.id]}
                                onRequestRecap={() => requestRecap(email)}
                            />
                        ))}
                        <div ref={endRef} />
                    </div>
                </div>
            </div>

            {/* Reply bar */}
            <div className="shrink-0 border-t border-line bg-surface px-4 py-2.5 sm:px-6">
                {thread.permissions.canSend ? (
                    <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
                        <Button size="sm" leftIcon={<Reply className="size-4" />} onClick={() => onCompose("reply")}>
                            Répondre
                            <Kbd className="ml-1 border-white/30 bg-white/15 text-primary-fg">R</Kbd>
                        </Button>
                        <Button size="sm" variant="secondary" leftIcon={<ReplyAll className="size-4" />} onClick={() => onCompose("replyAll")}>
                            <span className="hidden sm:inline">Répondre à tous</span>
                            <span className="sm:hidden">Tous</span>
                        </Button>
                        <Button size="sm" variant="secondary" leftIcon={<Forward className="size-4" />} onClick={() => onCompose("forward")}>
                            Transférer
                        </Button>
                    </div>
                ) : (
                    <p className="mx-auto max-w-3xl text-xs text-ink-3">
                        Vous pouvez lire cette conversation mais pas y répondre depuis cette boîte
                        {thread.permissions.sendBlockedReason ? ` : ${thread.permissions.sendBlockedReason.toLowerCase()}` : ""}.
                    </p>
                )}
            </div>
        </div>
    );
}

// ============================================
// MESSAGE CARD
// ============================================

interface MessageCardProps {
    email: EmailMessage;
    isExpanded: boolean;
    isLast: boolean;
    onToggle: () => void;
    recap?: { text?: string; loading?: boolean; error?: string };
    onRequestRecap: () => void;
}

function MessageCard({ email, isExpanded, isLast, onToggle, recap, onRequestRecap }: MessageCardProps) {
    const [showQuoted, setShowQuoted] = useState(false);
    const isOutbound = email.direction === "OUTBOUND";
    const date = messageDate(email);
    const sender = displayName(email.fromName, email.fromAddress);
    const plain = useMemo(() => messagePlainText(email), [email]);
    const body = useMemo(() => {
        if (!email.bodyHtml) return null;
        return splitQuoted(sanitizeEmailHtml(email.bodyHtml));
    }, [email.bodyHtml]);
    const opened = isOutbound && (email.openCount > 0 || !!email.firstOpenedAt || email.status === "OPENED" || email.status === "CLICKED");

    return (
        <article
            className={cn(
                "overflow-hidden rounded-panel border bg-surface",
                isLast ? "border-line-strong shadow-xs" : "border-line",
            )}
        >
            {/* Header */}
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={isExpanded}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
            >
                <Avatar name={sender} size="sm" shape="circle" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                        <span className="truncate text-[13px] font-semibold text-ink">{sender}</span>
                        {isOutbound && (
                            <span className="shrink-0 text-2xs text-ink-4">
                                {email.sentBy ? `envoyé par ${email.sentBy.name}` : "nous"}
                            </span>
                        )}
                        <span className="ml-auto shrink-0 text-2xs text-ink-4" title={formatFullDate(date)}>
                            {formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr })}
                        </span>
                    </div>
                    {isExpanded ? (
                        <p className="mt-0.5 truncate text-xs text-ink-3">
                            {email.fromName && <span className="text-ink-4">{email.fromAddress} · </span>}
                            À : {email.toAddresses.join(", ") || "—"}
                            {email.ccAddresses.length > 0 && <> · Cc : {email.ccAddresses.join(", ")}</>}
                        </p>
                    ) : (
                        <p className="mt-0.5 truncate text-xs text-ink-3">{plain.slice(0, 160) || "…"}</p>
                    )}
                </div>
            </button>

            {isExpanded && (
                <div className="border-t border-line px-4 pb-4 pt-3">
                    {/* Status + AI recap */}
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        {isOutbound && email.status === "BOUNCED" && <Badge size="sm" variant="danger">Non distribué</Badge>}
                        {isOutbound && email.status === "FAILED" && <Badge size="sm" variant="danger">Échec d&apos;envoi</Badge>}
                        {opened && (
                            <Badge size="sm" variant="info">
                                <Eye className="size-3" aria-hidden />
                                Ouvert{email.openCount > 1 ? ` ${email.openCount} fois` : ""}
                            </Badge>
                        )}
                        {plain.length > 280 && !recap && (
                            <Button size="xs" variant="ghost" leftIcon={<AiMark className="size-3.5" />} onClick={onRequestRecap}>
                                Résumer
                            </Button>
                        )}
                    </div>

                    {recap && (
                        <div className="mb-3 rounded-control border border-primary-200 bg-primary-50 px-3 py-2.5">
                            <p className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-primary-700">
                                <AiMark className="size-3.5" aria-hidden />
                                Résumé
                            </p>
                            {recap.loading && (
                                <p className="flex items-center gap-2 text-xs text-ink-3"><Spinner /> Analyse en cours…</p>
                            )}
                            {recap.error && (
                                <p className="flex items-center gap-2 text-xs text-ink-3">
                                    {recap.error}
                                    <Button size="xs" variant="link" onClick={onRequestRecap}>Réessayer</Button>
                                </p>
                            )}
                            {recap.text && <p className="text-[13px] leading-relaxed text-ink">{recap.text}</p>}
                        </div>
                    )}

                    {/* Body */}
                    {body ? (
                        <>
                            <div
                                className="email-body overflow-x-auto break-words text-sm leading-relaxed text-ink [&_a]:text-primary-700 [&_a]:underline [&_blockquote]:ml-0 [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-ink-3 [&_img]:h-auto [&_img]:max-w-full [&_table]:max-w-full"
                                dangerouslySetInnerHTML={{ __html: body.main }}
                            />
                            {body.quoted && (
                                <div className="mt-2">
                                    <IconButton
                                        size="xs"
                                        variant="outline"
                                        icon={MoreHorizontal}
                                        label={showQuoted ? "Masquer le message cité" : "Afficher le message cité"}
                                        onClick={() => setShowQuoted((v) => !v)}
                                    />
                                    {showQuoted && (
                                        <div
                                            className="email-body mt-2 overflow-x-auto break-words text-sm leading-relaxed text-ink-3 [&_a]:text-primary-700 [&_a]:underline [&_blockquote]:ml-0 [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_img]:h-auto [&_img]:max-w-full"
                                            dangerouslySetInnerHTML={{ __html: body.quoted }}
                                        />
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink">
                            {email.bodyText || "(Message vide)"}
                        </pre>
                    )}

                    {/* Attachments */}
                    {email.attachments.length > 0 && (
                        <div className="mt-4 border-t border-line pt-3">
                            <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-4">
                                {email.attachments.length} pièce{email.attachments.length > 1 ? "s" : ""} jointe{email.attachments.length > 1 ? "s" : ""}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {email.attachments.map((a) =>
                                    a.downloadable ? (
                                        <a
                                            key={a.id}
                                            href={`/api/email/attachments/${a.id}`}
                                            className="group flex max-w-[240px] items-center gap-2 rounded-control border border-line bg-surface-2 px-2.5 py-1.5 transition-colors hover:border-line-strong hover:bg-surface-3"
                                        >
                                            <FileTypeIcon mimeType={a.mimeType} />
                                            <span className="min-w-0">
                                                <span className="block truncate text-xs font-medium text-ink">{a.filename}</span>
                                                <span className="block text-3xs text-ink-4">{formatFileSize(a.size)}</span>
                                            </span>
                                            <Download className="size-3.5 shrink-0 text-ink-4 group-hover:text-ink-2" aria-hidden />
                                        </a>
                                    ) : (
                                        <span
                                            key={a.id}
                                            title="Le contenu de cette pièce jointe n'a pas été synchronisé — ouvrez-la depuis votre messagerie."
                                            className="flex max-w-[240px] items-center gap-2 rounded-control border border-dashed border-line px-2.5 py-1.5"
                                        >
                                            <FileTypeIcon mimeType={a.mimeType} />
                                            <span className="min-w-0">
                                                <span className="block truncate text-xs font-medium text-ink-2">{a.filename}</span>
                                                <span className="block text-3xs text-ink-4">{formatFileSize(a.size)} · non synchronisée</span>
                                            </span>
                                        </span>
                                    ),
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </article>
    );
}

export default ThreadView;
