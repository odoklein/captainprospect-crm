import { NextRequest } from "next/server";
import {
    requireRole,
    successResponse,
    errorResponse,
    withErrorHandler,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { logAuthEventView } from "@/lib/auth-event";
import { revokeSession } from "@/lib/user-session";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

// ============================================
// DELETE /api/users/[id]/sessions/[sessionId] - Revoke one session (device/IP)
// ============================================

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; sessionId: string }> }
) => {
    const session = await requireRole(["MANAGER", "DEVELOPER"], request);
    const { id, sessionId } = await params;

    const target = await prisma.userSession.findUnique({
        where: { id: sessionId },
        select: { id: true, userId: true, revokedAt: true },
    });
    if (!target || target.userId !== id) {
        return errorResponse("Session introuvable", 404);
    }
    if (target.revokedAt) {
        return successResponse({ message: "Session déjà révoquée." });
    }

    const result = await revokeSession(sessionId, session.user.id, "MANAGER_REVOKED");
    if (!result) return errorResponse("Session introuvable", 404);

    logAuthEventView(session.user.id, id, "REVOKE_SESSION").catch(() => {});
    audit(request, session, {
        action: AUDIT_ACTIONS.SESSION_REVOKE,
        entityType: "User",
        entityId: id,
        summary: "Session révoquée manuellement",
        metadata: { sessionId },
    });

    return successResponse({ message: "Session révoquée." });
});
