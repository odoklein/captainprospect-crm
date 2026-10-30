// ============================================
// GET /api/manager/agent/overview — worker state, counts, today's cost, recent runs
// Also sweeps proposals past their expiry (cheap, keeps counts honest).
// ============================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import type { AgentOverview } from "@/lib/assistant/api-contract";
import { RUN_SELECT, isAgentUnavailable, toRunCards } from "@/lib/agent/api";
import { parseUsage } from "@/lib/agent/budget";
import { expireStaleProposals } from "@/lib/agent/proposals";
import type { RunRow } from "@/lib/agent/serialize";
import { agentEnabled, withStore, workerMode } from "@/lib/agent/store";
import { parisDay, parisMidnight } from "@/lib/manager-home/today-rules";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const now = new Date();
    const enabled = await agentEnabled();
    const { mode, workerSeenAt } = await workerMode(now);
    const worker: AgentOverview["worker"] = { mode: enabled ? mode : "off", seenAt: workerSeenAt?.toISOString() ?? null, enabled };

    try {
        await expireStaleProposals(now).catch(() => 0);
        const todayStart = parisMidnight(parisDay(now));
        const [openFindings, critical, pendingProposals, running, queued, todayRuns, recent] = await Promise.all([
            withStore(() => prisma.agentFinding.count({ where: { state: "OPEN" } })),
            withStore(() => prisma.agentFinding.count({ where: { state: "OPEN", severity: "CRITICAL" } })),
            withStore(() => prisma.agentProposal.count({ where: { state: "PENDING", expiresAt: { gt: now } } })),
            withStore(() => prisma.agentRun.count({ where: { status: "RUNNING" } })),
            withStore(() => prisma.agentRun.count({ where: { status: "QUEUED" } })),
            withStore(() => prisma.agentRun.findMany({ where: { OR: [{ startedAt: { gte: todayStart } }, { finishedAt: { gte: todayStart } }] }, select: { usage: true }, take: 2000 })),
            withStore(() => prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: RUN_SELECT })),
        ]);
        const costTodayEur = Math.round(todayRuns.reduce((sum, r) => sum + parseUsage(r.usage).costEur, 0) * 10_000) / 10_000;
        const data: AgentOverview = {
            worker,
            counts: { openFindings, critical, pendingProposals, running, queued },
            costTodayEur,
            recentRuns: await toRunCards(recent as RunRow[]),
        };
        return successResponse(data);
    } catch (error) {
        if (!isAgentUnavailable(error)) throw error;
        const data: AgentOverview = {
            worker,
            counts: { openFindings: 0, critical: 0, pendingProposals: 0, running: 0, queued: 0 },
            costTodayEur: 0,
            recentRuns: [],
            degraded: true,
        };
        return successResponse(data);
    }
});
