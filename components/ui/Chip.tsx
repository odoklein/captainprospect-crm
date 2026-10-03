"use client";

import type { ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./recipes";

interface ChipProps {
    children: ReactNode;
    /** Toggle filter chip: selected = primary soft. */
    selected?: boolean;
    onClick?: () => void;
    /** Shows an × that calls onRemove (active filters, tags). */
    onRemove?: () => void;
    icon?: LucideIcon;
    count?: number;
    disabled?: boolean;
    className?: string;
}

/** Filter or tag chip. Toggle with onClick, dismiss with onRemove. */
export function Chip({ children, selected, onClick, onRemove, icon: Icon, count, disabled, className }: ChipProps) {
    const base = cn(
        "inline-flex h-8 items-center gap-1.5 rounded-chip border px-3 text-xs font-semibold whitespace-nowrap transition-[background-color,border-color,color] duration-150",
        selected
            ? "border-primary-200 bg-primary-50 text-primary-700"
            : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
        disabled && "pointer-events-none opacity-45",
        className,
    );
    const content = (
        <>
            {Icon && <Icon className="size-3.5" aria-hidden />}
            {children}
            {count !== undefined && (
                <span className={cn("rounded-full px-1.5 text-3xs font-bold tabular-nums", selected ? "bg-primary-100" : "bg-surface-3 text-ink-3")}>
                    {count}
                </span>
            )}
        </>
    );

    if (onRemove) {
        return (
            <span className={cn(base, "pr-1")}>
                {content}
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label="Retirer"
                    className={cn("ml-0.5 inline-flex size-6 items-center justify-center rounded-full text-current/70 hover:bg-black/5 hover:text-current", FOCUS_RING)}
                >
                    <X className="size-3.5" aria-hidden />
                </button>
            </span>
        );
    }

    if (onClick) {
        return (
            <button type="button" onClick={onClick} aria-pressed={selected} disabled={disabled} className={cn(base, FOCUS_RING)}>
                {content}
            </button>
        );
    }

    return <span className={base}>{content}</span>;
}

export default Chip;
