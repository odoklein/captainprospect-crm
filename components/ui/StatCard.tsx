"use client";

import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, LucideIcon } from "lucide-react";
import { HTMLAttributes, ReactNode } from "react";

interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
    label: string;
    value: string | number;
    icon: LucideIcon;
    iconBg?: string;
    iconColor?: string;
    subtitle?: ReactNode;
    className?: string;
    density?: "normal" | "compact";
    trend?: {
        value: string;
        isPositive: boolean;
    };
}

export function StatCard({
    label,
    value,
    icon: Icon,
    iconBg = "bg-primary-50 ring-1 ring-inset ring-primary-100",
    iconColor = "text-primary-700",
    subtitle,
    className,
    density = "normal",
    trend,
    ...props
}: StatCardProps) {
    const isCompact = density === "compact";
    return (
        <div
            className={cn(
                "bg-surface border border-line shadow-card transition-[border-color,box-shadow] duration-200 hover:border-line-strong",
                isCompact ? "rounded-xl p-3 sm:p-3.5" : "rounded-2xl p-5",
                className
            )}
            {...props}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className={cn("font-semibold uppercase text-ink-3 truncate", isCompact ? "text-[10px] tracking-wider" : "text-2xs tracking-[0.08em]")}>{label}</p>
                    <p className={cn("font-display font-bold tracking-tight text-ink tabular-nums leading-none", isCompact ? "text-xl mt-1.5" : "text-[30px] mt-2.5")}>{value}</p>
                    {subtitle && (
                        <div className={cn("text-ink-3", isCompact ? "mt-1 text-[11px]" : "mt-2 text-xs")}>{subtitle}</div>
                    )}
                    {trend && (
                        <div className={cn(
                            "inline-flex items-center gap-0.5 tabular-nums font-semibold",
                            isCompact ? "mt-1 text-[11px]" : "mt-2 text-xs",
                            trend.isPositive ? "text-success" : "text-danger"
                        )}>
                            {trend.isPositive ? <ArrowUpRight className={cn(isCompact ? "size-3" : "size-3.5")} aria-hidden /> : <ArrowDownRight className={cn(isCompact ? "size-3" : "size-3.5")} aria-hidden />}
                            <span>{trend.value}</span>
                        </div>
                    )}
                </div>
                <div className={cn(
                    "shrink-0 flex items-center justify-center",
                    isCompact ? "size-7 rounded-lg" : "size-10 rounded-xl",
                    iconBg
                )}>
                    <Icon className={cn(isCompact ? "size-3.5" : "size-5", iconColor)} aria-hidden />
                </div>
            </div>
        </div>
    );
}

export default StatCard;
