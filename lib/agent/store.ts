/**
 * Prisma access for the agent tables, with one failure mode the callers can
 * reason about: `AgentStoreUnavailable` when the migration has not been
 * applied (P2021 table missing, P2022 column missing). Everything else is a
 * real error.
 *
 * The claim / heartbeat / reaper statements live in lib/agent/queue.ts as raw
 * SQL (they need FOR UPDATE SKIP LOCKED); this file covers the model API.
 */

import { Prisma, type AgentRun as AgentRunModel, type AgentRunStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseBudget, parseUsage } from "./budget";
import type { ClaimedRun, RunMode, RunUsage } from "./types";

export class AgentStoreUnavailable extends Error {
    constructor(cause: unknown) {
        super("agent store unavailable (migration 20261101120000_add_agent_jobs applied?)");
        this.name = "AgentStoreUnavailable";
        this.cause = cause;
    }
}

export function isMissingTable(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022");
}

/** Wraps a Prisma call so a missing table reads as "unavailable". */
export async function withStore<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (isMissingTable(error)) throw new AgentStoreUnavailable(error);
        throw error;
    }
}

export function toClaimedRun(row: AgentRunModel | Record<string, unknown>): ClaimedRun {
    const r = row as AgentRunModel;
    return {
        id: r.id,
        jobId: r.jobId ?? null,
        kind: r.kind,
        playbook: r.playbook,
        trigger: r.trigger,
        status: r.status,
        folderId: r.folderId ?? null,
        clientId: r.clientId ?? null,
        missionId: r.missionId ?? null,
        actorId: r.actorId,
        conversationId: r.conversationId ?? null,
        goal: r.goal ?? null,
        budget: parseBudget(r.budget, r.kind),
        usage: parseUsage(r.usage),
        mode: r.mode === "lite" ? "lite" : "worker",
        attempts: r.attempts,
        maxAttempts: r.maxAttempts,
        checkpoint: r.checkpoint && typeof r.checkpoint === "object" && !Array.isArray(r.checkpoint) ? (r.checkpoint as Record<string, unknown>) : null,
        startedAt: r.startedAt ? new Date(r.startedAt) : null,
        createdAt: new Date(r.createdAt),
    };
}

// ── jobs ────────────────────────────────────────────────────────────────────

export async function getJob(jobId: string) {
    return withStore(() => prisma.agentJob.findUnique({ where: { id: jobId } }));
}

export async function recordJobOutcome(jobId: string, status: AgentRunStatus, now: Date): Promise<void> {
    await withStore(() =>
        prisma.agentJob.update({
            where: { id: jobId },
            data: {
                lastRunAt: now,
                lastStatus: status,
                failures: status === "FAILED" ? { increment: 1 } : status === "DONE" || status === "WAITING_APPROVAL" ? 0 : undefined,
            },
            select: { id: true },
        }),
    );
}

// ── runs ────────────────────────────────────────────────────────────────────

export async function getRun(runId: string): Promise<ClaimedRun | null> {
    const row = await withStore(() => prisma.agentRun.findUnique({ where: { id: runId } }));
    return row ? toClaimedRun(row) : null;
}

export interface RunFinish {
    status: AgentRunStatus;
    summary: string | null;
    error: string | null;
    usage: RunUsage;
    findingsCount: number;
    proposalsCount: number;
    stepsCount: number;
    checkpoint?: Record<string, unknown> | null;
}

export async function finishRun(runId: string, data: RunFinish, now: Date): Promise<void> {
    await withStore(() =>
        prisma.agentRun.update({
            where: { id: runId },
            data: {
                status: data.status,
                summary: data.summary,
                error: data.error,
                usage: data.usage as unknown as Prisma.InputJsonValue,
                findingsCount: data.findingsCount,
                proposalsCount: data.proposalsCount,
                stepsCount: data.stepsCount,
                ...(data.checkpoint !== undefined ? { checkpoint: (data.checkpoint ?? Prisma.DbNull) as Prisma.InputJsonValue } : {}),
                lockedBy: null,
                heartbeatAt: null,
                finishedAt: now,
            },
            select: { id: true },
        }),
    );
}

/** Puts a run back in the queue (drain, cancellation of a worker) with its checkpoint. */
export async function requeueRun(runId: string, checkpoint: Record<string, unknown> | null, note: string, now: Date): Promise<void> {
    await withStore(() =>
        prisma.agentRun.updateMany({
            where: { id: runId, status: "RUNNING" },
            data: {
                status: "QUEUED",
                lockedBy: null,
                heartbeatAt: null,
                runAfter: now,
                error: note,
                ...(checkpoint ? { checkpoint: checkpoint as Prisma.InputJsonValue } : {}),
            },
        }),
    );
}

export async function updateRun(runId: string, data: Prisma.AgentRunUpdateInput): Promise<void> {
    await withStore(() => prisma.agentRun.update({ where: { id: runId }, data, select: { id: true } }));
}

