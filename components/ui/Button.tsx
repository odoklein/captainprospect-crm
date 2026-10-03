"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { FOCUS_RING, FOCUS_RING_INVERSE } from "./recipes";
import { Spinner } from "./Spinner";

export type ButtonVariant =
    | "primary"
    | "accent"
    | "secondary"
    | "outline"
    | "soft"
    | "ghost"
    | "link"
    | "success"
    | "danger"
    | "inverse";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /**
     * primary — the one main action of a view (brand primary)
     * accent — brand highlight: AI, "start", a promoted action
     * secondary / outline — white bordered control
     * soft — tinted, for frequent secondary actions
     * ghost — no chrome (toolbars, cancel)
     * link — inline text action ("Voir tout")
     * success / danger — confirm or destroy
     * inverse — on the brand surface (hero, sidebar)
     */
    variant?: ButtonVariant;
    size?: ButtonSize;
    isLoading?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    fullWidth?: boolean;
}

const BUTTON_BASE_STYLES =
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-semibold tracking-[-0.005em] select-none cursor-pointer transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-snappy active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
    primary: "bg-primary text-primary-fg shadow-primary hover:bg-primary-hover active:bg-primary-active",
    accent: "bg-accent text-accent-fg shadow-xs hover:bg-accent-hover",
    secondary: "bg-surface text-ink-2 border border-line shadow-2xs hover:bg-surface-2 hover:border-line-strong hover:text-ink",
    outline: "bg-surface text-ink-2 border border-line shadow-2xs hover:bg-surface-2 hover:border-line-strong hover:text-ink",
    soft: "bg-primary-50 text-primary-700 hover:bg-primary-100",
    ghost: "bg-transparent text-ink-3 hover:text-ink hover:bg-surface-3",
    link: "bg-transparent text-link hover:text-primary-800 underline-offset-4 hover:underline active:scale-100 px-0! h-auto!",
    success: "bg-success text-white shadow-xs hover:bg-success-ink",
    danger: "bg-danger text-white shadow-xs hover:bg-danger-ink",
    inverse: "bg-white/10 text-inverse-ink border border-inverse-line hover:bg-white/15",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
    xs: "h-7 px-2.5 text-xs rounded-lg gap-1.5",
    sm: "h-9 px-3.5 text-[13px] rounded-[10px] gap-1.5",
    md: "h-10 px-4 text-sm rounded-control",
    lg: "h-11 px-5 text-sm rounded-control",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant = "primary",
            size = "md",
            isLoading = false,
            leftIcon,
            rightIcon,
            fullWidth,
            disabled,
            children,
            ...props
        },
        ref
    ) => {
        return (
            <button
                ref={ref}
                aria-busy={isLoading || undefined}
                className={cn(
                    BUTTON_BASE_STYLES,
                    variant === "inverse" ? FOCUS_RING_INVERSE : FOCUS_RING,
                    BUTTON_SIZES[size],
                    BUTTON_VARIANTS[variant],
                    fullWidth && "w-full",
                    className
                )}
                disabled={disabled || isLoading}
                {...props}
            >
                {isLoading ? <Spinner /> : leftIcon}
                {children}
                {!isLoading && rightIcon}
            </button>
        );
    }
);

Button.displayName = "Button";

export { Button };
export default Button;
