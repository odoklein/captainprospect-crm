// PATCH  /api/clients/[id]/onboarding-checklist/steps/[taskId] { title?, done?, dueDay?, assigneeId?, move? }
// DELETE /api/clients/[id]/onboarding-checklist/steps/[taskId] — a section goes with its steps.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { deleteStep, getChecklist, updateStep } from "@/lib/onboarding/checklist-service";
import { daySchema, runChecklist } from "@/lib/onboarding/route-helpers";

type Ctx = { params: Promise<{ id: string; taskId: string }> };

const schema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    done: z.boolean().optional(),
    dueDay: daySchema.nullable().optional(),
    assigneeId: z.string().nullable().optional(),
    move: z.enum(["up", "down"]).optional(),
});

export const PATCH = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    await requireRole(["MANAGER"], request);
    const { id, taskId } = await params;
    const body = await validateRequest(request, schema);
    const result = await runChecklist(async () => {
        await updateStep(id, taskId, body);
        return getChecklist(id);
    });
    return result instanceof NextResponse ? result : successResponse(result);
});

export const DELETE = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    await requireRole(["MANAGER"], request);
    const { id, taskId } = await params;
    const result = await runChecklist(async () => {
        await deleteStep(id, taskId);
        return getChecklist(id);
    });
    return result instanceof NextResponse ? result : successResponse(result);
});
