"use client";

// ============================================
// ThreadAnalytics - Visual metrics for a thread
// ============================================

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Clock, MessageSquare, Users, BarChart3, Loader2 } from "lucide-react";

interface ThreadAnalyticsData {
    threadId: string;
    responseTime: number | null; // Minutes
    messageCount: number;
    participantCount: number;
    activityScore: number;
    resolutionTime: number | null; // Hours
}

interface ThreadAnalyticsProps {
    threadId: string;
    className?: string;
}

export function ThreadAnalytics({ threadId, className }: ThreadAnalyticsProps) {
    const [stats, setStats] = useState<ThreadAnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch(`/api/comms/threads/${threadId}/analytics`);
                if (res.ok) {
                    const data = await res.json();
                    setStats(data);
                }
            } catch (error) {
                console.error("Failed to fetch analytics:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, [threadId]);

    if (isLoading) {
        return (
            <div className={cn("p-4 flex justify-center", className)}>
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
        );
    }

    if (!stats) return null;

    return (
        <div className={cn("grid grid-cols-2 gap-3", className)}>
            <StatCard
                icon={Clock}
                label="Tps réponse moy."
                value={stats.responseTime ? `${stats.responseTime} min` : "N/A"}
                color="text-primary-600 bg-primary-50"
            />
            <StatCard
                icon={BarChart3}
                label="Score activité"
                value={`${stats.activityScore}/100`}
                color="text-emerald-600 bg-emerald-50"
            />
            <StatCard
                icon={MessageSquare}
                label="Messages"
                value={stats.messageCount}
                color="text-slate-600 bg-slate-50"
            />
            <StatCard
                icon={Users}
                label="Participants"
                value={stats.participantCount}
                color="text-slate-600 bg-slate-50"
            />
            {stats.resolutionTime !== null && (
                <div className="col-span-2">
                    <StatCard
                        icon={CheckCircle}
                        label="Temps de résolution"
                        value={`${stats.resolutionTime} h`}
                        color="text-green-600 bg-green-50"
                        fullWidth
                    />
                </div>
            )}
        </div>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    color,
    fullWidth,
}: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: any;
    label: string;
    value: string | number;
    color: string;
    fullWidth?: boolean;
}) {
    return (
        <div
            className={cn(
                "p-3 rounded-xl border border-slate-100 flex items-center gap-3",
                fullWidth && "w-full"
            )}
        >
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", color)}>
                <Icon className="w-4 h-4" />
            </div>
            <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">
                    {label}
                </p>
                <p className="text-sm font-semibold text-slate-900">{value}</p>
            </div>
        </div>
    );
}

import { CheckCircle } from "lucide-react";

export default ThreadAnalytics;
