import { NextRequest, after } from "next/server";
import { applyRecording } from "@/lib/telephony/service";
import { applyVoicemail } from "@/lib/telephony/inbound";
import { summarizeCall } from "@/lib/telephony/summary";
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
        if (req.nextUrl.searchParams.get("kind") === "voicemail") {
            // A message left after the browser did not answer: stored, transcribed, notified.
            after(() => applyVoicemail(config, callId, params).catch((e) => console.error("[webhooks/twilio/recording] voicemail", e)));
            return new Response(null, { status: 204 });
        }
        const call = await applyRecording(config, callId, params);
        // The recording is the transcript of last resort: (re)start the summary now it exists.
        if (call?.recordingUrl) after(() => summarizeCall(callId).catch((e) => console.error("[webhooks/twilio/recording] summary", e)));
        return new Response(null, { status: 204 });
    } catch (error) {
        console.error("[webhooks/twilio/recording] failed", error);
        return new Response("handler failed", { status: 500 });
    }
}
