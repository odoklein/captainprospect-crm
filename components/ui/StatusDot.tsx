import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_FILL, type Tone } from "./recipes";

/** Coloured dot, optionally pulsing (live call, unread). Label it when it carries meaning on its own. */
export function StatusDot({ tone = "success", pulse, label, className }: { tone?: Tone; pulse?: boolean; label?: string; className?: string }) {
    return (
        <span className={cn("relative inline-flex size-2 shrink-0", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
            {pulse && <span className={cn("absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping", TONE_FILL[tone])} />}
            <span className={cn("relative size-2 rounded-full", TONE_FILL[tone])} />
        </span>
    );
}

/** Dot + text, the compact way to show a state in a table cell. */
export function StatusText({ tone = "success", pulse, children, className }: { tone?: Tone; pulse?: boolean; children: ReactNode; className?: string }) {
    return (
        <span className={cn("inline-flex items-center gap-2 text-xs font-medium text-ink-2", className)}>
            <StatusDot tone={tone} pulse={pulse} />
            {children}
        </span>
    );
}

export default StatusDot;
