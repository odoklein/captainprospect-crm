// ============================================
// PATCH  /api/manager/agent/jobs/[id] — PatchAgentJobBody → AgentJobItem
// DELETE /api/manager/agent/jobs/[id] — removes the job (its runs keep their history)
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { errorResponse, NotFoundError, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { isAgentUnavailable } from "@/lib/agent/api";
import { jobItems, parseJobConfig, parseSchedule, requirePlaybook } from "@/lib/agent/jobs";
import { withStore } from "@/lib/agent/store";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    schedule: z.string().max(120).nullable().optional(),
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, PatchBody);
    try {
        const job = await withStore(() => prisma.agentJob.findUnique({ where: { id } }));
        if (!job) throw new NotFoundError("Job introuvable");
        const playbook = requirePlaybook(job.playbook);
        const data: Prisma.AgentJobUpdateInput = {};
        if (body.name !== undefined) data.name = body.name;
        if (body.enabled !== undefined) {
            data.enabled = body.enabled;
            if (body.enabled) data.failures = 0;
        }
        if (body.config !== undefined) data.config = parseJobConfig(playbook, body.config) as Prisma.InputJsonValue;
        if (body.schedule !== undefined || (body.enabled === true && !job.nextRunAt)) {
            const next = parseSchedule(body.schedule !== undefined ? body.schedule : job.schedule, job.timezone || "Europe/Paris", new Date());
            data.schedule = next.schedule;
            data.nextRunAt = next.nextRunAt;
        }
        const row = await withStore(() => prisma.agentJob.update({ where: { id }, data }));
        const [item] = await jobItems([row]);
        return successResponse(item);
    } catch (error) {
        if (isAgentUnavailable(error)) return errorResponse("L'agent n'est pas encore installé sur cette instance (migration manquante).", 503);
        throw error;
    }
});

export const DELETE = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;
    try {
        const { count } = await withStore(() => prisma.agentJob.deleteMany({ where: { id } }));
        if (count === 0) throw new NotFoundError("Job introuvable");
        return successResponse({ deleted: true });
    } catch (error) {
        if (isAgentUnavailable(error)) throw new NotFoundError("Job introuvable");
        throw error;
    }
});
