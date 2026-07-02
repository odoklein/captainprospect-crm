"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
    Inbox,
    Flame,
    Send,
    Eye,
    Zap,
    AlertTriangle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

// ============================================
// ZONE A — Health Pulse Strip
// Single row of clickable metric pills
// ============================================

interface HealthData {
    activeMailboxes: number;
    warmingMailboxes: number;
    sentToday: number;
    openRate: number;
    activeSequences: number;
    errorMailboxes: number;
}

interface HealthPulseProps {
    data: HealthData | null;
    isLoading: boolean;
    onNavigate: (tab: string) => void;
}

interface PillProps {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    color: "slate" | "amber" | "indigo" | "emerald" | "violet" | "red";
    onClick: () => void;
    pulse?: boolean;
}

const colorMap = {
    slate: {
        bg: "bg-slate-50 hover:bg-slate-100 border-slate-200",
        icon: "text-slate-500",
        value: "text-slate-900",
        label: "text-slate-500",
    },
    amber: {
        bg: "bg-amber-50 hover:bg-amber-100 border-amber-200",
        icon: "text-amber-500",
        value: "text-amber-900",
        label: "text-amber-600",
    },
    indigo: {
        bg: "bg-[#E7EFE9] hover:bg-[#D9E5DD] border-[#C4D6CB]",
        icon: "text-[#2B5F3E]",
        value: "text-[#16301F]",
        label: "text-[#2B5F3E]",
    },
    emerald: {
        bg: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200",
        icon: "text-emerald-500",
        value: "text-emerald-900",
        label: "text-emerald-600",
    },
    violet: {
        bg: "bg-[#E7EFE9] hover:bg-[#D9E5DD] border-[#C4D6CB]",
        icon: "text-violet-500",
        value: "text-[#16301F]",
        label: "text-[#2B5F3E]",
    },
    red: {
        bg: "bg-red-50 hover:bg-red-100 border-red-200",
        icon: "text-red-500",
        value: "text-red-900",
        label: "text-red-600",
    },
};

function Pill({ icon, label, value, color, onClick, pulse }: PillProps) {
    const c = colorMap[color];
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all duration-200 hover:shadow-sm group",
                c.bg
            )}
        >
            <span className={cn("flex-shrink-0", c.icon)}>
                {icon}
            </span>
            <span className={cn("text-lg font-bold tabular-nums", c.value)}>
                {value}
            </span>
            <span className={cn("text-xs font-medium whitespace-nowrap", c.label)}>
                {label}
            </span>
            {pulse && (
                <span className="relative flex h-2 w-2 ml-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
            )}
        </button>
    );
}

export function HealthPulse({ data, isLoading, onNavigate }: HealthPulseProps) {
    if (isLoading || !data) {
        return (
            <div className="flex gap-3 overflow-x-auto pb-1">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-48 rounded-xl flex-shrink-0" />
                ))}
            </div>
        );
    }

    return (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
            <Pill
                icon={<Inbox className="w-4 h-4" />}
                label="boîtes actives"
                value={data.activeMailboxes}
                color="indigo"
                onClick={() => onNavigate("mailboxes")}
            />
            <Pill
                icon={<Flame className="w-4 h-4" />}
                label="en warmup"
                value={data.warmingMailboxes}
                color={data.warmingMailboxes > 0 ? "amber" : "slate"}
                onClick={() => onNavigate("mailboxes")}
            />
            <Pill
                icon={<Send className="w-4 h-4" />}
                label="envoyés aujourd'hui"
                value={data.sentToday}
                color="emerald"
                onClick={() => onNavigate("analytics")}
            />
            <Pill
                icon={<Eye className="w-4 h-4" />}
                label="taux d'ouverture"
                value={`${data.openRate}%`}
                color="violet"
                onClick={() => onNavigate("analytics")}
            />
            <Pill
                icon={<Zap className="w-4 h-4" />}
                label="séquences actives"
                value={data.activeSequences}
                color="indigo"
                onClick={() => onNavigate("sequences")}
            />
            {data.errorMailboxes > 0 && (
                <Pill
                    icon={<AlertTriangle className="w-4 h-4" />}
                    label="erreur"
                    value={data.errorMailboxes}
                    color="red"
                    onClick={() => onNavigate("mailboxes")}
                    pulse
                />
            )}
        </div>
    );
}

export default HealthPulse;
