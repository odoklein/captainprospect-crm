"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketCounts, Pair } from "@/lib/onboarding/market-counts";
import { coveredCodes, type Territory } from "@/lib/onboarding/territory";

export interface CountsPayload extends MarketCounts {
    small: number;
    updatedAt: string;
}

export type CountsStatus = "loading" | "ready" | "error";

/**
 * Per-département counts for the non-geographic criteria. Debounced and
 * abortable; the previous result stays on screen while the next one loads,
 * so the counter never blanks. Map clicks never call this (summed locally).
 */
export function useMarketCounts(criteria: { sectors: string[]; sizes: string[]; roles: string[] }) {
    const key = [criteria.sectors.join(","), criteria.sizes.join(","), criteria.roles.join(",")].join("|");
    const [data, setData] = useState<CountsPayload | null>(null);
    const [status, setStatus] = useState<CountsStatus>("loading");
    const first = useRef(true);
    useEffect(() => {
        const controller = new AbortController();
        const [sectors, sizes, roles] = key.split("|");
        const timer = window.setTimeout(async () => {
            setStatus("loading");
            try {
                const qs = new URLSearchParams({ sectors, sizes, roles });
                const response = await fetch(`/api/client/market-counts?${qs}`, { signal: controller.signal, cache: "no-store" });
                const json = await response.json();
                if (!response.ok || !json.success) throw new Error(json.error);
                setData(json.data);
                setStatus("ready");
            } catch {
                // Aborted by a newer request, or the count is down: the page keeps working without it.
                if (!controller.signal.aborted) setStatus("error");
            }
        }, first.current ? 0 : 320);
        first.current = false;
        return () => { controller.abort(); window.clearTimeout(timer); };
    }, [key]);
    return { data, status };
}

/** No territory picked, or « Toute la France », counts the whole base (unlocated companies included). */
export function selectionTotals(counts: MarketCounts | null, territory: Pick<Territory, "all" | "codes">): Pair {
    if (!counts) return [0, 0];
    const whole = territory.all || territory.codes.length === 0;
    const codes = whole ? Object.keys(counts.departements) : coveredCodes(territory);
    const sum: Pair = whole ? [...counts.unlocated] : [0, 0];
    for (const code of codes) {
        const pair = counts.departements[code];
        if (pair) { sum[0] += pair[0]; sum[1] += pair[1]; }
    }
    return sum;
}

export const formatCount = (n: number) => n.toLocaleString("fr-FR");

/** « moins de 20 » below the privacy threshold, the number otherwise. */
export function countLabel(n: number, small: number, noun: [string, string]): string {
    if (n === 0) return `aucun${noun[0].endsWith("e") && !noun[0].endsWith("ée") ? "e" : ""} ${noun[0]}`;
    if (n < small) return `moins de ${small} ${noun[1]}`;
    return `${formatCount(n)} ${n > 1 ? noun[1] : noun[0]}`;
}
