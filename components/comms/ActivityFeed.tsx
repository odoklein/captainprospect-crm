"use client";

// ============================================
// ActivityFeed - Recent communications list
// ============================================

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
    MessageSquare,
    AtSign,
    SmilePlus,
    CheckCircle,
    Flag,
    Loader2,
} from "lucide-react";
import type { CommsChannelType } from "@/lib/comms/types";
import { CHANNEL_TYPE_LABELS } from "@/lib/comms/types";

interface ActivityItem {
    id: string;
    type: "new_thread" | "new_message" | "status_change" | "mention" | "reaction";
    timestamp: string;
    actor: {
        id: string;
        name: string;
    };
    details: {
        threadId: string;
        threadSubject: string;
        channelType: CommsChannelType;
        channelName: string;
        contentPreview?: string;
        metadata?: string;
    };
    isRead: boolean;
}

interface ActivityFeedProps {
    className?: string;
    limit?: number;
    onItemClick?: (threadId: string) => void;
}

export function ActivityFeed({
    className,
    limit = 10,
    onItemClick,
}: ActivityFeedProps) {
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchActivity = async () => {
            try {
                const res = await fetch("/api/comms/activity");
                if (res.ok) {
                    const data = await res.json();
                    setActivities(data.slice(0, limit));
                }
            } catch (error) {
                console.error("Failed to fetch activity:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchActivity();
    }, [limit]);

    if (isLoading) {
        return (
            <div className={cn("p-4 flex justify-center", className)}>
                <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
            </div>
        );
    }

    if (activities.length === 0) {
        return (
            <div className={cn("p-6 text-center text-slate-400 text-sm", className)}>
                Aucune activité récente
            </div>
        );
    }

    const getIcon = (type: ActivityItem["type"]) => {
        switch (type) {
            case "new_thread":
                return <Flag className="w-4 h-4 text-emerald-500" />;
            case "new_message":
                return <MessageSquare className="w-4 h-4 text-primary-500" />;
            case "mention":
                return <AtSign className="w-4 h-4 text-amber-500" />;
            case "status_change":
                return <CheckCircle className="w-4 h-4 text-slate-500" />;
            case "reaction":
                return <SmilePlus className="w-4 h-4 text-rose-500" />;
        }
    };

    const getDescription = (item: ActivityItem) => {
        switch (item.type) {
            case "new_thread":
                return "a créé une discussion";
            case "new_message":
                return "a répondu";
            case "mention":
                return "vous a mentionné dans";
            case "status_change":
                return "a changé le statut de";
            case "reaction":
                return "a réagi à un message dans";
        }
    };

    return (
        <div className={cn("space-y-4", className)}>
            {activities.map((item) => (
                <button
                    key={item.id}
                    onClick={() => onItemClick?.(item.details.threadId)}
                    className="w-full text-left flex gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors group"
                >
                    <div className="mt-0.5 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-white group-hover:shadow-sm transition-all">
                        {getIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                            <span className="text-sm font-medium text-slate-900">
                                {item.actor.name}
                            </span>
                            <span className="text-xs text-slate-400 whitespace-nowrap ml-2">
                                {format(new Date(item.timestamp), "d MMM, HH:mm", {
                                    locale: fr,
                                })}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mb-1">
                            {getDescription(item)}{" "}
                            <span className="font-medium text-slate-700">
                                {item.details.threadSubject}
                            </span>
                        </p>
                        {item.details.contentPreview && (
                            <p className="text-xs text-slate-600 line-clamp-1 italic bg-slate-50/50 p-1.5 rounded border border-slate-100">
                                "{item.details.contentPreview}"
                            </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                                {CHANNEL_TYPE_LABELS[item.details.channelType]}
                            </span>
                            <span className="text-[10px] text-slate-400">
                                {item.details.channelName}
                            </span>
                        </div>
                    </div>
                </button>
            ))}
        </div>
    );
}

export default ActivityFeed;
