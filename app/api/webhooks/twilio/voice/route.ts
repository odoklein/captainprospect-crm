import { NextRequest } from "next/server";
import { acceptVoiceRequest } from "@/lib/telephony/service";
import { callbackBase, dialTwiml, rejectTwiml, twiml } from "@/lib/telephony/twilio";
import { gateTwilioWebhook } from "@/lib/telephony/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/twilio/voice — the TwiML App's Voice URL.
 * The browser placed a call with { callId }; dial the number stored on that row.
 */
export async function POST(req: NextRequest) {
    const gate = await gateTwilioWebhook(req, "voice");
    if (!gate.ok) return gate.response;
    const { config, params } = gate.ctx;

    try {
        const decision = await acceptVoiceRequest(params);
        if (!decision.ok) {
            console.warn(`[webhooks/twilio/voice] refused: ${decision.reason}`);
            return twiml(rejectTwiml(decision.message));
        }

        const base = callbackBase(req);
        const q = `callId=${encodeURIComponent(decision.call.id)}`;
        return twiml(
            dialTwiml({
                to: decision.call.toNumber,
                callerId: decision.call.fromNumber,
                record: config.record,
                urls: {
                    dialAction: `${base}/api/webhooks/twilio/status?leg=dial&${q}`,
                    legStatus: `${base}/api/webhooks/twilio/status?leg=child&${q}`,
                    recording: `${base}/api/webhooks/twilio/recording?${q}`,
                    notice: `${base}/api/webhooks/twilio/notice`,
                },
            }),
        );
    } catch (error) {
        console.error("[webhooks/twilio/voice] failed", error);
        return twiml(rejectTwiml("Une erreur technique empêche l'appel."));
    }
}
