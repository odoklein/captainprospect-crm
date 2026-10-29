"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon, MinusIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
    return (
        <CheckboxPrimitive.Root
            data-slot="checkbox"
            className={cn(
                "peer group/checkbox size-4 shrink-0 rounded-[5px] border border-line-strong bg-surface shadow-2xs",
                "transition-[background-color,border-color,box-shadow] duration-150 ease-snappy hover:border-ink-4",
                "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-fg",
                "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-fg",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/20",
                FOCUS_RING,
                className,
            )}
            {...props}
        >
            <CheckboxPrimitive.Indicator
                data-slot="checkbox-indicator"
                className="grid place-content-center text-current"
            >
                <CheckIcon className="size-3.5 group-data-[state=indeterminate]/checkbox:hidden" strokeWidth={3} aria-hidden />
                <MinusIcon className="hidden size-3.5 group-data-[state=indeterminate]/checkbox:block" strokeWidth={3} aria-hidden />
            </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
    );
}

export { Checkbox };
