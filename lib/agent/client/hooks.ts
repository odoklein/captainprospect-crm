"use client";

/**
 * SWR hooks and mutations for the Captain Agent screens (contract:
 * lib/assistant/api-contract.ts, section "Agent").
 *
 * Every mutation ends with `refreshAgent()`, which revalidates the plain
 * agent keys and pings the paged (useSWRInfinite) lists through a window
 * event — SWR's global matcher skips infinite keys on purpose.
 */

import { useCallback, useEffect, useMemo } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import useSWRInfinite from "swr/infinite";
import {
    AGENT_API,
    ASSISTANT_API,
    type FolderListResponse,
    type AgentFindingItem,
    type AgentFindingState,
    type AgentJobItem,
    type AgentJobKind,
    type AgentOverview,
    type AgentPlaybookItem,
    type AgentProposalItem,
    type AgentRunCard,
    type AgentRunDetail,
    type AgentRunStatus,
    type AgentSeverity,
    type CreateAgentJobBody,
    type CreateMissionBody,
    type DecideBatchResponse,
    type DecideProposalResponse,
    type Page,
    type PatchAgentJobBody,
    type PatchFindingBody,
    type RunsResponse,
} from "@/lib/assistant/api-contract";
import { apiGet, apiSend, withQuery } from "@/lib/assistant/client/fetcher";
import { asList, extractRunId, isLiveStatus } from "./format";

const AGENT_PREFIX = "/api/manager/agent";
const REFRESH_EVENT = "captain-agent:refresh";
const PENDING_KEY = "captain-agent:pending-proposals";

/** Revalidate everything agent-related on screen. */
export function refreshAgent(): void {
    void globalMutate(
        (key) =>
            (typeof key === "string" && key.startsWith(AGENT_PREFIX)) ||
            (Array.isArray(key) && key[0] === PENDING_KEY),
    );
    if (typeof window !== "undefined") window.dispatchEvent(new Event(REFRESH_EVENT));
}

function useRefreshListener(cb: () => void) {
    useEffect(() => {
        const handler = () => cb();
        window.addEventListener(REFRESH_EVENT, handler);
        return () => window.removeEventListener(REFRESH_EVENT, handler);
    }, [cb]);
}

// ============================================
// Reads
// ============================================

export function useAgentOverview() {
    return useSWR<AgentOverview>(AGENT_API.overview, apiGet, { refreshInterval: 30_000, keepPreviousData: true });
}

export function usePlaybooks() {
    const swr = useSWR<unknown>(AGENT_API.playbooks, apiGet, { revalidateOnFocus: false, dedupingInterval: 60_000 });
    const playbooks = useMemo(() => asList<AgentPlaybookItem>(swr.data, "playbooks"), [swr.data]);
    return { ...swr, playbooks };
}

/** Jobs, optionally narrowed to a folder/client (filtered here too, in case the route ignores the query). */
export function useAgentJobs(scope?: { folderId?: string | null; clientId?: string | null }) {
    const folderId = scope?.folderId ?? null;
    const clientId = scope?.clientId ?? null;
    const swr = useSWR<unknown>(withQuery(AGENT_API.jobs, { folderId, clientId }), apiGet, { keepPreviousData: true });
    const jobs = useMemo(() => {
        const all = asList<AgentJobItem>(swr.data, "jobs");
        if (!folderId && !clientId) return all;
        return all.filter((j) => (folderId && j.folderId === folderId) || (clientId && j.clientId === clientId));
    }, [swr.data, folderId, clientId]);
    return { ...swr, jobs };
}

export interface ClientOption {
    clientId: string;
    folderId: string | null;
    name: string;
}

