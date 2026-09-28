"use client";

import { createElement, forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ChevronDown, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { iconForResult, TONE_STYLES, type OutcomeTone } from "../_lib/status-ui";

// Small cockpit primitives built on the --cp-* tokens. Kept local until the
// shared components/ui primitives are migrated to the same tokens.

export const focusRing =
    "outline-none focus-visible:ring-2 focus-visible:ring-cp-green/40 focus-visible:ring-offset-1 focus-visible:ring-offset-cp-raised";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
    return <kbd className={cn("cpds-kbd", className)}>{children}</kbd>;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
    primary: "bg-cp-green text-white border-cp-green hover:bg-cp-green-hover",
    secondary: "bg-cp-raised text-cp-ink border-cp-border hover:border-cp-border-strong hover:bg-cp-sunken/60",
    ghost: "bg-transparent text-cp-ink-2 border-transparent hover:bg-cp-sunken hover:text-cp-ink",
    danger: "bg-cp-danger text-white border-cp-danger hover:opacity-90",
};

interface CpButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: "sm" | "md";
    icon?: LucideIcon;
    isLoading?: boolean;
}

export const CpButton = forwardRef<HTMLButtonElement, CpButtonProps>(function CpButton(
    { variant = "secondary", size = "md", icon: Icon, isLoading, className, children, disabled, type = "button", ...props },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled || isLoading}
            className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium whitespace-nowrap transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
                BUTTON_VARIANTS[variant],
                focusRing,
                className,
            )}
            {...props}
        >
            {isLoading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : Icon ? <Icon className="size-3.5" aria-hidden /> : null}
            {children}
        </button>
    );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    icon: LucideIcon;
    label: string;
    size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
    { icon: Icon, label, size = "md", className, type = "button", ...props },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type}
            aria-label={label}
            title={label}
            className={cn(
                "inline-flex items-center justify-center rounded-lg border border-cp-border bg-cp-raised text-cp-ink-3 transition-colors",
                "hover:border-cp-border-strong hover:text-cp-ink disabled:opacity-40 disabled:cursor-not-allowed",
                size === "sm" ? "size-7" : "size-9",
                focusRing,
                className,
            )}
            {...props}
        >
            <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
        </button>
    );
});

/** Icon for an outcome code (static lookup, rendered via createElement). */
export function ResultIcon({ code, className }: { code: string; className?: string }) {
    return createElement(iconForResult(code), { className, "aria-hidden": true });
}

export function ToneBadge({ tone, code, label, className }: { tone: OutcomeTone; code?: string; label: string; className?: string }) {
    return (
        <span className={cn("inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium", TONE_STYLES[tone].badge, className)}>
            {code && <ResultIcon code={code} className="size-3 shrink-0" />}
            <span className="truncate">{label}</span>
        </span>
    );
}

/** Native <select> dressed as a filter chip: accessible and keyboard-friendly for free. */
export function FilterSelect({
    label,
    value,
    onChange,
    options,
    active,
    className,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    active?: boolean;
    className?: string;
}) {
    return (
        <label
            className={cn(
                "relative inline-flex h-8 items-center gap-1 rounded-lg border pl-2.5 pr-7 text-xs transition-colors",
                "focus-within:ring-2 focus-within:ring-cp-green/40",
                active ? "border-cp-green/40 bg-cp-green-soft text-cp-green" : "border-cp-border bg-cp-raised text-cp-ink-2 hover:border-cp-border-strong",
                className,
            )}
        >
            <span className="shrink-0 text-cp-ink-3">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="max-w-44 cursor-pointer appearance-none truncate bg-transparent font-medium outline-none"
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-cp-ink-3" aria-hidden />
        </label>
    );
}

export function Segmented<T extends string>({
    value,
    onChange,
    options,
    label,
}: {
    value: T;
    onChange: (value: T) => void;
    options: Array<{ value: T; label: string }>;
    label: string;
}) {
    return (
        <div role="radiogroup" aria-label={label} className="inline-flex h-8 items-center rounded-lg border border-cp-border bg-cp-sunken/60 p-0.5">
            {options.map((o) => {
                const selected = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            "h-full rounded-md px-2.5 text-xs font-medium transition-colors",
                            selected ? "bg-cp-raised text-cp-ink shadow-sm" : "text-cp-ink-3 hover:text-cp-ink",
                            focusRing,
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
