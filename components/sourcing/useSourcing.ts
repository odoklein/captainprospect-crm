"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeLeads } from "@/lib/sourcing/merge";
import type { CrmMatch, GmapsEvent, SourcedLead, SourceId, SourcingPlan, SourcingQuery, ZoneCoverage } from "@/lib/sourcing/types";

// ============================================
// Sourcing session: query, per-source runs, merged leads, CRM matches.
// Kept in sessionStorage so leaving the page (or a reload) during a
// 2-minute Google Maps run (Apify engine) does not lose the run or its results.
// The Serper engine streams its run (see GmapsEvent): leads land as tiles
// finish, and closing the stream (Arrêter, leaving the page) stops spending.
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
    /** Serper streaming run. */
    plan?: SourcingPlan;
    progress?: { done: number; total: number };
    credits?: number;
    coverage?: ZoneCoverage[];
    /** Places Maps returned outside the requested zones, dropped. */
    outside?: number;
    budgetHit?: boolean;
    /** Stopped by the user or cut by a reload: results so far are kept. */
    stopped?: boolean;
    /** Ran on top of earlier results ("Creuser plus"). */
    appended?: boolean;
}

export interface RunOptions {
    /** Keep current results and fold the new ones in. */
    append?: boolean;
    /** Override part of the query for this run (the composer follows). */
    patch?: Partial<SourcingQuery>;
    /** Limit the run to these sources. */
    sources?: SourceId[];
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
    depth: "deep",
};

