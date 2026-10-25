/**
 * Persistence for agent runs and evidence.
 *
 * `EvidenceStore` is the seam: Prisma in production, an in-memory twin in
 * tests. Every query is keyed by the trusted ids the runtime passes in (user,
 * conversation, scope) — nothing here takes an id from the model.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EvidenceStatus } from "../protocol";
import type { EvidencePeriod, Fact } from "./facts";

export interface RunStart {
    id: string;
    conversationId: string;
    userId: string;
    clientId: string | null;
    missionId: string | null;
    model: string;
    /** A run still marked running and older than this is considered dead. */
    staleBefore: Date;
}

export type RunEndStatus = "COMPLETED" | "FAILED" | "CANCELLED" | "TIMEOUT";

export interface RunFinish {
    status: RunEndStatus;
    model: string;
    fallbackUsed: boolean;
    promptTokens: number;
    completionTokens: number;
    costEur: number;
    latencyMs: number;
    firstTokenMs: number | null;
    iterations: number;
    toolCalls: number;
    retries: number;
    errorCode: string | null;
    verification: unknown;
    messageId: string | null;
}

export interface EvidenceRow {
    id: string;
    runId: string;
    conversationId: string;
    userId: string;
    clientId: string | null;
    missionId: string | null;
    tool: string;
    argsHash: string;
    args: unknown;
    status: EvidenceStatus;
    errorCode: string | null;
    summary: string;
    facts: Fact[];
    period: EvidencePeriod | null;
    resultDigest: string | null;
    payload: unknown | null;
    retrievedAt: Date;
    expiresAt: Date;
}

export interface EvidenceStore {
    /** Takes the conversation's one-turn lock. "busy" = another turn is running. */
    startRun(run: RunStart): Promise<"started" | "busy">;
    /** Records the outcome and releases the lock. */
    finishRun(id: string, data: RunFinish): Promise<void>;
    insertEvidence(row: EvidenceRow): Promise<void>;
    findReusable(q: { conversationId: string; userId: string; tool: string; argsHash: string; now: Date }): Promise<EvidenceRow | null>;
    listFresh(q: { conversationId: string; userId: string; now: Date; limit: number }): Promise<EvidenceRow[]>;
}

/** The ledger tables are missing (migration not applied) or unreachable. */
export class EvidenceStoreUnavailable extends Error {
    constructor(cause: unknown) {
        super("evidence store unavailable");
        this.name = "EvidenceStoreUnavailable";
        this.cause = cause;
    }
}

function isMissingTable(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")
    );
}

function toRow(r: {
    id: string;
    runId: string;
    conversationId: string;
    userId: string;
    clientId: string | null;
    missionId: string | null;
    tool: string;
    argsHash: string;
    args: Prisma.JsonValue;
    status: EvidenceStatus;
    errorCode: string | null;
    summary: string;
    facts: Prisma.JsonValue;
    period: Prisma.JsonValue;
    resultDigest: string | null;
    payload: Prisma.JsonValue;
    retrievedAt: Date;
    expiresAt: Date;
}): EvidenceRow {
    return {
        ...r,
        facts: Array.isArray(r.facts) ? (r.facts as unknown as Fact[]) : [],
        period: (r.period as unknown as EvidencePeriod | null) ?? null,
        payload: r.payload ?? null,
    };
}

