import { NextRequest } from "next/server";
import { applyRecording } from "@/lib/telephony/service";
import { gateTwilioWebhook } from "@/lib/telephony/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/webhooks/twilio/recording — recordingStatusCallback of <Dial record>. */
export async function POST(req: NextRequest) {
    const gate = await gateTwilioWebhook(req, "recording");
    if (!gate.ok) return gate.response;
    const { config, params, callId } = gate.ctx;
    if (!callId) return new Response(null, { status: 204 });
    try {
        await applyRecording(config, callId, params);
        return new Response(null, { status: 204 });
    } catch (error) {
        console.error("[webhooks/twilio/recording] failed", error);
        return new Response("handler failed", { status: 500 });
    }
}
