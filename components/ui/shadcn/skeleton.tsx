import * as React from "react";

import { cn } from "@/lib/utils";

/** Loading placeholder: bg-surface-3 with the ds shimmer sweep (static under reduced motion). Give it the radius of what it stands for. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="skeleton"
            aria-hidden
            className={cn(
                "rounded-control bg-surface-3 bg-size-[200%_100%] bg-no-repeat [background-image:var(--sh-shimmer)] motion-safe:animate-ds-shimmer",
                className,
            )}
            {...props}
        />
    );
}

export { Skeleton };
