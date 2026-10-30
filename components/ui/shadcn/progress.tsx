"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
    return (
        <ProgressPrimitive.Root
            data-slot="progress"
            className={cn("relative h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}
            value={value}
            {...props}
        >
            <ProgressPrimitive.Indicator
                data-slot="progress-indicator"
                className="h-full w-full flex-1 rounded-full bg-primary motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-snappy"
                style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value || 0))}%)` }}
            />
        </ProgressPrimitive.Root>
    );
}

export { Progress };