export async function updateRunUsage(runId: string, usage: RunUsage, stepsCount: number): Promise<void> {
    await withStore(() =>
        prisma.agentRun.update({
            where: { id: runId },
            data: { usage: usage as unknown as Prisma.InputJsonValue, stepsCount },
            select: { id: true },
        }),
    );
}

/** Marks queued runs of these kinds DEFERRED (lite mode cannot run them). */
export async function deferQueuedRuns(kinds: Array<"REPORT" | "MISSION" | "DIGEST">, note: string, now: Date): Promise<number> {
    const { count } = await withStore(() =>
        prisma.agentRun.updateMany({
            where: { status: "QUEUED", kind: { in: kinds }, mode: "worker" },
            data: { status: "DEFERRED", error: note, finishedAt: now },
        }),
    );
    return count;
}

// ── steps ───────────────────────────────────────────────────────────────────

export async function createStep(input: { runId: string; index: number; phase: string; title: string; tool?: string | null; args?: unknown; now: Date }): Promise<string> {
    const row = await withStore(() =>
        prisma.agentStep.create({
            data: {
                runId: input.runId,
                index: input.index,
                phase: input.phase,
                title: input.title,
                status: "RUNNING",
                tool: input.tool ?? null,
                args: (input.args ?? Prisma.DbNull) as Prisma.InputJsonValue,
                startedAt: input.now,
            },
            select: { id: true },
        }),
    );
    return row.id;
}

export async function updateStep(stepId: string, data: Prisma.AgentStepUpdateInput): Promise<void> {
    await withStore(() => prisma.agentStep.update({ where: { id: stepId }, data, select: { id: true } }));
}

// ── proposals ───────────────────────────────────────────────────────────────

export async function createProposal(input: {
    runId: string;
    tool: string;
    args: Record<string, unknown>;
    card: unknown;
    rationale: string | null;
    risk: "confirm" | "safe_write";
    expiresAt: Date;
    batchId?: string | null;
}): Promise<string> {
    const row = await withStore(() =>
        prisma.agentProposal.create({
            data: {
                runId: input.runId,
                tool: input.tool,
                args: input.args as Prisma.InputJsonValue,
                card: (input.card ?? {}) as Prisma.InputJsonValue,
                rationale: input.rationale,
                risk: input.risk,
                expiresAt: input.expiresAt,
                batchId: input.batchId ?? null,
            },
            select: { id: true },
        }),
    );
    return row.id;
}

export async function countPendingProposals(runId: string): Promise<number> {
    return withStore(() => prisma.agentProposal.count({ where: { runId, state: "PENDING" } }));
}

// ── system config ───────────────────────────────────────────────────────────

export const CONFIG_KEYS = {
    enabled: "agent.enabled",
    workerHeartbeat: "agent.worker.heartbeat",
} as const;

/** Kill switch: SystemConfig "agent.enabled", default true (missing row, unreadable table). */
export async function agentEnabled(): Promise<boolean> {
    try {
        const row = await prisma.systemConfig.findUnique({ where: { key: CONFIG_KEYS.enabled } });
        if (!row) return true;
        const v = row.value.trim().toLowerCase();
        return !(v === "false" || v === "0" || v === "off" || v === "no");
    } catch {
        return true;
    }
}

export async function setWorkerHeartbeat(workerId: string, now: Date): Promise<void> {
    const value = JSON.stringify({ workerId, at: now.toISOString() });
    try {
        await prisma.systemConfig.upsert({
            where: { key: CONFIG_KEYS.workerHeartbeat },
            update: { value },
            create: { key: CONFIG_KEYS.workerHeartbeat, value },
        });
    } catch (error) {
        console.warn("[agent] worker heartbeat not written", error instanceof Error ? error.message : error);
    }
}

export async function getWorkerHeartbeat(): Promise<{ workerId: string; at: Date } | null> {
    try {
        const row = await prisma.systemConfig.findUnique({ where: { key: CONFIG_KEYS.workerHeartbeat } });
        if (!row) return null;
        const parsed = JSON.parse(row.value) as { workerId?: unknown; at?: unknown };
        const at = typeof parsed.at === "string" ? new Date(parsed.at) : null;
        if (!at || Number.isNaN(at.getTime())) return null;
        return { workerId: typeof parsed.workerId === "string" ? parsed.workerId : "?", at };
    } catch {
        return null;
    }
}

/** Mode the agent currently runs in, from the worker heartbeat age. */
export async function workerMode(now: Date, staleMs = 3 * 60_000): Promise<{ mode: RunMode; workerSeenAt: Date | null }> {
    const hb = await getWorkerHeartbeat();
    if (!hb) return { mode: "lite", workerSeenAt: null };
    return { mode: now.getTime() - hb.at.getTime() > staleMs ? "lite" : "worker", workerSeenAt: hb.at };
}
