"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useCommsRealtime } from "@/hooks/useCommsRealtime";
import { useToast } from "@/components/ui";
import type { CommsRealtimePayload } from "@/lib/comms/events";
import {
    MessageSquare,
    Plus,
    Search,
    RefreshCw,
    Target,
    Building2,
    FileText,
    Users,
    MessageCircle,
    Megaphone,
    PanelLeftClose,
    PanelLeft,
    Loader2,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { CommsPageHeader } from "@/components/comms/CommsPageHeader";
import { ThreadList } from "@/components/comms/ThreadList";
import type {
    CommsThreadListItem,
    CommsThreadView,
    CommsMessageView,
    CommsInboxStats,
    CommsInboxFilters,
    CommsChannelType,
    CommsThreadStatus,
    CreateThreadRequest,
} from "@/lib/comms/types";

function getInitials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "?";
}

function buildOptimisticMessage(
    tempId: string,
    content: string,
    currentUserId: string,
    currentUserName: string,
    currentUserRole: string
): CommsMessageView {
    return {
        id: tempId,
        threadId: "",
        type: "TEXT",
        content,
        author: {
            id: currentUserId,
            name: currentUserName,
            role: currentUserRole,
            initials: getInitials(currentUserName),
        },
        mentions: [],
        attachments: [],
        readBy: [],
        reactions: [],
        isEdited: false,
        isDeleted: false,
        isOwnMessage: true,
        createdAt: new Date().toISOString(),
        isOptimistic: true,
    };
}

function buildMessageFromPayload(
    payload: CommsRealtimePayload,
    threadId: string,
    currentUserId: string
): CommsMessageView | null {
    if (payload.type !== "message_created" || !payload.messageId || !payload.content || !payload.createdAt) return null;
    const authorId = payload.userId ?? "";
    const authorName = payload.userName ?? "Utilisateur";
    return {
        id: payload.messageId,
        threadId,
        type: "TEXT",
        content: payload.content,
        author: {
            id: authorId,
            name: authorName,
            role: "",
            initials: getInitials(authorName),
        },
        mentions: [],
        attachments: [],
        readBy: [],
        reactions: [],
        isEdited: false,
        isDeleted: false,
        isOwnMessage: authorId === currentUserId,
        createdAt: payload.createdAt,
    };
}

