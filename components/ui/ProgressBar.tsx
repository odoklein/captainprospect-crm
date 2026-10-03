"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
    value: number;
    max: number;
    className?: string;
    showLabel?: boolean;
    height?: "sm" | "md" | "lg";
    variant?: "default" | "shimmer";
    /** Fill colour: primary by default; success/warning/danger for thresholds, accent on the brand surface. */
    tone?: "primary" | "accent" | "success" | "warning" | "danger";
}

const FILL = {
    primary: "bg-primary",
    accent: "bg-accent",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
};

export function ProgressBar({
    value,
    max,
    className,
    showLabel = false,
    height = "md",
    variant = "shimmer",
    tone = "primary",
}: ProgressBarProps) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 100);
        return () => clearTimeout(t);
    }, []);

    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    const heightClass = height === "sm" ? "h-1.5" : height === "lg" ? "h-4" : "h-2.5";

    return (
        <div className={cn("w-full", className)}>
            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={value}
                className={cn(heightClass, "w-full bg-surface-3 rounded-full overflow-hidden")}
            >
                <div
                    className={cn(
                        "h-full rounded-full relative",
                        FILL[tone],
                        variant === "shimmer" && mounted && "progress-shimmer"
                    )}
                    style={{
                        width: mounted ? `${pct}%` : "0%",
                        transition: "width 900ms cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                />
            </div>
            {showLabel && (
                <div className="flex justify-between mt-1.5 text-xs text-ink-3 tabular-nums">
                    <span>{value}</span>
                    <span>{max}</span>
                </div>
            )}
        </div>
    );
}

export default ProgressBar;
