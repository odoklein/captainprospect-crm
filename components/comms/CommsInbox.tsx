"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useCommsRealtime } from "@/hooks/useCommsRealtime";
import type { CommsRealtimePayload } from "@/lib/comms/events";
import {
    MessageSquare,
    Plus,
    Filter,
    Search,
    RefreshCw,
    Target,
    Building2,
    FileText,
    Users,
    MessageCircle,
    Megaphone,
    X,
    AlertCircle,
} from "lucide-react";
import { Button, Input, EmptyState, Skeleton } from "@/components/ui";
import { ThreadList } from "./ThreadList";
import { ThreadView } from "./ThreadView";
import { NewThreadModal } from "./NewThreadModal";
import { SearchPanel } from "./SearchPanel";
import type {
    CommsThreadListItem,
    CommsThreadView,
    CommsInboxStats,
    CommsInboxFilters,
    CommsChannelType,
    CommsThreadStatus,
    CreateThreadRequest,
    CommsMessageView,
} from "@/lib/comms/types";

interface CommsInboxProps {
    className?: string;
    /** When set (e.g. for client portal), only these channel types are shown in filters and user can only create threads in these contexts */
    restrictToChannelTypes?: CommsChannelType[];
}

const FILTER_OPTIONS: {
    type: CommsChannelType | "all";
    label: string;
    icon: typeof Target;
}[] = [
        { type: "all", label: "Tous", icon: MessageSquare },
        { type: "MISSION", label: "Missions", icon: Target },
        { type: "CLIENT", label: "Clients", icon: Building2 },
        { type: "CAMPAIGN", label: "Campagnes", icon: FileText },
        { type: "GROUP", label: "Groupes", icon: Users },
        { type: "DIRECT", label: "Directs", icon: MessageCircle },
        { type: "BROADCAST", label: "Annonces", icon: Megaphone },
    ];

