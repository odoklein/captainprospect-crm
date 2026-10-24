// ============================================
// /api/clients/[id]/onboarding-checklist
// GET   → the client's checklist (auto steps reconciled on read)
// POST  { startDay, assigneeId? } → start it from the template (409 if started)
// PATCH { startDay } → move J0, open steps keep their offset
//       { activate: true } → « Passer le client en Actif »
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { activateClientOnboarding, getChecklist, shiftStart, startChecklist } from "@/lib/onboarding/checklist-service";
import { daySchema, runChecklist } from "@/lib/onboarding/route-helpers";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;
    return successResponse(await getChecklist(id));
});

const startSchema = z.object({ startDay: daySchema, assigneeId: z.string().optional().nullable() });

export const POST = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, startSchema);
    const result = await runChecklist(() => startChecklist(id, session.user.id, body));
    return result instanceof NextResponse ? result : successResponse(result, 201);
});

const patchSchema = z.union([z.object({ startDay: daySchema }), z.object({ activate: z.literal(true) })]);

export const PATCH = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, patchSchema);
    const result = await runChecklist(async () => {
        if ("activate" in body) await activateClientOnboarding(id);
        else await shiftStart(id, body.startDay);
        return getChecklist(id);
    });
    return result instanceof NextResponse ? result : successResponse(result);
});
