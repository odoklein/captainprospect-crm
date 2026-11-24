// GET /api/client/market-counts?sectors=J,M&sizes=10-49&roles=finance,rh
// Live "X entreprises · Y décideurs" for the mission brief: aggregate counts per
// département from the agency's own base, for the brief's non-geographic
// criteria. The page sums the selected départements itself, so map clicks cost
// no request. CLIENT only (the middleware guards /api/client), rate-limited,
// counts only: never a name, an email or an id.

import { NextRequest, NextResponse } from "next/server";
import { LRUCache } from "lru-cache";
import { errorResponse, requireRole, withErrorHandler } from "@/lib/api-utils";
import { requireClientSpace } from "@/lib/onboarding/client-missions";
import { countsFor, marketCube, parseCriteria, SMALL_COUNT } from "@/lib/onboarding/market-counts";

const PER_MINUTE = 90;
const hits = new LRUCache<string, { n: number; since: number }>({ max: 5_000, ttl: 60_000 });

function overLimit(userId: string): boolean {
    const now = Date.now();
    const entry = hits.get(userId);
    if (!entry || now - entry.since > 60_000) {
        hits.set(userId, { n: 1, since: now });
        return false;
    }
    entry.n += 1;
    return entry.n > PER_MINUTE;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    await requireClientSpace(session.user.id);
    if (overLimit(session.user.id)) {
        return NextResponse.json({ success: false, error: "Trop de requêtes, réessayez dans un instant." }, { status: 429, headers: { "Retry-After": "30" } });
    }
    const criteria = parseCriteria(request.nextUrl.searchParams);
    let cube;
    try {
        cube = await marketCube();
    } catch (error) {
        console.error("[market-counts] cube build failed", error);
        return errorResponse("Le comptage est momentanément indisponible.", 503);
    }
    return NextResponse.json(
        { success: true, data: { ...countsFor(cube, criteria), small: SMALL_COUNT, updatedAt: new Date(cube.builtAt).toISOString() } },
        { headers: { "Cache-Control": "private, no-store" } },
    );
});
