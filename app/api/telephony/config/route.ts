import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { callerIdFor, getTwilioConfig } from "@/lib/telephony/config";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";

export const dynamic = "force-dynamic";

/**
 * GET /api/telephony/config — does this user dial from the browser?
 * `softphone: false` means every phone link keeps opening tel: (Allo).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const config = getTwilioConfig();
    if (!config) return successResponse({ softphone: false, reason: "not_configured" as const });

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { twilioCallerId: true } });
    const callerId = callerIdFor(config, user?.twilioCallerId);
    if (!callerId) return successResponse({ softphone: false, reason: "no_caller_id" as const });

    return successResponse({
        softphone: true,
        provider: "twilio" as const,
        callerId,
        edge: config.edge,
        recording: config.record,
    });
});
