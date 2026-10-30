// ============================================
// POST /api/manager/agent/missions — CreateMissionBody → AgentRunCard (201)
// Delegates a goal to the agent: budget preset from MISSION_BUDGETS (a dry
// run spends no automatic write), an AGENT thread in the folder for the
// mission's answer, and one QUEUED "mission.delegated" run at priority 10
// acting as the delegating manager.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { MISSION_BUDGETS } from "@/lib/assistant/api-contract";
import { getRunCard, isAgentUnavailable } from "@/lib/agent/api";
import { requirePlaybook, resolveScope } from "@/lib/agent/jobs";
import { enqueueRun } from "@/lib/agent/queue";
import { updateRun } from "@/lib/agent/store";
import { conversationHasField } from "@/lib/agent/thread";

export const dynamic = "force-dynamic";

const MISSION_PLAYBOOK = "mission.delegated";

const Body = z.object({
    goal: z.string().trim().min(5, "Décris la mission en une phrase au moins.").max(2000),
    folderId: z.string().min(1).nullable().optional(),
    clientId: z.string().min(1).nullable().optional(),
    missionId: z.string().min(1).nullable().optional(),
    budget: z.enum(["rapide", "standard", "approfondi"]),
    dryRun: z.boolean().optional(),
});

function threadTitle(goal: string): string {
    const short = goal.replace(/\s+/g, " ").trim();
    return `[Agent] Mission — ${short.length > 70 ? `${short.slice(0, 69)}…` : short}`;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, Body);
    const playbook = requirePlaybook(MISSION_PLAYBOOK);
    const scope = await resolveScope(playbook, body);
    const budget = { ...MISSION_BUDGETS[body.budget], ...(body.dryRun ? { maxSafeWrites: 0 } : {}) };
    const now = new Date();

    // The AGENT thread the mission answers in (best effort: a missing column never blocks the run).
    let conversationId: string | null = null;
    try {
        const extra: Record<string, unknown> = {};
        if (conversationHasField("kind")) extra.kind = "AGENT";
        if (conversationHasField("folderId") && scope.folderId) extra.folderId = scope.folderId;
        const conversation = await prisma.assistantConversation.create({
            data: {
                title: threadTitle(body.goal),
                createdById: session.user.id,
                clientId: scope.clientId,
                missionId: scope.missionId,
                ...(extra as object),
            } as Prisma.AssistantConversationUncheckedCreateInput,
            select: { id: true },
        });
        conversationId = conversation.id;
    } catch (error) {
        console.warn("[agent.missions] thread not created", error instanceof Error ? error.message : error);
    }

    try {
        const { id } = await enqueueRun(
            {
                kind: playbook.kind,
                playbook: playbook.id,
                trigger: "MANUAL",
                folderId: scope.folderId,
                clientId: scope.clientId,
                missionId: scope.missionId,
                actorId: session.user.id,
                goal: body.goal,
                budget,
                priority: 10,
                // A few seconds so no worker claims it before the thread and checkpoint below are on the row.
                runAfter: new Date(now.getTime() + 3_000),
                // A mission is not retried blindly after a crash past its plan: resume once, then fail.
                maxAttempts: 2,
            },
            now,
        );
        if (!id) return errorResponse("Mission non créée, réessaie.", 409);
        await updateRun(id, {
            ...(conversationId ? { conversationId } : {}),
            checkpoint: { phase: "plan", proposals: 0, ...(body.dryRun ? { dryRun: true } : {}) } as Prisma.InputJsonValue,
        });
        return successResponse(await getRunCard(id), 201);
    } catch (error) {
        if (isAgentUnavailable(error)) return errorResponse("L'agent n'est pas encore installé sur cette instance (migration manquante).", 503);
        throw error;
    }
});
