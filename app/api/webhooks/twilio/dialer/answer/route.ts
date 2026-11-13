import { NextRequest, after } from "next/server";
import { onStatus } from "@/lib/dialer/orchestrator";
import { holdTwiml } from "@/lib/dialer/twiml";
import { handleDialerWebhook, twimlResponse } from "@/lib/dialer/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/twilio/dialer/answer?attemptId= — the prospect leg's Url: Twilio
 * asks for TwiML the moment someone (or something) picks up. The prospect waits in
 * silence while machine detection runs; the bridge is a REST redirect of this call.
 * The hold ends by itself, so a lost decision can never leave the line open.
 * Routing runs after the response, so the REST redirect never races this TwiML.
 */
export async function POST(req: NextRequest) {
    return handleDialerWebhook(
        req,
        "answer",
        (p) => (p.CallSid ? `tw:${p.CallSid}:answer` : null),
        async (deps, _params, query) => {
            const attemptId = query.get("attemptId");
            if (attemptId) after(() => onStatus(deps, attemptId, "in-progress").catch((e) => console.error("[dialer/answer] route", e)));
            return twimlResponse(holdTwiml(deps.policy.amdTimeoutSec + 10));
        },
    );
}
