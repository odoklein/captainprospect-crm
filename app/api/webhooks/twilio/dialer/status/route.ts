import { NextRequest } from "next/server";
import { onStatus } from "@/lib/dialer/orchestrator";
import { parseProviderStatus } from "@/lib/dialer/attempt-state";
import { handleDialerWebhook } from "@/lib/dialer/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/webhooks/twilio/dialer/status?attemptId= — status callbacks of a prospect leg. */
export async function POST(req: NextRequest) {
    return handleDialerWebhook(
        req,
        "status",
        (p) => (p.CallSid ? `tw:${p.CallSid}:status:${p.SequenceNumber ?? p.CallStatus ?? ""}` : null),
        async (deps, params, query) => {
            const attemptId = query.get("attemptId");
            const status = parseProviderStatus(params.CallStatus);
            if (attemptId && status) await onStatus(deps, attemptId, status, params.ErrorCode ?? params.SipResponseCode ?? null);
        },
    );
}
