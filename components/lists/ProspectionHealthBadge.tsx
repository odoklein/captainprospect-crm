"use client";

import { type HealthStatus, type ConfidenceLevel } from "@/lib/types/health";

// ============================================
// PROSPECTION HEALTH BADGE
// ============================================
// A compact inline badge showing the health status of a list.
// Designed for use in table rows and list cards.
//
// Each status renders a coloured pill with an icon.
// Hover shows the explanation tooltip.

interface ProspectionHealthBadgeProps {
    status: HealthStatus;
    statusLabel: string;
    statusExplanation?: string;
    /** If true renders a smaller dot-only variant */
    compact?: boolean;
    /** Show coverage percentage next to label */
    coverageRate?: number | null;
}

export const STATUS_CONFIG: Record<HealthStatus, {
    color: string;       // Tailwind classes for bg + text + border
    dotColor: string;    // Dot fill color
    icon: string;        // Unicode emoji-free icon character
}> = {
    FULLY_PROSPECTED: {
        color: "bg-emerald-50 text-emerald-700 border-emerald-200",
        dotColor: "bg-emerald-500",
        icon: "✓",
    },
    IN_PROGRESS: {
        color: "bg-blue-50 text-blue-700 border-blue-200",
        dotColor: "bg-blue-500",
        icon: "→",
    },
    AT_RISK: {
        color: "bg-amber-50 text-amber-700 border-amber-200",
        dotColor: "bg-amber-400",
        icon: "!",
    },
    STALLED: {
        color: "bg-rose-50 text-rose-700 border-rose-200",
        dotColor: "bg-rose-500",
        icon: "‖",
    },
    INSUFFICIENT_DATA: {
        color: "bg-slate-50 text-slate-500 border-slate-200",
        dotColor: "bg-slate-400",
        icon: "?",
    },
};

export function ProspectionHealthBadge({
    status,
    statusLabel,
    statusExplanation,
    compact = false,
    coverageRate,
}: ProspectionHealthBadgeProps) {
    const cfg = STATUS_CONFIG[status];
    const normalizedStatusLabel =
        status === "FULLY_PROSPECTED" || status === "IN_PROGRESS"
            ? "ACTIVE"
            : status === "STALLED" || status === "INSUFFICIENT_DATA"
                ? "INACTIVE"
            : statusLabel;

    if (compact) {
        return (
            <span
                title={statusExplanation ?? normalizedStatusLabel}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${cfg.color}`}
            >
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor} flex-shrink-0`} />
                {normalizedStatusLabel}
            </span>
        );
    }

    return (
        <span
            title={statusExplanation ?? normalizedStatusLabel}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}
        >
            <span className={`w-2 h-2 rounded-full ${cfg.dotColor} flex-shrink-0`} />
            {normalizedStatusLabel}
            {coverageRate !== null && coverageRate !== undefined && (
                <span className="opacity-70">· {Math.round(coverageRate)}%</span>
            )}
        </span>
    );
}

// ============================================
// VELOCITY TREND BADGE
// ============================================

interface VelocityTrendBadgeProps {
    trend: "RISING" | "STABLE" | "DECLINING" | "UNKNOWN";
    explanation?: string;
    showLabel?: boolean;
}

const TREND_CONFIG = {
    RISING: { icon: "↑", label: "Hausse", color: "text-emerald-600" },
    STABLE: { icon: "→", label: "Stable", color: "text-blue-500" },
    DECLINING: { icon: "↓", label: "Baisse", color: "text-amber-600" },
    UNKNOWN: { icon: "–", label: "Inconnu", color: "text-slate-400" },
};

export function VelocityTrendBadge({ trend, explanation, showLabel = false }: VelocityTrendBadgeProps) {
    const cfg = TREND_CONFIG[trend];
    return (
        <span
            title={explanation}
            className={`inline-flex items-center gap-0.5 text-xs font-bold ${cfg.color}`}
        >
            <span>{cfg.icon}</span>
            {showLabel && <span>{cfg.label}</span>}
        </span>
    );
}

// ============================================
// CONFIDENCE LEVEL BADGE
// ============================================

interface ConfidenceBadgeProps {
    confidence: ConfidenceLevel;
    explanation?: string;
}

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { label: string; color: string }> = {
    HIGH: { label: "Fiable", color: "text-emerald-600" },
    MEDIUM: { label: "Modéré", color: "text-amber-600" },
    LOW: { label: "Faible", color: "text-orange-500" },
    INSUFFICIENT: { label: "Insuffisant", color: "text-slate-400" },
};

export function ConfidenceBadge({ confidence, explanation }: ConfidenceBadgeProps) {
    const cfg = CONFIDENCE_CONFIG[confidence];
    return (
        <span title={explanation} className={`text-xs font-medium ${cfg.color}`}>
            {cfg.label}
        </span>
    );
}

// ============================================
// ACTIVITY SCORE BAR
// ============================================

interface ActivityScoreBarProps {
    score: number;
    explanation?: string;
    size?: "sm" | "md";
}

function getScoreColor(score: number): string {
    if (score >= 70) return "bg-emerald-500";
    if (score >= 40) return "bg-amber-400";
    return "bg-rose-400";
}

export function ActivityScoreBar({ score, explanation, size = "md" }: ActivityScoreBarProps) {
    const color = getScoreColor(score);
    const height = size === "sm" ? "h-1" : "h-1.5";
    const textSize = size === "sm" ? "text-[10px]" : "text-xs";

    return (
        <div title={explanation} className="flex items-center gap-2 min-w-0">
            <div className={`flex-1 bg-slate-100 rounded-full overflow-hidden ${height}`}>
                <div
                    className={`${color} ${height} rounded-full transition-all duration-500`}
                    style={{ width: `${Math.max(2, score)}%` }}
                />
            </div>
            <span className={`${textSize} font-bold text-slate-600 tabular-nums flex-shrink-0`}>
                {score}
            </span>
        </div>
    );
}
