"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
    Star,
    Archive,
    Trash2,
    Inbox,
    Send,
    MailCheck,
    Tag,
    SearchX,
    Clock,
    RefreshCw,
    ArchiveRestore,
    Target,
} from "lucide-react";
import { Button, EmptyState, IconButton, Skeleton, Callout } from "@/components/ui";
import {
    contactName,
    formatSmartDate,
    type OutreachStatus,
    type ThreadSummary,
} from "./inbox-utils";

// ============================================
// TYPES
// ============================================

interface ThreadListProps {
    threads: ThreadSummary[];
    folder: string;
    search: string;
    isLoading: boolean;
    isLoadingMore: boolean;
    error: string | null;
    hasMore: boolean;
    selectedThreadId?: string | null;
    /** Show which mailbox / owner a thread lives in (team view). */
    showMailbox?: boolean;
    onLoadMore: () => void;
    onRetry: () => void;
    onClearSearch: () => void;
    onSelectThread: (thread: ThreadSummary) => void;
    onStar: (thread: ThreadSummary) => void;
    onArchive: (thread: ThreadSummary) => void;
    onTrash: (thread: ThreadSummary) => void;
}

// ============================================
// EMPTY STATES (one per folder)
// ============================================

function FolderEmptyState({ folder, search, onClearSearch }: { folder: string; search: string; onClearSearch: () => void }) {
    if (search) {
        return (
            <EmptyState
                variant="inline"
                icon={SearchX}
                title={`Aucun résultat pour « ${search} »`}
                description="La recherche porte sur l'objet, l'aperçu, l'expéditeur et les participants."
                action={<Button size="sm" variant="secondary" onClick={onClearSearch}>Effacer la recherche</Button>}
            />
        );
    }
    if (folder.startsWith("label:")) {
        return <EmptyState variant="inline" icon={Tag} title="Aucune conversation avec ce libellé" />;
    }
    const states: Record<string, { icon: typeof Inbox; title: string; description?: string }> = {
        inbox: {
            icon: Inbox,
            title: "Boîte de réception vide",
            description: "Les réponses de vos prospects et de vos clients arrivent ici.",
        },
        unread: { icon: MailCheck, title: "Tout est lu", description: "Aucune conversation en attente de lecture." },
        starred: {
            icon: Star,
            title: "Aucun favori",
            description: "Appuyez sur S ou sur l'étoile pour garder une conversation sous la main.",
        },
        sent: { icon: Send, title: "Aucun message envoyé", description: "Les emails envoyés depuis le CRM apparaissent ici." },
        archive: {
            icon: Archive,
            title: "Aucune archive",
            description: "Archivez (E) les conversations traitées pour garder la boîte de réception nette.",
        },
        trash: { icon: Trash2, title: "Corbeille vide" },
    };
    const s = states[folder] ?? states.inbox;
    return <EmptyState variant="inline" icon={s.icon} title={s.title} description={s.description} />;
}

// ============================================
// SKELETON
// ============================================

function ThreadRowSkeleton() {
    return (
        <div className="flex gap-3 border-b border-line px-4 py-3">
            <Skeleton className="mt-1.5 size-2 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
            </div>
        </div>
    );
}

// ============================================
// OUTREACH STATUS
// ============================================

const OUTREACH: Record<OutreachStatus, { label: string; className: string }> = {
    sent: { label: "Envoyé", className: "text-ink-3" },
    opened: { label: "Ouvert", className: "text-info-ink" },
    replied: { label: "Répondu", className: "text-success-ink" },
    bounced: { label: "Non distribué", className: "text-danger-ink" },
};

// ============================================
// THREAD LIST
// ============================================

