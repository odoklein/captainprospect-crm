"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const EVENT = "captain-ai:draft-change";
const subscribe = (notify: () => void) => {
    window.addEventListener(EVENT, notify);
    return () => window.removeEventListener(EVENT, notify);
};
/** Per-tab drafts. A blocked storage API falls back to in-memory editing. */
export function useDraftText(key?: string): [string, (text: string) => void] {
    const [draft, setDraft] = useState({ key, text: "" });
    const fallback = draft.key === key ? draft.text : "";
    const read = useCallback(() => {
        if (!key) return fallback;
        try { return sessionStorage.getItem(key) ?? fallback; } catch { return fallback; }
    }, [key, fallback]);
    const value = useSyncExternalStore(subscribe, read, () => "");
    const set = useCallback((text: string) => {
        setDraft({ key, text });
        if (key) {
            try { if (text) sessionStorage.setItem(key, text); else sessionStorage.removeItem(key); } catch { /* In-memory fallback. */ }
            window.dispatchEvent(new Event(EVENT));
        }
    }, [key]);
    return [value, set];
}
