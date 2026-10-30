/**
 * The run queue, as raw SQL so it can be exercised on PGlite and so the claim
 * is ONE statement: `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)`.
 * One statement means no transaction to keep open across the Supabase
 * transaction pooler, and two workers can never take the same run.
 *
 * Exclusions at claim time: never two RUNNING runs of the same job, never two
 * RUNNING runs on the same folder (a thread is written by one run at a time).
 *
 * Every function takes a `db` with `$queryRaw` (Prisma in production, a PGlite
 * stand-in in tests) and an explicit `now`, so the SQL is reproducible.
 */

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveBudget } from "./budget";
import { nextMatch as cronNextMatch } from "./cron";
import { toClaimedRun } from "./store";
import type { AgentJobKind, AgentTrigger, ClaimedRun, RunBudget, RunMode } from "./types";

export interface SqlDb {
    $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

/** Heartbeat older than this on a RUNNING run = the worker is gone. */
export const STALE_HEARTBEAT_MS = 2 * 60_000;
/** Requeue backoff per attempt. */
export const REQUEUE_BACKOFF_MS = 60_000;

export interface EnqueueInput {
    jobId?: string | null;
    kind: AgentJobKind;
    playbook: string;
    trigger: AgentTrigger;
    folderId?: string | null;
    clientId?: string | null;
    missionId?: string | null;
    actorId: string;
    goal?: string | null;
    budget?: Partial<RunBudget> | null;
    priority?: number;
    runAfter?: Date;
    /** Unique: a second enqueue with the same key is a no-op (`created: false`). */
    dedupeKey?: string | null;
    mode?: RunMode;
    maxAttempts?: number;
}

export async function enqueueRun(input: EnqueueInput, now = new Date(), db: SqlDb = prisma): Promise<{ id: string | null; created: boolean }> {
    const id = randomUUID();
    const budget = JSON.stringify(resolveBudget(input.kind, input.budget));
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "AgentRun" (
            "id", "jobId", "kind", "playbook", "trigger", "status", "priority", "runAfter", "dedupeKey",
            "folderId", "clientId", "missionId", "actorId", "goal", "budget", "mode", "maxAttempts", "createdAt", "updatedAt"
        ) VALUES (
            ${id}, ${input.jobId ?? null}, ${input.kind}::"AgentJobKind", ${input.playbook}, ${input.trigger}::"AgentTrigger",
            'QUEUED'::"AgentRunStatus", ${input.priority ?? 0}, ${input.runAfter ?? now}, ${input.dedupeKey ?? null},
            ${input.folderId ?? null}, ${input.clientId ?? null}, ${input.missionId ?? null}, ${input.actorId}, ${input.goal ?? null},
            ${budget}::jsonb, ${input.mode ?? "worker"}, ${input.maxAttempts ?? 3}, ${now}, ${now}
        )
        ON CONFLICT ("dedupeKey") DO NOTHING
        RETURNING "id"
    `);
    return rows.length > 0 ? { id: rows[0].id, created: true } : { id: null, created: false };
}

export interface ClaimOptions {
    /** Only these kinds (lite mode: WATCH only). */
    kinds?: AgentJobKind[];
    mode?: RunMode;
}

/**
 * Takes the next runnable run for this worker, or null. Priority first, then
 * oldest `runAfter`. The row is locked and updated in the same statement.
 */
export async function claimRun(workerId: string, now = new Date(), options: ClaimOptions = {}, db: SqlDb = prisma): Promise<ClaimedRun | null> {
    const kinds = options.kinds && options.kinds.length > 0 ? options.kinds : null;
    const kindFilter = kinds
        ? Prisma.sql`AND r."kind" IN (${Prisma.join(kinds.map((k) => Prisma.sql`${k}::"AgentJobKind"`))})`
        : Prisma.empty;
    const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "AgentRun" AS u
        SET "status" = 'RUNNING'::"AgentRunStatus",
            "lockedBy" = ${workerId},
            "heartbeatAt" = ${now},
            "startedAt" = ${now},
            "attempts" = u."attempts" + 1,
            "mode" = ${options.mode ?? "worker"},
            "error" = NULL,
            "updatedAt" = ${now}
        WHERE u."id" = (
            SELECT r."id" FROM "AgentRun" AS r
            WHERE r."status" = 'QUEUED'::"AgentRunStatus"
              AND r."runAfter" <= ${now}
              AND r."cancelRequestedAt" IS NULL
              ${kindFilter}
              AND NOT EXISTS (
                  SELECT 1 FROM "AgentRun" AS x
                  WHERE x."status" = 'RUNNING'::"AgentRunStatus" AND x."jobId" IS NOT NULL AND x."jobId" = r."jobId"
              )
              AND NOT EXISTS (
                  SELECT 1 FROM "AgentRun" AS y
                  WHERE y."status" = 'RUNNING'::"AgentRunStatus" AND y."folderId" IS NOT NULL AND y."folderId" = r."folderId"
              )
            ORDER BY r."priority" DESC, r."runAfter" ASC, r."createdAt" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING u.*
    `);
    return rows.length > 0 ? toClaimedRun(rows[0]) : null;
}

