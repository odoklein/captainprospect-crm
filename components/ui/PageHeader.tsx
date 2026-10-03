"use client";

import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { ReactNode } from "react";
import { FOCUS_RING } from "./recipes";

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    icon?: ReactNode;
    actions?: ReactNode;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    className?: string;
    /** hero — the title sits on the brand surface (role landing pages) */
    variant?: "default" | "hero";
    /** Small line above the title: section name, breadcrumb, date. */
    eyebrow?: ReactNode;
}

export function PageHeader({
    title,
    subtitle,
    icon,
    actions,
    onRefresh,
    isRefreshing = false,
    className,
    variant = "default",
    eyebrow,
}: PageHeaderProps) {
    if (variant === "hero") {
        return (
            <div className={cn("relative overflow-hidden rounded-card bg-inverse p-7 text-inverse-ink shadow-raised sm:p-8", className)}>
                <div className="relative z-10">
                    {(icon || eyebrow) && (
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-accent-300">
                            {icon}
                            {eyebrow}
                        </div>
                    )}
                    <h1 className="mb-2 text-3xl font-bold tracking-tight">{title}</h1>
                    {subtitle && <p className="max-w-xl text-inverse-ink-2">{subtitle}</p>}
                    {actions && <div className="mt-6 flex flex-wrap items-center gap-3">{actions}</div>}
                </div>
            </div>
        );
    }

    return (
        <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
            <div className="flex min-w-0 items-center gap-3.5">
                {icon && (
                    <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100 [&_svg]:size-5">
                        {icon}
                    </span>
                )}
                <div className="min-w-0">
                    {eyebrow && <div className="mb-0.5 text-xs font-medium text-ink-3">{eyebrow}</div>}
                    <h1 className="truncate text-2xl font-bold tracking-tight text-ink sm:text-[26px]">{title}</h1>
                    {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
                </div>
            </div>
            {(onRefresh || actions) && (
                <div className="flex flex-wrap items-center gap-2">
                    {onRefresh && (
                        <button
                            type="button"
                            onClick={onRefresh}
                            aria-label="Actualiser"
                            title="Actualiser"
                            className={cn(
                                "inline-flex size-10 items-center justify-center rounded-control border border-line bg-surface text-ink-3 shadow-2xs transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-ink",
                                FOCUS_RING
                            )}
                        >
                            <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
                        </button>
                    )}
                    {actions}
                </div>
            )}
        </div>
    );
}

export default PageHeader;
