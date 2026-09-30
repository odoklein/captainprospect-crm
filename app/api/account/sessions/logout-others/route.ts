import { NextRequest } from "next/server";
import { requireAuth, successResponse, withErrorHandler } from "@/lib/api-utils";
import { revokeAllUserSessions } from "@/lib/user-session";

// ============================================
// POST /api/account/sessions/logout-others
// Self-service: any signed-in user revokes every one of their OWN sessions
// except the one they're currently using. No role restriction — this only
// ever touches the caller's own sessions.
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);

    const revokedCount = await revokeAllUserSessions(
        session.user.id,
        session.user.id,
        "SELF_LOGOUT_OTHERS",
        session.user.sessionId
    );

    return successResponse({
        message:
            revokedCount > 0
                ? `${revokedCount} autre(s) appareil(s) déconnecté(s).`
                : "Aucun autre appareil connecté.",
        revokedCount,
    });
});
