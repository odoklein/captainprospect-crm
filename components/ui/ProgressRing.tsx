"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ProgressRingProps {
    value: number;
    max: number;
    size?: number;
    strokeWidth?: number;
    className?: string;
    showValue?: boolean;
    /** Kept for compatibility; both variants render the same flat brand ring. */
    variant?: "default" | "glow";
    /** Ring colour: brand primary by default, accent on the brand surface. */
    tone?: "primary" | "accent" | "success";
}

export function ProgressRing({
    value,
    max,
    size = 120,
    strokeWidth = 10,
    className,
    showValue = false,
    tone = "primary",
}: ProgressRingProps) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 100);
        return () => clearTimeout(t);
    }, []);

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const pct = max > 0 ? Math.min(value / max, 1) : 0;
    const offset = circumference * (1 - (mounted ? pct : 0));
    const stroke = tone === "accent" ? "var(--ds-accent)" : tone === "success" ? "var(--ds-success)" : "var(--ds-primary)";

    return (
        <div className={cn("relative inline-flex items-center justify-center", className)}>
            <svg
                width={size}
                height={size}
                className="transform -rotate-90"
                aria-label={`${value} sur ${max}`}
                role="img"
            >
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="var(--ds-surface-3)"
                    strokeWidth={strokeWidth}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.4, 0, 0.2, 1)" }}
                />
            </svg>
            {showValue && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-2xl font-bold text-ink tabular-nums">{value}</span>
                    <span className="text-[10px] text-ink-3 -mt-0.5">sur {max}</span>
                </div>
            )}
        </div>
    );
}

export default ProgressRing;
