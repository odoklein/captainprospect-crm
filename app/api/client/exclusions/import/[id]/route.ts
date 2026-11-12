import { NextRequest } from "next/server";
import { AuthError, NotFoundError, requireAuth, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getExclusionImport } from "@/lib/exclusions/service";

const CLIENT_ROLES = new Set(["CLIENT", "COMMERCIAL"]);

// GET /api/client/exclusions/import/[id] — the client's own stored file
export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth(request);
    if (!CLIENT_ROLES.has(session.user.role) || !session.user.clientId) {
        throw new AuthError("Accès non autorisé", 403);
    }
    const { id } = await params;

    const record = await getExclusionImport(id);
    // Another client's upload is reported as missing, not forbidden: its
    // existence is not the caller's business.
    if (!record || record.scope !== "CLIENT" || record.scopeId !== session.user.clientId) {
        throw new NotFoundError("Import introuvable");
    }

    return successResponse({ id: record.id, fileName: record.fileName, createdAt: record.createdAt, rows: record.rows });
});
