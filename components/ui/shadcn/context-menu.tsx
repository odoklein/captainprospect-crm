"use client";

import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    menuCheckItemClassName,
    menuContentClassName,
    menuItemClassName,
    menuItemDestructiveClassName,
    menuItemIndicatorClassName,
    menuLabelClassName,
    menuSeparatorClassName,
    menuShortcutClassName,
    menuSubTriggerClassName,
} from "@/components/ui/shadcn/menu-styles";

function ContextMenu({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
    return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuTrigger({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
    return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />;
}

function ContextMenuGroup({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
    return <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />;
}

function ContextMenuPortal({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
    return <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />;
}

function ContextMenuSub({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
    return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />;
}

function ContextMenuRadioGroup({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
    return <ContextMenuPrimitive.RadioGroup data-slot="context-menu-radio-group" {...props} />;
}

function ContextMenuSubTrigger({
    className,
    inset,
    children,
    ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean;
}) {
    return (
        <ContextMenuPrimitive.SubTrigger
            data-slot="context-menu-sub-trigger"
            data-inset={inset}
            className={cn(menuItemClassName, menuSubTriggerClassName, className)}
            {...props}
        >
            {children}
            <ChevronRightIcon className="ml-auto size-4" />
        </ContextMenuPrimitive.SubTrigger>
    );
}

function ContextMenuSubContent({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
    return (
        <ContextMenuPrimitive.SubContent
            data-slot="context-menu-sub-content"
            className={cn(menuContentClassName, "origin-(--radix-context-menu-content-transform-origin)", className)}
            {...props}
        />
    );
}

function ContextMenuContent({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
    return (
        <ContextMenuPrimitive.Portal>
            <ContextMenuPrimitive.Content
                data-slot="context-menu-content"
                className={cn(
                    menuContentClassName,
                    "max-h-(--radix-context-menu-content-available-height) origin-(--radix-context-menu-content-transform-origin)",
                    className,
                )}
                {...props}
            />
        </ContextMenuPrimitive.Portal>
    );
}

function ContextMenuItem({
    className,
    inset,
    variant = "default",
    ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean;
    variant?: "default" | "destructive";
}) {
    return (
        <ContextMenuPrimitive.Item
            data-slot="context-menu-item"
            data-inset={inset}
            data-variant={variant}
            className={cn(menuItemClassName, menuItemDestructiveClassName, className)}
            {...props}
        />
    );
}

function ContextMenuCheckboxItem({
    className,
    children,
    checked,
    ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
    return (
        <ContextMenuPrimitive.CheckboxItem
            data-slot="context-menu-checkbox-item"
            className={cn(menuItemClassName, menuCheckItemClassName, className)}
            checked={checked}
            {...props}
        >
            <span className={menuItemIndicatorClassName}>
                <ContextMenuPrimitive.ItemIndicator>
                    <CheckIcon className="size-3.5 text-primary" strokeWidth={2.5} />
                </ContextMenuPrimitive.ItemIndicator>
            </span>
            {children}
        </ContextMenuPrimitive.CheckboxItem>
    );
}

function ContextMenuRadioItem({
    className,
    children,
    ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
    return (
        <ContextMenuPrimitive.RadioItem
            data-slot="context-menu-radio-item"
            className={cn(menuItemClassName, menuCheckItemClassName, className)}
            {...props}
        >
            <span className={menuItemIndicatorClassName}>
                <ContextMenuPrimitive.ItemIndicator>
                    <CircleIcon className="size-2 fill-current text-primary" />
                </ContextMenuPrimitive.ItemIndicator>
            </span>
            {children}
        </ContextMenuPrimitive.RadioItem>
    );
}

function ContextMenuLabel({
    className,
    inset,
    ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
    inset?: boolean;
}) {
    return (
        <ContextMenuPrimitive.Label
            data-slot="context-menu-label"
            data-inset={inset}
            className={cn(menuLabelClassName, className)}
            {...props}
        />
    );
}

function ContextMenuSeparator({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
    return (
        <ContextMenuPrimitive.Separator
            data-slot="context-menu-separator"
            className={cn(menuSeparatorClassName, className)}
            {...props}
        />
    );
}

function ContextMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
    return <span data-slot="context-menu-shortcut" className={cn(menuShortcutClassName, className)} {...props} />;
}

export {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuCheckboxItem,
    ContextMenuRadioItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuGroup,
    ContextMenuPortal,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuRadioGroup,
};