/** Refreshes the run's heartbeat; returns false when the run is no longer RUNNING under this worker (reaped or cancelled). */
export async function heartbeat(runId: string, workerId: string, now = new Date(), db: SqlDb = prisma): Promise<boolean> {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "AgentRun" SET "heartbeatAt" = ${now}, "updatedAt" = ${now}
        WHERE "id" = ${runId} AND "status" = 'RUNNING'::"AgentRunStatus" AND "lockedBy" = ${workerId}
        RETURNING "id"
    `);
    return rows.length > 0;
}

/** Whether a cancellation was requested for this run (checked between phases). */
export async function cancelRequested(runId: string, db: SqlDb = prisma): Promise<boolean> {
    const rows = await db.$queryRaw<Array<{ c: Date | null }>>(Prisma.sql`
        SELECT "cancelRequestedAt" AS c FROM "AgentRun" WHERE "id" = ${runId}
    `);
    return rows.length > 0 && rows[0].c !== null;
}

export interface ReapResult {
    requeued: string[];
    failed: string[];
}

/**
 * RUNNING runs whose heartbeat is older than `staleMs`: back to QUEUED with a
 * backoff while attempts remain, else FAILED. Two statements, each atomic.
 */
export async function reapStale(now = new Date(), staleMs = STALE_HEARTBEAT_MS, db: SqlDb = prisma): Promise<ReapResult> {
    const cutoff = new Date(now.getTime() - staleMs);
    const requeued = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "AgentRun"
        SET "status" = 'QUEUED'::"AgentRunStatus",
            "lockedBy" = NULL,
            "heartbeatAt" = NULL,
            "runAfter" = ${now}::timestamp + ("attempts" * ${REQUEUE_BACKOFF_MS / 1000}::int * interval '1 second'),
            "error" = 'Battement de cœur perdu : relancé automatiquement.',
            "updatedAt" = ${now}
        WHERE "status" = 'RUNNING'::"AgentRunStatus"
          AND ("heartbeatAt" IS NULL OR "heartbeatAt" < ${cutoff})
          AND "attempts" < "maxAttempts"
        RETURNING "id"
    `);
    const failed = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "AgentRun"
        SET "status" = 'FAILED'::"AgentRunStatus",
            "lockedBy" = NULL,
            "heartbeatAt" = NULL,
            "finishedAt" = ${now},
            "error" = 'Battement de cœur perdu après le nombre maximal de tentatives.',
            "updatedAt" = ${now}
        WHERE "status" = 'RUNNING'::"AgentRunStatus"
          AND ("heartbeatAt" IS NULL OR "heartbeatAt" < ${cutoff})
          AND "attempts" >= "maxAttempts"
        RETURNING "id"
    `);
    return { requeued: requeued.map((r) => r.id), failed: failed.map((r) => r.id) };
}

/** `job:<id>:<ISO minute>` — one run per job per scheduled minute. */
export function scheduledDedupeKey(jobId: string, fireAt: Date): string {
    return `job:${jobId}:${fireAt.toISOString().slice(0, 16)}`;
}

interface DueJobRow {
    id: string;
    kind: AgentJobKind;
    playbook: string;
    schedule: string;
    timezone: string;
    nextRunAt: Date | null;
    folderId: string | null;
    clientId: string | null;
    missionId: string | null;
    createdById: string | null;
    config: unknown;
}

export interface ScheduleResult {
    /** Jobs whose first nextRunAt was computed (no run yet). */
    initialised: string[];
    scheduled: Array<{ jobId: string; runId: string | null; created: boolean }>;
    /** Jobs with an unparsable schedule, skipped. */
    invalid: string[];
}

/**
 * Enqueues one run for every enabled job whose `nextRunAt` has passed, then
 * moves `nextRunAt` to the next match after `now`. A job that missed several
 * ticks gets one catch-up run, not a backlog. New jobs only get their first
 * `nextRunAt` here.
 */
export async function scheduleDueJobs(
    options: { now?: Date; defaultActorId: string | null; nextMatch?: typeof cronNextMatch },
    db: SqlDb = prisma,
): Promise<ScheduleResult> {
    const now = options.now ?? new Date();
    const nextMatch = options.nextMatch ?? cronNextMatch;
    const result: ScheduleResult = { initialised: [], scheduled: [], invalid: [] };

    const due = await db.$queryRaw<DueJobRow[]>(Prisma.sql`
        SELECT "id", "kind", "playbook", "schedule", "timezone", "nextRunAt", "folderId", "clientId", "missionId", "createdById", "config"
        FROM "AgentJob"
        WHERE "enabled" = true AND "schedule" IS NOT NULL AND ("nextRunAt" IS NULL OR "nextRunAt" <= ${now})
        ORDER BY "nextRunAt" ASC NULLS FIRST
    `);

    for (const job of due) {
        let next: Date | null;
        try {
            next = nextMatch(job.schedule, now, job.timezone || "Europe/Paris");
        } catch {
            result.invalid.push(job.id);
            continue;
        }

        if (job.nextRunAt) {
            const actorId = job.createdById ?? options.defaultActorId;
            if (!actorId) {
                result.scheduled.push({ jobId: job.id, runId: null, created: false });
            } else {
                const config = (job.config && typeof job.config === "object" ? job.config : {}) as { budget?: Partial<RunBudget> };
                const fireAt = new Date(job.nextRunAt);
                const { id, created } = await enqueueRun(
                    {
                        jobId: job.id,
                        kind: job.kind,
                        playbook: job.playbook,
                        trigger: "SCHEDULE",
                        folderId: job.folderId,
                        clientId: job.clientId,
                        missionId: job.missionId,
                        actorId,
                        budget: config.budget ?? null,
                        runAfter: now,
                        dedupeKey: scheduledDedupeKey(job.id, fireAt),
                    },
                    now,
                    db,
                );
                result.scheduled.push({ jobId: job.id, runId: id, created });
            }
        } else {
            result.initialised.push(job.id);
        }

        await db.$queryRaw(Prisma.sql`
            UPDATE "AgentJob" SET "nextRunAt" = ${next}, "updatedAt" = ${now} WHERE "id" = ${job.id}
        `);
    }
    return result;
}

export interface QueueStats {
    queued: number;
    running: number;
    waitingApproval: number;
    failed24h: number;
    deferred24h: number;
    oldestQueuedAgeS: number | null;
}

export async function queueStats(now = new Date(), db: SqlDb = prisma): Promise<QueueStats> {
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const rows = await db.$queryRaw<Array<{ queued: number | bigint; running: number | bigint; waiting: number | bigint; failed: number | bigint; deferred: number | bigint; oldest: Date | null }>>(Prisma.sql`
        SELECT
            COUNT(*) FILTER (WHERE "status" = 'QUEUED'::"AgentRunStatus") AS queued,
            COUNT(*) FILTER (WHERE "status" = 'RUNNING'::"AgentRunStatus") AS running,
            COUNT(*) FILTER (WHERE "status" = 'WAITING_APPROVAL'::"AgentRunStatus") AS waiting,
            COUNT(*) FILTER (WHERE "status" = 'FAILED'::"AgentRunStatus" AND "finishedAt" >= ${dayAgo}) AS failed,
            COUNT(*) FILTER (WHERE "status" = 'DEFERRED'::"AgentRunStatus" AND "finishedAt" >= ${dayAgo}) AS deferred,
            MIN("runAfter") FILTER (WHERE "status" = 'QUEUED'::"AgentRunStatus") AS oldest
        FROM "AgentRun"
    `);
    const r = rows[0];
    const n = (v: number | bigint | undefined) => Number(v ?? 0);
    const oldest = r?.oldest ? new Date(r.oldest) : null;
    return {
        queued: n(r?.queued),
        running: n(r?.running),
        waitingApproval: n(r?.waiting),
        failed24h: n(r?.failed),
        deferred24h: n(r?.deferred),
        oldestQueuedAgeS: oldest ? Math.max(0, Math.round((now.getTime() - oldest.getTime()) / 1000)) : null,
    };
}
