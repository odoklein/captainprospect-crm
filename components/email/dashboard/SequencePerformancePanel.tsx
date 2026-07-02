"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Zap, Pause, Play, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

// ============================================
// ZONE B — Panel 1: Sequence Performance
// Compact table with sparklines
// ============================================

interface SequencePerf {
    id: string;
    name: string;
    status: "ACTIVE" | "PAUSED" | "DRAFT" | "ARCHIVED";
    mission: { id: string; name: string } | null;
    enrolled: number;
    openRate: number;
    replyRate: number;
    stepsCount: number;
    sparkline: number[];
}

interface SequencePerformancePanelProps {
    data: SequencePerf[] | null;
    isLoading: boolean;
    onToggleStatus: (id: string, newStatus: string) => void;
    onNavigate: (sequenceId: string) => void;
}

// Mini sparkline using SVG
function Sparkline({ data, className }: { data: number[]; className?: string }) {
    if (!data.length) return null;
    const max = Math.max(...data, 1);
    const width = 80;
    const height = 24;
    const padding = 2;
    const points = data.map((v, i) => {
        const x = padding + (i / (data.length - 1)) * (width - padding * 2);
        const y = height - padding - (v / max) * (height - padding * 2);
        return `${x},${y}`;
    });
    const pathD = `M ${points.join(" L ")}`;

    return (
        <svg
            className={cn("flex-shrink-0", className)}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
        >
            <path
                d={pathD}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function StatusDot({ status }: { status: string }) {
    return (
        <span
            className={cn("w-2 h-2 rounded-full flex-shrink-0", {
                "bg-emerald-500": status === "ACTIVE",
                "bg-amber-400": status === "PAUSED",
                "bg-slate-300": status === "DRAFT",
                "bg-slate-200": status === "ARCHIVED",
            })}
        />
    );
}

export function SequencePerformancePanel({
    data,
    isLoading,
    onToggleStatus,
    onNavigate,
}: SequencePerformancePanelProps) {
    if (isLoading || !data) {
        return (
            <Card className="p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                    <Skeleton className="h-5 w-44" />
                </div>
                <div className="divide-y divide-slate-100">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="px-5 py-3 flex items-center gap-3">
                            <Skeleton className="w-6 h-6 rounded" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                            <Skeleton className="h-6 w-20 rounded" />
                        </div>
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
                        <Zap className="w-3.5 h-3.5 text-[#2B5F3E]" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">Séquences actives</h3>
                </div>
                <span className="text-xs text-slate-400">{data.length} séquences</span>
            </div>

            {/* Table */}
            {data.length === 0 ? (
                <div className="px-5 py-8 text-center">
                    <p className="text-sm text-slate-400">Aucune séquence active</p>
                </div>
            ) : (
                <div className="divide-y divide-slate-50">
                    {data.map((seq) => (
                        <div
                            key={seq.id}
                            className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50/50 transition-colors cursor-pointer group"
                            onClick={() => onNavigate(seq.id)}
                        >
                            {/* Status + Name */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <StatusDot status={seq.status} />
                                    <span className="text-sm font-medium text-slate-900 truncate">
                                        {seq.name}
                                    </span>
                                </div>
                                {seq.mission && (
                                    <p className="text-xs text-slate-400 mt-0.5 pl-4 truncate">
                                        {seq.mission.name}
                                    </p>
                                )}
                            </div>

                            {/* Stats */}
                            <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                                <div className="text-right">
                                    <p className="text-xs font-semibold text-slate-700 tabular-nums">
                                        {seq.enrolled}
                                    </p>
                                    <p className="text-[10px] text-slate-400">inscrits</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-semibold text-slate-700 tabular-nums">
                                        {seq.openRate}%
                                    </p>
                                    <p className="text-[10px] text-slate-400">ouvert</p>
                                </div>
                                <div className="text-right">
                                    <p className={cn(
                                        "text-xs font-semibold tabular-nums",
                                        seq.replyRate >= 8 ? "text-emerald-600" : seq.replyRate >= 4 ? "text-amber-600" : "text-slate-700"
                                    )}>
                                        {seq.replyRate}%
                                    </p>
                                    <p className="text-[10px] text-slate-400">réponse</p>
                                </div>
                            </div>

                            {/* Sparkline */}
                            <Sparkline
                                data={seq.sparkline}
                                className="text-[#4E8B66] hidden md:block"
                            />

                            {/* Actions */}
                            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                {seq.status === "ACTIVE" ? (
                                    <button
                                        onClick={() => onToggleStatus(seq.id, "PAUSED")}
                                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                        title="Mettre en pause"
                                    >
                                        <Pause className="w-3.5 h-3.5" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => onToggleStatus(seq.id, "ACTIVE")}
                                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                        title="Activer"
                                    >
                                        <Play className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

export default SequencePerformancePanel;
