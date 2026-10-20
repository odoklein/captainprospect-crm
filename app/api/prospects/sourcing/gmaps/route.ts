import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { getGmapsRun, gmapsEngine, providersStatus, searchSerperMaps, startGmapsRun } from "@/lib/sourcing/providers.server";
import { querySchema } from "@/lib/sourcing/schemas";
import type { SourcedLead } from "@/lib/sourcing/types";

// ============================================
// Google Maps has two engines:
// - Serper.dev (SERPER_API_KEY, preferred): synchronous, POST returns the
//   leads directly plus one warning per activity × location pair that failed.
// - Apify (APIFY_API_TOKEN): an actor run of 1-3 minutes; POST starts it for
//   every pair, GET polls it and returns the normalized leads once done.
// ============================================

// Up to ~100 départements × activities when the whole of France is picked.
export const maxDuration = 300;

const SERPER_CONCURRENCY = 8;

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const query = await validateRequest(request, querySchema);
    const status = providersStatus().gmaps;
    if (!status.configured) return errorResponse(status.reason ?? "Google Maps non configuré", 400);

    if (gmapsEngine() !== "serper") return successResponse(await startGmapsRun(query));

    const pairs = query.activities.flatMap((activity) => query.locations.map((location) => ({ activity, location })));
    const leads: SourcedLead[] = [];
    const warnings: string[] = [];
    let next = 0;
    const worker = async () => {
        while (next < pairs.length) {
            const { activity, location } = pairs[next++];
            try {
                const found = await searchSerperMaps({ activity, location, perSearch: query.perSearch });
                if (found.length === 0) warnings.push(`${activity.label} · ${location} : aucun résultat`);
                leads.push(...found);
            } catch (e) {
                warnings.push(`${activity.label} · ${location} : ${e instanceof Error ? e.message : "échec"}`);
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(SERPER_CONCURRENCY, pairs.length) }, worker));

    // Every pair failed (bad key, no credits): surface it as an error, not an empty run.
    if (leads.length === 0 && warnings.length === pairs.length && warnings.some((w) => w.includes("Serper "))) {
        return errorResponse(warnings[0].replace(/^.*? : /, ""), 502);
    }
    return successResponse({ leads, warnings, searches: pairs.length });
});

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const runId = request.nextUrl.searchParams.get("runId");
    if (!runId) return errorResponse("runId requis", 400);
    return successResponse(await getGmapsRun(runId));
});
