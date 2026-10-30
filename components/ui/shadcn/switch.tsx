"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";

/** On/off that applies immediately. `size="sm"` for dense rows. */
function Switch({
    className,
    size = "default",
    ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
    size?: "sm" | "default";
}) {
    return (
        <SwitchPrimitive.Root
            data-slot="switch"
            data-size={size}
            className={cn(
                "peer group/switch inline-flex shrink-0 items-center rounded-full p-0.5",
                "transition-colors duration-200 ease-snappy disabled:cursor-not-allowed disabled:opacity-45",
                "data-[state=checked]:bg-primary data-[state=unchecked]:bg-line-strong data-[state=unchecked]:hover:bg-ink-4",
                "data-[size=default]:h-5 data-[size=default]:w-9 data-[size=sm]:h-4 data-[size=sm]:w-7",
                "aria-invalid:ring-2 aria-invalid:ring-danger/30",
                FOCUS_RING,
                className,
            )}
            {...props}
        >
            <SwitchPrimitive.Thumb
                data-slot="switch-thumb"
                className={cn(
                    "pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-snappy",
                    "group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
                    "data-[state=unchecked]:translate-x-0 group-data-[size=default]/switch:data-[state=checked]:translate-x-4 group-data-[size=sm]/switch:data-[state=checked]:translate-x-3",
                )}
            />
        </SwitchPrimitive.Root>
    );
}

export { Switch };
