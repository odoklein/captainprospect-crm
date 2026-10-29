import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimRun, reapStale, scheduleDueJobs } from "@/lib/agent/queue";
import { AgentStoreUnavailable, deferQueuedRuns, workerMode } from "@/lib/agent/store";
import { agentAllowed, executeRun, jsonLog } from "@/lib/agent/run";

// ============================================
// GET /api/cron/agent-tick — every 5 minutes (lib/instance/cron-jobs.ts)
//
// 1. Enqueues the agent jobs whose schedule has come due (the worker does it
//    too; whichever runs first wins, the dedupe key stops doubles).
// 2. LITE MODE: when the worker's heartbeat is older than 3 minutes (no second
//    service deployed, or it is down), runs ONE queued WATCH run here, capped
//    at 240 s so the request ends under the scheduler's 300 s. REPORT and
//    MISSION runs cannot fit in a request: they are marked DEFERRED with a note.
//
// Bearer CRON_SECRET, fail closed: no secret configured = 503.
// ============================================

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LITE_DEADLINE_MS = 240_000;
const WORKER_STALE_MS = 3 * 60_000;

export async function GET(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const allowed = await agentAllowed();
    if (!allowed.ok) return NextResponse.json({ success: true, skipped: allowed.reason });

    try {
        const defaultActor = await prisma.user.findFirst({ where: { role: "MANAGER", isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
        const scheduled = await scheduleDueJobs({ now, defaultActorId: defaultActor?.id ?? null });
        const reaped = await reapStale(now);
        const { mode, workerSeenAt } = await workerMode(now, WORKER_STALE_MS);

        const summary: Record<string, unknown> = {
            success: true,
            mode,
            workerSeenAt: workerSeenAt?.toISOString() ?? null,
            scheduled: scheduled.scheduled.filter((s) => s.created).length,
            initialised: scheduled.initialised.length,
            invalid: scheduled.invalid,
            reaped,
        };
        if (mode === "worker") return NextResponse.json(summary);

        // Lite mode: the web process stands in for the missing worker, briefly.
        const deferred = await deferQueuedRuns(["REPORT", "MISSION", "DIGEST"], "Worker agent absent : ce type d'exécution attend le service dédié (mode lite).", now);
        const run = await claimRun(`lite:${process.pid}`, now, { kinds: ["WATCH"], mode: "lite" });
        if (!run) return NextResponse.json({ ...summary, deferred, ran: null });

        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(new Error("lite deadline")), LITE_DEADLINE_MS + 15_000);
        try {
            const result = await executeRun(run, {
                workerId: `lite:${process.pid}`,
                mode: "lite",
                signal: abort.signal,
                log: jsonLog,
                deadlineMs: LITE_DEADLINE_MS,
            });
            return NextResponse.json({ ...summary, deferred, ran: { runId: run.id, playbook: run.playbook, status: result.status, error: result.error, summary: result.outcome?.summary ?? null } });
        } finally {
            clearTimeout(timer);
        }
    } catch (error) {
        if (error instanceof AgentStoreUnavailable) {
            return NextResponse.json({ success: true, skipped: "tables agent absentes (migration 20261101120000_add_agent_jobs non appliquée)" });
        }
        console.error("[agent-tick]", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
