"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Inbox, Wifi, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

// ============================================
// ZONE B — Panel 3: Mailbox Health Grid
// Compact card per mailbox
// ============================================

interface MailboxHealth {
    id: string;
    email: string;
    displayName: string | null;
    provider: string;
    syncStatus: string;
    warmupStatus: string;
    warmupDailyLimit: number;
    dailySendLimit: number;
    sentToday: number;
    healthScore: number;
    isActive: boolean;
    disabledAt: string | null;
    lastError: string | null;
}

interface MailboxHealthGridProps {
    data: MailboxHealth[] | null;
    isLoading: boolean;
    onMailboxClick: (id: string) => void;
}

function getMailboxStatus(mb: MailboxHealth): "healthy" | "warming" | "error" {
    if (mb.disabledAt || mb.syncStatus === "ERROR" || !mb.isActive) return "error";
    if (mb.warmupStatus === "IN_PROGRESS") return "warming";
    return "healthy";
}

function getProviderLabel(provider: string): string {
    switch (provider) {
        case "GMAIL": return "Gmail";
        case "OUTLOOK": return "Outlook";
        case "CUSTOM": return "IMAP";
        case "REACHINBOX": return "ReachInbox";
        default: return provider;
    }
}

function warmupPercentage(mb: MailboxHealth): number {
    if (mb.warmupStatus === "COMPLETED") return 100;
    if (mb.warmupStatus === "NOT_STARTED") return 0;
    // Estimate based on dailySendLimit vs warmupDailyLimit
    return Math.min(Math.round((mb.sentToday / Math.max(mb.warmupDailyLimit, 1)) * 100), 100);
}

const statusBorder = {
    healthy: "border-emerald-200 hover:border-emerald-300",
    warming: "border-amber-200 hover:border-amber-300",
    error: "border-red-200 hover:border-red-300",
};

const statusDot = {
    healthy: "bg-emerald-500",
    warming: "bg-amber-400",
    error: "bg-red-500",
};

const statusLabel = {
    healthy: "Synchronisé",
    warming: "En warmup",
    error: "Erreur",
};

export function MailboxHealthGrid({ data, isLoading, onMailboxClick }: MailboxHealthGridProps) {
    if (isLoading || !data) {
        return (
            <Card className="p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                    <Skeleton className="h-5 w-36" />
                </div>
                <div className="p-4 grid grid-cols-1 gap-3">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <Skeleton key={i} className="h-28 rounded-xl" />
                    ))}
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-0 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#D9E5DD] flex items-center justify-center">
                        <Inbox className="w-3.5 h-3.5 text-[#2B5F3E]" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">Boîtes mail</h3>
                </div>
                <span className="text-xs text-slate-400">{data.length} boîtes</span>
            </div>

            {/* Grid */}
            <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                {data.length === 0 ? (
                    <div className="py-6 text-center">
                        <p className="text-sm text-slate-400">Aucune boîte mail connectée</p>
                    </div>
                ) : (
                    data.map((mb) => {
                        const status = getMailboxStatus(mb);
                        const warmup = warmupPercentage(mb);
                        const sendRatio = mb.dailySendLimit > 0
                            ? Math.round((mb.sentToday / mb.dailySendLimit) * 100)
                            : 0;

                        return (
                            <button
                                key={mb.id}
                                onClick={() => onMailboxClick(mb.id)}
                                className={cn(
                                    "w-full text-left p-4 rounded-xl border-2 bg-white transition-all duration-200 hover:shadow-sm",
                                    statusBorder[status]
                                )}
                            >
                                {/* Top: email + status */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-sm font-semibold text-slate-900 truncate">
                                            {mb.email}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        {status === "error" ? (
                                            <WifiOff className="w-3 h-3 text-red-500" />
                                        ) : (
                                            <Wifi className="w-3 h-3 text-emerald-500" />
                                        )}
                                        <span className={cn("w-2 h-2 rounded-full", statusDot[status])} />
                                        <span className="text-[10px] text-slate-500 font-medium">
                                            {statusLabel[status]}
                                        </span>
                                    </div>
                                </div>

                                {/* Provider + stats */}
                                <div className="flex items-center gap-4 text-xs">
                                    <span className="text-slate-400">
                                        {getProviderLabel(mb.provider)}
                                    </span>

                                    {/* Warmup bar */}
                                    {mb.warmupStatus !== "NOT_STARTED" && (
                                        <div className="flex items-center gap-2 flex-1">
                                            <span className="text-slate-400 whitespace-nowrap">Warmup</span>
                                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className={cn(
                                                        "h-full rounded-full transition-all duration-500",
                                                        warmup >= 100 ? "bg-emerald-500" : "bg-amber-400"
                                                    )}
                                                    style={{ width: `${warmup}%` }}
                                                />
                                            </div>
                                            <span className="text-slate-500 tabular-nums">{warmup}%</span>
                                        </div>
                                    )}
                                </div>

                                {/* Bottom stats */}
                                <div className="flex items-center gap-4 mt-2.5 text-xs">
                                    <div>
                                        <span className="text-slate-400">Envoyés : </span>
                                        <span className={cn(
                                            "font-semibold tabular-nums",
                                            sendRatio >= 90 ? "text-red-600" : "text-slate-700"
                                        )}>
                                            {mb.sentToday}/{mb.dailySendLimit}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400">Santé : </span>
                                        <span className={cn(
                                            "font-semibold tabular-nums",
                                            mb.healthScore >= 80 ? "text-emerald-600" : mb.healthScore >= 50 ? "text-amber-600" : "text-red-600"
                                        )}>
                                            {mb.healthScore}/100
                                        </span>
                                    </div>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </Card>
    );
}

export default MailboxHealthGrid;