const STORAGE_KEY = "sourcing:session:v2";
const POLL_MS = 4000;
const FLUSH_MS = 350;
const CREDITS_PER_CALL = 3;

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
    const streamRef = useRef<AbortController | null>(null);
    const stateRef = useRef(state);
    stateRef.current = state;

    useEffect(() => {
        const saved = load();
        if (saved) {
            stateRef.current = saved;
            setState(saved);
        }
        setHydrated(true);
    }, []);

    useEffect(() => {
        if (hydrated) save(state);
    }, [state, hydrated]);

    const patchRun = useCallback((source: SourceId, patch: Partial<SourceRun>) => {
        const runs = { ...stateRef.current.runs, [source]: { ...stateRef.current.runs[source]!, ...patch } };
        stateRef.current = { ...stateRef.current, runs };
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
        (incoming: SourcedLead[], opts?: { checkMatches?: boolean }) => {
            // Merge against the ref, not the updater arg: two sources finishing
            // together must both land, and checkMatches must see the result.
            const leads = mergeLeads(stateRef.current.leads, incoming);
            stateRef.current = { ...stateRef.current, leads };
            setState((s) => ({ ...s, leads }));
            if (opts?.checkMatches !== false) void checkMatches();
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

    // Resume a Google Maps run that was in flight before a reload. A streamed
    // (Serper) run died with the page: keep what it found, mark it stopped.
    useEffect(() => {
        if (!hydrated) return;
        const run = stateRef.current.runs.gmaps;
        if (run?.status === "running" && run.runId) pollGmaps(run.runId);
        else if (run?.status === "running") patchRun("gmaps", { status: "done", stopped: true, finishedAt: Date.now() });
        for (const id of ["annuaire", "apollo"] as const) {
            if (stateRef.current.runs[id]?.status === "running")
                patchRun(id, { status: "error", error: "Interrompue par le rechargement", finishedAt: Date.now() });
        }
        return () => {
            if (pollRef.current) clearTimeout(pollRef.current);
            streamRef.current?.abort();
        };
    }, [hydrated, pollGmaps, patchRun]);

    /** Serper engine: read the NDJSON stream, folding leads in by batches. Apify: returns its run id. */
    const streamGmaps = useCallback(
        async (query: SourcingQuery): Promise<{ runId: string; searches: number } | null> => {
            const ctrl = new AbortController();
            streamRef.current = ctrl;
            const res = await fetch("/api/prospects/sourcing/gmaps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(query),
                signal: ctrl.signal,
            });
            if (!(res.headers.get("content-type") ?? "").includes("ndjson")) {
                streamRef.current = null;
                const json = await res.json().catch(() => ({}));
                if (!res.ok || !json.success) throw new Error(json.error || `Erreur ${res.status}`);
                return json.data as { runId: string; searches: number };
            }

            let pending: SourcedLead[] = [];
            let found = 0;
            let lastFlush = 0;
            const flush = (final = false) => {
                if (pending.length) {
                    addLeads(pending, { checkMatches: final });
                    pending = [];
                } else if (final) void checkMatches();
                lastFlush = Date.now();
            };
            const handle = (e: GmapsEvent) => {
                switch (e.t) {
                    case "plan":
                        patchRun("gmaps", { plan: e.plan, searches: e.plan.searches, progress: { done: 0, total: e.plan.searches } });
                        break;
                    case "leads":
                        pending.push(...e.leads);
                        found += e.leads.length;
                        if (Date.now() - lastFlush > FLUSH_MS) flush();
                        break;
                    case "progress":
                        patchRun("gmaps", {
                            found,
                            progress: { done: e.done, total: e.total },
                            credits: e.calls * CREDITS_PER_CALL,
                            outside: e.outside,
                        });
                        break;
                    case "warning":
                        patchRun("gmaps", { warnings: [...(stateRef.current.runs.gmaps?.warnings ?? []), e.message] });
                        break;
                    case "done":
                        flush(true);
                        patchRun("gmaps", {
                            status: "done",
                            found,
                            credits: e.credits,
                            coverage: e.coverage,
                            outside: e.outside,
                            budgetHit: e.budgetHit,
                            finishedAt: Date.now(),
                        });
                        break;
                    case "error":
                        flush(true);
                        patchRun("gmaps", { status: "error", error: e.message, found, finishedAt: Date.now() });
                        break;
                }
            };

            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            try {
                for (;;) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });
                    let nl: number;
                    while ((nl = buf.indexOf("\n")) >= 0) {
                        const line = buf.slice(0, nl).trim();
                        buf = buf.slice(nl + 1);
                        if (line) handle(JSON.parse(line) as GmapsEvent);
                    }
                }
                buf += decoder.decode();
                if (buf.trim()) handle(JSON.parse(buf) as GmapsEvent);
            } catch (e) {
                flush(true);
                if (!ctrl.signal.aborted) throw e;
            } finally {
                if (streamRef.current === ctrl) streamRef.current = null;
            }
            // Stream ended without a verdict: stopped by the user or cut by the network.
            if (stateRef.current.runs.gmaps?.status === "running") {
                flush(true);
                patchRun("gmaps", { status: "done", stopped: true, found, finishedAt: Date.now() });
            }
            return null;
        },
        [addLeads, checkMatches, patchRun],
    );

    const run = useCallback(
        async (opts: RunOptions = {}) => {
            const base = stateRef.current;
            const query = opts.patch ? { ...base.query, ...opts.patch } : base.query;
            const sources = opts.sources ?? base.sources;
            if (pollRef.current) clearTimeout(pollRef.current);
            streamRef.current?.abort();
            const now = Date.now();
            const runs: Partial<Record<SourceId, SourceRun>> = opts.append ? { ...base.runs } : {};
            for (const s of sources) runs[s] = { status: "running", found: 0, startedAt: now, appended: opts.append };
            const next: SessionState = {
                ...base,
                query,
                runs,
                leads: opts.append ? base.leads : [],
                matches: opts.append ? base.matches : {},
                ranQuery: query,
            };
            stateRef.current = next;
            setState(next);

            await Promise.all(
                sources.map(async (source) => {
                    try {
                        if (source === "gmaps") {
                            const apify = await streamGmaps(query);
                            if (!apify) return;
                            pollGmaps(apify.runId);
                            patchRun("gmaps", { runId: apify.runId, searches: apify.searches });
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
        },
        [addLeads, patchRun, pollGmaps, streamGmaps],
    );

    /** Serper: close the stream (the server stops spending). Apify: stop following the run. */
    const cancelGmaps = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.abort();
            return;
        }
        if (pollRef.current) clearTimeout(pollRef.current);
        patchRun("gmaps", { status: "error", error: "Suivi arrêté", finishedAt: Date.now() });
    }, [patchRun]);

    const reset = useCallback(() => {
        if (pollRef.current) clearTimeout(pollRef.current);
        streamRef.current?.abort();
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
