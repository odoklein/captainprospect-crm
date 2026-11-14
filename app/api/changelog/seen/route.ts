import { NextRequest } from "next/server";
import { requireAuth, successResponse, ValidationError, withErrorHandler } from "@/lib/api-utils";
import { markSeen } from "@/lib/changelog/server";

/** POST /api/changelog/seen { ids: string[] } — the user has read these « Nouveautés ». */
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    if (!body || !Array.isArray(body.ids)) throw new ValidationError("ids attendu");
    const marked = await markSeen(session.user.id, body.ids.filter((x): x is string => typeof x === "string"));
    return successResponse({ marked });
});
