import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { getTwilioConfig } from "@/lib/telephony/config";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { TelephonyError, createOutboundCall, presentCall } from "@/lib/telephony/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
    to: z.string().trim().min(3).max(40),
    contactId: z.string().min(1).optional().nullable(),
    companyId: z.string().min(1).optional().nullable(),
    campaignId: z.string().min(1).optional().nullable(),
});

// A human dials a few numbers a minute; anything faster is a script.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const g = globalThis as typeof globalThis & { __telephonyDials?: Map<string, number[]> };
const recent: Map<string, number[]> = (g.__telephonyDials ??= new Map());

function allowDial(userId: string): boolean {
    const now = Date.now();
    const hits = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
    if (hits.length >= MAX_PER_WINDOW) {
        recent.set(userId, hits);
        return false;
    }
    hits.push(now);
    recent.set(userId, hits);
    return true;
}

/**
 * POST /api/telephony/calls — registers the call the browser is about to place.
 * The returned id is the only thing the browser sends to Twilio: the TwiML
 * webhook dials the number validated and stored here.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const config = getTwilioConfig();
    if (!config) return errorResponse("Téléphone intégré non configuré", 503);

    const data = await validateRequest(request, schema);
    if (!allowDial(session.user.id)) return errorResponse("Trop d'appels lancés en une minute", 429);

    try {
        const call = await createOutboundCall(config, {
            userId: session.user.id,
            to: data.to,
            contactId: data.contactId,
            companyId: data.companyId,
            campaignId: data.campaignId,
        });
        return successResponse(presentCall(call), 201);
    } catch (err) {
        if (err instanceof TelephonyError) return errorResponse(err.message, err.status);
        throw err;
    }
});
