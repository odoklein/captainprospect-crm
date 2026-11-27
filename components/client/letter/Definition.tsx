"use client";

// How a figure of the client letter is counted, one line, on hover or keyboard
// focus (and on tap on a phone, where focus follows the tap). The tooltip spans
// its anchor's width and wraps, so it never pushes the page sideways.

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Definition({
    text,
    children,
    className,
    placement = "below",
}: {
    /** One line: how the figure is counted. */
    text: string;
    children: ReactNode;
    className?: string;
    placement?: "below" | "above";
}) {
    const id = useId();
    return (
        <div
            tabIndex={0}
            aria-describedby={id}
            className={cn(
                "group/def relative rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-focus",
                className,
            )}
        >
            {children}
            <span
                role="tooltip"
                id={id}
                className={cn(
                    "pointer-events-none absolute inset-x-2 z-20 hidden rounded-lg bg-ink px-3 py-2 text-xs font-medium leading-snug text-surface shadow-overlay",
                    "group-hover/def:block group-focus-visible/def:block group-focus/def:block",
                    placement === "below" ? "top-full mt-1.5" : "bottom-full mb-1.5",
                )}
            >
                {text}
            </span>
        </div>
    );
}

/** The dotted underline that tells a label has a definition. */
export const DEFINED = "underline decoration-dotted decoration-line-strong underline-offset-4";
