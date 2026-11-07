import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { getGmapsRun, gmapsEngine, providersStatus, startGmapsRun } from "@/lib/sourcing/providers.server";
import { runMaps } from "@/lib/sourcing/deep.server";
import { querySchema } from "@/lib/sourcing/schemas";
import type { GmapsEvent } from "@/lib/sourcing/types";

// ============================================
// Google Maps has two engines:
// - Serper.dev (SERPER_API_KEY, preferred): POST streams NDJSON events
//   (plan, leads, progress, warning, done | error, see GmapsEvent) while the
//   deep engine works through its tiles; closing the request stops the run.
// - Apify (APIFY_API_TOKEN): an actor run of 1-3 minutes; POST starts it for
//   every pair, GET polls it and returns the normalized leads once done.
// ============================================

// A max-depth run on a région can take several minutes.
export const maxDuration = 800;

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const query = await validateRequest(request, querySchema);
    const status = providersStatus().gmaps;
    if (!status.configured) return errorResponse(status.reason ?? "Google Maps non configuré", 400);

    if (gmapsEngine() !== "serper") return successResponse(await startGmapsRun(query));

    const abort = new AbortController();
    request.signal.addEventListener("abort", () => abort.abort());
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const emit = (e: GmapsEvent) => {
                if (abort.signal.aborted) return;
                try {
                    controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
                } catch {
                    abort.abort();
                }
            };
            try {
                await runMaps(query, emit, abort.signal);
            } catch (e) {
                emit({ t: "error", message: e instanceof Error ? e.message : "Échec Google Maps" });
            } finally {
                try {
                    controller.close();
                } catch {
                    // Client already gone.
                }
            }
        },
        cancel() {
            abort.abort();
        },
    });
    return new NextResponse(stream, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
    });
});

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const runId = request.nextUrl.searchParams.get("runId");
    if (!runId) return errorResponse("runId requis", 400);
    return successResponse(await getGmapsRun(runId));
});
