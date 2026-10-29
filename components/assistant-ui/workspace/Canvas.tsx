"use client";

/**
 * The canvas slot beside a thread: one visual at full size. Beside the
 * column from md up, full-screen below (and inside a compact embed, over it).
 */

import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { cn } from "@/lib/utils";
import { VisualCanvas } from "../visuals/VisualCanvas";

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
    return (
        <div
            className={cn(
                "z-[70] bg-surface",
                overlay
                    ? "absolute inset-0"
                    : "fixed inset-0 pb-[env(safe-area-inset-bottom)] md:relative md:inset-auto md:z-auto md:w-[min(560px,46vw)] md:shrink-0 md:pb-0",
            )}
        >
            <VisualCanvas key={visual.id} visual={visual} pinned={pinned} pinBusy={pinBusy} onTogglePin={onTogglePin} onClose={onClose} />
        </div>
    );
}
