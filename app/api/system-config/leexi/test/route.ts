import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { testLeexiKeys } from "@/lib/leexi/service";

// GET /api/system-config/leexi/test — tries each configured Leexi key
// (Paramètres, then server env) and says which one answers. Never returns keys.
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    return successResponse(await testLeexiKeys());
});
