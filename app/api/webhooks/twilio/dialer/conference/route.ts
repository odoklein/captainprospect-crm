import { NextRequest } from "next/server";
import { onConferenceJoin, onConferenceLeave } from "@/lib/dialer/orchestrator";
import { handleDialerWebhook } from "@/lib/dialer/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/twilio/dialer/conference?sessionId= — participant join / leave of a
 * session's conference. A prospect joining is the ONLY signal that counts a conversation.
 */
export async function POST(req: NextRequest) {
    return handleDialerWebhook(
        req,
        "conference",
        (p) => (p.ConferenceSid && p.CallSid ? `tw:${p.ConferenceSid}:${p.CallSid}:${p.StatusCallbackEvent}:${p.SequenceNumber ?? ""}` : null),
        async (deps, params, query) => {
            const sessionId = query.get("sessionId");
            if (!sessionId || !params.CallSid) return;
            if (params.StatusCallbackEvent === "participant-join") await onConferenceJoin(deps, sessionId, params.CallSid);
            else if (params.StatusCallbackEvent === "participant-leave") await onConferenceLeave(deps, sessionId, params.CallSid);
        },
    );
}
