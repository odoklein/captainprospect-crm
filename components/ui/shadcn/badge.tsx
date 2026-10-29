import * as React from "react";
import { Slot as SlotPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";

const badgeVariants = cva(
    [
        "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-chip border px-2 py-0.5 text-2xs font-semibold",
        "transition-[background-color,border-color,color] duration-150 ease-snappy",
        "[&>svg]:pointer-events-none [&>svg]:size-3",
        FOCUS_RING,
    ],
    {
        variants: {
            variant: {
                /** Solid brand primary (counts, "Nouveau"). */
                default: "border-transparent bg-primary text-primary-fg [a&]:hover:bg-primary-hover",
                /** Neutral soft chip. */
                secondary: "border-line bg-surface-3 text-ink-2 [a&]:hover:bg-line",
                /** Solid danger (shadcn's destructive). For a soft red tag use `danger`. */
                destructive: "border-transparent bg-danger text-white [a&]:hover:bg-danger-ink",
                outline: "border-line bg-surface text-ink-2 [a&]:hover:bg-surface-2 [a&]:hover:text-ink",
                success: "border-success-line bg-success-soft text-success-ink",
                warning: "border-warning-line bg-warning-soft text-warning-ink",
                danger: "border-danger-line bg-danger-soft text-danger-ink",
                info: "border-info-line bg-info-soft text-info-ink",
                /** AI / Captain: brand accent, soft. */
                ai: "border-accent-200 bg-accent-soft text-accent-soft-ink",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    },
);

function Badge({
    className,
    variant,
    asChild = false,
    ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
    const Comp = asChild ? SlotPrimitive.Slot : "span";

    return (
        <Comp
            data-slot="badge"
            data-variant={variant ?? "default"}
            className={cn(badgeVariants({ variant }), className)}
            {...props}
        />
    );
}

export { Badge, badgeVariants };