/** Clients the viewer can scope to (from the assistant folders list), sorted by name. */
export function useClientOptions(enabled = true) {
    const swr = useSWR<FolderListResponse>(enabled ? ASSISTANT_API.folders : null, apiGet, { revalidateOnFocus: false, dedupingInterval: 60_000 });
    const clients = useMemo<ClientOption[]>(
        () =>
            (swr.data?.clients ?? [])
                .map((c) => ({ clientId: c.clientId, folderId: c.folder?.id ?? null, name: c.name }))
                .sort((a, b) => a.name.localeCompare(b.name, "fr")),
        [swr.data],
    );
    return { ...swr, clients };
}

export interface PagedResult<T> {
    items: T[];
    isLoading: boolean;
    isLoadingMore: boolean;
    hasMore: boolean;
    loadMore: () => void;
    error: Error | undefined;
    degraded: boolean;
    reload: () => void;
}

function usePaged<T extends { id: string }>(
    baseUrl: string | null,
    query: Record<string, string | number | boolean | null | undefined>,
    refreshInterval = 0,
): PagedResult<T> {
    const getKey = (index: number, previous: Page<T> | null) => {
        if (!baseUrl) return null;
        if (previous && !previous.nextCursor) return null;
        return withQuery(baseUrl, { ...query, cursor: index === 0 ? undefined : previous?.nextCursor });
    };
    const swr = useSWRInfinite<Page<T>>(getKey, apiGet, {
        revalidateFirstPage: true,
        keepPreviousData: true,
        refreshInterval,
    });
    const { mutate, setSize, size, data, isLoading, error } = swr;
    const reload = useCallback(() => void mutate(), [mutate]);
    useRefreshListener(reload);

    const items = useMemo(() => {
        const seen = new Set<string>();
        const out: T[] = [];
        for (const page of data ?? []) {
            for (const item of page?.items ?? []) {
                if (seen.has(item.id)) continue;
                seen.add(item.id);
                out.push(item);
            }
        }
        return out;
    }, [data]);

    const last = data?.[data.length - 1];
    const hasMore = Boolean(last?.nextCursor);
    const isLoadingMore = isLoading || (size > 0 && data !== undefined && typeof data[size - 1] === "undefined");
    return {
        items,
        isLoading,
        isLoadingMore,
        hasMore,
        loadMore: () => void setSize(size + 1),
        error: error as Error | undefined,
        degraded: Boolean(data?.some((p) => p?.degraded)),
        reload,
    };
}

export interface RunFilters {
    status?: AgentRunStatus | null;
    kind?: AgentJobKind | null;
    folderId?: string | null;
}

export function useAgentRuns(filters: RunFilters = {}, opts: { refreshInterval?: number } = {}) {
    return usePaged<AgentRunCard>(
        AGENT_API.runs,
        { status: filters.status ?? null, kind: filters.kind ?? null, folderId: filters.folderId ?? null },
        opts.refreshInterval ?? 0,
    );
}

/** One run; polls every 3 s while it is queued or running, stops otherwise. */
export function useAgentRun(id: string | null) {
    return useSWR<AgentRunDetail>(id ? AGENT_API.run(id) : null, apiGet, {
        refreshInterval: (latest) => (latest && isLiveStatus(latest.status) ? 3_000 : 0),
        keepPreviousData: false,
    });
}

export interface FindingFiltersQuery {
    state?: AgentFindingState | null;
    severity?: AgentSeverity | null;
    folderId?: string | null;
}

export function useAgentFindings(filters: FindingFiltersQuery = {}) {
    return usePaged<AgentFindingItem>(
        AGENT_API.findings,
        { state: filters.state ?? "OPEN", severity: filters.severity ?? null, folderId: filters.folderId ?? null },
        60_000,
    );
}

export interface PendingProposal extends AgentProposalItem {
    run: Pick<AgentRunCard, "id" | "jobName" | "kind" | "playbook" | "goal" | "clientName" | "clientId" | "folderId" | "conversationId">;
}

/**
 * Pending proposals: the runs waiting for approval, then their details (the
 * contract has no proposals list). A handful of runs at most, fetched in parallel.
 */
