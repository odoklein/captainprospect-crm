import { NextRequest } from "next/server";
import {
    requireRole,
    successResponse,
    errorResponse,
    withErrorHandler,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { logAuthEventView } from "@/lib/auth-event";
import { listUserSessions, revokeAllUserSessions } from "@/lib/user-session";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

// ============================================
// GET /api/users/[id]/sessions - List a user's sign-in sessions (devices/IPs)
// POST /api/users/[id]/sessions - Force-logout: revoke every active session
// Only MANAGER and DEVELOPER may view/act on another user's sessions. Each
// access is logged in AuthEventView for accountability, same as auth history.
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(["MANAGER", "DEVELOPER"], request);
    const { id } = await params;

    const target = await prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true },
    });
    if (!target) return errorResponse("Utilisateur introuvable", 404);

    const [sessions] = await Promise.all([
        listUserSessions(id),
        logAuthEventView(session.user.id, id, "VIEW_SESSIONS").catch(() => {}),
    ]);

    return successResponse({ user: target, sessions });
});

export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(["MANAGER", "DEVELOPER"], request);
    const { id } = await params;

    const target = await prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true },
    });
    if (!target) return errorResponse("Utilisateur introuvable", 404);

    const [revokedCount] = await Promise.all([
        revokeAllUserSessions(id, session.user.id, "FORCE_LOGOUT"),
        logAuthEventView(session.user.id, id, "FORCE_LOGOUT").catch(() => {}),
    ]);

    audit(request, session, {
        action: AUDIT_ACTIONS.FORCE_LOGOUT,
        entityType: "User",
        entityId: id,
        summary: `${target.name} déconnecté de force (${revokedCount} session(s))`,
        metadata: { revokedCount },
    });

    return successResponse({
        message: revokedCount > 0
            ? `${target.name} a été déconnecté de ${revokedCount} session(s).`
            : `${target.name} n'avait aucune session active.`,
        revokedCount,
    });
});
