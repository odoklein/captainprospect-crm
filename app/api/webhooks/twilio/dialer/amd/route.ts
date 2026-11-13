import { NextRequest } from "next/server";
import { onAmd } from "@/lib/dialer/orchestrator";
import { handleDialerWebhook } from "@/lib/dialer/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/webhooks/twilio/dialer/amd?attemptId= — asynchronous machine-detection verdict (AnsweredBy). */
export async function POST(req: NextRequest) {
    return handleDialerWebhook(
        req,
        "amd",
        (p) => (p.CallSid ? `tw:${p.CallSid}:amd` : null),
        async (deps, params, query) => {
            const attemptId = query.get("attemptId");
            if (attemptId) await onAmd(deps, attemptId, params.AnsweredBy || "unknown");
        },
    );
}
