"use client";

import { useEffect, useState } from "react";

// Motion spec (shared with self-service.css): --ss-ease for movement, a spring
// for chips, 160 ms hover/focus, 280 ms chips, 520 ms sections, 700 ms counter.
export const EASE = "cubic-bezier(.22, 1, .36, 1)";
export const SPRING = "cubic-bezier(.34, 1.56, .64, 1)";

export function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        if (!query) return;
        const sync = () => setReduced(query.matches);
        sync();
        query.addEventListener("change", sync);
        return () => query.removeEventListener("change", sync);
    }, []);
    return reduced;
}

/**
 * The signature: a « +1 240 » pill leaves the clicked département and lands on
 * the counter. Transform and opacity only; nothing under reduced motion.
 */
export function flyDelta(from: { x: number; y: number }, target: Element | null, text: string, tone: "add" | "remove") {
    if (!target || prefersReducedMotion() || typeof document === "undefined") return;
    const to = target.getBoundingClientRect();
    const pill = document.createElement("div");
    pill.className = "ms-fly";
    pill.dataset.tone = tone;
    pill.textContent = text;
    pill.setAttribute("aria-hidden", "true");
    document.body.appendChild(pill);
    const box = pill.getBoundingClientRect();
    const sx = from.x - box.width / 2, sy = from.y - box.height / 2;
    const tx = to.left + to.width / 2 - box.width / 2, ty = to.top + to.height / 2 - box.height / 2;
    const mx = (sx + tx) / 2, my = Math.min(sy, ty) - 60;
    const animation = pill.animate([
        { transform: `translate(${sx}px, ${sy}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${sx}px, ${sy - 18}px) scale(1)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${tx}px, ${ty}px) scale(.5)`, opacity: 0 },
    ], { duration: 760, easing: EASE, fill: "forwards" });
    animation.onfinish = () => pill.remove();
    animation.oncancel = () => pill.remove();
}

type StartViewTransition = (update: () => Promise<void> | void) => { finished: Promise<void> };

/**
 * Runs `update` inside a View Transition when the browser has one (the brief
 * card morphs into its tile in the missions grid), else after `fallback`.
 */
export async function withViewTransition(update: () => Promise<void>, fallback: () => Promise<void>) {
    const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition?.bind(document);
    if (!start || prefersReducedMotion()) {
        if (!prefersReducedMotion()) await fallback();
        await update();
        return;
    }
    await start(update).finished.catch(() => undefined);
}

/** Resolves once `selector` exists (or after `timeout`), for a view transition that waits on a route change. */
export function waitForElement(selector: string, timeout = 1500): Promise<void> {
    return new Promise((resolve) => {
        if (document.querySelector(selector)) { resolve(); return; }
        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) { observer.disconnect(); window.clearTimeout(timer); resolve(); }
        });
        const timer = window.setTimeout(() => { observer.disconnect(); resolve(); }, timeout);
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

/** Keeps removed items on screen while they animate out (220 ms), then drops them. */
export function useLeaving<T>(items: readonly T[], keyOf: (item: T) => string, reduced: boolean, ms = 220) {
    const [leaving, setLeaving] = useState<{ item: T; index: number }[]>([]);
    const [previous, setPrevious] = useState(items);
    if (previous !== items) {
        if (!reduced) {
            const now = new Set(items.map(keyOf));
            const gone = previous.map((item, index) => ({ item, index })).filter((x) => !now.has(keyOf(x.item)));
            if (gone.length) setLeaving((current) => [...current.filter((x) => !now.has(keyOf(x.item))), ...gone]);
        }
        setPrevious(items);
    }
    useEffect(() => {
        if (!leaving.length) return;
        const timer = window.setTimeout(() => setLeaving([]), ms);
        return () => window.clearTimeout(timer);
    }, [leaving, ms]);
    const merged: { item: T; leaving: boolean }[] = items.map((item) => ({ item, leaving: false }));
    for (const x of [...leaving].sort((a, b) => a.index - b.index)) merged.splice(Math.min(x.index, merged.length), 0, { item: x.item, leaving: true });
    return merged;
}
