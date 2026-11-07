import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardInstanceRequest, instanceJson } from "@/lib/instance/respond";
import { queueStats } from "@/lib/agent/queue";
import { agentEnabled, workerMode } from "@/lib/agent/store";
import { getLicense } from "@/lib/license/server";
import { isFeatureEnabled } from "@/lib/license/resolve";

// ============================================
// GET /api/instance/agent/health — the Console's view of Captain Agent.
// HMAC-signed like the rest of /api/instance/* (lib/instance/auth).
//
// Never throws: a database or migration problem answers { ok: true, dbOk: false }
// with whatever could be read, so the Console can alert on the fields it has.
// ============================================

export const dynamic = "force-dynamic";

const WORKER_STALE_MS = 3 * 60_000;

export async function GET(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "agent-health");
    if (!guard.ok) return guard.response;

    const now = new Date();
    const body: Record<string, unknown> = {
        ok: true,
        dbOk: true,
        at: now.toISOString(),
        workerSeenAt: null,
        mode: "lite",
        enabled: true,
        licensed: true,
        queued: 0,
        running: 0,
        waitingApproval: 0,
        failed24h: 0,
        deferred24h: 0,
        costTodayEur: 0,
        oldestQueuedAgeS: null,
        jobs: [] as unknown[],
    };

    try {
        body.licensed = isFeatureEnabled(await getLicense(), "agent");
    } catch {
        // licence unreadable = unlimited, same as everywhere else
    }

    try {
        const [enabled, { mode, workerSeenAt }, stats] = await Promise.all([agentEnabled(), workerMode(now, WORKER_STALE_MS), queueStats(now)]);
        body.enabled = enabled;
        body.mode = mode;
        body.workerSeenAt = workerSeenAt?.toISOString() ?? null;
        Object.assign(body, stats);

        const dayStart = new Date(now);
        dayStart.setUTCHours(0, 0, 0, 0);
        const cost = await prisma.$queryRaw<Array<{ cost: number | null }>>(Prisma.sql`
            SELECT COALESCE(SUM("costEur"), 0)::float8 AS cost FROM "AgentStep" WHERE "createdAt" >= ${dayStart}
        `);
        body.costTodayEur = Math.round(Number(cost[0]?.cost ?? 0) * 10_000) / 10_000;

        const jobs = await prisma.agentJob.findMany({
            select: { id: true, name: true, playbook: true, kind: true, enabled: true, schedule: true, timezone: true, lastRunAt: true, nextRunAt: true, lastStatus: true, failures: true, clientId: true, folderId: true },
            orderBy: { name: "asc" },
        });
        body.jobs = jobs.map((j) => ({
            ...j,
            lastRunAt: j.lastRunAt?.toISOString() ?? null,
            nextRunAt: j.nextRunAt?.toISOString() ?? null,
        }));
    } catch (error) {
        body.dbOk = false;
        body.error = error instanceof Error ? error.message.split("\n")[0].slice(0, 200) : String(error);
    }

    return instanceJson(body);
}
