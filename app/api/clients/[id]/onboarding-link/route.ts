// ============================================
// /api/clients/[id]/onboarding-link — the client-facing onboarding link (managers)
// GET    → link, client progress and answers
// POST   { targetLaunchDate?, welcomeMessage? } → create, or replace (old URL dies)
// PATCH  { targetLaunchDate?, welcomeMessage? } | { reopen: true }
// DELETE → revoke the link
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { runLink } from "@/lib/client-onboarding/http";
import { createLink, getLinkInfo, reopenQuestionnaire, revokeLink, updateLink } from "@/lib/client-onboarding/service";

type Ctx = { params: Promise<{ id: string }> };

const settingsSchema = z.object({
    targetLaunchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    welcomeMessage: z.string().trim().max(1000).optional(),
});

async function respond<T>(fn: () => Promise<T>, status = 200) {
    const result = await runLink(fn);
    return result instanceof NextResponse ? result : successResponse(result, status);
}

export const GET = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;
    return respond(() => getLinkInfo(id));
});

export const POST = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, settingsSchema);
    return respond(() => createLink(id, session.user.id, body), 201);
});

const patchSchema = z.union([z.object({ reopen: z.literal(true) }), settingsSchema]);

export const PATCH = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, patchSchema);
    return respond(() => ("reopen" in body ? reopenQuestionnaire(id) : updateLink(id, body)));
});

export const DELETE = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;
    return respond(() => revokeLink(id));
});
