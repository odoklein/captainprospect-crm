"use client";

// « Nouveautés »: one feed for the top-bar button, the banner and the panel.
// Refreshed on load, every 10 minutes and when the tab comes back; the panel
// itself (and its code) loads only when opened.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { FeedItem } from "@/lib/changelog/service";

type Ctx = {
    items: FeedItem[];
    unread: number;
    loaded: boolean;
    open: (focusId?: string) => void;
    dismissBanner: (id: string) => void;
    prefetchPanel: () => void;
};

const ChangelogContext = createContext<Ctx | null>(null);
export const useChangelog = () => useContext(ChangelogContext);

const loadPanel = () => import("./ChangelogPanel");
const ChangelogPanel = dynamic(loadPanel, { ssr: false });
const REFRESH_MS = 10 * 60_000;

async function post(ids: string[], banner?: boolean) {
    await fetch("/api/changelog/seen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, ...(banner ? { banner: true } : {}) }),
    }).catch(() => undefined);
}

export function ChangelogProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<FeedItem[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [panel, setPanel] = useState<{ focusId?: string; unseenAtOpen: Set<string> } | null>(null);
    const lastFetch = useRef(0);

    const refresh = useCallback(async () => {
        lastFetch.current = Date.now();
        try {
            const res = await fetch("/api/changelog", { cache: "no-store" });
            const json = await res.json();
            if (json?.success) setItems(json.data.items as FeedItem[]);
        } catch {
            /* offline or signed out: keep what we have */
        } finally {
            setLoaded(true);
        }
    }, []);

    useEffect(() => {
        void refresh();
        const timer = window.setInterval(() => void refresh(), REFRESH_MS);
        const onVisible = () => {
            if (document.visibilityState === "visible" && Date.now() - lastFetch.current > 60_000) void refresh();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [refresh]);

    const open = useCallback(
        (focusId?: string) => {
            const unseen = items.filter((i) => !i.seen);
            // The « Nouveau » markers stay for this opening; the badge clears right away.
            setPanel({ focusId, unseenAtOpen: new Set(unseen.map((i) => i.id)) });
            if (unseen.length) {
                setItems((prev) => prev.map((i) => ({ ...i, seen: true })));
                void post(unseen.map((i) => i.id));
            }
        },
        [items],
    );

    const dismissBanner = useCallback((id: string) => {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, banner: false, seen: true } : i)));
        void post([id], true);
    }, []);

    const value = useMemo<Ctx>(
        () => ({ items, unread: items.filter((i) => !i.seen).length, loaded, open, dismissBanner, prefetchPanel: () => void loadPanel() }),
        [items, loaded, open, dismissBanner],
    );

    return (
        <ChangelogContext.Provider value={value}>
            {children}
            {panel && <ChangelogPanel items={items} unseenAtOpen={panel.unseenAtOpen} focusId={panel.focusId} onClose={() => setPanel(null)} />}
        </ChangelogContext.Provider>
    );
}
