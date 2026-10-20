"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeLeads } from "@/lib/sourcing/merge";
import type { CrmMatch, SourcedLead, SourceId, SourcingQuery } from "@/lib/sourcing/types";

// ============================================
// Sourcing session: query, per-source runs, merged leads, CRM matches.
// Kept in sessionStorage so leaving the page (or a reload) during a
// 2-minute Google Maps run (Apify engine) does not lose the run or its results.
// ============================================

export type RunStatus = "running" | "done" | "error";

export interface SourceRun {
    status: RunStatus;
    found: number;
    startedAt: number;
    finishedAt?: number;
    runId?: string;
    searches?: number;
    error?: string;
    warnings?: string[];
}

interface SessionState {
    query: SourcingQuery;
    sources: SourceId[];
    leads: SourcedLead[];
    runs: Partial<Record<SourceId, SourceRun>>;
    matches: Record<string, CrmMatch>;
    /** Query actually sent with the last run (the composer may have moved on). */
    ranQuery?: SourcingQuery;
}

export const DEFAULT_QUERY: SourcingQuery = {
    activities: [],
    locations: [],
    perSearch: 50,
    activeOnly: true,
};

const STORAGE_KEY = "sourcing:session:v1";
const POLL_MS = 4000;

function load(): SessionState | null {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as SessionState) : null;
    } catch {
        return null;
    }
}

function save(state: SessionState) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Quota or private mode: the session simply won't survive a reload.
    }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.error || `Erreur ${res.status}`);
    return json.data as T;
}

