"use client";

// One keyboard grammar for the manager's workspaces (Appels, Journal
// d'appels, Listes): j/k move, Entrée opens, Échap closes, / searches,
// Espace plays, ? lists every shortcut. Each page passes the keys it uses.
//
// Keys are matched on KeyboardEvent.key ("j", "ArrowDown", "Enter", " ",
// "?", "["…). Nothing fires while the user types (Échap leaves the field),
// with ⌘/Ctrl/Alt held, inside the call keypad, or while a modal or drawer is
// open. Entrée and Espace stay with a focused button or link, which they
// activate; every other key works wherever the focus is in the page.

import { useEffect, useLayoutEffect, useRef } from "react";

export type KeyHandler = (e: KeyboardEvent) => void;
export type KeyMap = Partial<Record<string, KeyHandler | false | null | undefined>>;

export function isTypingTarget(el: EventTarget | null): boolean {
    const node = el as HTMLElement | null;
    return Boolean(node && (node.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName)));
}

export function useWorkspaceKeys(map: KeyMap, enabled = true) {
    const ref = useRef(map);
    useLayoutEffect(() => {
        ref.current = map;
    });

    useEffect(() => {
        if (!enabled) return;
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            if (isTypingTarget(el)) {
                if (e.key === "Escape") el?.blur();
                return;
            }
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
            if (el?.closest?.("[data-call-keypad]")) return;
            if (document.querySelector('[aria-modal="true"]')) return;
            if ((e.key === "Enter" || e.key === " ") && el?.closest?.("button, a, [role=button], summary, label")) return;
            const handler = ref.current[e.key];
            if (!handler) return;
            e.preventDefault();
            handler(e);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [enabled]);
}
