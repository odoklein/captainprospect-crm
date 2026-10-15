import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { providersStatus } from "@/lib/sourcing/providers.server";

// GET /api/prospects/sourcing/providers — which sources this deployment can use.
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    return successResponse(providersStatus());
});
