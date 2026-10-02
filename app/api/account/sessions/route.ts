import { NextRequest } from "next/server";
import { requireAuth, successResponse, withErrorHandler } from "@/lib/api-utils";
import { listUserSessions } from "@/lib/user-session";

// ============================================
// GET /api/account/sessions
// Self-service: the caller's own signed-in devices, newest activity first.
// "Active" = not revoked and seen within the 8 h JWT lifetime (lib/auth.ts);
// the device making this request is flagged `current`.
// ============================================

const ACTIVE_WINDOW_MS = 8 * 60 * 60 * 1000;

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const currentId = session.user.sessionId ?? null;
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;

    const sessions = (await listUserSessions(session.user.id))
        .filter((s) => !s.revokedAt && (s.id === currentId || s.lastSeenAt.getTime() >= cutoff))
        .map((s) => ({
            id: s.id,
            ip: s.ip,
            country: s.country,
            userAgent: s.userAgent,
            createdAt: s.createdAt,
            lastSeenAt: s.lastSeenAt,
            current: s.id === currentId,
        }));

    return successResponse({ sessions });
});