export const prismaEvidenceStore: EvidenceStore = {
    async startRun(run) {
        try {
            // A crashed process leaves its lock behind; anything older than the
            // deadline cannot still be running.
            await prisma.assistantRun.updateMany({
                where: { lockKey: run.conversationId, startedAt: { lt: run.staleBefore } },
                data: { lockKey: null, status: "ABANDONED", finishedAt: new Date() },
            });
            await prisma.assistantRun.create({
                data: {
                    id: run.id,
                    conversationId: run.conversationId,
                    lockKey: run.conversationId,
                    userId: run.userId,
                    clientId: run.clientId,
                    missionId: run.missionId,
                    model: run.model,
                    status: "RUNNING",
                },
                select: { id: true },
            });
            return "started";
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "busy";
            throw new EvidenceStoreUnavailable(error);
        }
    },

    async finishRun(id, data) {
        await prisma.assistantRun.update({
            where: { id },
            data: {
                ...data,
                verification: (data.verification ?? Prisma.DbNull) as Prisma.InputJsonValue,
                lockKey: null,
                finishedAt: new Date(),
            },
            select: { id: true },
        });
    },

    async insertEvidence(row) {
        try {
            await prisma.assistantEvidence.create({
                data: {
                    ...row,
                    args: (row.args ?? {}) as Prisma.InputJsonValue,
                    facts: row.facts as unknown as Prisma.InputJsonValue,
                    period: (row.period ?? Prisma.DbNull) as Prisma.InputJsonValue,
                    payload: (row.payload ?? Prisma.DbNull) as Prisma.InputJsonValue,
                },
                select: { id: true },
            });
        } catch (error) {
            if (isMissingTable(error)) throw new EvidenceStoreUnavailable(error);
            throw error;
        }
    },

    async findReusable(q) {
        const row = await prisma.assistantEvidence.findFirst({
            where: {
                conversationId: q.conversationId,
                userId: q.userId,
                tool: q.tool,
                argsHash: q.argsHash,
                status: { in: ["OK", "EMPTY"] },
                expiresAt: { gt: q.now },
                payload: { not: Prisma.DbNull },
            },
            orderBy: { retrievedAt: "desc" },
        });
        return row ? toRow(row) : null;
    },

    async listFresh(q) {
        const rows = await prisma.assistantEvidence.findMany({
            where: { conversationId: q.conversationId, userId: q.userId, expiresAt: { gt: q.now }, status: { in: ["OK", "EMPTY"] } },
            orderBy: { retrievedAt: "desc" },
            take: q.limit,
        });
        return rows.map(toRow);
    },
};

/**
 * Retention: payloads are dropped once stale, whole rows (and their runs) once
 * older than the retention period. Cheap and idempotent; the chat route calls
 * it opportunistically, at most every 30 minutes per process.
 */
let lastPurgeAt = 0;
export async function purgeEvidence(now: Date, retentionDays: number): Promise<void> {
    if (now.getTime() - lastPurgeAt < 30 * 60_000) return;
    lastPurgeAt = now.getTime();
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    try {
        await prisma.assistantEvidence.updateMany({
            where: { expiresAt: { lt: now }, payload: { not: Prisma.DbNull } },
            data: { payload: Prisma.DbNull },
        });
        await prisma.assistantRun.deleteMany({ where: { startedAt: { lt: cutoff } } });
    } catch (error) {
        console.warn("[assistant.evidence] purge skipped", error instanceof Error ? error.message : error);
    }
}

/** In-memory twin with the same contract, for tests and evals. */
export function createMemoryEvidenceStore() {
    const runs = new Map<string, { run: RunStart; lockKey: string | null; startedAt: Date; finish?: RunFinish }>();
    const evidence: EvidenceRow[] = [];
    const store: EvidenceStore & { runs: typeof runs; evidence: EvidenceRow[]; failInserts: boolean } = {
        runs,
        evidence,
        failInserts: false,
        async startRun(run) {
            for (const r of runs.values()) {
                if (r.lockKey === run.conversationId && r.startedAt < run.staleBefore) r.lockKey = null;
            }
            if ([...runs.values()].some((r) => r.lockKey === run.conversationId)) return "busy";
            runs.set(run.id, { run, lockKey: run.conversationId, startedAt: new Date() });
            return "started";
        },
        async finishRun(id, data) {
            const r = runs.get(id);
            if (r) {
                r.lockKey = null;
                r.finish = data;
            }
        },
        async insertEvidence(row) {
            if (store.failInserts) throw new EvidenceStoreUnavailable(new Error("simulated"));
            evidence.push(structuredClone(row));
        },
        async findReusable(q) {
            const hits = evidence.filter(
                (e) =>
                    e.conversationId === q.conversationId &&
                    e.userId === q.userId &&
                    e.tool === q.tool &&
                    e.argsHash === q.argsHash &&
                    e.status !== "ERROR" &&
                    e.expiresAt > q.now &&
                    e.payload !== null,
            );
            return hits.length ? structuredClone(hits[hits.length - 1]) : null;
        },
        async listFresh(q) {
            return evidence
                .filter((e) => e.conversationId === q.conversationId && e.userId === q.userId && e.expiresAt > q.now && e.status !== "ERROR")
                .slice(-q.limit)
                .reverse()
                .map((e) => structuredClone(e));
        },
    };
    return store;
}
