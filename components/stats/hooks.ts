"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { StatsFilterOptions } from "@/app/api/analytics/filters/route";
import {
    parseState, periodParams, serializeState, stateRange, type StatsState,
} from "@/lib/stats/period";
import type { StatsOverview, TelephonyResponse } from "@/lib/stats/types";

async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error ?? `Erreur ${res.status}`);
    return json.data as T;
}

/**
 * Page state (period, scope filters, tab) mirrored in the URL: a manager can send
 * "mission X, last month, équipe tab" as a link, and Back/refresh keep the view.
 * Written with history.replaceState — no navigation, no re-render of the route.
 */
export function useStatsState() {
    const search = useSearchParams();
    const [state, setStateRaw] = useState<StatsState>(() => parseState(new URLSearchParams(search.toString())));

    const setState = useCallback((patch: Partial<StatsState>) => {
        setStateRaw((prev) => {
            const next = { ...prev, ...patch };
            const qs = serializeState(next);
            try {
                window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
            } catch {
                // history unavailable (sandboxed frame): the state still lives in memory
            }
            return next;
        });
    }, []);

    const range = useMemo(() => stateRange(state), [state.preset, state.from, state.to]); // eslint-disable-line react-hooks/exhaustive-deps
    return { state, setState, range };
}

export function useFilterOptions() {
    return useQuery({
        queryKey: ["stats", "filters"],
        queryFn: () => getJson<StatsFilterOptions>("/api/analytics/filters"),
        staleTime: 5 * 60_000,
    });
}

export function useOverview(state: StatsState, range: { start: string; end: string }) {
    const query = periodParams(range, state).toString();
    return useQuery({
        queryKey: ["stats", "overview", query],
        queryFn: () => getJson<StatsOverview>(`/api/analytics/overview?${query}`),
        placeholderData: keepPreviousData,
        staleTime: 60_000,
    });
}

/** Allo figures arrive after the page: current period first, previous period alongside. */
export function useTelephony(state: StatsState, overview: StatsOverview | undefined) {
    const range = overview?.range;
    const cur = useQuery({
        queryKey: ["stats", "telephony", range?.start, range?.end, state.sdrIds.join(",")],
        queryFn: () => getJson<TelephonyResponse>(`/api/analytics/telephony?${periodParams({ start: range!.start, end: range!.end }, { ...state, missionIds: [], clientIds: [], listIds: [] })}`),
        enabled: !!range,
        staleTime: 60_000,
        retry: 1,
    });
    const prev = useQuery({
        queryKey: ["stats", "telephony", range?.prevStart, range?.prevEnd, state.sdrIds.join(",")],
        queryFn: () => getJson<TelephonyResponse>(`/api/analytics/telephony?${periodParams({ start: range!.prevStart, end: range!.prevEnd }, { ...state, missionIds: [], clientIds: [], listIds: [] })}`),
        enabled: !!range,
        staleTime: 60_000,
        retry: 1,
    });
    return { current: cur.data, previous: prev.data, isLoading: cur.isLoading };
}
