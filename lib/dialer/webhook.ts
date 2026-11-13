// Shared handling of /api/webhooks/twilio/dialer/*: signature, dedupe, dead letters.
import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { gateTwilioWebhook } from "@/lib/telephony/webhook";
import type { TwilioParams } from "@/lib/telephony/twilio";
import { buildDialerDeps } from "./runtime";
import type { DialerDeps } from "./orchestrator";
import { markEvent, recordEvent } from "./store";

/** After this many failed tries an event is parked (visible in the manager's dead-letter count). */
export const MAX_EVENT_TRIES = 5;

export type DialerWebhookResult = { ok: true; response?: Response } | { ok: false; response: Response };

/**
 * Verifies the signature, records the event once, then runs `handle`.
 * A duplicate delivery of an event already processed is acknowledged without work;
 * one whose earlier processing failed is processed again (handlers are idempotent).
 */
export async function handleDialerWebhook(
    req: NextRequest,
    route: string,
    dedupeKey: (params: TwilioParams, query: URLSearchParams) => string | null,
    handle: (deps: DialerDeps, params: TwilioParams, query: URLSearchParams) => Promise<Response | void>,
): Promise<Response> {
    const gate = await gateTwilioWebhook(req, `dialer/${route}`);
    if (!gate.ok) return gate.response;
    const { params } = gate.ctx;
    const query = req.nextUrl.searchParams;
    const built = await buildDialerDeps();
    if (!built.ok) {
        // Switched off mid-session (rollback): acknowledge so Twilio stops; the sweeper of a
        // re-enabled instance, or the provider's own ring timeout, closes what is left.
        console.warn(`[webhooks/twilio/dialer/${route}] dialer unavailable: ${built.reason}`);
        return new Response(null, { status: 204 });
    }

    const key = dedupeKey(params, query);
    let eventId: string | null = null;
    if (key) {
        eventId = await recordEvent(prisma, {
            dedupeKey: key,
            source: "twilio",
            type: route,
            sessionId: query.get("sessionId"),
            attemptId: query.get("attemptId"),
            payload: params,
        });
        if (!eventId) {
            const prior = await prisma.$queryRaw<{ id: string; processedAt: Date | null; tries: number }[]>(
                Prisma.sql`SELECT "id", "processedAt", "tries" FROM "DialerEvent" WHERE "dedupeKey" = ${key}`,
            );
            const p = prior[0];
            if (!p || p.processedAt || p.tries >= MAX_EVENT_TRIES) return new Response(null, { status: 204 }); // duplicate
            eventId = p.id;
        }
    }

    try {
        const res = await handle(built.deps, params, query);
        if (eventId) await markEvent(prisma, eventId, null);
        return res ?? new Response(null, { status: 204 });
    } catch (err) {
        console.error(`[webhooks/twilio/dialer/${route}] failed`, err);
        if (eventId) await markEvent(prisma, eventId, err instanceof Error ? err.message : String(err)).catch(() => undefined);
        return new Response("handler failed", { status: 500 });
    }
}

export function twimlResponse(xml: string): Response {
    return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
