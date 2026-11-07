"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a number towards its new value (ease-out, ~450 ms) so a change of
 * filter reads as a change, not a flicker. Instant under reduced motion.
 */
export function useCountUp(value: number, duration = 450): number {
    const [shown, setShown] = useState(value);
    const from = useRef(value);

    useEffect(() => {
        const start = from.current;
        if (start === value) return;
        const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (reduce) {
            from.current = value;
            const id = requestAnimationFrame(() => setShown(value));
            return () => cancelAnimationFrame(id);
        }
        const t0 = performance.now();
        let raf = 0;
        const step = (t: number) => {
            const k = Math.min(1, (t - t0) / duration);
            const eased = 1 - Math.pow(1 - k, 3);
            const v = start + (value - start) * eased;
            setShown(k === 1 ? value : v);
            if (k < 1) raf = requestAnimationFrame(step);
            else from.current = value;
        };
        raf = requestAnimationFrame(step);
        return () => {
            cancelAnimationFrame(raf);
            from.current = value;
        };
    }, [value, duration]);

    return shown;
}
