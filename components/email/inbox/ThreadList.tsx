"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import {
    Star,
    Clock,
    Building2,
    AlertCircle,
    Archive,
    Trash2,
    Loader2,
    Inbox,
    Search,
    X,
    RefreshCw,
} from "lucide-react";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { fr } from "date-fns/locale";

// ============================================
// TYPES
// ============================================

interface Thread {
    id: string;
    mailboxId: string;
    subject: string;
    snippet: string | null;
    participantEmails: string[];
    isRead: boolean;
    isStarred: boolean;
    labels: string[];
    sentiment: string | null;
    priority: string | null;
    slaDeadline: string | null;
    lastEmailAt: string;
    messageCount: number;
    latestEmail: {
        id: string;
        fromAddress: string;
        fromName: string | null;
        direction: string;
    } | null;
    clientId: string | null;
    missionId: string | null;
    assignedTo: {
        id: string;
        name: string;
    } | null;
    mailbox: {
        email: string;
        displayName: string | null;
    };
}

interface ThreadListProps {
    mailboxId?: string;
    folder: string;
    selectedThreadId?: string;
    onSelectThread: (thread: { id: string; subject: string; mailboxId: string }) => void;
    refreshKey?: number;
}

// ============================================
// HELPERS
// ============================================

function formatSmartDate(dateStr: string): string {
    const date = new Date(dateStr);
    if (isToday(date)) {
        return format(date, "HH:mm", { locale: fr });
    }
    if (isYesterday(date)) {
        return "Hier";
    }
    if (isThisWeek(date)) {
        return format(date, "EEEE", { locale: fr });
    }
    return format(date, "d MMM", { locale: fr });
}

