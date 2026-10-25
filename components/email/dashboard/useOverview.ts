"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BlockName, OverviewBlocks } from "./types";

export type BlockState<T> =
    | { status: "loading"; data?: T }
    | { status: "error"; error: string; data?: T }
    | { status: "ready"; data: T };

type States = { [K in BlockName]: BlockState<OverviewBlocks[K]> };

const ALL: BlockName[] = ["setup", "triage", "mailboxes", "sequences", "templates", "activity", "kpis"];

const initial = (): States => ({
    setup: { status: "loading" },
    triage: { status: "loading" },
    mailboxes: { status: "loading" },
    sequences: { status: "loading" },
    templates: { status: "loading" },
    activity: { status: "loading" },
    kpis: { status: "loading" },
});

/**
 * Loads the Vue d'ensemble in one request and keeps a state per block, so one
 * failing query shows an error + retry on its card instead of a page-wide spinner.
 */
export function useOverview(period: "7" | "30" | "90") {
    const [states, setStates] = useState<States>(initial);
    const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
    const periodRef = useRef(period);
    periodRef.current = period;

    const load = useCallback(async (blocks: BlockName[]) => {
        setStates((prev) => {
            const next = { ...prev };
            for (const b of blocks) next[b] = { status: "loading", data: prev[b].data } as never;
            return next;
        });
        try {
            const qs = new URLSearchParams({ period: periodRef.current });
            if (blocks.length !== ALL.length) qs.set("blocks", blocks.join(","));
            const res = await fetch(`/api/email/dashboard/overview?${qs}`, { cache: "no-store" });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) throw new Error(json?.error || `Erreur ${res.status}`);
            const payload = json.data.blocks as Partial<Record<BlockName, { ok: boolean; data?: unknown; error?: string }>>;
            setStates((prev) => {
                const next = { ...prev };
                for (const b of blocks) {
                    const r = payload[b];
                    next[b] = (r?.ok
                        ? { status: "ready", data: r.data }
                        : { status: "error", error: r?.error || "Bloc indisponible", data: prev[b].data }) as never;
                }
                return next;
            });
            setRefreshedAt(new Date());
        } catch (e) {
            const message = e instanceof Error && e.message ? e.message : "Erreur de connexion";
            setStates((prev) => {
                const next = { ...prev };
                for (const b of blocks) next[b] = { status: "error", error: message, data: prev[b].data } as never;
                return next;
            });
        }
    }, []);

    useEffect(() => {
        load(ALL);
    }, [load]);

    // Period only changes the KPI block.
    const firstPeriod = useRef(true);
    useEffect(() => {
        if (firstPeriod.current) {
            firstPeriod.current = false;
            return;
        }
        load(["kpis"]);
    }, [period, load]);

    return {
        states,
        refreshedAt,
        reloadAll: () => load(ALL),
        retry: (b: BlockName) => load([b]),
    };
}
