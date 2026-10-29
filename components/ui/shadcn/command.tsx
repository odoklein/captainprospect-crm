"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/shadcn/dialog";

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
    return (
        <CommandPrimitive
            data-slot="command"
            className={cn("flex h-full w-full flex-col overflow-hidden rounded-panel bg-surface text-ink", className)}
            {...props}
        />
    );
}

function CommandDialog({
    title = "Palette de commandes",
    description = "Rechercher une commande ou une page…",
    children,
    className,
    showCloseButton = false,
    ...props
}: React.ComponentProps<typeof Dialog> & {
    title?: string;
    description?: string;
    className?: string;
    showCloseButton?: boolean;
}) {
    return (
        <Dialog {...props}>
            <DialogContent
                className={cn("top-[min(20%,10rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl", className)}
                showCloseButton={showCloseButton}
            >
                <DialogHeader className="sr-only">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <Command className="rounded-none **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:py-2.5">
                    {children}
                </Command>
            </DialogContent>
        </Dialog>
    );
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
    return (
        <div data-slot="command-input-wrapper" className="flex h-10 items-center gap-2 border-b border-line-subtle px-3">
            <SearchIcon className="size-4 shrink-0 text-ink-4" aria-hidden />
            <CommandPrimitive.Input
                data-slot="command-input"
                className={cn(
                    "flex h-10 w-full rounded-md bg-transparent py-3 text-sm text-ink outline-hidden placeholder:text-ink-4 disabled:cursor-not-allowed disabled:opacity-50",
                    className,
                )}
                {...props}
            />
        </div>
    );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
    return (
        <CommandPrimitive.List
            data-slot="command-list"
            className={cn("max-h-[320px] scroll-py-1.5 overflow-x-hidden overflow-y-auto", className)}
            {...props}
        />
    );
}

function CommandEmpty({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
    return <CommandPrimitive.Empty data-slot="command-empty" className={cn("py-6 text-center text-sm text-ink-3", className)} {...props} />;
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
    return (
        <CommandPrimitive.Group
            data-slot="command-group"
            className={cn(
                "overflow-hidden p-1.5 text-ink",
                "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-ink-3 [&_[cmdk-group-heading]]:uppercase",
                className,
            )}
            {...props}
        />
    );
}

function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
    return <CommandPrimitive.Separator data-slot="command-separator" className={cn("-mx-1 h-px bg-line-subtle", className)} {...props} />;
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
    return (
        <CommandPrimitive.Item
            data-slot="command-item"
            className={cn(
                "relative flex cursor-default items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm text-ink-2 outline-hidden select-none",
                "data-[selected=true]:bg-surface-3 data-[selected=true]:text-ink",
                "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
                "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-ink-3",
                className,
            )}
            {...props}
        />
    );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
    return <span data-slot="command-shortcut" className={cn("ml-auto pl-4 text-xs tracking-widest text-ink-4", className)} {...props} />;
}

export {
    Command,
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandShortcut,
    CommandSeparator,
};
