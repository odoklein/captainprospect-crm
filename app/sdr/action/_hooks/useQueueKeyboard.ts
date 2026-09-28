"use client";

import { useEffect, useRef } from "react";

export interface QueueKeyboardHandlers {
    /** Moves the row cursor by `delta` (±1) or to an edge ("first" | "last"). */
    move: (delta: number | "first" | "last") => void;
    open: () => void;
    toggleSelect: () => void;
    call: () => void;
    /** Quick outcome slot (0-based) on the focused row. */
    quickOutcome: (slot: number) => void;
    focusSearch: () => void;
    toggleScript: () => void;
    refresh: () => void;
    help: () => void;
    escape: () => void;
}

export const QUICK_OUTCOME_SLOTS = 4;

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target.isContentEditable;
}

/**
 * Table shortcuts (disabled while any overlay is open):
 *   ↑/↓ or k/j  move · Home/End  first/last · Entrée/o  ouvrir la fiche
 *   x/Espace  sélectionner · a  appeler · 1–4  résultat rapide
 *   /  rechercher · s  script · r  actualiser · ?  aide · Échap  annuler
 */
export function useQueueKeyboard(enabled: boolean, handlers: QueueKeyboardHandlers) {
    const ref = useRef(handlers);
    useEffect(() => {
        ref.current = handlers;
    });

    useEffect(() => {
        if (!enabled) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
            if (isTypingTarget(e.target)) {
                if (e.key === "Escape") (e.target as HTMLElement).blur();
                return;
            }
            // Let buttons/links keep their native Enter/Space behaviour.
            const onControl = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
            const h = ref.current;
            const handled = (() => {
                switch (e.key) {
                    case "ArrowDown":
                    case "j":
                        h.move(1);
                        return true;
                    case "ArrowUp":
                    case "k":
                        h.move(-1);
                        return true;
                    case "Home":
                        h.move("first");
                        return true;
                    case "End":
                        h.move("last");
                        return true;
                    case "Enter":
                    case "o":
                        if (onControl && e.key === "Enter") return false;
                        h.open();
                        return true;
                    case "x":
                        h.toggleSelect();
                        return true;
                    case " ":
                        if (onControl) return false;
                        h.toggleSelect();
                        return true;
                    case "a":
                        h.call();
                        return true;
                    case "/":
                        h.focusSearch();
                        return true;
                    case "s":
                        h.toggleScript();
                        return true;
                    case "r":
                        h.refresh();
                        return true;
                    case "?":
                        h.help();
                        return true;
                    case "Escape":
                        h.escape();
                        return true;
                    default:
                        if (e.key >= "1" && e.key <= String(QUICK_OUTCOME_SLOTS)) {
                            h.quickOutcome(Number(e.key) - 1);
                            return true;
                        }
                        return false;
                }
            })();
            if (handled) e.preventDefault();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [enabled]);
}
