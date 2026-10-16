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
            <div className={cn("relative overflow-hidden rounded-2xl bg-inverse p-5 sm:p-6 text-inverse-ink shadow-raised", className)}>
                <div className="relative z-10">
                    {(icon || eyebrow) && (
                        <div className="mb-1.5 flex items-center gap-2 text-xs sm:text-sm font-medium text-accent-300">
                            {icon}
                            {eyebrow}
                        </div>
                    )}
                    <h1 className="mb-1.5 text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
                    {subtitle && <p className="max-w-xl text-xs sm:text-sm text-inverse-ink-2">{subtitle}</p>}
                    {actions && <div className="mt-4 flex flex-wrap items-center gap-2.5">{actions}</div>}
                </div>
            </div>
        );
    }

    return (
        <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4", className)}>
            <div className="flex min-w-0 items-center gap-3">
                {icon && (
                    <span className="inline-flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50/80 text-primary-700 border border-primary-100/80 [&_svg]:size-4 sm:[&_svg]:size-4.5">
                        {icon}
                    </span>
                )}
                <div className="min-w-0">
                    {eyebrow && <div className="text-xs font-medium text-ink-3">{eyebrow}</div>}
                    <h1 className="truncate text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
                    {subtitle && <p className="mt-0.5 text-xs sm:text-sm text-ink-3">{subtitle}</p>}
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
                                "inline-flex size-8.5 items-center justify-center rounded-lg border border-line bg-surface text-ink-3 shadow-2xs transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-ink",
                                FOCUS_RING
                            )}
                        >
                            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
                        </button>
                    )}
                    {actions}
                </div>
            )}
        </div>
    );
}

export default PageHeader;
