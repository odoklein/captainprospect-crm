import { NextRequest } from "next/server";
import { applySmsStatus, receiveSms } from "@/lib/messaging/sms";
import { emptyTwiml, twiml } from "@/lib/telephony/twilio";
import { gateTwilioWebhook } from "@/lib/telephony/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/twilio/sms — signed by Twilio.
 *   (default)     a prospect texted one of our numbers (the number's SMS URL)
 *   ?step=status  delivery report of an SMS we sent
 */
export async function POST(req: NextRequest) {
    const gate = await gateTwilioWebhook(req, "sms");
    if (!gate.ok) return gate.response;
    const { params } = gate.ctx;
    try {
        if (req.nextUrl.searchParams.get("step") === "status") {
            await applySmsStatus(params);
            return new Response(null, { status: 204 });
        }
        await receiveSms(params);
        return twiml(emptyTwiml()); // no automatic reply
    } catch (error) {
        console.error("[webhooks/twilio/sms] failed", error);
        return new Response("handler failed", { status: 500 }); // Twilio retries
    }
}