export function CommsInbox({ className, restrictToChannelTypes }: CommsInboxProps) {
    const { data: session } = useSession();
    const searchParams = useSearchParams();
    const [threads, setThreads] = useState<CommsThreadListItem[]>([]);
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
    const [selectedThread, setSelectedThread] = useState<CommsThreadView | null>(null);
    const [isLoadingThreadDetails, setIsLoadingThreadDetails] = useState(false);
    const [stats, setStats] = useState<CommsInboxStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showNewThreadModal, setShowNewThreadModal] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [showSearchPanel, setShowSearchPanel] = useState(false);

    // Filters
    const [filters, setFilters] = useState<CommsInboxFilters>({});
    const [searchQuery, setSearchQuery] = useState("");
    const selectedThreadIdRef = useRef<string | null>(null);
    selectedThreadIdRef.current = selectedThreadId ?? selectedThread?.id ?? null;

    // Typing indicators per thread
    const [typingByThread, setTypingByThread] = useState<Record<string, string>>({});
    const typingTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});



    // Fetch threads
    const fetchThreads = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        else setIsLoading(true);

        try {
            const params = new URLSearchParams();
            if (filters.type) params.set("type", filters.type);
            if (filters.status) params.set("status", filters.status);
            if (filters.unreadOnly) params.set("unreadOnly", "true");
            if (searchQuery) params.set("search", searchQuery);

            const res = await fetch(`/api/comms/threads?${params}`);
            if (res.ok) {
                const data = await res.json();
                setThreads(data.threads);
                setError(null);
            } else {
                const errorData = await res.json().catch(() => ({ error: "Erreur serveur" }));
                setError(errorData.error || "Impossible de charger les discussions");
            }
        } catch (error) {
            console.error("Error fetching threads:", error);
            setError("Erreur de connexion à la base de données");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [filters, searchQuery]);

    // Fetch stats
    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch("/api/comms/inbox/stats");
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (error) {
            console.error("Error fetching stats:", error);
            // Don't set error state for stats, it's not critical
        }
    }, []);

    // Fetch thread details (returns data so caller can apply only if still selected)
    const fetchThreadDetails = useCallback(async (threadId: string): Promise<CommsThreadView | null> => {
        try {
            const res = await fetch(`/api/comms/threads/${threadId}`);
            if (res.ok) {
                const data = await res.json();
                return data as CommsThreadView;
            }
        } catch (error) {
            console.error("Error fetching thread:", error);
        }
        return null;
    }, []);

    // Real-time: refetch on message/thread events; track typing
    const handleRealtimeEvent = useCallback(
        (payload: CommsRealtimePayload) => {
            const tid = payload.threadId;
            if (payload.type === "typing_start" && tid && payload.userName) {
                if (typingTimeoutRef.current[tid]) {
                    clearTimeout(typingTimeoutRef.current[tid]);
                }
                setTypingByThread((prev) => ({ ...prev, [tid]: payload.userName! }));
                typingTimeoutRef.current[tid] = setTimeout(() => {
                    setTypingByThread((prev) => {
                        const next = { ...prev };
                        delete next[tid];
                        return next;
                    });
                    delete typingTimeoutRef.current[tid];
                }, 5000);
            } else if (payload.type === "typing_stop" && tid) {
                setTypingByThread((prev) => {
                    const next = { ...prev };
                    delete next[tid];
                    return next;
                });
                if (typingTimeoutRef.current[tid]) {
                    clearTimeout(typingTimeoutRef.current[tid]);
                    delete typingTimeoutRef.current[tid];
                }
            }
            if (!tid) return;
            if (
                payload.type === "message_created" ||
                payload.type === "message_updated" ||
                payload.type === "message_deleted" ||
                payload.type === "thread_status_updated"
            ) {
                fetchThreads(true);
                fetchStats();
                if (selectedThreadIdRef.current === tid) {
                    fetchThreadDetails(tid).then((data) => {
                        if (data && selectedThreadIdRef.current === data.id) {
                            setSelectedThread(data);
                        }
                    });
                }
            }
        },
        [fetchThreads, fetchStats, fetchThreadDetails]
    );

    useCommsRealtime({
        enabled: !!session?.user?.id,
        onEvent: handleRealtimeEvent,
    });

    // Initial load
    useEffect(() => {
        fetchThreads();
        fetchStats();
    }, [fetchThreads, fetchStats]);

    // Open thread from URL (e.g. from notification link ?thread=xxx)
    const threadIdFromUrl = searchParams.get("thread");
    useEffect(() => {
        if (!threadIdFromUrl || !session?.user?.id) return;
        setSelectedThreadId(threadIdFromUrl);
        setSelectedThread(null);
        setIsLoadingThreadDetails(true);
        fetchThreadDetails(threadIdFromUrl).then((data) => {
            if (data && selectedThreadIdRef.current === data.id) {
                setSelectedThread(data);
            }
            setIsLoadingThreadDetails(false);
        });
    }, [threadIdFromUrl, session?.user?.id, fetchThreadDetails]);

    // Handle thread selection — update list immediately, load details in background
    const handleSelectThread = (thread: CommsThreadListItem) => {
        selectedThreadIdRef.current = thread.id;
        setSelectedThreadId(thread.id);
        setSelectedThread(null);
        setIsLoadingThreadDetails(true);
        fetchThreadDetails(thread.id).then((data) => {
            if (data && selectedThreadIdRef.current === data.id) {
                setSelectedThread(data);
            }
            setIsLoadingThreadDetails(false);
        });
    };

    // Handle close thread panel
    const handleCloseThread = () => {
        setSelectedThreadId(null);
        setSelectedThread(null);
        fetchThreads(true); // Refresh to update read status
    };

    // Handle status change (optimistic)
    const handleStatusChange = async (status: CommsThreadStatus) => {
        if (!selectedThread) return;
        const threadId = selectedThread.id;
        const prevThread = selectedThread;
        const prevThreads = threads;

        setSelectedThread((t) => (t?.id === threadId ? { ...t, status } : t));
        setThreads((list) => list.map((t) => (t.id === threadId ? { ...t, status } : t)));
        try {
            const res = await fetch(`/api/comms/threads/${threadId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) throw new Error("Failed to update status");
            fetchThreads(true);
            fetchThreadDetails(threadId).then((data) => {
                if (data && selectedThreadIdRef.current === data.id) setSelectedThread(data);
            });
        } catch (error) {
            console.error("Error updating status:", error);
            setSelectedThread(prevThread);
            setThreads(prevThreads);
        }
    };

    // Handle send message (optimistic: show message immediately, sync in background)
    const handleSendMessage = async (
        content: string,
        opts?: { mentionIds?: string[]; files?: File[] }
    ) => {
        if (!selectedThread || !session?.user?.id) return;

        const threadId = selectedThread.id;
        const optimisticId = `opt-${Date.now()}`;
        const userName = (session.user as { name?: string; email?: string })?.name
            ?? (session.user as { email?: string })?.email
            ?? "Vous";
        const initials = userName
            .split(/\s+/)
            .map((s) => s.charAt(0))
            .join("")
            .toUpperCase()
            .slice(0, 2) || "?";
        const optimisticMsg: CommsMessageView = {
            id: optimisticId,
            threadId,
            type: "TEXT",
            content: content.trim() || "[Pièces jointes]",
            author: {
                id: session.user.id,
                name: userName,
                role: (session.user as { role?: string })?.role ?? "",
                initials,
            },
            mentions: [],
            attachments: [],
            reactions: [],
            isEdited: false,
            isDeleted: false,
            isOwnMessage: true,
            createdAt: new Date().toISOString(),
        };

        setSelectedThread((t) =>
            t?.id === threadId ? { ...t, messages: [...t.messages, optimisticMsg] } : t
        );

        // Also update thread in list optimistically (move to top, update lastMessage preview)
        const prevThreads = threads;
        const prevThreadInList = prevThreads.find((t) => t.id === threadId);
        setThreads((list) => {
            const thread = list.find((t) => t.id === threadId);
            if (!thread) return list;
            const updatedThread: CommsThreadListItem = {
                ...thread,
                messageCount: thread.messageCount + 1,
                lastMessage: {
                    content: optimisticMsg.content,
                    authorName: optimisticMsg.author.name,
                    createdAt: optimisticMsg.createdAt,
                },
                updatedAt: optimisticMsg.createdAt,
            };
            return [updatedThread, ...list.filter((t) => t.id !== threadId)];
        });

        const doSend = async () => {
            try {
                const hasFiles = !!opts?.files?.length;
                if (hasFiles) {
                    const form = new FormData();
                    form.set("content", content);
                    if (opts.mentionIds?.length) {
                        form.set("mentionIds", JSON.stringify(opts.mentionIds));
                    }
                    for (const f of opts.files!) {
                        form.append("files", f);
                    }
                    await fetch(`/api/comms/threads/${threadId}/messages`, {
                        method: "POST",
                        body: form,
                    });
                } else {
                    await fetch(`/api/comms/threads/${threadId}/messages`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            content,
                            mentionIds: opts?.mentionIds ?? [],
                        }),
                    });
                }
                fetchThreadDetails(threadId).then((data) => {
                    if (data && selectedThreadIdRef.current === data.id) setSelectedThread(data);
                });
                fetchStats();
            } catch (err) {
                console.error("Error sending message:", err);
                setSelectedThread((t) =>
                    t?.id === threadId
                        ? { ...t, messages: t.messages.filter((m) => m.id !== optimisticId) }
                        : t
                );
                // Revert thread list update
                if (prevThreadInList) {
                    setThreads(prevThreads);
                }
            }
        };
        void doSend();
    };

    // Handle create thread
    const handleCreateThread = async (request: CreateThreadRequest) => {
        const res = await fetch("/api/comms/threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
        });

        if (res.ok) {
            const { id } = await res.json();
            fetchThreads(true);
            fetchStats();
            selectedThreadIdRef.current = id;
            setSelectedThreadId(id);
            setSelectedThread(null);
            setIsLoadingThreadDetails(true);
            fetchThreadDetails(id).then((data) => {
                if (data && selectedThreadIdRef.current === data.id) {
                    setSelectedThread(data);
                }
                setIsLoadingThreadDetails(false);
            });
        }
    };

    // Handle filter change
    const handleFilterChange = (type: CommsChannelType | "all") => {
        setFilters((prev) => ({
            ...prev,
            type: type === "all" ? undefined : type,
        }));
    };

    // Handle reaction toggle (optimistic)
    const handleReactionToggle = useCallback(
        async (messageId: string, emoji: string) => {
            if (!selectedThread || !session?.user?.id) return;
            const currentUserId = session.user.id;
            const prevThread = selectedThread;

            const nextMessages = prevThread.messages.map((m) => {
                if (m.id !== messageId) return m;
                const reactions = [...(m.reactions ?? [])];
                const r = reactions.find((x) => x.emoji === emoji);
                const hadUser = r?.userIds.includes(currentUserId);
                let nextReactions: typeof reactions;
                if (r) {
                    if (hadUser) {
                        const newUserIds = r.userIds.filter((id) => id !== currentUserId);
                        const newCount = Math.max(0, r.count - 1);
                        nextReactions =
                            newCount === 0
                                ? reactions.filter((x) => x.emoji !== emoji)
                                : reactions.map((x) =>
                                    x.emoji === emoji
                                        ? { ...x, count: newCount, userIds: newUserIds }
                                        : x
                                );
                    } else {
                        nextReactions = reactions.map((x) =>
                            x.emoji === emoji
                                ? { ...x, count: x.count + 1, userIds: [...x.userIds, currentUserId] }
                                : x
                        );
                    }
                } else {
                    nextReactions = [...reactions, { emoji, count: 1, userIds: [currentUserId] }];
                }
                return { ...m, reactions: nextReactions };
            });

            setSelectedThread({ ...prevThread, messages: nextMessages });

            try {
                const res = await fetch(`/api/comms/messages/${messageId}/reactions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ emoji }),
                });
                if (!res.ok) throw new Error("Failed to toggle reaction");
            } catch (err) {
                console.error("Error toggling reaction:", err);
                fetchThreadDetails(prevThread.id).then((data) => {
                    if (data && selectedThreadIdRef.current === data.id) setSelectedThread(data);
                });
            }
        },
        [selectedThread, session?.user?.id, fetchThreadDetails]
    );

    return (
        <div className={cn("flex h-full bg-white dark:bg-[#151c2a] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden", className)}>
            {/* Left panel: Thread list - 400px like Sales Inbox inspo */}
            <div className="w-[400px] flex flex-col border-r border-slate-200 dark:border-slate-800 shrink-0">
                {/* Header */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                                Inbox
                            </h2>
                            {stats && stats.totalUnread > 0 && (
                                <span className="px-2 py-0.5 text-xs font-medium text-white bg-primary-500 rounded-full">
                                    {stats.totalUnread}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">

                            <button
                                onClick={async () => {
                                    if (isSyncing) return;
                                    setIsSyncing(true);
                                    try {
                                        await fetch('/api/email/sync', { method: 'POST' });
                                        // Wait a bit for sync to actually fetch something (optimistic)
                                        // But ideally we just trigger it and let user refresh or use SWR/polling
                                        // For now, let's wait 2s then refresh list
                                        await new Promise(r => setTimeout(r, 2000));
                                        await fetchThreads(true);
                                    } catch (e) {
                                        console.error('Sync failed', e);
                                    } finally {
                                        setIsSyncing(false);
                                    }
                                }}
                                className={cn(
                                    "p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors",
                                    isSyncing && "animate-spin text-primary-500"
                                )}
                                title="Synchroniser les emails"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setShowSearchPanel(true)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Recherche avancée"
                            >
                                <Search className="w-4 h-4" />
                            </button>
                            <Button
                                size="sm"
                                onClick={() => setShowNewThreadModal(true)}
                            >
                                <Plus className="w-4 h-4 mr-1" />
                                Nouveau
                            </Button>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Rechercher des messages..."
                            className="pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border-0 rounded-lg focus:ring-2 focus:ring-primary-500/20"
                        />
                    </div>

                    {/* Filter chips - inspo style */}
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {(restrictToChannelTypes
                            ? FILTER_OPTIONS.filter((o) => o.type === "all" || restrictToChannelTypes.includes(o.type as CommsChannelType))
                            : FILTER_OPTIONS
                        ).map((opt) => (
                            <button
                                key={opt.type}
                                onClick={() => handleFilterChange(opt.type)}
                                className={cn(
                                    "flex h-7 items-center justify-center gap-1 px-3 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
                                    (filters.type === opt.type || (opt.type === "all" && !filters.type))
                                        ? "bg-primary-500/10 text-primary-600 dark:text-indigo-400 border-primary-500/20"
                                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-600 dark:text-slate-300"
                                )}
                            >
                                {opt.label}
                                {stats && opt.type !== "all" && stats.unreadByType[opt.type as CommsChannelType] > 0 && (
                                    <span className="ml-0.5 text-[10px] bg-primary-500 text-white rounded-full px-1.5 py-0.5">
                                        {stats.unreadByType[opt.type as CommsChannelType]}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Thread list */}
                <div className="flex-1 overflow-y-auto">
                    {error && (
                        <div className="m-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-rose-900">{error}</p>
                                <button
                                    onClick={() => {
                                        setError(null);
                                        fetchThreads(true);
                                    }}
                                    className="text-xs text-rose-600 hover:text-rose-700 mt-1 underline"
                                >
                                    Réessayer
                                </button>
                            </div>
                            <button
                                onClick={() => setError(null)}
                                className="text-rose-400 hover:text-rose-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    {isLoading ? (
                        <div className="space-y-2 p-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div
                                    key={i}
                                    className="animate-pulse bg-slate-100 rounded-xl h-24"
                                />
                            ))}
                        </div>
                    ) : threads.length === 0 && !error ? (
                        <EmptyState
                            icon={MessageSquare}
                            title="Aucune discussion"
                            description="Créez une nouvelle discussion pour commencer"
                            variant="inline"
                        />
                    ) : (
                        <ThreadList
                            threads={threads}
                            selectedId={selectedThreadId ?? selectedThread?.id}
                            onSelect={handleSelectThread}
                        />
                    )}
                </div>
            </div>

            {/* Right panel: Thread view */}
            <div className="flex-1 flex flex-col">
                {!selectedThreadId ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                                <MessageSquare className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                Sélectionnez une discussion
                            </h3>
                            <p className="text-sm text-slate-500 max-w-sm">
                                Choisissez une discussion dans la liste ou créez-en une nouvelle
                            </p>
                        </div>
                    </div>
                ) : selectedThread && selectedThread.id === selectedThreadId && !isLoadingThreadDetails ? (
                    <ThreadView
                        thread={selectedThread}
                        onClose={handleCloseThread}
                        onStatusChange={handleStatusChange}
                        onSendMessage={handleSendMessage}
                        onReactionToggle={handleReactionToggle}
                        currentUserId={session?.user?.id || ""}
                        typingUserName={typingByThread[selectedThread.id]}
                    />
                ) : (
                    <div className="flex-1 flex flex-col p-4 gap-4">
                        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
                            <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-48" />
                                <Skeleton className="h-3 w-32" />
                            </div>
                        </div>
                        <div className="flex-1 space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className={cn("flex gap-3", i % 2 === 0 ? "flex-row-reverse" : "")}>
                                    <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                                    <Skeleton className={i % 2 === 0 ? "h-16 w-3/4 ml-auto" : "h-16 w-2/3"} />
                                </div>
                            ))}
                        </div>
                        <div className="pt-3 border-t border-slate-200">
                            <Skeleton className="h-24 w-full rounded-xl" />
                        </div>
                    </div>
                )}
            </div>

            {/* New thread modal */}
            <NewThreadModal
                isOpen={showNewThreadModal}
                onClose={() => setShowNewThreadModal(false)}
                onSubmit={handleCreateThread}
                userRole={session?.user?.role || ""}
            />

            {/* Search panel */}
            <SearchPanel
                isOpen={showSearchPanel}
                onClose={() => setShowSearchPanel(false)}
                onResultClick={(threadId, _messageId) => {
                    setShowSearchPanel(false);
                    selectedThreadIdRef.current = threadId;
                    setSelectedThreadId(threadId);
                    setSelectedThread(null);
                    setIsLoadingThreadDetails(true);
                    fetchThreadDetails(threadId).then((data) => {
                        if (data && selectedThreadIdRef.current === data.id) {
                            setSelectedThread(data);
                        }
                        setIsLoadingThreadDetails(false);
                    });
                }}
            />
        </div >
    );
}

export default CommsInbox;