export function ThreadList({
    threads,
    folder,
    search,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    selectedThreadId,
    showMailbox,
    onLoadMore,
    onRetry,
    onClearSearch,
    onSelectThread,
    onStar,
    onArchive,
    onTrash,
}: ThreadListProps) {
    const listRef = useRef<HTMLDivElement>(null);

    // Keep the selected row visible when moving with j/k
    useEffect(() => {
        if (!selectedThreadId || !listRef.current) return;
        const row = listRef.current.querySelector<HTMLElement>(`[data-thread-id="${CSS.escape(selectedThreadId)}"]`);
        row?.scrollIntoView({ block: "nearest" });
    }, [selectedThreadId]);

    const handleScroll = () => {
        const el = listRef.current;
        if (!el || !hasMore || isLoadingMore || isLoading) return;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) onLoadMore();
    };

    if (isLoading && threads.length === 0) {
        return (
            <div className="min-h-0 flex-1 overflow-hidden" aria-busy="true" aria-label="Chargement des conversations">
                {Array.from({ length: 9 }).map((_, i) => <ThreadRowSkeleton key={i} />)}
            </div>
        );
    }

    if (error && threads.length === 0) {
        return (
            <div className="p-4">
                <Callout
                    tone="danger"
                    title="Impossible de charger les conversations"
                    action={<Button size="sm" variant="secondary" leftIcon={<RefreshCw className="size-3.5" />} onClick={onRetry}>Réessayer</Button>}
                >
                    {error}
                </Callout>
            </div>
        );
    }

    if (threads.length === 0) {
        return (
            <div className="min-h-0 flex-1 overflow-y-auto">
                <FolderEmptyState folder={folder} search={search} onClearSearch={onClearSearch} />
            </div>
        );
    }

    return (
        <div
            ref={listRef}
            onScroll={handleScroll}
            role="listbox"
            aria-label="Conversations"
            className={cn("min-h-0 flex-1 overflow-y-auto email-scrollbar", isLoading && "opacity-60 transition-opacity")}
        >
            {threads.map((thread) => (
                <ThreadRow
                    key={thread.id}
                    thread={thread}
                    folder={folder}
                    isSelected={thread.id === selectedThreadId}
                    showMailbox={showMailbox}
                    onSelect={() => onSelectThread(thread)}
                    onStar={() => onStar(thread)}
                    onArchive={() => onArchive(thread)}
                    onTrash={() => onTrash(thread)}
                />
            ))}

            {isLoadingMore && (
                <div aria-busy="true">
                    <ThreadRowSkeleton />
                    <ThreadRowSkeleton />
                </div>
            )}
            {hasMore && !isLoadingMore && (
                <div className="flex justify-center py-3">
                    <Button size="xs" variant="ghost" onClick={onLoadMore}>Charger plus</Button>
                </div>
            )}
        </div>
    );
}

// ============================================
// THREAD ROW
// ============================================

interface ThreadRowProps {
    thread: ThreadSummary;
    folder: string;
    isSelected: boolean;
    showMailbox?: boolean;
    onSelect: () => void;
    onStar: () => void;
    onArchive: () => void;
    onTrash: () => void;
}

