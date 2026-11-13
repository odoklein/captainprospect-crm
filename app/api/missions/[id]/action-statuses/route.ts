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
import { ActionValidationError, resolveActionResult } from "@/lib/actions/action-result";
import type { ActionScopeType, ActionPriorityLabel } from "@prisma/client";

type RouteParams = { params: Promise<{ id: string }> };

const statusDefSchema = z.object({
    code: z.string().min(1),
    label: z.string().min(1).optional().nullable(),
    color: z.string().optional().nullable(),
    sortOrder: z.number().int().min(0),
    requiresNote: z.boolean(),
    priorityLabel: z.enum(["CALLBACK", "FOLLOW_UP", "NEW", "RETRY", "SKIP"]),
    priorityOrder: z.number().int().optional().nullable(),
    triggersOpportunity: z.boolean(),
    triggersCallback: z.boolean(),
    resultCategoryCode: z.string().optional().nullable(),
});
const putBodySchema = z.object({ statuses: z.array(statusDefSchema) });

// GET /api/missions/[id]/action-statuses — list mission-scoped status defs; if none, return effective from GLOBAL
export const GET = withErrorHandler(async (request: NextRequest, { params }: RouteParams) => {
    await requireRole(["MANAGER", "BUSINESS_DEVELOPER"], request);
    const { id: missionId } = await params;

    const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { id: true } });
    if (!mission) throw new NotFoundError("Mission");

    const missionRows = await prisma.actionStatusDefinition.findMany({
        where: { scopeType: "MISSION", scopeId: missionId, isActive: true },
        orderBy: { sortOrder: "asc" },
    });

    if (missionRows.length > 0) {
        return successResponse({
            source: "MISSION",
            statuses: missionRows.map((r) => ({
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
    }

    const globalRows = await prisma.actionStatusDefinition.findMany({
        where: { scopeType: "GLOBAL", scopeId: "", isActive: true },
        orderBy: { sortOrder: "asc" },
    });
    return successResponse({
        source: "GLOBAL",
        statuses: globalRows.map((r) => ({
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

// PUT /api/missions/[id]/action-statuses — upsert mission-scoped status definitions (replace set for mission)
export const PUT = withErrorHandler(async (request: NextRequest, { params }: RouteParams) => {
    await requireRole(["MANAGER", "BUSINESS_DEVELOPER"], request);
    const { id: missionId } = await params;

    const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { id: true } });
    if (!mission) throw new NotFoundError("Mission");

    const body = await request.json();
    const parsed = putBodySchema.safeParse(body);
    if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join(", ") || "Données invalides";
        return errorResponse(msg, 400);
    }
    const { statuses } = parsed.data;

    // Mission statuses are configurable, but Action.result can only store enum
    // values. Canonicalize before persisting so the SDR never selects a code
    // that the API cannot save.
    for (const status of statuses) {
        try {
            status.code = resolveActionResult(status.code, { code: status.code, label: status.label });
        } catch (error) {
            if (error instanceof ActionValidationError) {
                return errorResponse(
                    `Code de statut invalide : "${status.code}". Choisissez un libellé de résultat reconnu.`,
                    400
                );
            }
            throw error;
        }
    }
    const seenCodes = new Set<string>();
    for (const status of statuses) {
        if (seenCodes.has(status.code)) {
            return errorResponse(
                `Deux statuts correspondent au même résultat : "${status.code}".`,
                400
            );
        }
        seenCodes.add(status.code);
    }

    await prisma.$transaction(async (tx) => {
        await tx.actionStatusDefinition.deleteMany({
            where: { scopeType: "MISSION", scopeId: missionId },
        });
        for (let i = 0; i < statuses.length; i++) {
            const s = statuses[i];
            await tx.actionStatusDefinition.create({
                data: {
                    scopeType: "MISSION" as ActionScopeType,
                    scopeId: missionId,
                    code: s.code,
                    label: s.label ?? undefined,
                    color: s.color ?? undefined,
                    sortOrder: s.sortOrder,
                    requiresNote: s.requiresNote,
                    priorityLabel: s.priorityLabel as ActionPriorityLabel,
                    priorityOrder: s.priorityOrder ?? undefined,
                    triggersOpportunity: s.triggersOpportunity,
                    triggersCallback: s.triggersCallback,
                    resultCategoryCode: s.resultCategoryCode ?? undefined,
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

// DELETE /api/missions/[id]/action-statuses — remove all mission overrides (mission falls back to GLOBAL)
export const DELETE = withErrorHandler(async (request: NextRequest, { params }: RouteParams) => {
    await requireRole(["MANAGER", "BUSINESS_DEVELOPER"], request);
    const { id: missionId } = await params;

    const mission = await prisma.mission.findUnique({ where: { id: missionId }, select: { id: true } });
    if (!mission) throw new NotFoundError("Mission");

    await prisma.actionStatusDefinition.deleteMany({
        where: { scopeType: "MISSION", scopeId: missionId },
    });
    return successResponse({ message: "Mission status overrides removed" });
});
