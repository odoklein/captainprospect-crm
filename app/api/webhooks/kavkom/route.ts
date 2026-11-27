import { NextRequest, NextResponse, after } from "next/server";
import { integrationKey } from "@/lib/integrations/keys";
import { checkKavkomSecret, parseKavkomEvent, receivedSecret } from "@/lib/kavkom/webhook";
import { applyKavkomEvent } from "@/lib/kavkom/service";
import { summarizeCall } from "@/lib/telephony/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kavkom's own transcript usually follows the CDR: give it this long before we transcribe ourselves. */
const SUMMARY_DELAY_MS = 75_000;

async function readBody(req: NextRequest): Promise<unknown> {
    const type = req.headers.get("content-type")?.toLowerCase() ?? "";
    const text = await req.text();
    if (!text.trim()) return null;
    if (type.includes("application/x-www-form-urlencoded")) {
        return Object.fromEntries(new URLSearchParams(text));
    }
    try {
        return JSON.parse(text);
    } catch {
        // Some deliveries are form bodies without the header.
        return text.includes("=") ? Object.fromEntries(new URLSearchParams(text)) : text;
    }
}

/**
 * POST /api/webhooks/kavkom
 *
 * Kavkom → CRM, one URL for every event (Réglages avancés → Intégrations → Webhook):
 * live inbound and outbound calls, CDR (end of call, recording), transcription.
 * Excluded from the auth middleware (/api/webhooks/*): the secret header is the only
 * gate (Authorization: Bearer <KAVKOM_WEBHOOK_SECRET>), and no secret refuses everything.
 *
 * Kavkom's « Tester » sends an empty request and its retry policy is undocumented:
 * anything we cannot use is acknowledged with 200; only a store failure answers 500.
 */
export async function POST(req: NextRequest) {
    const check = checkKavkomSecret(integrationKey("KAVKOM_WEBHOOK_SECRET"), receivedSecret((n) => req.headers.get(n)));
    if (!check.ok) {
        console.warn(`[webhooks/kavkom] rejected delivery: ${check.reason}`);
        return NextResponse.json({ error: check.status === 503 ? "webhook not configured" : "invalid secret" }, { status: check.status });
    }

    let body: unknown;
    try {
        body = await readBody(req);
    } catch {
        return NextResponse.json({ ok: true, ignored: "unreadable body" });
    }
    if (body === null) return NextResponse.json({ ok: true, ignored: "empty (test)" });

    const event = parseKavkomEvent(body);
    if (!event) return NextResponse.json({ ok: true, ignored: "not a call event" });

    try {
        const result = await applyKavkomEvent(event);
        if (result.callId && result.summarize) {
            const callId = result.callId;
            const delay = event.kind === "transcription" ? 0 : SUMMARY_DELAY_MS;
            after(async () => {
                if (delay) await new Promise((r) => setTimeout(r, delay));
                await summarizeCall(callId).catch((e) => console.error("[webhooks/kavkom] summary", e));
            });
        }
        return NextResponse.json({ ok: true, kind: result.kind, matched: Boolean(result.callId) });
    } catch (error) {
        console.error(`[webhooks/kavkom] storing the ${event.kind} event failed`, error);
        return NextResponse.json({ error: "handler failed" }, { status: 500 });
    }
}
