"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./recipes";

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: ReactNode;
    description?: ReactNode;
    disabled?: boolean;
    size?: "sm" | "md";
    /** Accessible name when there is no visible label. */
    ariaLabel?: string;
    className?: string;
}

/** On/off setting that applies immediately. For a form value that is submitted later, use Checkbox. */
export function Switch({ checked, onChange, label, description, disabled, size = "md", ariaLabel, className }: SwitchProps) {
    const id = useId();
    const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
    const thumb = size === "sm" ? "size-4" : "size-5";
    const shift = size === "sm" ? "translate-x-4" : "translate-x-5";

    const control = (
        <button
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label ? undefined : ariaLabel}
            aria-describedby={description ? `${id}-desc` : undefined}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ease-snappy disabled:cursor-not-allowed disabled:opacity-45",
                FOCUS_RING,
                track,
                checked ? "bg-primary" : "bg-line-strong hover:bg-ink-4",
            )}
        >
            <span
                aria-hidden
                className={cn(
                    "rounded-full bg-white shadow-sm transition-transform duration-200 ease-snappy",
                    thumb,
                    checked ? shift : "translate-x-0",
                )}
            />
        </button>
    );

    if (!label) return <span className={className}>{control}</span>;

    return (
        <div className={cn("flex items-start justify-between gap-4", className)}>
            <div className="min-w-0">
                <label htmlFor={id} className={cn("block text-sm font-medium text-ink", !disabled && "cursor-pointer")}>
                    {label}
                </label>
                {description && (
                    <p id={`${id}-desc`} className="mt-0.5 text-xs leading-relaxed text-ink-3">
                        {description}
                    </p>
                )}
            </div>
            {control}
        </div>
    );
}

export default Switch;