function ThreadRow({ thread, folder, isSelected, showMailbox, onSelect, onStar, onArchive, onTrash }: ThreadRowProps) {
    const latest = thread.latestEmail;
    const isOutbound = latest?.direction === "OUTBOUND";
    const linkedName = contactName(thread.contact);
    const counterpart = isOutbound
        ? `À : ${linkedName || latest?.toAddresses[0] || thread.participantEmails[0] || "—"}`
        : latest?.fromName || latest?.fromAddress || linkedName || "Expéditeur inconnu";
    const unread = !thread.isRead;
    const slaLate = thread.slaDeadline && new Date(thread.slaDeadline) < new Date();
    const outreach = thread.outreachStatus ? OUTREACH[thread.outreachStatus] : null;

    return (
        <div
            data-thread-id={thread.id}
            role="option"
            aria-selected={isSelected}
            tabIndex={-1}
            onClick={onSelect}
            className={cn(
                "group relative cursor-pointer border-b border-line px-4 py-2.5 transition-colors",
                isSelected ? "bg-primary-50" : "hover:bg-surface-2",
            )}
        >
            {isSelected && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary-600" aria-hidden />}

            <div className="flex items-start gap-2.5">
                <span
                    className={cn("mt-[7px] size-2 shrink-0 rounded-full", unread ? "bg-primary-600" : "bg-transparent")}
                    aria-label={unread ? "Non lu" : undefined}
                />

                <div className="min-w-0 flex-1">
                    {/* Row 1 — counterpart + date */}
                    <div className="flex items-baseline gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-[13px]", unread ? "font-semibold text-ink" : "font-medium text-ink-2")}>
                            {counterpart}
                            {thread.messageCount > 1 && (
                                <span className="ml-1.5 text-2xs font-medium tabular-nums text-ink-4">{thread.messageCount}</span>
                            )}
                        </span>
                        <span className={cn("shrink-0 text-2xs tabular-nums group-hover:invisible", unread ? "font-semibold text-primary-700" : "text-ink-4")}>
                            {formatSmartDate(thread.lastEmailAt)}
                        </span>
                    </div>

                    {/* Row 2 — subject + snippet */}
                    <p className="mt-0.5 truncate text-[13px] leading-snug">
                        <span className={cn(unread ? "font-medium text-ink" : "text-ink-2")}>{thread.subject || "(Sans objet)"}</span>
                        {thread.snippet && <span className="text-ink-4"> — {thread.snippet}</span>}
                    </p>

                    {/* Row 3 — context */}
                    {(thread.mission || outreach || thread.isStarred || slaLate || thread.labels.length > 0 || showMailbox) && (
                        <div className="mt-1 flex min-w-0 items-center gap-2 text-2xs">
                            {thread.isStarred && <Star className="size-3 shrink-0 fill-warning text-warning" aria-label="Favori" />}
                            {outreach && folder !== "inbox" && (
                                <span className={cn("shrink-0 font-medium", outreach.className)}>{outreach.label}</span>
                            )}
                            {thread.mission && (
                                <span className="inline-flex min-w-0 items-center gap-1 text-ink-3">
                                    <Target className="size-3 shrink-0" aria-hidden />
                                    <span className="truncate">{thread.mission.name}</span>
                                </span>
                            )}
                            {thread.labels.slice(0, 2).map((l) => (
                                <span key={l} className="shrink-0 rounded-chip border border-line bg-surface-2 px-1.5 text-ink-3">{l}</span>
                            ))}
                            {slaLate && (
                                <span className="inline-flex shrink-0 items-center gap-1 font-medium text-warning-ink">
                                    <Clock className="size-3" aria-hidden />
                                    SLA dépassé
                                </span>
                            )}
                            {showMailbox && (
                                <span className="ml-auto shrink-0 truncate text-ink-4" title={thread.mailbox.email}>
                                    {thread.mailbox.owner?.name || thread.mailbox.displayName || thread.mailbox.email}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Hover actions (keyboard: S, E) */}
            <div
                className="absolute right-2 top-1.5 hidden items-center gap-0.5 rounded-control border border-line bg-surface px-0.5 shadow-xs group-hover:flex"
                onClick={(e) => e.stopPropagation()}
            >
                <IconButton
                    size="xs"
                    icon={Star}
                    label={thread.isStarred ? "Retirer des favoris (S)" : "Ajouter aux favoris (S)"}
                    active={thread.isStarred}
                    onClick={onStar}
                />
                <IconButton
                    size="xs"
                    icon={thread.isArchived ? ArchiveRestore : Archive}
                    label={thread.isArchived ? "Remettre en boîte de réception (E)" : "Archiver (E)"}
                    onClick={onArchive}
                />
                {folder !== "trash" && (
                    <IconButton size="xs" variant="danger" icon={Trash2} label="Mettre à la corbeille (#)" onClick={onTrash} />
                )}
            </div>
        </div>
    );
}

export default ThreadList;
