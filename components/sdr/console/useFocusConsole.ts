"use client";

// ============================================
// The data of the Mission Control band in Focus mode, from existing APIs only:
//   today's calls          GET /api/sdr/actions?period=today&channel=CALL
//   today's planning       GET /api/sdr/today-blocks
//   calls with no result   GET /api/sdr/calls?view=unqualified
//   « Ensuite »            GET /api/sdr/action-queue (same ranking as /api/actions/next)
// refresh() reloads the calls and the gate right after a save; a minute poll
// catches what happened elsewhere (the softphone island, another tab).
// ============================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { JournalRow } from "@/lib/calls-journal/types";
import type { RailBlock } from "@/lib/focus/console";

export interface TodayCall {
    id: string;
    result: string;
    resultLabel: string;
    createdAt: string;
    contactName?: string;
    companyName?: string;
    missionId?: string;
}

export interface QueuePreviewRow {
    contact: { id: string; firstName: string | null; lastName: string | null; title: string | null } | null;
    company: { id: string; name: string };
    priority: string;
    hasContactInfo?: boolean;
}

const POLL_MS = 60_000;
/** The preview is the whole queue: reloaded every few prospects, not after each one. */
const QUEUE_RELOAD_EVERY = 8;

async function getData<T>(url: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(url, { signal, cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || `Erreur ${res.status}`);
    return json.data as T;
}

const fetchCalls = () => getData<TodayCall[]>("/api/sdr/actions?period=today&channel=CALL&limit=500");
const fetchGate = () => getData<{ rows: JournalRow[] }>("/api/sdr/calls?view=unqualified&limit=20").then((d) => d.rows ?? []);
const fetchQueue = (missionId: string, signal?: AbortSignal) =>
    getData<{ items?: QueuePreviewRow[] }>(`/api/sdr/action-queue?${new URLSearchParams({ missionId, channel: "CALL" })}`, signal).then((d) => d.items ?? []);

export function useFocusConsole(missionId: string | null, active: boolean) {
    const [calls, setCalls] = useState<TodayCall[]>([]);
    const [blocks, setBlocks] = useState<RailBlock[]>([]);
    const [unqualified, setUnqualified] = useState<JournalRow[]>([]);
    // Rows are kept with the mission they belong to: a switch shows the skeleton, not the old list.
    const [queueOf, setQueueOf] = useState<{ missionId: string; rows: QueuePreviewRow[] } | null>(null);
    const [now, setNow] = useState(() => new Date());
    const handledSinceReload = useRef(0);

    const reloadCalls = useCallback(() => {
        fetchCalls().then(setCalls).catch(() => { /* the band keeps what it had */ });
        fetchGate().then(setUnqualified).catch(() => setUnqualified([]));
    }, []);

    const reloadQueue = useCallback((signal?: AbortSignal) => {
        if (!missionId) return;
        fetchQueue(missionId, signal)
            .then((rows) => {
                setQueueOf({ missionId, rows });
                handledSinceReload.current = 0;
            })
            .catch(() => {
                if (!signal?.aborted) setQueueOf({ missionId, rows: [] });
            });
    }, [missionId]);

    // Planning: once per session.
    useEffect(() => {
        if (!active) return;
        getData<{ todayBlocks: RailBlock[] }>("/api/sdr/today-blocks")
            .then((d) => setBlocks(d.todayBlocks ?? []))
            .catch(() => setBlocks([]));
    }, [active]);

    useEffect(() => {
        if (!active) return;
        reloadCalls();
        const t = setInterval(() => {
            setNow(new Date());
            reloadCalls();
        }, POLL_MS);
        return () => clearInterval(t);
    }, [active, reloadCalls]);

    useEffect(() => {
        if (!active) return;
        const controller = new AbortController();
        reloadQueue(controller.signal);
        return () => controller.abort();
    }, [active, reloadQueue]);

    /** After an outcome is saved (here, in the drawer or from the island). */
    const refresh = useCallback(() => {
        setNow(new Date());
        reloadCalls();
        handledSinceReload.current += 1;
        if (handledSinceReload.current >= QUEUE_RELOAD_EVERY) reloadQueue();
    }, [reloadCalls, reloadQueue]);

    const queue = queueOf && queueOf.missionId === missionId ? queueOf.rows : null;
    return { calls, blocks, unqualified, queue, now, refresh };
}