function getAvatarColor(name: string): string {
    const colors = [
        "bg-accent-500",
        "bg-blue-500",
        "bg-emerald-500",
        "bg-amber-500",
        "bg-rose-500",
        "bg-teal-500",
        "bg-primary-500",
        "bg-pink-500",
        "bg-cyan-500",
        "bg-orange-500",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
    const parts = name.split(/[\s@.]+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (parts[0]?.[0] || "?").toUpperCase();
}

// ============================================
// DEBOUNCE HOOK
// ============================================

function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debouncedValue;
}

// ============================================
// SKELETON LOADER
// ============================================

function ThreadSkeleton() {
    return (
        <div className="px-5 py-4 border-b border-slate-100/80">
            <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-full skeleton-shimmer flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="h-4 w-32 skeleton-shimmer rounded" />
                        <div className="h-3 w-12 skeleton-shimmer rounded" />
                    </div>
                    <div className="h-3.5 w-48 skeleton-shimmer rounded" />
                    <div className="h-3 w-64 skeleton-shimmer rounded" />
                </div>
            </div>
        </div>
    );
}

// ============================================
// THREAD LIST COMPONENT
// ============================================

export function ThreadList({
    mailboxId,
    folder,
    selectedThreadId,
    onSelectThread,
    refreshKey = 0,
}: ThreadListProps) {
    const [threads, setThreads] = useState<Thread[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [page, setPage] = useState(1);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const fetchingRef = useRef(false);

    // Debounce search by 400ms
    const debouncedSearch = useDebounce(searchInput, 400);

    // Fetch threads
    const fetchThreads = useCallback(async (pageNum: number, append: boolean = false) => {
        // Pagination guard - prevent duplicate fetches
        if (fetchingRef.current && append) return;
        fetchingRef.current = true;

        if (!append) {
            setIsLoading(true);
            setError(null);
        } else {
            setIsLoadingMore(true);
        }

        try {
            const params = new URLSearchParams({
                folder,
                page: pageNum.toString(),
                limit: "30",
            });

            if (mailboxId) {
                params.set("mailboxId", mailboxId);
            }
            if (debouncedSearch) {
                params.set("search", debouncedSearch);
            }

            const res = await fetch(`/api/email/threads?${params.toString()}`);

            if (!res.ok) {
                throw new Error(`Erreur ${res.status}`);
            }

            const json = await res.json();

            if (json.success) {
                if (append) {
                    setThreads(prev => [...prev, ...json.data.threads]);
                } else {
                    setThreads(json.data.threads);
                }
                setHasMore(json.data.hasMore);
            } else {
                throw new Error(json.error || "Erreur inconnue");
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Erreur de chargement";
            if (!append) {
                setError(message);
            }
            console.error("Failed to fetch threads:", err);
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
            fetchingRef.current = false;
        }
    }, [mailboxId, folder, debouncedSearch]);

    // Reset and refetch on filter change
    useEffect(() => {
        setPage(1);
        fetchThreads(1, false);
    }, [mailboxId, folder, debouncedSearch, refreshKey, fetchThreads]);

    // Scroll-based pagination
    const handleScroll = useCallback(() => {
        if (!listRef.current || !hasMore || isLoadingMore || fetchingRef.current) return;

        const { scrollTop, scrollHeight, clientHeight } = listRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 150) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchThreads(nextPage, true);
        }
    }, [hasMore, isLoadingMore, page, fetchThreads]);

    // Thread actions with optimistic updates and rollback
    const handleStar = async (e: React.MouseEvent, threadId: string, isStarred: boolean) => {
        e.stopPropagation();
        const prevThreads = threads;
        setThreads(prev => prev.map(t =>
            t.id === threadId ? { ...t, isStarred: !isStarred } : t
        ));
        try {
            const res = await fetch(`/api/email/threads/${threadId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isStarred: !isStarred }),
            });
            if (!res.ok) throw new Error();
        } catch {
            setThreads(prevThreads); // Rollback
        }
    };

    const handleArchive = async (e: React.MouseEvent, threadId: string) => {
        e.stopPropagation();
        const prevThreads = threads;
        setThreads(prev => prev.filter(t => t.id !== threadId));
        try {
            const res = await fetch(`/api/email/threads/${threadId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isArchived: true }),
            });
            if (!res.ok) throw new Error();
        } catch {
            setThreads(prevThreads); // Rollback
        }
    };

    const handleTrash = async (e: React.MouseEvent, threadId: string) => {
        e.stopPropagation();
        const prevThreads = threads;
        setThreads(prev => prev.filter(t => t.id !== threadId));
        try {
            const res = await fetch(`/api/email/threads/${threadId}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error();
        } catch {
            setThreads(prevThreads); // Rollback
        }
    };

    // Error state
    if (error && threads.length === 0) {
        return (
            <div className="flex-1 flex flex-col min-h-0">
                <SearchBar
                    searchInput={searchInput}
                    setSearchInput={setSearchInput}
                    isSearchFocused={isSearchFocused}
                    setIsSearchFocused={setIsSearchFocused}
                    searchRef={searchRef}
                />
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                        <AlertCircle className="w-7 h-7 text-red-400" />
                    </div>
                    <h3 className="text-[15px] font-semibold text-slate-800 mb-1.5">
                        Erreur de chargement
                    </h3>
                    <p className="text-sm text-slate-400 max-w-[260px] leading-relaxed mb-4">
                        {error}
                    </p>
                    <button
                        onClick={() => {
                            setPage(1);
                            fetchThreads(1, false);
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-xl transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Réessayer
                    </button>
                </div>
            </div>
        );
    }

    // Empty state
    if (!isLoading && threads.length === 0) {
        return (
            <div className="flex-1 flex flex-col min-h-0">
                <SearchBar
                    searchInput={searchInput}
                    setSearchInput={setSearchInput}
                    isSearchFocused={isSearchFocused}
                    setIsSearchFocused={setIsSearchFocused}
                    searchRef={searchRef}
                />
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
                        <Inbox className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-[15px] font-semibold text-slate-800 mb-1.5">
                        {searchInput ? "Aucun résultat" : "Boîte vide"}
                    </h3>
                    <p className="text-sm text-slate-400 max-w-[240px] leading-relaxed">
                        {searchInput
                            ? "Essayez de modifier votre recherche"
                            : "Aucun message dans ce dossier"}
                    </p>
                    {searchInput && (
                        <button
                            onClick={() => setSearchInput("")}
                            className="mt-4 px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-xl transition-colors"
                        >
                            Effacer la recherche
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* Search */}
            <SearchBar
                searchInput={searchInput}
                setSearchInput={setSearchInput}
                isSearchFocused={isSearchFocused}
                setIsSearchFocused={setIsSearchFocused}
                searchRef={searchRef}
            />

            {/* Thread List */}
            <div
                ref={listRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto email-scrollbar"
            >
                {isLoading && threads.length === 0 ? (
                    <div>
                        {Array.from({ length: 8 }).map((_, i) => (
                            <ThreadSkeleton key={i} />
                        ))}
                    </div>
                ) : (
                    <div className="email-entrance">
                        {threads.map((thread) => (
                            <ThreadListItem
                                key={thread.id}
                                thread={thread}
                                isSelected={thread.id === selectedThreadId}
                                onSelect={() => onSelectThread({
                                    id: thread.id,
                                    subject: thread.subject,
                                    mailboxId: thread.mailboxId,
                                })}
                                onStar={(e) => handleStar(e, thread.id, thread.isStarred)}
                                onArchive={(e) => handleArchive(e, thread.id)}
                                onTrash={(e) => handleTrash(e, thread.id)}
                            />
                        ))}
                    </div>
                )}

                {/* Load more indicator */}
                {isLoadingMore && (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================
// SEARCH BAR
// ============================================

function SearchBar({
    searchInput,
    setSearchInput,
    isSearchFocused,
    setIsSearchFocused,
    searchRef,
}: {
    searchInput: string;
    setSearchInput: (q: string) => void;
    isSearchFocused: boolean;
    setIsSearchFocused: (f: boolean) => void;
    searchRef: React.RefObject<HTMLInputElement | null>;
}) {
    return (
        <div className="p-3">
            <div className={cn(
                "relative rounded-xl transition-all duration-200",
                isSearchFocused
                    ? "ring-2 ring-primary-500/20 shadow-sm"
                    : ""
            )}>
                <Search className={cn(
                    "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors",
                    isSearchFocused ? "text-primary-500" : "text-slate-400"
                )} />
                <input
                    ref={searchRef}
                    type="text"
                    placeholder="Rechercher des emails..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                    className="w-full pl-9 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-500 focus:bg-white transition-all"
                />
                {searchInput && (
                    <button
                        onClick={() => setSearchInput("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}

// ============================================
// THREAD LIST ITEM
// ============================================

interface ThreadListItemProps {
    thread: Thread;
    isSelected: boolean;
    onSelect: () => void;
    onStar: (e: React.MouseEvent) => void;
    onArchive: (e: React.MouseEvent) => void;
    onTrash: (e: React.MouseEvent) => void;
}

function ThreadListItem({
    thread,
    isSelected,
    onSelect,
    onStar,
    onArchive,
    onTrash,
}: ThreadListItemProps) {
    const sender = thread.latestEmail?.fromName || thread.latestEmail?.fromAddress || "Inconnu";
    const isOutbound = thread.latestEmail?.direction === "OUTBOUND";
    const smartDate = formatSmartDate(thread.lastEmailAt);
    const avatarColor = getAvatarColor(sender);
    const initials = getInitials(sender);

    return (
        <div
            onClick={onSelect}
            className={cn(
                "group relative px-5 py-4 cursor-pointer transition-all duration-150 border-b border-slate-100/80",
                isSelected
                    ? "bg-primary-50/60"
                    : "hover:bg-slate-50/80",
                !thread.isRead && !isSelected && "bg-white"
            )}
        >
            {/* Selected indicator */}
            {isSelected && (
                <div className="absolute left-0 top-3 bottom-3 w-[3px] bg-primary-500 rounded-r-full" />
            )}

            <div className="flex items-start gap-3.5">
                {/* Avatar */}
                <div className="relative flex-shrink-0 mt-[1px]">
                    <div className={cn(
                        "w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-semibold text-white shadow-sm",
                        thread.clientId
                            ? "bg-emerald-500"
                            : avatarColor
                    )}>
                        {initials}
                    </div>
                    {!thread.isRead && (
                        <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-primary-500 rounded-full ring-2 ring-white" />
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Row 1: Sender + Date */}
                    <div className="flex items-center justify-between gap-3 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className={cn(
                                "text-[14px] truncate",
                                thread.isRead ? "text-slate-600 font-medium" : "font-semibold text-slate-900"
                            )}>
                                {isOutbound ? `À: ${thread.participantEmails[0] || ""}` : sender}
                            </span>
                            {thread.messageCount > 1 && (
                                <span className="flex-shrink-0 text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md font-medium tabular-nums">
                                    {thread.messageCount}
                                </span>
                            )}
                        </div>
                        <span className={cn(
                            "text-[11px] flex-shrink-0 tabular-nums pr-1",
                            thread.isRead ? "text-slate-400" : "text-primary-600 font-semibold"
                        )}>
                            {smartDate}
                        </span>
                    </div>

                    {/* Row 2: Subject */}
                    <p className={cn(
                        "text-[13px] truncate leading-snug pr-2",
                        thread.isRead ? "text-slate-500" : "text-slate-800 font-medium"
                    )}>
                        {thread.subject || "(Sans objet)"}
                    </p>

                    {/* Row 3: Snippet + badges */}
                    <div className="flex items-center gap-3 mt-1">
                        <p className="text-[12px] text-slate-400 truncate flex-1 pr-2">
                            {thread.snippet}
                        </p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            {thread.clientId && (
                                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-100" title="Lié à un client">
                                    <Building2 className="w-3 h-3 text-emerald-500" />
                                </div>
                            )}
                            {thread.priority === "high" && (
                                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-50 border border-red-100" title="Haute priorité">
                                    <AlertCircle className="w-3 h-3 text-red-500" />
                                </div>
                            )}
                            {thread.slaDeadline && new Date(thread.slaDeadline) < new Date() && (
                                <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-100" title="SLA dépassé">
                                    <Clock className="w-3 h-3 text-amber-500" />
                                </div>
                            )}
                            {thread.isStarred && (
                                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Hover actions */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-white shadow-lg border border-slate-200 rounded-xl px-1.5 py-1 z-10">
                <button
                    onClick={onStar}
                    className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        thread.isStarred
                            ? "text-amber-400 hover:bg-amber-50"
                            : "text-slate-400 hover:text-amber-400 hover:bg-slate-50"
                    )}
                    title={thread.isStarred ? "Retirer des favoris" : "Ajouter aux favoris"}
                >
                    <Star className={cn("w-4 h-4", thread.isStarred && "fill-current")} />
                </button>
                <button
                    onClick={onArchive}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                    title="Archiver"
                >
                    <Archive className="w-4 h-4" />
                </button>
                <button
                    onClick={onTrash}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Supprimer"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

export default ThreadList;
