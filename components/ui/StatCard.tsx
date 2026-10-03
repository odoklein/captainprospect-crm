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
    trend,
    ...props
}: StatCardProps) {
    return (
        <div
            className={cn(
                "bg-surface border border-line rounded-2xl p-5 shadow-card transition-[border-color,box-shadow] duration-200 hover:border-line-strong",
                className
            )}
            {...props}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3 truncate">{label}</p>
                    <p className="font-display text-[30px] leading-none font-bold tracking-tight text-ink mt-2.5 tabular-nums">{value}</p>
                    {subtitle && (
                        <div className="mt-2 text-xs text-ink-3">{subtitle}</div>
                    )}
                    {trend && (
                        <div className={cn(
                            "inline-flex items-center gap-0.5 mt-2 text-xs font-semibold tabular-nums",
                            trend.isPositive ? "text-success" : "text-danger"
                        )}>
                            {trend.isPositive ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                            <span>{trend.value}</span>
                        </div>
                    )}
                </div>
                <div className={cn(
                    "size-10 shrink-0 rounded-xl flex items-center justify-center",
                    iconBg
                )}>
                    <Icon className={cn("size-5", iconColor)} aria-hidden />
                </div>
            </div>
        </div>
    );
}

export default StatCard;
