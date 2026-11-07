"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { CircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
    return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn("grid gap-3", className)} {...props} />;
}

function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
    return (
        <RadioGroupPrimitive.Item
            data-slot="radio-group-item"
            className={cn(
                "aspect-square size-4 shrink-0 rounded-full border border-line-strong bg-surface text-primary shadow-2xs",
                "transition-[border-color,box-shadow] duration-150 ease-snappy hover:border-ink-4 data-[state=checked]:border-primary",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/20",
                FOCUS_RING,
                className,
            )}
            {...props}
        >
            <RadioGroupPrimitive.Indicator data-slot="radio-group-indicator" className="relative flex items-center justify-center">
                <CircleIcon className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary text-primary" aria-hidden />
            </RadioGroupPrimitive.Indicator>
        </RadioGroupPrimitive.Item>
    );
}

export { RadioGroup, RadioGroupItem };
