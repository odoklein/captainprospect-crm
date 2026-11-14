import { NextRequest } from "next/server";
import { requireAuth, successResponse, withErrorHandler } from "@/lib/api-utils";
import { feedFor, isChangelogTableMissing } from "@/lib/changelog/server";

/**
 * GET /api/changelog — « Nouveautés » for the signed-in user: entries for their role,
 * which ones they haven't seen, banners, and (MANAGER only) the pending update offer.
 * An instance whose migration hasn't run yet answers an empty feed, never an error.
 */
export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    try {
        return successResponse(await feedFor({ id: session.user.id, role: session.user.role }));
    } catch (err) {
        if (isChangelogTableMissing(err)) return successResponse({ entries: [], unseen: 0, offer: null, version: null });
        throw err;
    }
});
