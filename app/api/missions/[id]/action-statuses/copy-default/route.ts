import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    NotFoundError,
} from "@/lib/api-utils";
import { z } from "zod";
import type { ActionScopeType, ActionPriorityLabel } from "@prisma/client";
import { MISSION_STATUS_PRESETS } from "@/lib/constants/actionStatusPresets";
import { DEFAULT_EXCLUSION_TARGETS } from "@/lib/services/StatusConfigService";

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({
    preset: z.enum(["short", "full"]).optional().default("full"),
});

// POST /api/missions/[id]/action-statuses/copy-default — create mission overrides from preset (short = 7, full = 8)
export const POST = withErrorHandler(async (request: NextRequest, { params }: RouteParams) => {
    await requireRole(["MANAGER", "BUSINESS_DEVELOPER"], request);
    const { id: missionId } = await params;

    const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { id: true } });
    if (!mission) throw new NotFoundError("Mission");

    let body: unknown = {};
    try {
        body = await request.json();
    } catch {
        // optional body
    }
    const parsed = bodySchema.safeParse(body);
    const preset = parsed.success ? parsed.data.preset : "full";
    const list = preset === "short" ? MISSION_STATUS_PRESETS.SHORT : MISSION_STATUS_PRESETS.FULL;

    const globalDefs = await prisma.actionStatusDefinition.findMany({
        where: { scopeType: "GLOBAL", scopeId: "", isActive: true },
        select: { code: true, resultCategoryCode: true },
    });
    const categoryByCode = new Map(globalDefs.map((d) => [d.code, d.resultCategoryCode]));

    await prisma.$transaction(async (tx) => {
        await tx.actionStatusDefinition.deleteMany({
            where: { scopeType: "MISSION", scopeId: missionId },
        });
        for (let i = 0; i < list.length; i++) {
            const s = list[i];
            await tx.actionStatusDefinition.create({
                data: {
                    scopeType: "MISSION" as ActionScopeType,
                    scopeId: missionId,
                    code: s.code,
                    label: s.label,
                    color: s.color ?? undefined,
                    sortOrder: s.sortOrder,
                    requiresNote: s.requiresNote,
                    priorityLabel: s.priorityLabel as ActionPriorityLabel,
                    priorityOrder: s.priorityOrder ?? undefined,
                    triggersOpportunity: s.triggersOpportunity,
                    triggersCallback: s.triggersCallback,
                    // A mission copied from a preset inherits the same notion of
                    // "final" as a fresh install, so a new mission is not quietly
                    // born without any exclusion-triggering status.
                    triggersExclusion: DEFAULT_EXCLUSION_TARGETS[s.code] !== undefined,
                    exclusionTarget: DEFAULT_EXCLUSION_TARGETS[s.code] ?? undefined,
                    resultCategoryCode: categoryByCode.get(s.code) ?? undefined,
                    isActive: true,
                },
            });
        }
    });

    const updated = await prisma.actionStatusDefinition.findMany({
        where: { scopeType: "MISSION", scopeId: missionId },
        orderBy: { sortOrder: "asc" },
    });
    return successResponse({
        source: "MISSION",
        preset,
        statuses: updated.map((r) => ({
            id: r.id,
            code: r.code,
            label: r.label,
            color: r.color,
            sortOrder: r.sortOrder,
            requiresNote: r.requiresNote,
            priorityLabel: r.priorityLabel,
            priorityOrder: r.priorityOrder,
            triggersOpportunity: r.triggersOpportunity,
            triggersCallback: r.triggersCallback,
            resultCategoryCode: r.resultCategoryCode,
        })),
    });
});
