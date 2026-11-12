// ============================================
// GET  /api/manager/agent/jobs?folderId=&clientId= — the agent's jobs ({ items })
//      First call on an instance seeds the default jobs (lib/agent/seed.ts).
// POST /api/manager/agent/jobs — CreateAgentJobBody → AgentJobItem (201)
//      Config validated by the playbook's zod schema, schedule by the cron parser.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { folderWhere, isAgentUnavailable } from "@/lib/agent/api";
import { isUniqueViolation, jobItems, parseJobConfig, parseSchedule, requirePlaybook, resolveScope } from "@/lib/agent/jobs";
import { seedDefaultJobs } from "@/lib/agent/seed";
import { withStore } from "@/lib/agent/store";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId");
    const clientId = searchParams.get("clientId");
    try {
        await seedDefaultJobs(session.user.id).catch((error) => {
            if (isAgentUnavailable(error)) throw error;
            console.warn("[agent.jobs] default jobs not seeded", error instanceof Error ? error.message : error);
        });
        const where: Prisma.AgentJobWhereInput = folderId ? await folderWhere(folderId) : clientId ? { clientId } : {};
        const rows = await withStore(() => prisma.agentJob.findMany({ where, orderBy: [{ kind: "asc" }, { name: "asc" }], take: 200 }));
        return successResponse({ items: await jobItems(rows) });
    } catch (error) {
        if (isAgentUnavailable(error)) return successResponse({ items: [], degraded: true });
        throw error;
    }
});

const CreateBody = z.object({
    playbook: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(120).optional(),
    folderId: z.string().min(1).nullable().optional(),
    clientId: z.string().min(1).nullable().optional(),
    missionId: z.string().min(1).nullable().optional(),
    schedule: z.string().max(120).nullable().optional(),
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, CreateBody);
    const playbook = requirePlaybook(body.playbook);
    const scope = await resolveScope(playbook, body);
    const config = parseJobConfig(playbook, body.config);
    const now = new Date();
    const timezone = "Europe/Paris";
    const { schedule, nextRunAt } = parseSchedule(body.schedule === undefined ? playbook.defaultSchedule : body.schedule, timezone, now);

    try {
        const duplicate = await withStore(() =>
            prisma.agentJob.findFirst({ where: { playbook: playbook.id, folderId: scope.folderId, clientId: scope.clientId, missionId: scope.missionId }, select: { id: true } }),
        );
        if (duplicate) return errorResponse("Ce playbook est déjà programmé sur ce périmètre.", 409);
        const row = await withStore(() =>
            prisma.agentJob.create({
                data: {
                    kind: playbook.kind,
                    playbook: playbook.id,
                    name: body.name ?? (scope.clientName ? `${playbook.label} — ${scope.clientName}` : playbook.label),
                    enabled: body.enabled ?? true,
                    folderId: scope.folderId,
                    clientId: scope.clientId,
                    missionId: scope.missionId,
                    schedule,
                    timezone,
                    config: config as Prisma.InputJsonValue,
                    createdById: session.user.id,
                    nextRunAt,
                },
            }),
        );
        const [item] = await jobItems([row]);
        return successResponse(item, 201);
    } catch (error) {
        if (isUniqueViolation(error)) return errorResponse("Ce playbook est déjà programmé sur ce périmètre.", 409);
        if (isAgentUnavailable(error)) return errorResponse("L'agent n'est pas encore installé sur cette instance (migration manquante).", 503);
        throw error;
    }
});
