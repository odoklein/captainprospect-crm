// ============================================
// GET /api/ai/usage — Get token usage and cost in Euros for current user
// ============================================

import { NextRequest } from "next/server";
import { getUserAiUsage } from "@/lib/ai/usage";
import {
    requireRole,
    successResponse,
    withErrorHandler,
} from "@/lib/api-utils";

// AI cost figures are internal: managers only.
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const usage = await getUserAiUsage(session.user.id);
    return successResponse(usage);
});
