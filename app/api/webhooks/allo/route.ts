import { NextRequest, NextResponse } from "next/server";
import { parseAlloEvent, verifyAlloSignature } from "@/lib/incoming-calls/allo-webhook";
import { handleAlloCallEvent } from "@/lib/incoming-calls/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/allo
 *
 * Allo → CRM event stream (subscribe with scripts/register-allo-webhook.ts).
 * call.received fires while the SDR's phone is still ringing — that's what pops
 * the incoming-call panel. Excluded from the auth middleware (middleware.ts);
 * the Standard Webhooks signature below is the only gate, so an unset
 * ALLO_WEBHOOK_SECRET refuses everything rather than trusting anyone.
 */
export async function POST(req: NextRequest) {
    const secret = process.env.ALLO_WEBHOOK_SECRET;
    if (!secret) {
        console.error("[webhooks/allo] ALLO_WEBHOOK_SECRET not set — refusing delivery");
        return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
    }

    // Signature covers the exact bytes — read raw, parse after.
    const rawBody = await req.text();
    const check = verifyAlloSignature({
        secret,
        rawBody,
        headers: {
            id: req.headers.get("webhook-id"),
            timestamp: req.headers.get("webhook-timestamp"),
            signature: req.headers.get("webhook-signature"),
        },
    });
    if (!check.ok) {
        console.warn(`[webhooks/allo] rejected delivery: ${check.reason}`);
        return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    let body: unknown;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    const event = parseAlloEvent(body);
    try {
        const result = await handleAlloCallEvent(event);
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        // 5xx makes Allo retry; late call.received retries are dropped as stale by the service.
        console.error("[webhooks/allo] handling failed", error);
        return NextResponse.json({ error: "handler failed" }, { status: 500 });
    }
}