// Lazy-load heavy panels/modals to improve initial page load
const ThreadView = dynamic(
    () => import("@/components/comms/ThreadView").then((m) => m.default),
    { ssr: false, loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 text-primary-500 animate-spin" /></div> }
);
const NewThreadModal = dynamic(
    () => import("@/components/comms/NewThreadModal").then((m) => m.NewThreadModal),
    { ssr: false }
);
const SearchPanel = dynamic(
    () => import("@/components/comms/SearchPanel").then((m) => m.SearchPanel),
    { ssr: false }
);

// ============================================
// FILTER OPTIONS
// ============================================

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

// ============================================
// CUSTOM HOOK FOR DEBOUNCED VALUE
// ============================================

function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function ManagerCommsPage() {
    const { data: session } = useSession();
    const { error, success } = useToast();

    const [threads, setThreads] = useState<CommsThreadListItem[]>([]);
    const [selectedThread, setSelectedThread] = useState<CommsThreadView | null>(null);
    const [stats, setStats] = useState<CommsInboxStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingThread, setIsLoadingThread] = useState(false);
    const [showNewThreadModal, setShowNewThreadModal] = useState(false);
    const [showSearchPanel, setShowSearchPanel] = useState(false);
    const [isListCollapsed, setIsListCollapsed] = useState(false);
    const [focusMode, setFocusMode] = useState(false);

    // Filters
    const [filters, setFilters] = useState<CommsInboxFilters>({});
    const [searchQuery, setSearchQuery] = useState("");
    const debouncedSearchQuery = useDebounce(searchQuery, 400);
    const selectedThreadIdRef = useRef<string | null>(null);
    selectedThreadIdRef.current = selectedThread?.id ?? null;

    // Typing indicators per thread - support multiple users
    const [typingByThread, setTypingByThread] = useState<Record<string, string[]>>({});
    const typingTimeoutRef = useRef<Record<string, Record<string, ReturnType<typeof setTimeout>>>>({});

    // Fetch threads
    const fetchThreads = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        else setIsLoading(true);

        try {
            const params = new URLSearchParams();
            if (filters.type) params.set("type", filters.type);
            if (filters.status) params.set("status", filters.status);
            if (filters.unreadOnly) params.set("unreadOnly", "true");
            if (debouncedSearchQuery) params.set("search", debouncedSearchQuery);

            const res = await fetch(`/api/comms/threads?${params}`);
            if (res.ok) {
                const data = await res.json();
                setThreads(data.threads || []);
            } else {
                error("Erreur", "Impossible de charger les discussions");
            }
        } catch (error) {
            console.error("Error fetching threads:", error);
            error("Erreur", "Impossible de charger les discussions");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [filters, debouncedSearchQuery, error]);

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
        }
    }, []);

    // Fetch thread details
    const fetchThreadDetails = useCallback(async (threadId: string) => {
        setIsLoadingThread(true);
        try {
            const res = await fetch(`/api/comms/threads/${threadId}`);
            if (res.ok) {
                const data = await res.json();
                setSelectedThread(data);
            } else {
                error("Erreur", "Impossible de charger la discussion");
            }
        } catch (error) {
            console.error("Error fetching thread:", error);
            error("Erreur", "Impossible de charger la discussion");
        } finally {
            setIsLoadingThread(false);
        }
    }, [error]);

    // Debounced stats refresh for realtime (avoid hammering)
    const statsRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const debouncedFetchStats = useCallback(() => {
        if (statsRefreshRef.current) clearTimeout(statsRefreshRef.current);
        statsRefreshRef.current = setTimeout(() => {
            statsRefreshRef.current = null;
            void fetchStats();
        }, 500);
    }, [fetchStats]);

    // Real-time event handler: incremental updates only (no full refetch)
    const handleRealtimeEvent = useCallback(
        (payload: CommsRealtimePayload) => {
            // Resolve threadId for typing when server sends only userId/userName (page has thread list)
            let tid = payload.threadId;
            if (!tid && (payload.type === "typing_start" || payload.type === "typing_stop") && payload.userId && selectedThread?.participants?.some((p) => p.userId === payload.userId)) {
                tid = selectedThread.id;
            }
            const userName = payload.userName;

            if (payload.type === "typing_start" && tid && userName) {
                if (!typingTimeoutRef.current[tid]) {
                    typingTimeoutRef.current[tid] = {};
                }
                if (typingTimeoutRef.current[tid][userName]) {
                    clearTimeout(typingTimeoutRef.current[tid][userName]);
                }
                setTypingByThread((prev) => {
                    const current = prev[tid] || [];
                    if (!current.includes(userName)) {
                        return { ...prev, [tid]: [...current, userName] };
                    }
                    return prev;
                });
                typingTimeoutRef.current[tid][userName] = setTimeout(() => {
                    setTypingByThread((prev) => {
                        const current = prev[tid] || [];
                        return { ...prev, [tid]: current.filter(n => n !== userName) };
                    });
                    delete typingTimeoutRef.current[tid][userName];
                }, 5000);
            } else if (payload.type === "typing_stop" && tid && userName) {
                setTypingByThread((prev) => {
                    const current = prev[tid] || [];
                    return { ...prev, [tid]: current.filter(n => n !== userName) };
                });
                if (typingTimeoutRef.current[tid]?.[userName]) {
                    clearTimeout(typingTimeoutRef.current[tid][userName]);
                    delete typingTimeoutRef.current[tid][userName];
                }
            }

            if (!tid) return;

            const currentUserId = session?.user?.id ?? "";

            switch (payload.type) {
                case "message_created": {
                    const msg = buildMessageFromPayload(payload, tid, currentUserId);
                    if (msg) {
                        setSelectedThread((prev) => {
                            if (prev?.id !== tid) return prev;
                            if (prev.messages.some((m) => m.id === msg.id)) return prev;
                            return { ...prev, messages: [...prev.messages, msg] };
                        });
                        setThreads((prev) =>
                            prev.map((t) =>
                                t.id === tid
                                    ? {
                                        ...t,
                                        lastMessage: {
                                            content: payload.content ?? msg.content,
                                            authorName: payload.userName ?? msg.author.name,
                                            createdAt: payload.createdAt ?? msg.createdAt,
                                        },
                                    }
                                    : t
                            )
                        );
                    }
                    debouncedFetchStats();
                    return;
                }
                case "message_updated":
                    setSelectedThread((prev) => {
                        if (!prev || prev.id !== tid || !payload.messageId) return prev;
                        return {
                            ...prev,
                            messages: prev.messages.map((m) =>
                                m.id === payload.messageId
                                    ? { ...m, content: payload.content ?? m.content }
                                    : m
                            ),
                        };
                    });
                    debouncedFetchStats();
                    return;
                case "message_deleted":
                    setSelectedThread((prev) => {
                        if (!prev || prev.id !== tid || !payload.messageId) return prev;
                        return {
                            ...prev,
                            messages: prev.messages.filter((m) => m.id !== payload.messageId),
                        };
                    });
                    debouncedFetchStats();
                    return;
                case "thread_status_updated":
                    if (payload.status) {
                        setSelectedThread((prev) =>
                            prev?.id === tid ? { ...prev, status: payload.status as CommsThreadStatus } : prev
                        );
                        setThreads((prev) =>
                            prev.map((t) =>
                                t.id === tid ? { ...t, status: payload.status as CommsThreadStatus } : t
                            )
                        );
                    }
                    debouncedFetchStats();
                    return;
                default:
                    break;
            }


        },
        [session?.user?.id, debouncedFetchStats, selectedThread]
    );

    const handleStatusChange = useCallback(
        async (status: CommsThreadStatus) => {
            const thread = selectedThread;
            if (!thread) return;

            setSelectedThread((prev) => (prev?.id === thread.id ? { ...prev, status } : prev));
            setThreads((prev) =>
                prev.map((t) => (t.id === thread.id ? { ...t, status } : t))
            );

            try {
                const res = await fetch(`/api/comms/threads/${thread.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status }),
                });

                if (res.ok) {
                    success("Succès", status === "RESOLVED" ? "Discussion résolue" : "Discussion archivée");
                    void fetchStats();
                } else {
                    setSelectedThread((prev) => (prev?.id === thread.id ? { ...prev, status: thread.status } : prev));
                    setThreads((prev) =>
                        prev.map((t) => (t.id === thread.id ? { ...t, status: thread.status } : t))
                    );
                    error("Erreur", "Impossible de modifier le statut");
                }
            } catch (err) {
                console.error("Error updating status:", err);
                setSelectedThread((prev) => (prev?.id === thread.id ? { ...prev, status: thread.status } : prev));
                setThreads((prev) =>
                    prev.map((t) => (t.id === thread.id ? { ...t, status: thread.status } : t))
                );
                error("Erreur", "Impossible de modifier le statut");
            }
        },
        [selectedThread, success, error, fetchStats]
    );

    // Handle send message: optimistic UI, then confirm or rollback
    const handleSendMessage = useCallback(
        async (
            content: string,
            opts?: { mentionIds?: string[]; files?: File[] }
        ) => {
            const thread = selectedThread;
            if (!thread || !session?.user?.id) return;

            const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const optimisticMsg = buildOptimisticMessage(
                tempId,
                content,
                session.user.id,
                session.user.name ?? "Vous",
                (session.user as { role?: string }).role ?? ""
            );
            optimisticMsg.threadId = thread.id;

            setSelectedThread((prev) =>
                prev?.id === thread.id
                    ? { ...prev, messages: [...prev.messages, optimisticMsg] }
                    : prev
            );

            try {
                const hasFiles = !!opts?.files?.length;
                let res: Response;

                if (hasFiles) {
                    const form = new FormData();
                    form.set("content", content);
                    if (opts.mentionIds?.length) {
                        form.set("mentionIds", JSON.stringify(opts.mentionIds));
                    }
                    for (const f of opts.files!) {
                        form.append("files", f);
                    }
                    res = await fetch(`/api/comms/threads/${thread.id}/messages`, {
                        method: "POST",
                        body: form,
                    });
                } else {
                    res = await fetch(`/api/comms/threads/${thread.id}/messages`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            content,
                            mentionIds: opts?.mentionIds ?? [],
                        }),
                    });
                }

                const json = await res.json().catch(() => ({}));

                if (res.ok && json.id) {
                    const realId = json.id as string;
                    const createdAt = (json.createdAt as string) ?? new Date().toISOString();
                    setSelectedThread((prev) => {
                        if (!prev || prev.id !== thread.id) return prev;
                        const next = prev.messages.map((m) =>
                            m.id === tempId
                                ? { ...m, id: realId, createdAt, isOptimistic: undefined }
                                : m
                        );
                        return { ...prev, messages: next };
                    });
                    void fetchStats();
                } else {
                    setSelectedThread((prev) =>
                        prev?.id === thread.id
                            ? { ...prev, messages: prev.messages.filter((m) => m.id !== tempId) }
                            : prev
                    );
                    error("Erreur", json?.error ?? "Impossible d'envoyer le message");
                }
            } catch (err) {
                console.error("Error sending message:", err);
                setSelectedThread((prev) =>
                    prev?.id === thread.id
                        ? { ...prev, messages: prev.messages.filter((m) => m.id !== tempId) }
                        : prev
                );
                error("Erreur", "Impossible d'envoyer le message");
            }
        },
        [selectedThread, session?.user?.id, error, debouncedFetchStats]
    );

    // Resolve recipient user IDs for the current thread (for typing emissions).
    const getRecipientIdsForThread = useCallback(
        (threadId: string) => {
            if (selectedThread?.id !== threadId) return [];
            return selectedThread.participants
                .filter((p) => p.userId !== session?.user?.id)
                .map((p) => p.userId);
        },
        [selectedThread?.id, selectedThread?.participants, session?.user?.id]
    );

    // Real-time hook with presence
    const {
        isConnected,
        onlineUsers,
        joinThread,
        leaveThread,
        startTyping,
        stopTyping
    } = useCommsRealtime({
        enabled: !!session?.user?.id,
        userId: session?.user?.id,
        onEvent: handleRealtimeEvent,
        getRecipientIdsForThread,
    });

    // Keep track of selected thread for room management
    const selectedThreadRef = useRef<string | null>(null);
    useEffect(() => {
        selectedThreadRef.current = selectedThread?.id || null;
    }, [selectedThread?.id]);

    // Initial load: threads and stats in parallel
    useEffect(() => {
        void fetchThreads();
        void fetchStats();
    }, [fetchThreads, fetchStats]);

    // Handle thread selection
    const handleSelectThread = useCallback(
        (thread: CommsThreadListItem) => {
            if (selectedThreadRef.current && selectedThreadRef.current !== thread.id) {
                leaveThread(selectedThreadRef.current);
            }
            joinThread(thread.id);

            const minimalThread: CommsThreadView = {
                ...thread,
                participants: [],
                messages: [],
            };
            setSelectedThread(minimalThread);
            setIsLoadingThread(true);
            fetch(`/api/comms/threads/${thread.id}`)
                .then((res) => {
                    if (!res.ok) throw new Error("Failed to load");
                    return res.json();
                })
                .then((data: CommsThreadView) => {
                    setSelectedThread((prev) => (prev?.id === thread.id ? data : prev));
                })
                .catch(() => {
                    error("Erreur", "Impossible de charger la discussion");
                    setSelectedThread((prev) => (prev?.id === thread.id ? null : prev));
                })
                .finally(() => setIsLoadingThread(false));
        },
        [error, joinThread, leaveThread]
    );

    // Handle close thread panel
    const handleCloseThread = useCallback(() => {
        if (selectedThreadRef.current) {
            leaveThread(selectedThreadRef.current);
        }
        setSelectedThread(null);
        fetchThreads(true);
    }, [leaveThread, fetchThreads]);

    const handleTyping = useCallback((isTyping: boolean) => {
        if (!session?.user?.name || !selectedThread?.id) return;
        if (isTyping) {
            startTyping(selectedThread.id, session.user.name);
        } else {
            stopTyping(selectedThread.id, session.user.name);
        }
    }, [selectedThread?.id, session?.user?.name, startTyping, stopTyping]);

    const isRecipientOnline = useMemo(() => {
        if (!selectedThread) return false;
        return selectedThread.participants.some(
            p => p.userId !== session?.user?.id && onlineUsers.has(p.userId)
        );
    }, [selectedThread, session?.user?.id, onlineUsers]);



    // Handle create thread
    const handleCreateThread = async (request: CreateThreadRequest) => {
        try {
            const res = await fetch("/api/comms/threads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(request),
            });

            if (res.ok) {
                const { id } = await res.json();
                success("Succès", "Discussion créée");
                fetchThreads(true);
                fetchStats();
                fetchThreadDetails(id);
            } else {
                error("Erreur", "Impossible de créer la discussion");
            }
        } catch (error) {
            console.error("Error creating thread:", error);
            error("Erreur", "Impossible de créer la discussion");
        }
    };

    // Handle filter change
    const handleFilterChange = (type: CommsChannelType | "all") => {
        setFilters((prev) => ({
            ...prev,
            type: type === "all" ? undefined : type,
        }));
    };

    // Calculate stats from data
    const totalUnread = stats?.totalUnread || 0;
    const openThreads = useMemo(() => threads.filter(t => t.status === "OPEN").length, [threads]);

    // Format typing indicator text
    const getTypingText = (threadId: string) => {
        const users = typingByThread[threadId] || [];
        if (users.length === 0) return undefined;
        if (users.length === 1) return users[0];
        if (users.length === 2) return `${users[0]} et ${users[1]}`;
        return `${users[0]} et ${users.length - 1} autres`;
    };

    return (
        <div className="flex flex-col bg-slate-100 dark:bg-slate-900" style={{ height: "calc(100vh - 56px - 2.5rem)", overflow: "hidden" }}>
            {!focusMode && (
                <>
                    <div className="shrink-0 space-y-4">
                        <CommsPageHeader
                            title="Communications"
                            subtitle="Gérez les discussions avec l'équipe"
                            slimTitle="Communications — Messages"
                            icon={<MessageSquare className="w-6 h-6 text-white" />}
                            collapsible={true}
                            actions={
                                <>
                                    <button
                                        onClick={() => fetchThreads(true)}
                                        disabled={isRefreshing}
                                        className={cn(
                                            "p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
                                        )}
                                        title="Actualiser"
                                    >
                                        <RefreshCw className={cn("w-4 h-4 text-slate-500", isRefreshing && "animate-spin")} />
                                    </button>
                                    <button
                                        onClick={() => setShowSearchPanel(true)}
                                        className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                                        title="Recherche avancée"
                                    >
                                        <Search className="w-4 h-4 text-slate-500" />
                                    </button>
                                    <Button
                                        onClick={() => setShowNewThreadModal(true)}
                                        className="h-9 px-4 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium shadow-sm"
                                    >
                                        <Plus className="w-4 h-4 mr-1.5" />
                                        Nouveau message
                                    </Button>
                                </>
                            }
                        />
                    </div>


                </>
            )}

            {/* Main Content - stretches to fill remaining height */}
            <div className="flex-1 min-h-0 flex mt-4 gap-0 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-[#151c2a] shadow-sm">
                {/* Thread List Panel - fixed 400px like inspo */}
                <div className={cn(
                    "flex flex-col shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151c2a] transition-all duration-300 min-h-0",
                    focusMode ? "hidden" : isListCollapsed ? "w-14" : "w-[400px]"
                )}>
                    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                        {/* List Header - inspo: Inbox title, filter btn, search */}
                        <div className={cn(
                            "border-b border-slate-100 dark:border-slate-800 p-4 shrink-0",
                            isListCollapsed && "p-2 flex flex-col items-center"
                        )}>
                            {!isListCollapsed ? (
                                <>
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Inbox</h2>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setIsListCollapsed(true)}
                                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 transition-colors"
                                                title="Réduire"
                                            >
                                                <PanelLeftClose className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                                        <Input
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Rechercher des messages..."
                                            className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border-0 rounded-lg focus:ring-2 focus:ring-primary-500/20 text-slate-900 dark:text-white placeholder-slate-400"
                                        />
                                    </div>

                                    {/* Smart filter chips - inspo style */}
                                    <div className="flex gap-2 overflow-x-auto py-3 border-b border-slate-100 dark:border-slate-800 -mx-4 px-4 no-scrollbar">
                                        <button
                                            onClick={() => setFilters((p) => ({ ...p, unreadOnly: !p.unreadOnly }))}
                                            className={cn(
                                                "flex h-7 items-center justify-center px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border",
                                                filters.unreadOnly
                                                    ? "bg-primary-500/10 text-primary-600 dark:text-indigo-400 border-primary-500/20"
                                                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-300"
                                            )}
                                        >
                                            Non lus {totalUnread > 0 && `(${totalUnread})`}
                                        </button>
                                        {FILTER_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.type}
                                                onClick={() => handleFilterChange(opt.type)}
                                                className={cn(
                                                    "flex h-7 items-center justify-center gap-1 px-3 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
                                                    (filters.type === opt.type || (opt.type === "all" && !filters.type))
                                                        ? "bg-primary-500/10 text-primary-600 dark:text-indigo-400 border-primary-500/20"
                                                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-300"
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

                                    {(filters.type || debouncedSearchQuery || filters.unreadOnly) && (
                                        <div className="mt-3 flex items-center justify-between">
                                            <span className="text-xs text-slate-500">
                                                {threads.length} résultat{threads.length !== 1 ? "s" : ""}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    setFilters({});
                                                    setSearchQuery("");
                                                }}
                                                className="text-xs text-primary-600 hover:text-primary-700 dark:text-indigo-400"
                                            >
                                                Effacer
                                            </button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex flex-col items-center gap-2">
                                    <button
                                        onClick={() => setIsListCollapsed(false)}
                                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                        title="Développer"
                                    >
                                        <PanelLeft className="w-5 h-5" />
                                    </button>
                                    {totalUnread > 0 && (
                                        <span className="px-2 py-0.5 text-xs font-medium text-white bg-primary-500 rounded-full">
                                            {totalUnread}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Thread List */}
                        <div className={cn(
                            "flex-1 overflow-y-auto",
                            isListCollapsed && "hidden"
                        )}>
                            {isLoading ? (
                                <div className="space-y-2 p-4">
                                    {[1, 2, 3, 4, 5].map((i) => (
                                        <div
                                            key={i}
                                            className="animate-pulse bg-slate-100 rounded-xl h-20"
                                        />
                                    ))}
                                </div>
                            ) : threads.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full py-12">
                                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                                        <MessageSquare className="w-8 h-8 text-slate-400" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                        {debouncedSearchQuery || filters.type ? "Aucun résultat" : "Aucune discussion"}
                                    </h3>
                                    <p className="text-sm text-slate-500 text-center max-w-xs">
                                        {debouncedSearchQuery || filters.type
                                            ? "Essayez de modifier vos filtres"
                                            : "Envoyez un premier message pour commencer"
                                        }
                                    </p>
                                </div>
                            ) : (
                                <ThreadList
                                    threads={threads}
                                    selectedId={selectedThread?.id}
                                    onSelect={handleSelectThread}
                                    currentUserId={session?.user?.id}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Thread View Panel - flex-1 fills remaining height */}
                <div className="flex-1 flex flex-col min-w-0 min-h-0">
                    {isLoadingThread ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                                <p className="text-sm text-slate-500">Chargement...</p>
                            </div>
                        </div>
                    ) : selectedThread ? (
                        <ThreadView
                            thread={selectedThread}
                            onClose={handleCloseThread}
                            onStatusChange={handleStatusChange}
                            onSendMessage={handleSendMessage}
                            onReactionToggle={() => selectedThread && fetchThreadDetails(selectedThread.id)}
                            currentUserId={session?.user?.id || ""}
                            typingUserName={getTypingText(selectedThread.id)}
                            focusMode={focusMode}
                            onFocusModeChange={setFocusMode}
                            isRecipientOnline={isRecipientOnline}
                            onTyping={handleTyping}
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center h-full bg-white dark:bg-[#151c2a]">
                            <div className="text-center">
                                <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-5">
                                    <MessageSquare className="w-10 h-10 text-slate-400" />
                                </div>
                                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                                    Sélectionnez une discussion
                                </h3>
                                <p className="text-sm text-slate-500 max-w-sm">
                                    Choisissez une conversation dans la liste pour commencer
                                </p>
                            </div>
                        </div>
                    )}
                </div>
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
                onResultClick={(threadId) => {
                    fetchThreadDetails(threadId);
                    setShowSearchPanel(false);
                }}
            />
        </div>
    );
}
