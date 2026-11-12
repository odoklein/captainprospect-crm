import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
} from "@/lib/api-utils";
import { z } from "zod";
import { ActionValidationError, resolveActionResult } from "@/lib/actions/action-result";

const PRIORITY_LABELS = ["CALLBACK", "FOLLOW_UP", "NEW", "RETRY", "SKIP"] as const;

const statusSchema = z.object({
    code: z.string().min(1).max(50),
    label: z.string().min(1).max(100).optional().nullable(),
    color: z.string().max(20).optional().nullable(),
    sortOrder: z.number().int().min(0).optional(),
    requiresNote: z.boolean().optional(),
    priorityLabel: z.enum(PRIORITY_LABELS).optional(),
    priorityOrder: z.number().int().optional().nullable(),
    triggersOpportunity: z.boolean().optional(),
    triggersCallback: z.boolean().optional(),
    resultCategoryCode: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
});

const putBodySchema = z.object({
    statuses: z.array(statusSchema),
});

const createBodySchema = z.object({
    code: z.string().min(1).max(50).transform((v) => v.toUpperCase().replace(/\s+/g, "_")),
    label: z.string().min(1).max(100),
    color: z.string().max(20).optional().nullable(),
    sortOrder: z.number().int().min(0).optional(),
    requiresNote: z.boolean().optional(),
    priorityLabel: z.enum(PRIORITY_LABELS).optional(),
    priorityOrder: z.number().int().optional().nullable(),
    triggersOpportunity: z.boolean().optional(),
    triggersCallback: z.boolean().optional(),
    resultCategoryCode: z.string().nullable().optional(),
});

function mapRow(r: any) {
    return {
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
        isActive: r.isActive,
    };
}

/**
 * GET /api/manager/action-statuses/global
 * List GLOBAL action status definitions (for status management UI).
 * ?includeInactive=true to also return deactivated statuses.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER", "BUSINESS_DEVELOPER"], request);

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const rows = await prisma.actionStatusDefinition.findMany({
        where: {
            scopeType: "GLOBAL",
            scopeId: "",
            ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: { sortOrder: "asc" },
    });

    return successResponse(rows.map(mapRow));
});

/**
 * POST /api/manager/action-statuses/global
 * Create a new GLOBAL action status definition.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);

    const body = await request.json();
    const parsed = createBodySchema.safeParse(body);
    if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join(", ") || "Données invalides";
        return errorResponse(msg, 400);
    }
    const data = parsed.data;

    // Status codes are free-form in the UI, but Action.result is an enum.
    // Store the canonical enum value so a newly created status can always be saved.
    let statusCode: string;
    try {
        statusCode = resolveActionResult(data.code, { code: data.code, label: data.label });
    } catch (error) {
        if (error instanceof ActionValidationError) {
            return errorResponse(
                `Code de statut invalide : "${data.code}". Choisissez un libellé de résultat reconnu.`,
                400
            );
        }
        throw error;
    }

    // Check for duplicate code
    const existing = await prisma.actionStatusDefinition.findFirst({
        where: { scopeType: "GLOBAL", scopeId: "", code: statusCode },
    });
    if (existing) {
        // Reactivate if deactivated
        if (!existing.isActive) {
            const reactivated = await prisma.actionStatusDefinition.update({
                where: { id: existing.id },
                data: {
                    isActive: true,
                    label: data.label,
                    color: data.color ?? existing.color,
                    sortOrder: data.sortOrder ?? existing.sortOrder,
                    requiresNote: data.requiresNote ?? existing.requiresNote,
                    priorityLabel: (data.priorityLabel as any) ?? existing.priorityLabel,
                    priorityOrder: data.priorityOrder ?? existing.priorityOrder,
                    triggersOpportunity: data.triggersOpportunity ?? existing.triggersOpportunity,
                    triggersCallback: data.triggersCallback ?? existing.triggersCallback,
                    resultCategoryCode: data.resultCategoryCode ?? existing.resultCategoryCode,
                },
            });
            return successResponse(mapRow(reactivated), 200);
        }
        return errorResponse(`Le code "${statusCode}" existe déjà`, 409);
    }

    // Determine next sortOrder if not provided
    const maxSort = await prisma.actionStatusDefinition.aggregate({
        where: { scopeType: "GLOBAL", scopeId: "" },
        _max: { sortOrder: true },
    });

    const row = await prisma.actionStatusDefinition.create({
        data: {
            scopeType: "GLOBAL",
            scopeId: "",
            code: statusCode,
            label: data.label,
            color: data.color ?? null,
            sortOrder: data.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
            requiresNote: data.requiresNote ?? false,
            priorityLabel: (data.priorityLabel as any) ?? "SKIP",
            priorityOrder: data.priorityOrder ?? null,
            triggersOpportunity: data.triggersOpportunity ?? false,
            triggersCallback: data.triggersCallback ?? false,
            resultCategoryCode: data.resultCategoryCode ?? null,
        },
    });

    return successResponse(mapRow(row), 201);
});

/**
 * PUT /api/manager/action-statuses/global
 * Bulk update GLOBAL action status definitions.
 */
export const PUT = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER", "BUSINESS_DEVELOPER"], request);

    const body = await request.json();
    const parsed = putBodySchema.safeParse(body);
    if (!parsed.success) {
        const msg = parsed.error.issues.map((i) => i.message).join(", ") || "Données invalides";
        return errorResponse(msg, 400);
    }
    const { statuses } = parsed.data;

    for (const s of statuses) {
        const updateData: Record<string, unknown> = {};
        if (s.resultCategoryCode !== undefined) updateData.resultCategoryCode = s.resultCategoryCode;
        if (s.label !== undefined) updateData.label = s.label;
        if (s.color !== undefined) updateData.color = s.color;
        if (s.sortOrder !== undefined) updateData.sortOrder = s.sortOrder;
        if (s.requiresNote !== undefined) updateData.requiresNote = s.requiresNote;
        if (s.priorityLabel !== undefined) updateData.priorityLabel = s.priorityLabel;
        if (s.priorityOrder !== undefined) updateData.priorityOrder = s.priorityOrder;
        if (s.triggersOpportunity !== undefined) updateData.triggersOpportunity = s.triggersOpportunity;
        if (s.triggersCallback !== undefined) updateData.triggersCallback = s.triggersCallback;
        if (s.isActive !== undefined) updateData.isActive = s.isActive;

        if (Object.keys(updateData).length > 0) {
            await prisma.actionStatusDefinition.updateMany({
                where: { scopeType: "GLOBAL", scopeId: "", code: s.code },
                data: updateData,
            });
        }
    }

    const updated = await prisma.actionStatusDefinition.findMany({
        where: { scopeType: "GLOBAL", scopeId: "" },
        orderBy: { sortOrder: "asc" },
    });

    return successResponse(updated.map(mapRow));
});
