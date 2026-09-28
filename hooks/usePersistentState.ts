"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function read<T>(key: string, fallback: T, isValid?: (value: unknown) => boolean): T {
    try {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return fallback;
        const parsed: unknown = JSON.parse(raw);
        if (isValid && !isValid(parsed)) return fallback;
        return parsed as T;
    } catch {
        return fallback;
    }
}

/**
 * localStorage-backed state that is hydration-safe: the first render always
 * uses `initial` (same as the server), the stored value is applied after mount.
 */
export function usePersistentState<T>(
    key: string,
    initial: T,
    isValid?: (value: unknown) => boolean,
): [T, (next: T | ((prev: T) => T)) => void] {
    const [value, setValue] = useState<T>(initial);
    const initialRef = useRef(initial);
    const validRef = useRef(isValid);

    useEffect(() => {
        setValue(read(key, initialRef.current, validRef.current));
    }, [key]);

    const update = useCallback((next: T | ((prev: T) => T)) => {
        setValue((prev) => {
            const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
            try {
                window.localStorage.setItem(key, JSON.stringify(resolved));
            } catch {
                // private mode / quota: keep the in-memory value
            }
            return resolved;
        });
    }, [key]);

    return [value, update];
}
