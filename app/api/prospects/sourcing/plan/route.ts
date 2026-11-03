import { NextRequest } from "next/server";
import { requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { planMaps } from "@/lib/sourcing/deep.server";
import { querySchema } from "@/lib/sourcing/schemas";

// POST /api/prospects/sourcing/plan — how a Google Maps run would cut the
// zones and what it would cost, without spending a credit (geo.api.gouv.fr only).
export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const query = await validateRequest(request, querySchema);
    return successResponse(await planMaps(query));
});
