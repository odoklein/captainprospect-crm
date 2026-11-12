import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { importExclusionsSchema } from "@/lib/exclusions/schemas";
import { importExclusions, listExclusionImports } from "@/lib/exclusions/service";

/**
 * Bulk blacklist upload, manager side. A manager picks the scope (one client,
 * or every client); the client portal has its own route that forces it.
 */

// GET /api/exclusions/import — every past upload, newest first
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    return successResponse(await listExclusionImports({}));
});

// POST /api/exclusions/import — upload a list
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const input = await validateRequest(request, importExclusionsSchema);

    try {
        const result = await importExclusions({
            scope: input.scope,
            scopeId: input.scopeId ?? null,
            rows: input.rows,
            fileName: input.fileName ?? null,
            reason: input.reason,
            duration: input.duration,
            source: "MANAGER",
            actorId: session.user.id,
        });
        return successResponse(result, 201);
    } catch (err) {
        return errorResponse(err instanceof Error ? err.message : "Import impossible", 400);
    }
});
