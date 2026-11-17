// Route helpers for the onboarding link APIs.

import { NextRequest, NextResponse } from "next/server";
import { LRUCache } from "lru-cache";
import { OnboardingLinkError } from "./service";

/** OnboardingLinkError → its status; anything else goes to withErrorHandler. */
export async function runLink<T>(fn: () => Promise<T>): Promise<T | NextResponse> {
    try {
        return await fn();
    } catch (err) {
        if (err instanceof OnboardingLinkError) {
            return NextResponse.json({ success: false, error: err.message }, { status: err.status });
        }
        throw err;
    }
}

const hits = new LRUCache<string, { n: number; since: number }>({ max: 5_000, ttl: 60_000 });

/**
 * Per-minute budget for the public routes (keyed by route + token + IP). The
 * token already gates access; this only stops a runaway script.
 */
export function overBudget(request: NextRequest, scope: string, token: string, perMinute: number): NextResponse | null {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const key = `${scope}|${token}|${ip}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.since > 60_000) {
        hits.set(key, { n: 1, since: now });
        return null;
    }
    entry.n += 1;
    if (entry.n <= perMinute) return null;
    return NextResponse.json(
        { success: false, error: "Trop de requêtes, réessayez dans un instant." },
        { status: 429, headers: { "Retry-After": "30" } },
    );
}

export const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
