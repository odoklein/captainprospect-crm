"use client";

import * as React from "react";
import { Toggle as TogglePrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";

const toggleVariants = cva(
    [
        "inline-flex items-center justify-center gap-2 rounded-control text-sm font-semibold whitespace-nowrap text-ink-3",
        "transition-[background-color,border-color,color,box-shadow] duration-150 ease-snappy hover:bg-surface-3 hover:text-ink",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=on]:bg-accent-soft data-[state=on]:text-accent-soft-ink",
        "aria-invalid:border-danger",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        FOCUS_RING,
    ],
    {
        variants: {
            variant: {
                default: "bg-transparent",
                outline:
                    "border border-line bg-surface shadow-2xs hover:border-line-strong hover:bg-surface-2 data-[state=on]:border-accent-200",
            },
            size: {
                default: "h-9 min-w-9 px-2",
                sm: "h-8 min-w-8 rounded-[10px] px-1.5",
                lg: "h-10 min-w-10 px-2.5",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);

function Toggle({
    className,
    variant,
    size,
    ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
    return (
        <TogglePrimitive.Root data-slot="toggle" className={cn(toggleVariants({ variant, size, className }))} {...props} />
    );
}

export { Toggle, toggleVariants };
