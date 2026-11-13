import { NextRequest } from "next/server";
import { recordingNoticeTwiml, twiml } from "@/lib/telephony/twilio";
import { gateTwilioWebhook } from "@/lib/telephony/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/webhooks/twilio/notice — <Number url>: recording notice the prospect hears on pickup. */
export async function POST(req: NextRequest) {
    const gate = await gateTwilioWebhook(req, "notice");
    if (!gate.ok) return gate.response;
    return twiml(recordingNoticeTwiml());
}
