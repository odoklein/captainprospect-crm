"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
    MessageSquare,
    AlertTriangle,
    Eye,
    Gauge,
    ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

// ============================================
// ZONE C — Pending Actions
// Items needing human attention
// ============================================

interface PendingAction {
    id: string;
    type: "reply" | "bounce" | "review" | "limit";
    priority: number;
    title: string;
    description: string;
    missionName: string | null;
    linkHref: string;
    linkLabel: string;
    count?: number;
    meta?: Record<string, unknown>;
}

interface PendingActionsProps {
    data: PendingAction[] | null;
    isLoading: boolean;
}

const typeConfig: Record<
    PendingAction["type"],
    { icon: React.ReactNode; color: string; bg: string; badge: string; badgeBg: string }
> = {
    reply: {
        icon: <MessageSquare className="w-4 h-4" />,
        color: "text-emerald-600",
        bg: "bg-emerald-50 border-emerald-200",
        badge: "RÉPONSE",
        badgeBg: "bg-emerald-100 text-emerald-700",
    },
    bounce: {
        icon: <AlertTriangle className="w-4 h-4" />,
        color: "text-red-600",
        bg: "bg-red-50 border-red-200",
        badge: "REBOND",
        badgeBg: "bg-red-100 text-red-700",
    },
    review: {
        icon: <Eye className="w-4 h-4" />,
        color: "text-amber-600",
        bg: "bg-amber-50 border-amber-200",
        badge: "REVIEW",
        badgeBg: "bg-amber-100 text-amber-700",
    },
    limit: {
        icon: <Gauge className="w-4 h-4" />,
        color: "text-orange-600",
        bg: "bg-orange-50 border-orange-200",
        badge: "LIMITE",
        badgeBg: "bg-orange-100 text-orange-700",
    },
};

export function PendingActions({ data, isLoading }: PendingActionsProps) {
    if (isLoading && !data) {
        return (
            <Card className="p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                    <Skeleton className="h-5 w-52" />
                </div>
                <div className="divide-y divide-slate-50">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="px-5 py-3 flex items-center gap-3">
                            <Skeleton className="w-8 h-8 rounded-lg" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                            <Skeleton className="h-8 w-24 rounded-lg" />
                        </div>
                    ))}
                </div>
            </Card>
        );
    }

    if (!data || data.length === 0) {
        return (
            <Card className="p-5">
                <div className="flex items-center gap-3 text-slate-400">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <span className="text-lg">✓</span>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-600">Tout est en ordre</p>
                        <p className="text-xs text-slate-400">Aucune action en attente</p>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-0 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">Actions à traiter</h3>
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
                    {data.length}
                </span>
            </div>

            {/* Actions list */}
            <div className="divide-y divide-slate-50">
                {data.map((action) => {
                    const config = typeConfig[action.type];
                    return (
                        <div
                            key={action.id}
                            className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50/50 transition-colors"
                        >
                            {/* Badge */}
                            <span
                                className={cn(
                                    "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md flex-shrink-0",
                                    config.badgeBg
                                )}
                            >
                                {config.badge}
                            </span>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900">
                                    {action.title}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5 truncate">
                                    {action.description}
                                </p>
                            </div>

                            {/* Mission tag */}
                            {action.missionName && (
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded flex-shrink-0 hidden sm:block">
                                    {action.missionName}
                                </span>
                            )}

                            {/* Action link */}
                            <a
                                href={action.linkHref}
                                className="flex items-center gap-1.5 text-xs font-medium text-[#2B5F3E] hover:text-[#1C3F2A] whitespace-nowrap flex-shrink-0 transition-colors"
                            >
                                {action.linkLabel}
                                <ArrowRight className="w-3 h-3" />
                            </a>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

export default PendingActions;
