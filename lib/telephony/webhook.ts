// Shared gate for /api/webhooks/twilio/*: config present, signature valid.
import type { NextRequest } from "next/server";
import { getTwilioConfig, type TwilioConfig } from "./config";
import { readSignedTwilioRequest, type TwilioParams } from "./twilio";

export type TwilioWebhookContext = { config: TwilioConfig; params: TwilioParams; callId: string | null };

export async function gateTwilioWebhook(
    req: NextRequest,
    route: string,
): Promise<{ ok: true; ctx: TwilioWebhookContext } | { ok: false; response: Response }> {
    const config = getTwilioConfig();
    if (!config) {
        console.error(`[webhooks/twilio/${route}] Twilio not configured — refusing delivery`);
        return { ok: false, response: new Response("not configured", { status: 503 }) };
    }
    const signed = await readSignedTwilioRequest(req, config);
    if (!signed.ok) {
        console.warn(`[webhooks/twilio/${route}] rejected delivery: ${signed.reason}`);
        return { ok: false, response: new Response("invalid signature", { status: 403 }) };
    }
    const callId = req.nextUrl.searchParams.get("callId") ?? signed.params.callId ?? null;
    return { ok: true, ctx: { config, params: signed.params, callId } };
}
