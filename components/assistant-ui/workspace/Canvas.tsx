"use client";

/**
 * The canvas slot beside a thread: one visual at full size. A side panel
 * beside the column from md up, a right-hand Sheet below; inside a compact
 * embed (drawers) it covers the embed.
 */

import { useSyncExternalStore } from "react";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/shadcn/sheet";
import { VisualCanvas } from "../visuals/VisualCanvas";

const DESKTOP = "(min-width: 768px)";

/** True from md up; false on the server. */
export function useIsDesktop(): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const query = window.matchMedia(DESKTOP);
            query.addEventListener("change", onChange);
            return () => query.removeEventListener("change", onChange);
        },
        () => window.matchMedia(DESKTOP).matches,
        () => true,
    );
}

export function Canvas({
    visual,
    pinned,
    pinBusy,
    onTogglePin,
    onClose,
    overlay = false,
}: {
    visual: StoredVisual;
    pinned?: boolean;
    pinBusy?: boolean;
    onTogglePin?: (visual: StoredVisual) => void;
    onClose: () => void;
    /** Compact hosts (drawers): always over the thread, never beside it. */
    overlay?: boolean;
}) {
    const desktop = useIsDesktop();
    const canvas = (handlesEscape: boolean) => (
        <VisualCanvas
            key={visual.id}
            visual={visual}
            pinned={pinned}
            pinBusy={pinBusy}
            onTogglePin={onTogglePin}
            onClose={onClose}
            handlesEscape={handlesEscape}
        />
    );

    if (overlay) return <div className="absolute inset-0 z-[70] bg-surface">{canvas(true)}</div>;

    if (desktop) return <div className="relative w-[min(560px,46vw)] shrink-0 bg-surface">{canvas(true)}</div>;

    return (
        <Sheet open onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-lg">
                <SheetTitle className="sr-only">{visual.spec.title}</SheetTitle>
                <SheetDescription className="sr-only">Visuel en grand, avec ses données.</SheetDescription>
                {canvas(false)}
            </SheetContent>
        </Sheet>
    );
}
