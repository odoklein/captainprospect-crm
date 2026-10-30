import * as React from "react";
import { Slot as SlotPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";

const buttonVariants = cva(
    [
        "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-semibold tracking-[-0.005em] select-none",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-snappy active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-50",
        "aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/20",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        FOCUS_RING,
    ],
    {
        variants: {
            variant: {
                /** The one main action of a view (brand primary). */
                default: "bg-primary text-primary-fg shadow-primary hover:bg-primary-hover active:bg-primary-active",
                /** Quiet filled control. */
                secondary: "bg-surface-3 text-ink hover:bg-line data-[state=open]:bg-line",
                /** White bordered control (filters, "Annuler"). */
                outline:
                    "border border-line bg-surface text-ink-2 shadow-2xs hover:border-line-strong hover:bg-surface-2 hover:text-ink data-[state=open]:border-line-strong data-[state=open]:bg-surface-2 data-[state=open]:text-ink",
                /** No chrome: toolbars, icon actions. */
                ghost: "text-ink-3 hover:bg-surface-3 hover:text-ink data-[state=open]:bg-surface-3 data-[state=open]:text-ink",
                destructive: "bg-danger text-white shadow-xs hover:bg-danger-ink focus-visible:ring-danger/40",
                link: "text-link underline-offset-4 hover:text-primary-800 hover:underline active:scale-100",
                /** AI actions (Captain): brand accent. */
                ai: "bg-accent text-accent-fg shadow-xs hover:bg-accent-hover data-[state=open]:bg-accent-hover",
            },
            size: {
                xs: "h-7 gap-1.5 rounded-lg px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
                sm: "h-8 gap-1.5 rounded-[10px] px-3 text-[13px] has-[>svg]:px-2.5",
                default: "h-9 rounded-control px-4 text-sm has-[>svg]:px-3",
                lg: "h-10 rounded-control px-5 text-sm has-[>svg]:px-4",
                "icon-xs": "size-7 rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
                "icon-sm": "size-8 rounded-[10px]",
                icon: "size-9 rounded-control",
                "icon-lg": "size-10 rounded-control",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);

function Button({
    className,
    variant,
    size,
    asChild = false,
    ...props
}: React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
        asChild?: boolean;
    }) {
    const Comp = asChild ? SlotPrimitive.Slot : "button";

    return (
        <Comp
            data-slot="button"
            data-variant={variant ?? "default"}
            data-size={size ?? "default"}
            className={cn(buttonVariants({ variant, size, className }))}
            {...props}
        />
    );
}

export { Button, buttonVariants };
