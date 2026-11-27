import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getKavkomConfig } from "@/lib/kavkom/config";
import { hangupKavkomCall } from "@/lib/kavkom/service";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { TelephonyError, presentCall } from "@/lib/telephony/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/telephony/calls/[id]/hangup — « Raccrocher » on a call placed through Kavkom
 * (the audio is in the SDR's Kavkom app, so the CRM ends it through Kavkom's API).
 * Twilio calls hang up in the browser and never come here.
 */
export const POST = withErrorHandler(
    async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
        const session = await requireRole([...TELEPHONY_ROLES], request);
        const config = getKavkomConfig();
        if (!config) return errorResponse("Kavkom n'est pas configuré", 503);
        const { id } = await params;
        try {
            const call = await hangupKavkomCall(config, id, session.user.id);
            return successResponse(presentCall(call));
        } catch (err) {
            if (err instanceof TelephonyError) return errorResponse(err.message, err.status);
            throw err;
        }
    },
);
