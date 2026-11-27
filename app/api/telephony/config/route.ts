import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { callerIdFor, getTwilioConfig } from "@/lib/telephony/config";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { pauseView } from "@/lib/telephony/line-pause";
import { providerFor } from "@/lib/telephony/provider";
import { kavkomCallerIdFor } from "@/lib/kavkom/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/telephony/config — does this user dial from the CRM, and through which line?
 * `softphone: false` means every phone link keeps opening tel: (Allo).
 *   provider "twilio"  the browser is the phone (microphone, headset)
 *   provider "kavkom"  « Appeler » rings the user's Kavkom extension first: this tab when
 *                      `webphone` (SIP over WebRTC), else their Kavkom app; the call bar follows it
 * `twilio: true` alongside Kavkom: the parallel dialer stays available (it needs Twilio).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { twilioCallerId: true, twilioReceiveCalls: true, preferences: true, kavkomExtension: true, kavkomCallerId: true },
    });
    const provider = user ? providerFor(user) : null;
    if (!provider) {
        const reason = getTwilioConfig() ? ("no_assigned_number" as const) : ("not_configured" as const);
        return successResponse({ softphone: false, reason });
    }

    if (provider.kind === "kavkom") {
        const twilio = getTwilioConfig();
        const twilioCallerId = twilio ? callerIdFor(twilio, user?.twilioCallerId) : null;
        return successResponse({
            softphone: true,
            provider: "kavkom" as const,
            callerId: kavkomCallerIdFor({ kavkomCallerId: user?.kavkomCallerId ?? null }),
            extension: provider.extension,
            autoAnswer: provider.config.autoAnswer,
            // The CRM tab is the phone (SIP over WebRTC): mute, keypad, headset and inbound ringing here.
            webphone: Boolean(provider.config.webphone),
            // Kavkom records and transcribes on its side; the CDR tells us per call.
            recording: true,
            transcription: false,
            receiveCalls: user?.twilioReceiveCalls ?? true,
            pause: user ? pauseView(user.preferences) : null,
            twilio: Boolean(twilioCallerId),
            edge: twilio?.edge,
        });
    }

    const config = provider.config;
    return successResponse({
        softphone: true,
        provider: "twilio" as const,
        callerId: provider.callerId,
        edge: config.edge,
        recording: config.record,
        transcription: Boolean(config.transcription),
        receiveCalls: user?.twilioReceiveCalls ?? true,
        pause: user ? pauseView(user.preferences) : null,
        twilio: true,
    });
});
