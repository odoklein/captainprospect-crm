import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getTwilioConfig } from "@/lib/telephony/config";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { createVoiceToken } from "@/lib/telephony/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/telephony/token — short-lived Twilio Voice token for the browser softphone. */
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const config = getTwilioConfig();
    if (!config) return errorResponse("Téléphone intégré non configuré", 503);

    const { token, identity, ttlSec } = createVoiceToken(config, session.user.id);
    return successResponse({ token, identity, expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString() });
});
