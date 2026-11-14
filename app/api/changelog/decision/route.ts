import { NextRequest } from "next/server";
import { errorResponse, requireAuth, successResponse, ValidationError, withErrorHandler } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { decide } from "@/lib/changelog/server";

/**
 * POST /api/changelog/decision { id, decision: NOW | WINDOW | POSTPONE } — a MANAGER answers the
 * update offer the Console pushed. The Console reads the answer (GET /api/instance/changelog) and
 * runs the upgrade: NOW at once, WINDOW in the agency's maintenance window, POSTPONE after 7 days
 * (never past the deadline; security updates can't be postponed).
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const body = (await request.json().catch(() => null)) as { id?: unknown; decision?: unknown } | null;
    if (!body || typeof body.id !== "string") throw new ValidationError("id attendu");

    const result = await decide(
        { id: session.user.id, name: session.user.name ?? "Manager", role: session.user.role },
        body.id,
        body.decision,
    );
    if (!result.ok) return errorResponse(result.error, result.status);

    audit(request, session, {
        action: "UPDATE_DECISION",
        entityType: "InstanceChangelogEntry",
        entityId: body.id,
        summary: `Réponse à la mise à jour proposée : ${String(body.decision).toUpperCase()}`,
        after: { decision: String(body.decision).toUpperCase(), tag: result.offer?.tag ?? null },
    });
    return successResponse({ offer: result.offer });
});
