"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";

/** Shared by Dialog, AlertDialog and Sheet: scrim + fade. */
const overlayClassName = cn(
    "fixed inset-0 z-(--sh-z-modal) bg-sh-scrim backdrop-blur-[2px]",
    "duration-200 ease-snappy data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
);

/** Close « × » of Dialog and Sheet, same as Modal.tsx. */
const closeButtonClassName = cn(
    "absolute top-3.5 right-3.5 inline-flex size-9 items-center justify-center rounded-control text-ink-3 transition-colors duration-150 hover:bg-surface-3 hover:text-ink disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
    FOCUS_RING,
);

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
    return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
    return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
    return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
    return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
    return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn(overlayClassName, className)} {...props} />;
}

function DialogContent({
    className,
    children,
    showCloseButton = true,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean;
}) {
    return (
        <DialogPortal data-slot="dialog-portal">
            <DialogOverlay />
            <DialogPrimitive.Content
                data-slot="dialog-content"
                className={cn(
                    "fixed top-[50%] left-[50%] z-(--sh-z-modal) grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-card border border-line bg-surface p-6 text-ink shadow-overlay outline-none sm:max-w-lg",
                    "duration-200 ease-snappy data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-97",
                    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-97 data-[state=closed]:duration-150",
                    className,
                )}
                {...props}
            >
                {children}
                {showCloseButton && (
                    <DialogPrimitive.Close data-slot="dialog-close" className={closeButtonClassName}>
                        <XIcon aria-hidden />
                        <span className="sr-only">Fermer</span>
                    </DialogPrimitive.Close>
                )}
            </DialogPrimitive.Content>
        </DialogPortal>
    );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
    return <div data-slot="dialog-header" className={cn("flex flex-col gap-1.5 pr-8 text-left", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="dialog-footer"
            className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
            {...props}
        />
    );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
    return (
        <DialogPrimitive.Title
            data-slot="dialog-title"
            className={cn("text-lg leading-tight font-semibold tracking-tight text-ink", className)}
            {...props}
        />
    );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
    return (
        <DialogPrimitive.Description
            data-slot="dialog-description"
            className={cn("text-sm leading-relaxed text-ink-3", className)}
            {...props}
        />
    );
}

export {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
    DialogTrigger,
    overlayClassName,
    closeButtonClassName,
};
