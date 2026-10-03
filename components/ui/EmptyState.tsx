"use client";

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
    /** card — standalone block; inline — inside an existing card or list */
    variant?: "card" | "inline";
}

/** "Nothing here yet": the fact, why, and the next action. */
export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className,
    variant = "card",
}: EmptyStateProps) {
    const body = (
        <>
            <div
                className={cn(
                    "mx-auto flex items-center justify-center rounded-2xl border border-line bg-surface text-ink-3 shadow-xs",
                    variant === "inline" ? "mb-3 size-11" : "mb-4 size-14"
                )}
            >
                <Icon className={variant === "inline" ? "size-5" : "size-6"} aria-hidden />
            </div>
            <h3 className={cn("font-semibold tracking-tight text-ink", variant === "inline" ? "text-sm" : "text-base")}>{title}</h3>
            {description && (
                <p className={cn("mx-auto mt-1.5 max-w-sm leading-relaxed text-ink-3", variant === "inline" ? "text-xs" : "text-sm")}>
                    {description}
                </p>
            )}
            {action && <div className="mt-5 flex justify-center">{action}</div>}
        </>
    );

    if (variant === "inline") {
        return <div className={cn("px-6 py-10 text-center", className)}>{body}</div>;
    }

    return (
        <div className={cn("rounded-2xl border border-dashed border-line-strong bg-surface-2/60 px-6 py-14 text-center", className)}>
            {body}
        </div>
    );
}

export default EmptyState;
