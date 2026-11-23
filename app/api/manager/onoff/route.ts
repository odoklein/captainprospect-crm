import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { integrationKey } from "@/lib/integrations/keys";
import { isOnoffApiConfigured, latestOnoffImportRuns, previewOnoffMembers, startOnoffImport } from "@/lib/onoff/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paramètres → Intégrations → Onoff (lib/onoff/import.ts).
//   GET                → connection state, what the CRM holds, the last imports
//   GET ?members=1     → « Tester la clé » : Onoff members and their CRM user
//   POST { from, to }  → start « Récupérer l'historique » (runs in the background)

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    if (new URL(request.url).searchParams.get("members") === "1") {
        const r = await previewOnoffMembers();
        return r.ok ? successResponse(r.members) : errorResponse(r.message, 400);
    }

    const [calls, withSummary, withAudio, last, runs] = await Promise.all([
        prisma.onoffCall.count(),
        prisma.onoffCall.count({ where: { summary: { not: null } } }),
        prisma.onoffCall.count({ where: { OR: [{ recordingUrl: { not: null } }, { recordingId: { not: null } }, { voicemailId: { not: null } }] } }),
        prisma.onoffCall.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
        latestOnoffImportRuns(),
    ]);
    return successResponse({
        webhookConfigured: Boolean(integrationKey("ONOFF_WEBHOOK_KEY")?.trim()),
        apiConfigured: isOnoffApiConfigured(),
        stats: { calls, withSummary, withAudio, lastCallAt: last?.startedAt ?? null },
        runs,
    });
});

const postSchema = z.object({ from: z.string(), to: z.string() });

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("Format attendu : { from: AAAA-MM-JJ, to: AAAA-MM-JJ }", 400);

    const r = await startOnoffImport({ ...parsed.data, userId: session.user.id });
    if (!r.ok) return errorResponse(r.message, 409);
    audit(request, session, {
        action: "ONOFF_HISTORY_IMPORT",
        entityType: "OnoffImportRun",
        entityId: r.runId,
        summary: `Import de l'historique Onoff du ${parsed.data.from} au ${parsed.data.to}`,
        metadata: parsed.data,
    });
    return successResponse({ runId: r.runId }, 202);
});
