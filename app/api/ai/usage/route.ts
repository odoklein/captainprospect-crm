// ============================================
// GET /api/ai/usage — Get token usage and cost in Euros for current user
// ============================================

import { NextRequest } from "next/server";
import { getUserAiUsage } from "@/lib/ai/usage";
import {
    requireAuth,
    successResponse,
    withErrorHandler,
} from "@/lib/api-utils";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const usage = await getUserAiUsage(session.user.id);
    return successResponse(usage);
});
