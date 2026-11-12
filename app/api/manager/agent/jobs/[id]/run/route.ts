// ============================================
// POST /api/manager/agent/jobs/[id]/run — « Lancer maintenant » → AgentRunCard
// Priority 10, acting as the clicking manager. A job with a run already queued
// or running returns that run (200) instead of stacking a second one; a
// per-minute dedupe key absorbs double clicks.
// ============================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getRunCard, isAgentUnavailable } from "@/lib/agent/api";
import { enqueueRun } from "@/lib/agent/queue";
import type { RunBudget } from "@/lib/agent/types";
import { withStore } from "@/lib/agent/store";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    try {
        const job = await withStore(() => prisma.agentJob.findUnique({ where: { id } }));
        if (!job) throw new NotFoundError("Job introuvable");

        const open = await withStore(() =>
            prisma.agentRun.findFirst({ where: { jobId: job.id, status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { createdAt: "desc" }, select: { id: true } }),
        );
        if (open) return successResponse(await getRunCard(open.id));

        const now = new Date();
        const config = (job.config && typeof job.config === "object" ? job.config : {}) as { budget?: Partial<RunBudget> };
        const { id: runId } = await enqueueRun(
            {
                jobId: job.id,
                kind: job.kind,
                playbook: job.playbook,
                trigger: "MANUAL",
                folderId: job.folderId,
                clientId: job.clientId,
                missionId: job.missionId,
                actorId: session.user.id,
                budget: config.budget ?? null,
                priority: 10,
                runAfter: now,
                dedupeKey: `manual:${job.id}:${now.toISOString().slice(0, 16)}`,
            },
            now,
        );
        if (!runId) {
            const again = await withStore(() => prisma.agentRun.findFirst({ where: { jobId: job.id }, orderBy: { createdAt: "desc" }, select: { id: true } }));
            if (again) return successResponse(await getRunCard(again.id));
            return errorResponse("Lancement impossible, réessaie dans une minute.", 409);
        }
        return successResponse(await getRunCard(runId), 201);
    } catch (error) {
        if (isAgentUnavailable(error)) return errorResponse("L'agent n'est pas encore installé sur cette instance (migration manquante).", 503);
        throw error;
    }
});