export function useSourcing() {
    const [state, setState] = useState<SessionState>({
        query: DEFAULT_QUERY,
        sources: ["gmaps", "annuaire"],
        leads: [],
        runs: {},
        matches: {},
    });
    const [hydrated, setHydrated] = useState(false);
    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stateRef = useRef(state);
    stateRef.current = state;

    useEffect(() => {
        const saved = load();
        if (saved) setState(saved);
        setHydrated(true);
    }, []);

    useEffect(() => {
        if (hydrated) save(state);
    }, [state, hydrated]);

    const patchRun = useCallback((source: SourceId, patch: Partial<SourceRun>) => {
        setState((s) => ({ ...s, runs: { ...s.runs, [source]: { ...s.runs[source]!, ...patch } } }));
    }, []);

    const checkMatches = useCallback(async () => {
        const leads = stateRef.current.leads;
        if (leads.length === 0) return;
        try {
            const matches = await api<Record<string, CrmMatch>>("/api/prospects/sourcing/match", {
                method: "POST",
                body: JSON.stringify({
                    leads: leads.map((l) => ({ id: l.id, name: l.name, website: l.website, phone: l.phone })),
                }),
            });
            setState((s) => ({ ...s, matches }));
        } catch {
            // Duplicate check is a hint; the import still skips in-list duplicates.
        }
    }, []);

    const addLeads = useCallback(
        (incoming: SourcedLead[]) => {
            // Merge against the ref, not the updater arg: two sources finishing
            // together must both land, and checkMatches must see the result.
            const leads = mergeLeads(stateRef.current.leads, incoming);
            stateRef.current = { ...stateRef.current, leads };
            setState((s) => ({ ...s, leads }));
            void checkMatches();
        },
        [checkMatches],
    );

    const pollGmaps = useCallback(
        (runId: string) => {
            if (pollRef.current) clearTimeout(pollRef.current);
            const tick = async () => {
                if (stateRef.current.runs.gmaps?.runId !== runId) return;
                try {
                    const run = await api<{ status: string; found: number; leads?: SourcedLead[]; error?: string }>(
                        `/api/prospects/sourcing/gmaps?runId=${encodeURIComponent(runId)}`,
                    );
                    if (run.status === "SUCCEEDED") {
                        patchRun("gmaps", { status: "done", found: run.found, finishedAt: Date.now() });
                        addLeads(run.leads ?? []);
                        return;
                    }
                    if (run.status === "FAILED") {
                        patchRun("gmaps", { status: "error", error: run.error ?? "Échec du scraping", finishedAt: Date.now() });
                        return;
                    }
                    patchRun("gmaps", { found: run.found });
                } catch (e) {
                    // Network blip: keep polling, the run lives on Apify's side.
                    console.warn("[sourcing] gmaps poll failed", e);
                }
                pollRef.current = setTimeout(tick, POLL_MS);
            };
            pollRef.current = setTimeout(tick, 1200);
        },
        [addLeads, patchRun],
    );

    // Resume a Google Maps run that was in flight before a reload.
    useEffect(() => {
        if (!hydrated) return;
        const run = stateRef.current.runs.gmaps;
        if (run?.status === "running" && run.runId) pollGmaps(run.runId);
        return () => {
            if (pollRef.current) clearTimeout(pollRef.current);
        };
    }, [hydrated, pollGmaps]);

    const run = useCallback(async () => {
        const { query, sources } = stateRef.current;
        if (pollRef.current) clearTimeout(pollRef.current);
        const now = Date.now();
        const runs: Partial<Record<SourceId, SourceRun>> = {};
        for (const s of sources) runs[s] = { status: "running", found: 0, startedAt: now };
        stateRef.current = { ...stateRef.current, leads: [], matches: {}, runs, ranQuery: query };
        setState((st) => ({ ...st, leads: [], matches: {}, runs, ranQuery: query }));

        await Promise.all(
            sources.map(async (source) => {
                try {
                    if (source === "gmaps") {
                        const res = await api<
                            | { runId: string; searches: number }
                            | { leads: SourcedLead[]; warnings: string[]; searches: number }
                        >("/api/prospects/sourcing/gmaps", {
                            method: "POST",
                            body: JSON.stringify(query),
                        });
                        // Serper engine: the results come back in the same response.
                        if ("leads" in res) {
                            patchRun("gmaps", {
                                status: "done",
                                found: res.leads.length,
                                searches: res.searches,
                                warnings: res.warnings,
                                finishedAt: Date.now(),
                            });
                            addLeads(res.leads);
                            return;
                        }
                        const { runId, searches } = res;
                        const gmaps = { ...stateRef.current.runs.gmaps!, runId, searches };
                        stateRef.current = { ...stateRef.current, runs: { ...stateRef.current.runs, gmaps } };
                        setState((st) => ({ ...st, runs: { ...st.runs, gmaps: { ...st.runs.gmaps!, runId, searches } } }));
                        pollGmaps(runId);
                        return;
                    }
                    const res = await api<{ leads: SourcedLead[]; warnings: string[] }>("/api/prospects/sourcing/search", {
                        method: "POST",
                        body: JSON.stringify({ source, query }),
                    });
                    patchRun(source, { status: "done", found: res.leads.length, warnings: res.warnings, finishedAt: Date.now() });
                    addLeads(res.leads);
                } catch (e) {
                    patchRun(source, { status: "error", error: e instanceof Error ? e.message : "Échec", finishedAt: Date.now() });
                }
            }),
        );
    }, [addLeads, patchRun, pollGmaps]);

    const cancelGmaps = useCallback(() => {
        if (pollRef.current) clearTimeout(pollRef.current);
        patchRun("gmaps", { status: "error", error: "Suivi arrêté", finishedAt: Date.now() });
    }, [patchRun]);

    const reset = useCallback(() => {
        if (pollRef.current) clearTimeout(pollRef.current);
        setState((s) => ({ ...s, leads: [], runs: {}, matches: {}, ranQuery: undefined }));
    }, []);

    const setQuery = useCallback((patch: Partial<SourcingQuery>) => {
        setState((s) => ({ ...s, query: { ...s.query, ...patch } }));
    }, []);

    const setSources = useCallback((sources: SourceId[]) => {
        setState((s) => ({ ...s, sources }));
    }, []);

    const isRunning = Object.values(state.runs).some((r) => r?.status === "running");

    return { ...state, hydrated, isRunning, setQuery, setSources, run, reset, cancelGmaps, refreshMatches: checkMatches };
}
