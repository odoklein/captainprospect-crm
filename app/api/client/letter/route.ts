import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { buildClientLetter } from "@/lib/client-portal/letter.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================
// GET /api/client/letter
// « La lettre de la semaine », the client portal home: confirmed RDV live,
// everything else as of the last Monday 06:00 (Paris). Scoped to the signed-in
// client's running, portal-visible missions. No individual call is returned.
// See lib/client-portal/letter.ts for every rule.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const clientId = session.user.clientId;
    if (!clientId) return errorResponse("Aucun espace client rattaché", 403);
    return successResponse(await buildClientLetter(clientId));
});
