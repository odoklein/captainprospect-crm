"use client";

import { useEffect } from "react";

// Keyboard focus across in-place navigation (?client=…&mission=…).
// The workspace swaps views without a page load, so focus would otherwise stay
// on a button that no longer exists. Before navigating, ask for a target
// (`data-focus-key`); the view that renders it takes focus, even when its data
// arrives a little later.

let pending: string | null = null;

export function requestFocus(key: string | null) {
    pending = key;
}

export function useFocusRequest(...deps: unknown[]) {
    useEffect(() => {
        if (!pending) return;
        const frame = requestAnimationFrame(() => {
            if (!pending) return;
            const element = document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(pending)}"]`);
            if (!element) return;
            pending = null;
            element.focus({ preventScroll: true });
            element.scrollIntoView({ block: "nearest" });
        });
        return () => cancelAnimationFrame(frame);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
