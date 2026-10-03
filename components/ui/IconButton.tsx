"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING, FOCUS_RING_INVERSE, type ControlSize } from "./recipes";
import { Spinner } from "./Spinner";

type IconButtonVariant = "ghost" | "outline" | "soft" | "primary" | "danger" | "inverse";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
    icon: LucideIcon;
    /** Accessible name; also shown as the native tooltip. */
    label: string;
    variant?: IconButtonVariant;
    size?: ControlSize;
    isLoading?: boolean;
    /** Pressed/selected state for toggles (bold, list view…). */
    active?: boolean;
}

const VARIANT: Record<IconButtonVariant, string> = {
    ghost: "text-ink-3 hover:text-ink hover:bg-surface-3",
    outline: "bg-surface border border-line text-ink-2 shadow-2xs hover:text-ink hover:border-line-strong hover:bg-surface-2",
    soft: "bg-primary-50 text-primary-700 hover:bg-primary-100",
    primary: "bg-primary text-primary-fg shadow-primary hover:bg-primary-hover",
    danger: "text-ink-3 hover:text-danger hover:bg-danger-soft",
    inverse: "text-inverse-ink-2 hover:text-inverse-ink hover:bg-white/10",
};

const ACTIVE: Record<IconButtonVariant, string> = {
    ghost: "bg-primary-50 text-primary-700",
    outline: "border-primary-300 bg-primary-50 text-primary-700",
    soft: "bg-primary-100",
    primary: "bg-primary-active",
    danger: "bg-danger-soft text-danger",
    inverse: "bg-white/12 text-inverse-ink",
};

const SIZE: Record<ControlSize, { box: string; icon: string }> = {
    xs: { box: "size-7 rounded-lg", icon: "size-3.5" },
    sm: { box: "size-8 rounded-[10px]", icon: "size-4" },
    md: { box: "size-9 rounded-control", icon: "size-[18px]" },
    lg: { box: "size-11 rounded-control", icon: "size-5" },
};

/** Square, icon-only button. Always labelled. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ icon: Icon, label, variant = "ghost", size = "md", isLoading, active, className, disabled, type = "button", ...props }, ref) => (
        <button
            ref={ref}
            type={type}
            aria-label={label}
            title={label}
            aria-pressed={active}
            disabled={disabled || isLoading}
            className={cn(
                "inline-flex shrink-0 items-center justify-center transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-45",
                variant === "inverse" ? FOCUS_RING_INVERSE : FOCUS_RING,
                SIZE[size].box,
                VARIANT[variant],
                active && ACTIVE[variant],
                className,
            )}
            {...props}
        >
            {isLoading ? <Spinner className={SIZE[size].icon} /> : <Icon className={SIZE[size].icon} aria-hidden />}
        </button>
    ),
);

IconButton.displayName = "IconButton";

export default IconButton;