export function usePendingProposals(folderId?: string | null) {
    const runs = useSWR<RunsResponse>(withQuery(AGENT_API.runs, { status: "WAITING_APPROVAL", folderId: folderId ?? null }), apiGet, {
        refreshInterval: 30_000,
        keepPreviousData: true,
    });
    const ids = useMemo(() => (runs.data?.items ?? []).map((r) => r.id), [runs.data]);
    const details = useSWR<Array<AgentRunDetail | null>>(
        ids.length > 0 ? [PENDING_KEY, ...ids] : null,
        (key: string[]) => Promise.all(key.slice(1).map((id) => apiGet<AgentRunDetail>(AGENT_API.run(id)).catch(() => null))),
        { keepPreviousData: true },
    );
    const proposals = useMemo<PendingProposal[]>(() => {
        if (ids.length === 0) return [];
        const out: PendingProposal[] = [];
        for (const run of details.data ?? []) {
            if (!run) continue;
            for (const p of run.proposals ?? []) {
                if (p.state !== "PENDING") continue;
                out.push({
                    ...p,
                    run: {
                        id: run.id,
                        jobName: run.jobName,
                        kind: run.kind,
                        playbook: run.playbook,
                        goal: run.goal,
                        clientName: run.clientName,
                        clientId: run.clientId,
                        folderId: run.folderId,
                        conversationId: run.conversationId,
                    },
                });
            }
        }
        return out.sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
    }, [details.data, ids.length]);
    return {
        proposals,
        isLoading: runs.isLoading || (ids.length > 0 && details.isLoading),
        error: (runs.error ?? details.error) as Error | undefined,
    };
}

// ============================================
// Mutations
// ============================================

export async function patchFinding(id: string, body: PatchFindingBody): Promise<AgentFindingItem> {
    const res = await apiSend<AgentFindingItem>(AGENT_API.finding(id), "PATCH", body);
    refreshAgent();
    return res;
}

export async function decideProposal(id: string, decision: "approve" | "reject"): Promise<DecideProposalResponse> {
    try {
        return await apiSend<DecideProposalResponse>(AGENT_API.proposalDecide(id), "POST", { decision });
    } finally {
        refreshAgent();
    }
}

export async function decideBatch(ids: string[], decision: "approve" | "reject"): Promise<DecideBatchResponse> {
    try {
        return await apiSend<DecideBatchResponse>(AGENT_API.proposalsDecideBatch, "POST", { ids, decision });
    } finally {
        refreshAgent();
    }
}

/** Starts a mission; resolves to the new run id (null if the route did not return one). */
export async function createMission(body: CreateMissionBody): Promise<string | null> {
    const res = await apiSend<unknown>(AGENT_API.missions, "POST", body);
    refreshAgent();
    return extractRunId(res);
}

export async function cancelRun(id: string): Promise<void> {
    try {
        await apiSend<unknown>(AGENT_API.runCancel(id), "POST");
    } finally {
        refreshAgent();
    }
}

export async function createJob(body: CreateAgentJobBody): Promise<AgentJobItem> {
    const res = await apiSend<AgentJobItem>(AGENT_API.jobs, "POST", body);
    refreshAgent();
    return res;
}

export async function patchJob(id: string, body: PatchAgentJobBody): Promise<AgentJobItem> {
    try {
        return await apiSend<AgentJobItem>(AGENT_API.job(id), "PATCH", body);
    } finally {
        refreshAgent();
    }
}

export async function deleteJob(id: string): Promise<void> {
    await apiSend<unknown>(AGENT_API.job(id), "DELETE");
    refreshAgent();
}

/** « Lancer maintenant »; resolves to the queued run id when the route returns it. */
export async function runJob(id: string): Promise<string | null> {
    const res = await apiSend<unknown>(AGENT_API.jobRun(id), "POST");
    refreshAgent();
    return extractRunId(res);
}
