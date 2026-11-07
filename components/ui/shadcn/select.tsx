"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    menuContentClassName,
    menuItemClassName,
    menuLabelClassName,
    menuSeparatorClassName,
} from "@/components/ui/shadcn/menu-styles";

function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
    return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({ ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
    return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
    return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
    className,
    size = "default",
    children,
    ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
    size?: "sm" | "default";
}) {
    return (
        <SelectPrimitive.Trigger
            data-slot="select-trigger"
            data-size={size}
            className={cn(
                "flex w-fit cursor-pointer items-center justify-between gap-2 rounded-control border border-line bg-surface px-3 py-2 text-sm whitespace-nowrap text-ink shadow-2xs outline-none",
                "transition-[border-color,box-shadow] duration-150 ease-snappy hover:border-line-strong",
                "focus-visible:border-primary-400 focus-visible:ring-4 focus-visible:ring-primary-500/12 data-[state=open]:border-primary-400",
                "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-4",
                "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/15",
                "data-[placeholder]:text-ink-4 data-[size=default]:h-9 data-[size=sm]:h-8 data-[size=sm]:rounded-[10px]",
                "*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2",
                "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-ink-4",
                className,
            )}
            {...props}
        >
            {children}
            <SelectPrimitive.Icon asChild>
                <ChevronDownIcon className="size-4 opacity-80" />
            </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
    );
}

/** Defaults to `position="popper"` (opens below the trigger, at its width or wider). */
function SelectContent({
    className,
    children,
    position = "popper",
    align = "start",
    ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
    return (
        <SelectPrimitive.Portal>
            <SelectPrimitive.Content
                data-slot="select-content"
                className={cn(
                    menuContentClassName,
                    "relative max-h-(--radix-select-content-available-height) origin-(--radix-select-content-transform-origin) overflow-y-auto p-0",
                    position === "popper" &&
                        "data-[side=bottom]:translate-y-1.5 data-[side=left]:-translate-x-1.5 data-[side=right]:translate-x-1.5 data-[side=top]:-translate-y-1.5",
                    className,
                )}
                position={position}
                align={align}
                {...props}
            >
                <SelectScrollUpButton />
                <SelectPrimitive.Viewport
                    className={cn(
                        "p-1.5",
                        position === "popper" &&
                            "h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1.5",
                    )}
                >
                    {children}
                </SelectPrimitive.Viewport>
                <SelectScrollDownButton />
            </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
    );
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
    return <SelectPrimitive.Label data-slot="select-label" className={cn(menuLabelClassName, className)} {...props} />;
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
    return (
        <SelectPrimitive.Item
            data-slot="select-item"
            className={cn(
                menuItemClassName,
                "w-full pr-8 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
                className,
            )}
            {...props}
        >
            <span className="absolute right-2 flex size-3.5 items-center justify-center">
                <SelectPrimitive.ItemIndicator>
                    <CheckIcon className="size-3.5 text-primary" strokeWidth={2.5} />
                </SelectPrimitive.ItemIndicator>
            </span>
            <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        </SelectPrimitive.Item>
    );
}

function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
    return (
        <SelectPrimitive.Separator
            data-slot="select-separator"
            className={cn(menuSeparatorClassName, "pointer-events-none", className)}
            {...props}
        />
    );
}

function SelectScrollUpButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
    return (
        <SelectPrimitive.ScrollUpButton
            data-slot="select-scroll-up-button"
            className={cn("flex cursor-default items-center justify-center py-1 text-ink-4", className)}
            {...props}
        >
            <ChevronUpIcon className="size-4" />
        </SelectPrimitive.ScrollUpButton>
    );
}

function SelectScrollDownButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
    return (
        <SelectPrimitive.ScrollDownButton
            data-slot="select-scroll-down-button"
            className={cn("flex cursor-default items-center justify-center py-1 text-ink-4", className)}
            {...props}
        >
            <ChevronDownIcon className="size-4" />
        </SelectPrimitive.ScrollDownButton>
    );
}

export {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectScrollDownButton,
    SelectScrollUpButton,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
};
