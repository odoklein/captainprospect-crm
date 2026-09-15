// ============================================
// GET  /api/manager/vault — list stored credentials (never a password)
// POST /api/manager/vault — store a new credential
//
// MANAGER-only. These are shared secrets, not per-user settings: a commercial
// must never reach their own row, and an SDR has no business here at all.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import {
    requireRole,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import { createCredential, listCredentials, listVaultAudit } from "@/lib/vault/service";

const credentialTypeSchema = z.enum([
    "PORTAL",
    "EMAIL",
    "CALENDAR",
    "CRM_EXTERNAL",
    "LINKEDIN",
    "PHONE_TOOL",
    "OTHER",
]);

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId") || undefined;
    const typeParam = searchParams.get("type");
    const parsedType = typeParam ? credentialTypeSchema.safeParse(typeParam) : null;

    const credentials = await listCredentials({
        clientId,
        missionId: searchParams.get("missionId") || undefined,
        interlocuteurId: searchParams.get("interlocuteurId") || undefined,
        type: parsedType?.success ? parsedType.data : undefined,
        search: searchParams.get("search") || undefined,
    });

    // The activity feed is scoped to the same filter, so the panel can show
    // "what happened here" next to "what exists here" in one round-trip.
    const activity = searchParams.get("withActivity")
        ? await listVaultAudit({ clientId, limit: 30 })
        : [];

    return successResponse({ credentials, activity });
});

const CreateBody = z.object({
    clientId: z.string().min(1),
    missionId: z.string().optional().nullable(),
    interlocuteurId: z.string().optional().nullable(),
    type: credentialTypeSchema,
    label: z.string().max(200).optional(),
    login: z.string().min(1).max(320),
    password: z.string().max(500).optional(),
    url: z.string().max(500).optional(),
    notes: z.string().max(2000).optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, CreateBody);

    const credential = await createCredential(body, session.user.id);
    return successResponse(credential, 201);
});
