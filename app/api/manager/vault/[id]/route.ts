// ============================================
// PUT    /api/manager/vault/[id] — edit a stored credential
// POST   /api/manager/vault/[id] — { action: "reveal" | "rotate" | "send" }
// DELETE /api/manager/vault/[id] — drop it from the vault
//
// The three POST actions sit together because they share one property: each
// one touches the secret itself and therefore writes an audit row. Editing a
// label does not, which is why PUT is separate.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import {
    requireRole,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import {
    deleteCredential,
    revealCredential,
    rotateCredential,
    updateCredential,
} from "@/lib/vault/service";
import { sendCredentialsEmail } from "@/lib/vault/credentialsEmail";

const credentialTypeSchema = z.enum([
    "PORTAL",
    "EMAIL",
    "CALENDAR",
    "CRM_EXTERNAL",
    "LINKEDIN",
    "PHONE_TOOL",
    "OTHER",
]);

const UpdateBody = z.object({
    missionId: z.string().nullable().optional(),
    interlocuteurId: z.string().nullable().optional(),
    type: credentialTypeSchema.optional(),
    label: z.string().max(200).optional(),
    login: z.string().min(1).max(320).optional(),
    /** Omitted = unchanged. Empty string = clear the stored password. */
    password: z.string().max(500).optional(),
    url: z.string().max(500).optional(),
    notes: z.string().max(2000).optional(),
});

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, UpdateBody);

    const credential = await updateCredential(id, body, session.user.id);
    return successResponse(credential);
});

const ActionBody = z.discriminatedUnion("action", [
    z.object({ action: z.literal("reveal") }),
    z.object({ action: z.literal("rotate") }),
    z.object({
        action: z.literal("send"),
        to: z.string().email().optional(),
        note: z.string().max(500).optional(),
    }),
]);

export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, ActionBody);

    switch (body.action) {
        case "reveal": {
            const result = await revealCredential(id, session.user.id);
            return successResponse(result);
        }
        case "rotate": {
            const result = await rotateCredential(id, session.user.id);
            return successResponse({
                password: result.password,
                portalSynced: result.portalSynced,
                credential: result.credential,
            });
        }
        case "send": {
            const result = await sendCredentialsEmail({
                credentialId: id,
                actorId: session.user.id,
                to: body.to ?? null,
                note: body.note ?? null,
            });
            return successResponse(result);
        }
    }
});

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;

    const result = await deleteCredential(id, session.user.id);
    return successResponse(result);
});
