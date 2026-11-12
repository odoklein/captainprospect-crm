// ============================================
// INSTANCE API GUARD — rate limit + HMAC check shared by /api/instance/*.
//
//   const g = await guardInstanceRequest(request, "brand");
//   if (!g.ok) return g.response;
//   g.rawBody  // the verified bytes; parse them yourself
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/geo-ip";
import {
    INSTANCE_SIGNATURE_HEADER,
    INSTANCE_TIMESTAMP_HEADER,
    getInstanceSecret,
    verifyInstanceSignature,
} from "./auth";
import { checkInstanceRateLimit } from "./rate-limit";

const NO_STORE = { "Cache-Control": "no-store" };

export function instanceJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function instanceError(status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
    return instanceJson({ ok: false, error, ...extra }, status, headers);
}

export type InstanceGuardResult =
    | { ok: true; rawBody: Uint8Array }
    | { ok: false; response: NextResponse };

export async function guardInstanceRequest(request: NextRequest, route: string): Promise<InstanceGuardResult> {
    const limit = checkInstanceRateLimit(getClientIp(request), route);
    if (!limit.allowed) {
        return {
            ok: false,
            response: instanceError(429, "rate_limited", {}, { "Retry-After": String(limit.retryAfterSeconds) }),
        };
    }

    const secret = getInstanceSecret();
    if (!secret) return { ok: false, response: instanceError(503, "instance_api_not_configured") };

    const rawBody = new Uint8Array(await request.arrayBuffer());
    const url = new URL(request.url);
    const result = verifyInstanceSignature({
        secret,
        method: request.method,
        pathWithQuery: `${url.pathname}${url.search}`,
        body: rawBody,
        timestampHeader: request.headers.get(INSTANCE_TIMESTAMP_HEADER),
        signatureHeader: request.headers.get(INSTANCE_SIGNATURE_HEADER),
    });
    if (!result.ok) {
        console.warn(`[instance-api] rejected ${request.method} ${url.pathname}: ${result.reason}`);
        return { ok: false, response: instanceError(401, "invalid_signature", { reason: result.reason }) };
    }
    return { ok: true, rawBody };
}

/** JSON body of a verified request, or null when empty / not JSON. */
export function parseJsonBody(raw: Uint8Array): { ok: true; value: unknown } | { ok: false } {
    if (raw.length === 0) return { ok: true, value: {} };
    try {
        return { ok: true, value: JSON.parse(new TextDecoder().decode(raw)) };
    } catch {
        return { ok: false };
    }
}
