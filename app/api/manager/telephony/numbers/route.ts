import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { getTwilioConfig } from "@/lib/telephony/config";
import { NumberAssignmentError, assignNumber, configureInbound, listAccountNumbers, listPhoneUsers } from "@/lib/telephony/numbers";

export const dynamic = "force-dynamic";

/**
 * GET /api/manager/telephony/numbers[?fresh=1]
 * The Twilio account's numbers and who uses each, plus every user who may call.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const config = getTwilioConfig();
    const users = await listPhoneUsers();
    if (!config) return successResponse({ configured: false, numbers: [], users, error: null });

    try {
        const fresh = new URL(request.url).searchParams.get("fresh") === "1";
        const numbers = await listAccountNumbers(config, { fresh });
        return successResponse({ configured: true, numbers, users, error: null });
    } catch (err) {
        console.error("[manager/telephony/numbers] Twilio list failed", err);
        // The assignments still show; the list of numbers says why it is missing.
        return successResponse({
            configured: true,
            numbers: [],
            users,
            error: "Twilio n'a pas renvoyé la liste des numéros (clés API ou réseau). Réessayez, ou vérifiez Paramètres → Intégrations.",
        });
    }
});

const putSchema = z.object({
    userId: z.string().min(1).max(64),
    number: z.string().max(32).nullable(),
});

/** PUT /api/manager/telephony/numbers — { userId, number | null }: give a number to a user (or remove it). */
export const PUT = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const config = getTwilioConfig();
    if (!config) return errorResponse("Twilio n'est pas configuré (Paramètres → Intégrations)", 409);
    const { userId, number } = await validateRequest(request, putSchema);

    try {
        const { previousHolder, inbound } = await assignNumber(config, userId, number);
        const users = await listPhoneUsers();
        const user = users.find((u) => u.id === userId);
        audit(request, session, {
            action: AUDIT_ACTIONS.UPDATE,
            entityType: "User",
            entityId: userId,
            summary: number
                ? `Numéro Twilio ${number} attribué à ${user?.name ?? userId}${previousHolder ? ` (retiré à ${previousHolder.name})` : ""}`
                : `Numéro Twilio retiré à ${user?.name ?? userId}`,
            after: { twilioCallerId: number },
        });
        return successResponse({ users, previousHolder, inbound });
    } catch (err) {
        if (err instanceof NumberAssignmentError) return errorResponse(err.message, err.status);
        throw err;
    }
});

/** POST /api/manager/telephony/numbers — { sid }: point a bought number's calls at the CRM again. */
export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const config = getTwilioConfig();
    if (!config) return errorResponse("Twilio n'est pas configuré (Paramètres → Intégrations)", 409);
    const { sid } = await validateRequest(request, z.object({ sid: z.string().regex(/^PN[0-9a-f]{32}$/i) }));
    const sms = (await listAccountNumbers(config).catch(() => [])).find((n) => n.sid === sid)?.sms ?? false;
    const result = await configureInbound(config, sid, { sms });
    if (!result.ok) return errorResponse(result.reason, 502);
    return successResponse({ configured: true });
});
