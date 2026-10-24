// POST /api/clients/[id]/onboarding-checklist/steps { parentId|null, title, dueDay? } — add a step (or a section when parentId is null).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { addStep, getChecklist } from "@/lib/onboarding/checklist-service";
import { daySchema, runChecklist } from "@/lib/onboarding/route-helpers";

const schema = z.object({
    parentId: z.string().nullable(),
    title: z.string().trim().min(1).max(200),
    dueDay: daySchema.optional().nullable(),
});

export const POST = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, schema);
    const result = await runChecklist(async () => {
        await addStep(id, session.user.id, body);
        return getChecklist(id);
    });
    return result instanceof NextResponse ? result : successResponse(result, 201);
});
