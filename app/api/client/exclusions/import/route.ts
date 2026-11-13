import { NextRequest } from "next/server";
import {
    AuthError,
    errorResponse,
    requireAuth,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import { clientImportExclusionsSchema } from "@/lib/exclusions/schemas";
import { importExclusions, listExclusionImports } from "@/lib/exclusions/service";

/**
 * The client's own blacklist upload. Scope is forced to CLIENT and scopeId to
 * the session's clientId, as in /api/client/exclusions, so no payload can reach
 * another client's prospects — or another client's upload history.
 */

const CLIENT_ROLES = new Set(["CLIENT", "COMMERCIAL"]);

async function requireClientSession(request: NextRequest) {
    const session = await requireAuth(request);
    if (!CLIENT_ROLES.has(session.user.role) || !session.user.clientId) {
        throw new AuthError("Accès non autorisé", 403);
    }
    return { userId: session.user.id, clientId: session.user.clientId };
}

// GET /api/client/exclusions/import
export const GET = withErrorHandler(async (request: NextRequest) => {
    const { clientId } = await requireClientSession(request);
    const imports = await listExclusionImports({ scope: "CLIENT", scopeId: clientId });
    // The client sees the file and the outcome, never the internal scope name.
    return successResponse(imports.map(({ scopeName: _scopeName, ...row }) => row));
});

// POST /api/client/exclusions/import
export const POST = withErrorHandler(async (request: NextRequest) => {
    const { userId, clientId } = await requireClientSession(request);
    const input = await validateRequest(request, clientImportExclusionsSchema);

    try {
        const result = await importExclusions({
            scope: "CLIENT",
            scopeId: clientId,
            rows: input.rows,
            fileName: input.fileName ?? null,
            reason: input.reason,
            duration: input.duration,
            source: "CLIENT_PORTAL",
            actorId: userId,
        });
        return successResponse(result, 201);
    } catch (err) {
        return errorResponse(err instanceof Error ? err.message : "Import impossible", 400);
    }
});
