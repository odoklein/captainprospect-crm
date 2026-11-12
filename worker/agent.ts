/**
 * Captain Agent worker — the second service of an agency (Dockerfile stage
 * `agent-worker`, Dokploy app `crm-<slug>-agent`, same env file, no domain).
 *
 *   npm run worker:agent
 *
 * Every AGENT_POLL_MS (5 s): schedule due jobs, reap stale runs, then claim
 * up to AGENT_CONCURRENCY (2) runs and execute them. Heartbeat every 15 s on
 * each run and on SystemConfig `agent.worker.heartbeat` (the web process reads
 * it to decide between worker and lite mode). SIGTERM/SIGINT: stop claiming,
 * abort running turns, requeue the runs with a checkpoint, disconnect.
 *
 * Off switches: SystemConfig `agent.enabled = false`, licence feature `agent`.
 * Both are re-read every tick, so flipping them needs no restart.
 */

import "dotenv/config";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { startIntegrationKeys } from "@/lib/integrations/store";
import { reapStale, scheduleDueJobs, claimRun } from "@/lib/agent/queue";
import { AgentStoreUnavailable, setWorkerHeartbeat } from "@/lib/agent/store";
import { agentAllowed, executeRun, jsonLog } from "@/lib/agent/run";
import { isAgentConfigured } from "@/lib/agent/providers";
import type { ClaimedRun } from "@/lib/agent/types";

const POLL_MS = Math.max(1_000, Number(process.env.AGENT_POLL_MS) || 5_000);
const CONCURRENCY = Math.min(4, Math.max(1, Number(process.env.AGENT_CONCURRENCY) || 2));
const HEARTBEAT_MS = 15_000;
const WORKER_ID = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

const log = jsonLog;
const running = new Map<string, { run: ClaimedRun; abort: AbortController; done: Promise<void> }>();
let draining = false;
let defaultActorId: string | null = null;
let defaultActorAt = 0;
let storeWarned = false;
let allowedWarned = false;

/** The manager scheduled jobs act as when the job has no creator (cached 5 min). */
async function resolveDefaultActor(now: Date): Promise<string | null> {
    if (now.getTime() - defaultActorAt < 5 * 60_000) return defaultActorId;
    defaultActorAt = now.getTime();
    try {
        const m = await prisma.user.findFirst({ where: { role: "MANAGER", isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
        defaultActorId = m?.id ?? null;
    } catch {
        defaultActorId = null;
    }
    return defaultActorId;
}

async function tick(): Promise<void> {
    const now = new Date();
    await setWorkerHeartbeat(WORKER_ID, now);

    const allowed = await agentAllowed();
    if (!allowed.ok) {
        if (!allowedWarned) {
            allowedWarned = true;
            log("agent.paused", { reason: allowed.reason });
        }
        return;
    }
    allowedWarned = false;

    try {
        const scheduled = await scheduleDueJobs({ now, defaultActorId: await resolveDefaultActor(now) });
        if (scheduled.scheduled.length > 0 || scheduled.initialised.length > 0 || scheduled.invalid.length > 0) {
            log("agent.schedule", { scheduled: scheduled.scheduled.filter((s) => s.created).length, initialised: scheduled.initialised.length, invalid: scheduled.invalid });
        }
        const reaped = await reapStale(now);
        if (reaped.requeued.length > 0 || reaped.failed.length > 0) log("agent.reap", { ...reaped });
        storeWarned = false;
    } catch (error) {
        if (!storeWarned) {
            storeWarned = true;
            log("agent.store.unavailable", { error: error instanceof Error ? error.message.split("\n")[0] : String(error) });
        }
        return;
    }

    while (!draining && running.size < CONCURRENCY) {
        if (!isAgentConfigured()) {
            log("agent.not_configured", { hint: "OPENAI_API_KEY absente : les veilles détectent mais ne rédigent pas" });
        }
        const run = await claimRun(WORKER_ID, new Date(), { mode: "worker" });
        if (!run) break;
        log("agent.claim", { runId: run.id, playbook: run.playbook, kind: run.kind, attempt: run.attempts, queuedForS: Math.round((Date.now() - run.createdAt.getTime()) / 1000) });
        const abort = new AbortController();
        const done = executeRun(run, { workerId: WORKER_ID, mode: "worker", signal: abort.signal, log, heartbeatMs: HEARTBEAT_MS })
            .catch((error) => log("agent.run.crashed", { runId: run.id, error: error instanceof Error ? error.message : String(error) }))
            .then(() => {
                running.delete(run.id);
            });
        running.set(run.id, { run, abort, done });
    }
}

async function main(): Promise<void> {
    await startIntegrationKeys();
    log("agent.boot", { workerId: WORKER_ID, pollMs: POLL_MS, concurrency: CONCURRENCY, configured: isAgentConfigured() });

    const loop = async () => {
        while (!draining) {
            const started = Date.now();
            try {
                await tick();
            } catch (error) {
                if (!(error instanceof AgentStoreUnavailable)) log("agent.tick.failed", { error: error instanceof Error ? error.message : String(error) });
            }
            const wait = Math.max(250, POLL_MS - (Date.now() - started));
            await new Promise((resolve) => setTimeout(resolve, wait));
        }
    };

    const drain = async (signal: string) => {
        if (draining) return;
        draining = true;
        log("agent.drain", { signal, running: running.size });
        for (const { abort } of running.values()) abort.abort(new Error(`drain:${signal}`));
        const deadline = setTimeout(() => {
            log("agent.drain.timeout", { running: running.size });
            process.exit(1);
        }, 30_000);
        await Promise.allSettled([...running.values()].map((r) => r.done));
        clearTimeout(deadline);
        await prisma.$disconnect().catch(() => undefined);
        log("agent.stopped", {});
        process.exit(0);
    };
    process.on("SIGTERM", () => void drain("SIGTERM"));
    process.on("SIGINT", () => void drain("SIGINT"));

    await loop();
}

main().catch((error) => {
    log("agent.fatal", { error: error instanceof Error ? error.stack ?? error.message : String(error) });
    process.exit(1);
});
