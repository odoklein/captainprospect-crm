import { NextRequest, NextResponse } from "next/server";
import { integrationKey } from "@/lib/integrations/keys";
import { checkOnoffKey, parseOnoffEvent } from "@/lib/onoff/webhook";
import { ingestOnoffEvent } from "@/lib/onoff/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/onoff
 *
 * Onoff Business → CRM: one call log per event (webhook « Appels », configured in
 * Onoff's B2B console with this URL and the agency's ONOFF_WEBHOOK_KEY as « Api key »).
 * Excluded from the auth middleware (middleware.ts matcher skips /api/webhooks/*):
 * the X-API-KEY header is the only gate, and no key configured refuses everything.
 *
 * Onoff retries 4 times on 4xx/5xx and validates the URL with dummy data when the
 * webhook is created, so anything we simply cannot use is acknowledged with 200.
 */
export async function POST(req: NextRequest) {
    const check = checkOnoffKey(integrationKey("ONOFF_WEBHOOK_KEY"), req.headers.get("x-api-key"));
    if (!check.ok) {
        console.warn(`[webhooks/onoff] rejected delivery: ${check.reason}`);
        return NextResponse.json({ error: check.status === 503 ? "webhook not configured" : "invalid api key" }, { status: check.status });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: true, ignored: "invalid json" });
    }

    const event = parseOnoffEvent(body);
    if (!event) return NextResponse.json({ ok: true, ignored: "not a call log" });

    try {
        const result = await ingestOnoffEvent(event);
        return NextResponse.json({ ok: true, matchedUser: Boolean(result.sdrId) });
    } catch (error) {
        // 5xx makes Onoff retry (4 times); the upsert on its event id makes retries harmless.
        console.error("[webhooks/onoff] storing the call failed", error);
        return NextResponse.json({ error: "handler failed" }, { status: 500 });
    }
}
