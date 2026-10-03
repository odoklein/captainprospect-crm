"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING, FOCUS_RING_INVERSE } from "./recipes";

export interface SegmentedOption<T extends string> {
    value: T;
    label: ReactNode;
    icon?: LucideIcon;
    /** Small counter after the label. */
    count?: number;
    /** Danger active state, for an "En retard" kind of filter. */
    alert?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
}

interface SegmentedControlProps<T extends string> {
    options: SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    ariaLabel: string;
    size?: "sm" | "md";
    /** `inverse` on the brand surface (hero, sidebar). */
    tone?: "default" | "inverse";
    fullWidth?: boolean;
    className?: string;
}

/**
 * Pill toggle between 2–6 views ("Jour / Semaine / Mois"). Track 12px with
 * p-1 → segments 8px (concentric). Arrow keys move the selection (radiogroup).
 */
export function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    ariaLabel,
    size = "md",
    tone = "default",
    fullWidth,
    className,
}: SegmentedControlProps<T>) {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const inverse = tone === "inverse";

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const enabled = options.map((o, i) => ({ o, i })).filter(({ o }) => !o.disabled);
        const at = enabled.findIndex(({ o }) => o.value === value);
        const next =
            e.key === "Home" ? 0
            : e.key === "End" ? enabled.length - 1
            : (at + (e.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length;
        const target = enabled[next];
        if (!target) return;
        onChange(target.o.value);
        refs.current[target.i]?.focus();
    };

    return (
        <div
            role="radiogroup"
            aria-label={ariaLabel}
            onKeyDown={onKeyDown}
            className={cn(
                "inline-flex items-center gap-0.5 rounded-control p-1",
                inverse ? "bg-inverse-raised border border-inverse-line" : "bg-surface-3 border border-line",
                fullWidth && "flex w-full",
                className,
            )}
        >
            {options.map((o, i) => {
                const active = o.value === value;
                const Icon = o.icon;
                return (
                    <button
                        key={o.value}
                        ref={(el) => {
                            refs.current[i] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={o.ariaLabel}
                        tabIndex={active ? 0 : -1}
                        disabled={o.disabled}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-[background-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-40",
                            size === "sm" ? "h-6 px-2.5 text-xs" : "h-7 px-3 text-xs",
                            fullWidth && "flex-1",
                            inverse ? FOCUS_RING_INVERSE : cn(FOCUS_RING, "focus-visible:ring-offset-surface-3"),
                            inverse
                                ? active ? "bg-white text-primary shadow-sm" : "text-inverse-ink-2 hover:text-inverse-ink hover:bg-white/8"
                                : o.alert
                                    ? active ? "bg-danger text-white shadow-sm" : "text-danger hover:text-danger-ink"
                                    : active
                                        ? "bg-surface text-ink shadow-sm ring-1 ring-line/70"
                                        : "text-ink-3 hover:text-ink",
                        )}
                    >
                        {Icon && <Icon className="size-3.5" aria-hidden />}
                        {o.label}
                        {o.count !== undefined && (
                            <span
                                className={cn(
                                    "min-w-4 rounded-full px-1 text-3xs font-bold tabular-nums",
                                    active ? (inverse ? "bg-primary-50 text-primary" : "bg-surface-3 text-ink-2") : inverse ? "bg-white/10" : "bg-surface text-ink-3",
                                )}
                            >
                                {o.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

export default SegmentedControl;
