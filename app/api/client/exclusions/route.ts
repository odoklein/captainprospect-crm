import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    AuthError,
    errorResponse,
    requireAuth,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import { clientExclusionSchema } from "@/lib/exclusions/schemas";
import { createExclusionFromRow } from "@/lib/exclusions/service";

/**
 * The client's own "ne plus contacter" list.
 *
 * Deliberately not a mode of /api/exclusions: scope is forced to CLIENT and
 * scopeId to the session's clientId, so no payload can reach another client's
 * prospects. The client also never sees who else excluded what — only their
 * own rules come back.
 */

const CLIENT_ROLES = new Set(["CLIENT", "COMMERCIAL"]);

async function requireClientSession(request: NextRequest) {
    const session = await requireAuth(request);
    if (!CLIENT_ROLES.has(session.user.role) || !session.user.clientId) {
        throw new AuthError("Accès non autorisé", 403);
    }
    return { userId: session.user.id, clientId: session.user.clientId };
}

// ============================================
// GET /api/client/exclusions
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const { clientId } = await requireClientSession(request);

    const rows = await prisma.exclusion.findMany({
        where: { scope: "CLIENT", scopeId: clientId },
        orderBy: [{ liftedAt: "asc" }, { createdAt: "desc" }],
        select: {
            id: true,
            target: true,
            label: true,
            reason: true,
            source: true,
            createdAt: true,
            expiresAt: true,
            liftedAt: true,
            appliedCompanies: true,
            appliedContacts: true,
        },
        take: 300,
    });

    const now = new Date();
    return successResponse(
        rows.map((row) => ({
            ...row,
            active: !row.liftedAt && (!row.expiresAt || row.expiresAt > now),
        }))
    );
});

// ============================================
// POST /api/client/exclusions
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    const { userId, clientId } = await requireClientSession(request);
    const input = await validateRequest(request, clientExclusionSchema);

    if (!input.companyId && !input.contactId) {
        return errorResponse("Société ou contact requis", 400);
    }

    // The prospect must belong to this client's own missions. Without this a
    // client could exclude — and therefore confirm the existence of — a company
    // in someone else's database.
    const companyId = input.companyId ?? null;
    const ownsRow = await prisma.company.findFirst({
        where: {
            ...(companyId ? { id: companyId } : { contacts: { some: { id: input.contactId! } } }),
            list: { mission: { clientId } },
        },
        select: { id: true },
    });

    if (!ownsRow) {
        return errorResponse("Fiche introuvable dans vos missions", 404);
    }

    try {
        const rule = await createExclusionFromRow({
            target: input.target,
            scope: "CLIENT",
            scopeId: clientId,
            companyId: companyId ?? ownsRow.id,
            contactId: input.contactId ?? null,
            reason: input.reason,
            duration: input.duration,
            source: "CLIENT_PORTAL",
            actorId: userId,
        });

        return successResponse(
            {
                id: rule.id,
                label: rule.label,
                target: rule.target,
                appliedCompanies: rule.appliedCompanies,
                appliedContacts: rule.appliedContacts,
            },
            201
        );
    } catch (err) {
        return errorResponse(err instanceof Error ? err.message : "Exclusion impossible", 400);
    }
});
