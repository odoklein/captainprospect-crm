"use client";

import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
    Target,
    Building2,
    FileText,
    Users,
    MessageCircle,
    Megaphone,
} from "lucide-react";
import type {
    CommsThreadListItem,
    CommsChannelType,
} from "@/lib/comms/types";

interface ThreadListProps {
    threads: CommsThreadListItem[];
    selectedId?: string;
    onSelect: (thread: CommsThreadListItem) => void;
    isLoading?: boolean;
    currentUserId?: string;
}

const CHANNEL_ICONS: Record<CommsChannelType, typeof Target> = {
    MISSION: Target,
    CLIENT: Building2,
    CAMPAIGN: FileText,
    GROUP: Users,
    DIRECT: MessageCircle,
    BROADCAST: Megaphone,
};

const CHANNEL_TAGS: Record<CommsChannelType, string> = {
    MISSION: "Mission",
    CLIENT: "Client",
    CAMPAIGN: "Campagne",
    GROUP: "Groupe",
    DIRECT: "Direct",
    BROADCAST: "Inbound",
};

// Get display name for a thread
function getThreadDisplayName(thread: CommsThreadListItem, _currentUserId?: string): string {
    if (thread.channelType === "DIRECT") {
        if (thread.otherParticipantName) return thread.otherParticipantName;
        if (thread.subject.startsWith("Message avec ")) {
            return thread.subject.replace("Message avec ", "");
        }
    }
    return thread.channelName;
}

// Short relative time (5m, 1h, Yesterday, 2d ago)
function formatShortTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays === 1) return "Hier";
    if (diffDays < 7) return `${diffDays}j`;
    return formatDistanceToNow(date, { addSuffix: false, locale: fr });
}

export function ThreadList({
    threads,
    selectedId,
    onSelect,
    isLoading,
    currentUserId,
}: ThreadListProps) {
    if (isLoading) {
        return (
            <div className="space-y-0">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div
                        key={i}
                        className="flex items-start gap-3 p-4 border-b border-slate-100 dark:border-slate-800 animate-pulse"
                    >
                        <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0 mt-1" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (threads.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                    <MessageCircle className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-base font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Aucune discussion
                </p>
                <p className="text-sm text-slate-500 text-center">
                    Les conversations apparaîtront ici
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            {threads.map((thread) => {
                const ChannelIcon = CHANNEL_ICONS[thread.channelType];
                const isSelected = selectedId === thread.id;
                const hasUnread = thread.unreadCount > 0;
                const displayName = getThreadDisplayName(thread, currentUserId);
                const lastPreview = thread.lastMessage
                    ? thread.channelType === "DIRECT"
                        ? thread.lastMessage.content
                        : `${thread.lastMessage.authorName}: ${thread.lastMessage.content}`
                    : null;
                const updatedDate = new Date(thread.updatedAt);

                return (
                    <button
                        key={thread.id}
                        onClick={() => onSelect(thread)}
                        className={cn(
                            "w-full text-left flex items-start gap-3 p-4 border-b border-slate-100 dark:border-slate-800",
                            "hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer relative group transition-colors",
                            isSelected && "bg-primary-500/5 dark:bg-indigo-500/10",
                            !isSelected && hasUnread && "bg-slate-50/50 dark:bg-slate-800/30"
                        )}
                    >
                        {/* Active indicator - left accent bar */}
                        {isSelected && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500 rounded-r" />
                        )}

                        {/* Avatar - circular like inspo */}
                        <div
                            className={cn(
                                "size-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 flex-shrink-0",
                                thread.channelType === "DIRECT"
                                    ? "bg-primary-100 dark:bg-indigo-900/50 text-primary-600 dark:text-indigo-400 font-semibold text-sm"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            )}
                        >
                            {thread.channelType === "DIRECT" ? (
                                displayName.charAt(0).toUpperCase()
                            ) : (
                                <ChannelIcon className="w-5 h-5" />
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex flex-col flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-0.5 gap-2">
                                <p
                                    className={cn(
                                        "text-sm truncate pr-2",
                                        hasUnread
                                            ? "font-semibold text-slate-900 dark:text-white"
                                            : "font-medium text-slate-900 dark:text-white"
                                    )}
                                >
                                    {displayName}
                                </p>
                                {hasUnread ? (
                                    <span className="size-2 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                                ) : (
                                    <span
                                        className={cn(
                                            "text-xs shrink-0",
                                            isSelected
                                                ? "text-primary-600 dark:text-indigo-400 font-medium"
                                                : "text-slate-400 font-normal"
                                        )}
                                    >
                                        {formatShortTime(updatedDate)}
                                    </span>
                                )}
                            </div>

                            {lastPreview && (
                                <p
                                    className={cn(
                                        "text-xs truncate",
                                        hasUnread
                                            ? "text-slate-700 dark:text-slate-300 font-medium"
                                            : "text-slate-500 dark:text-slate-400"
                                    )}
                                >
                                    {lastPreview}
                                </p>
                            )}

                            {/* Tags - small pills like inspo */}
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                                {thread.channelType !== "DIRECT" && (
                                    <span className="text-[10px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 text-slate-500 dark:text-slate-400">
                                        {CHANNEL_TAGS[thread.channelType]}
                                    </span>
                                )}
                                {thread.isBroadcast && (
                                    <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded px-1.5 py-0.5 font-medium">
                                        Annonce
                                    </span>
                                )}
                                {thread.status === "OPEN" && thread.unreadCount > 0 && (
                                    <span className="text-[10px] bg-primary-100 dark:bg-indigo-900/30 text-primary-600 dark:text-indigo-400 rounded px-1.5 py-0.5 font-medium">
                                        Non lu
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Unread count badge */}
                        {hasUnread && (
                            <span className="flex-shrink-0 min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-bold bg-primary-500 text-white mt-1">
                                {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

export default ThreadList;
