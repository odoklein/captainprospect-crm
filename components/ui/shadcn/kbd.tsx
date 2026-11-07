import * as React from "react";

import { cn } from "@/lib/utils";

/** Keyboard key ("⌘K", "Échap"). Inside a TooltipContent it switches to the dark style. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
    return (
        <kbd
            data-slot="kbd"
            className={cn(
                "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-md border border-b-2 border-line-strong bg-surface px-1 font-mono text-3xs leading-none font-medium text-ink-2 select-none",
                "[&_svg:not([class*='size-'])]:size-3",
                "[[data-slot=tooltip-content]_&]:border-white/20 [[data-slot=tooltip-content]_&]:bg-white/10 [[data-slot=tooltip-content]_&]:text-surface",
                className,
            )}
            {...props}
        />
    );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {
    return <kbd data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)} {...props} />;
}

export { Kbd, KbdGroup };
