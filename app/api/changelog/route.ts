import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { feedFor } from "@/lib/changelog/service";

// GET /api/changelog — the signed-in user's « Nouveautés » (what their role may see, live now) and the unread count.
export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER", "SDR", "BOOKER", "BUSINESS_DEVELOPER", "DEVELOPER"], request);
    return successResponse(await feedFor({ id: session.user.id, role: session.user.role }));
});
