import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";
import type { CompletenessStatus } from "@/lib/types";
import { TONE_FILL, TONE_SOFT, TONE_SOLID, type Tone } from "./recipes";

type BadgeVariant = "default" | "primary" | "accent" | "success" | "warning" | "danger" | "info" | "outline";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
    status?: CompletenessStatus;
    size?: "xs" | "sm" | "md";
    /** Solid fill instead of the soft tint (counters, strong states). */
    solid?: boolean;
    /** Leading coloured dot. */
    dot?: boolean;
}

const STATUS_TONE: Record<CompletenessStatus, Tone> = {
    INCOMPLETE: "danger",
    PARTIAL: "warning",
    ACTIONABLE: "success",
};

const VARIANT_TONE: Record<Exclude<BadgeVariant, "outline">, Tone> = {
    default: "neutral",
    primary: "primary",
    accent: "accent",
    success: "success",
    warning: "warning",
    danger: "danger",
    info: "info",
};

const SIZES = {
    xs: "h-4 px-1.5 text-[10px] gap-1 leading-none font-medium",
    sm: "h-5 px-1.5 text-[11px] gap-1 leading-none",
    md: "h-5.5 px-2 text-xs gap-1.5 leading-none",
};

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, variant = "default", status, size = "md", solid, dot, children, ...props }, ref) => {
        const tone: Tone | null = status ? STATUS_TONE[status] : variant === "outline" ? null : VARIANT_TONE[variant];
        const look = tone === null
            ? "bg-transparent text-ink-2 border-line-strong"
            : solid
                ? cn(TONE_SOLID[tone], "border-transparent")
                : TONE_SOFT[tone];

        return (
            <span
                ref={ref}
                className={cn(
                    "inline-flex shrink-0 items-center whitespace-nowrap rounded-chip border font-semibold leading-none tabular-nums",
                    SIZES[size],
                    look,
                    className
                )}
                {...props}
            >
                {(status || dot) && (
                    <span
                        aria-hidden
                        className={cn("size-1.5 shrink-0 rounded-full", solid ? "bg-current opacity-80" : TONE_FILL[tone ?? "neutral"])}
                    />
                )}
                {children}
            </span>
        );
    }
);

Badge.displayName = "Badge";

export { Badge };
export default Badge;
