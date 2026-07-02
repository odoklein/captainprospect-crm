"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
    Send,
    Eye,
    MessageSquare,
    MousePointerClick,
    AlertTriangle,
    Zap,
    Star,
    RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

// ============================================
// ZONE B — Panel 2: Activity Feed
// Chronological live feed of email events today
// ============================================

interface ActivityEvent {
    id: string;
    type: "sent" | "opened" | "replied" | "clicked" | "bounced" | "sequence_step";
    timestamp: string;
    contactName: string | null;
    companyName: string | null;
    contactId: string | null;
    threadId: string | null;
    subject: string;
    missionName: string | null;
    sequenceName: string | null;
    mailboxEmail: string | null;
    openCount?: number;
    meta?: string;
}

interface ActivityFeedProps {
    data: ActivityEvent[] | null;
    isLoading: boolean;
    onRefresh: () => void;
    lastRefreshAt?: Date;
}

const eventConfig: Record<
    ActivityEvent["type"],
    { icon: React.ReactNode; color: string; bg: string; label: string }
> = {
    replied: {
        icon: <Star className="w-3.5 h-3.5" />,
        color: "text-emerald-600",
        bg: "bg-emerald-100",
        label: "RÉPONSE",
    },
    opened: {
        icon: <Eye className="w-3.5 h-3.5" />,
        color: "text-blue-600",
        bg: "bg-blue-100",
        label: "",
    },
    clicked: {
        icon: <MousePointerClick className="w-3.5 h-3.5" />,
        color: "text-[#2B5F3E]",
        bg: "bg-[#D9E5DD]",
        label: "",
    },
    sent: {
        icon: <Send className="w-3.5 h-3.5" />,
        color: "text-slate-500",
        bg: "bg-slate-100",
        label: "",
    },
    sequence_step: {
        icon: <Zap className="w-3.5 h-3.5" />,
        color: "text-[#2B5F3E]",
        bg: "bg-[#D9E5DD]",
        label: "",
    },
    bounced: {
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
        color: "text-red-600",
        bg: "bg-red-100",
        label: "REBOND",
    },
};

function formatTime(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function EventDescription({ event }: { event: ActivityEvent }) {
    const name = event.contactName || "Contact";
    switch (event.type) {
        case "replied":
            return (
                <span>
                    <strong className="text-slate-900">{name}</strong>{" "}
                    a répondu à{" "}
                    <span className="text-slate-600">&ldquo;{event.subject}&rdquo;</span>
                </span>
            );
        case "opened":
            return (
                <span>
                    <strong className="text-slate-900">{name}</strong>{" "}
                    a ouvert{" "}
                    <span className="text-slate-600">&ldquo;{event.subject}&rdquo;</span>
                    {event.openCount && event.openCount > 1 && (
                        <span className="text-slate-400"> ({event.openCount}×)</span>
                    )}
                </span>
            );
        case "clicked":
            return (
                <span>
                    <strong className="text-slate-900">{name}</strong>{" "}
                    a cliqué un lien
                </span>
            );
        case "bounced":
            return (
                <span>
                    Rebond sur{" "}
                    <span className="text-slate-600">{event.mailboxEmail}</span>
                </span>
            );
        case "sequence_step":
            return (
                <span>
                    Séquence a envoyé {event.meta || "une étape"} →{" "}
                    <strong className="text-slate-900">{name}</strong>
                </span>
            );
        case "sent":
            return (
                <span>
                    Email envoyé à{" "}
                    <strong className="text-slate-900">{name}</strong>
                </span>
            );
        default:
            return <span>{event.subject}</span>;
    }
}

export function ActivityFeed({ data, isLoading, onRefresh, lastRefreshAt }: ActivityFeedProps) {
    // Auto-refresh timer
    const [countdown, setCountdown] = useState(60);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        setCountdown(60);
        intervalRef.current = setInterval(() => {
            setCountdown((c) => {
                if (c <= 1) {
                    onRefresh();
                    return 60;
                }
                return c - 1;
            });
        }, 1000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [lastRefreshAt]); // eslint-disable-line react-hooks/exhaustive-deps

    if (isLoading && !data) {
        return (
            <Card className="p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                    <Skeleton className="h-5 w-40" />
                </div>
                <div className="divide-y divide-slate-50">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="px-5 py-3 flex items-center gap-3">
                            <Skeleton className="w-6 h-6 rounded-full" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-3.5 w-4/5" />
                                <Skeleton className="h-3 w-1/3" />
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-0 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">Activité du jour</h3>
                </div>
                <button
                    onClick={() => {
                        onRefresh();
                        setCountdown(60);
                    }}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                    <span className="tabular-nums">{countdown}s</span>
                </button>
            </div>

            {/* Feed */}
            <div className="flex-1 overflow-y-auto max-h-[400px] divide-y divide-slate-50">
                {!data || data.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                        <p className="text-sm text-slate-400">Aucune activité aujourd&apos;hui</p>
                    </div>
                ) : (
                    data.map((event) => {
                        const config = eventConfig[event.type];
                        return (
                            <div
                                key={event.id}
                                className={cn(
                                    "px-5 py-3 flex items-start gap-3 hover:bg-slate-50/50 transition-colors",
                                    event.type === "replied" && "bg-emerald-50/30",
                                    event.type === "bounced" && "bg-red-50/30"
                                )}
                            >
                                {/* Time */}
                                <span className="text-[11px] text-slate-400 font-mono tabular-nums w-10 flex-shrink-0 pt-0.5">
                                    {formatTime(event.timestamp)}
                                </span>

                                {/* Icon */}
                                <div
                                    className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                                        config.bg,
                                        config.color
                                    )}
                                >
                                    {config.icon}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-slate-600 leading-snug">
                                        <EventDescription event={event} />
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        {config.label && (
                                            <span
                                                className={cn(
                                                    "text-[10px] font-bold uppercase tracking-wider",
                                                    config.color
                                                )}
                                            >
                                                ← {config.label}
                                            </span>
                                        )}
                                        {event.missionName && (
                                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                                {event.missionName}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </Card>
    );
}

export default ActivityFeed;
