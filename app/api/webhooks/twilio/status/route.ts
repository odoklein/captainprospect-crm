import { NextRequest } from "next/server";
import { applyDialResult, applyLegStatus } from "@/lib/telephony/service";
import { emptyTwiml, twiml } from "@/lib/telephony/twilio";
import { gateTwilioWebhook } from "@/lib/telephony/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/twilio/status
 *   ?leg=child  <Number statusCallback>: ringing / answered / completed of the prospect's leg
 *   ?leg=dial   <Dial action>: final outcome; must answer TwiML (empty = hang up the browser leg)
 */
export async function POST(req: NextRequest) {
    const gate = await gateTwilioWebhook(req, "status");
    if (!gate.ok) return gate.response;
    const { params, callId } = gate.ctx;
    const leg = req.nextUrl.searchParams.get("leg");

    if (callId) {
        try {
            if (leg === "dial") await applyDialResult(callId, params);
            else await applyLegStatus(callId, params);
        } catch (error) {
            console.error(`[webhooks/twilio/status] leg=${leg} failed`, error);
            if (leg !== "dial") return new Response("handler failed", { status: 500 }); // Twilio retries
        }
    }
    return leg === "dial" ? twiml(emptyTwiml()) : new Response(null, { status: 204 });
}
