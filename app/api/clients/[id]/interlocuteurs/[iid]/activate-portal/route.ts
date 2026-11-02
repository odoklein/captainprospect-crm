// ============================================
// POST   /api/clients/[id]/interlocuteurs/[iid]/activate-portal
// DELETE /api/clients/[id]/interlocuteurs/[iid]/activate-portal
//
// Creates (or revokes) the COMMERCIAL portal account of a client's commercial.
//
// The creation itself lives in lib/vault/portalAccounts.ts, shared with the
// access assistant, so an account made from this drawer and one made from a
// chat instruction are the same account with the same vault entry. This route
// used to show the generated password once and then lose it forever; it is now
// stored encrypted, recoverable by a manager, and audited.
// ============================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    requireRole,
    withErrorHandler,
    NotFoundError,
} from "@/lib/api-utils";
import { createPortalAccountForInterlocuteur } from "@/lib/vault/portalAccounts";
import { revokeCommercialPortal } from "@/lib/clients/commercial-access";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; iid: string }> }
) => {
    const session = await requireRole(['MANAGER'], request);
    const { id: clientId, iid: interlocuteurId } = await params;

    const interlocuteur = await prisma.clientInterlocuteur.findUnique({
        where: { id: interlocuteurId },
        select: { clientId: true },
    });
    if (!interlocuteur || interlocuteur.clientId !== clientId) {
        throw new NotFoundError('Interlocuteur introuvable');
    }

    const result = await createPortalAccountForInterlocuteur(
        interlocuteurId,
        session.user.id,
    );

    // Response shape kept as-is: the client drawer reads these three fields.
    return successResponse(
        {
            user: result.user,
            alreadyExists: !result.created,
            generatedPassword: result.password,
            credentialId: result.credential?.id ?? null,
        },
        result.created ? 201 : 200,
    );
});

// ============================================
// DELETE — remove COMMERCIAL portal access
// ============================================

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; iid: string }> }
) => {
    const session = await requireRole(['MANAGER'], request);
    const { id: clientId, iid: interlocuteurId } = await params;

    const interlocuteur = await prisma.clientInterlocuteur.findUnique({
        where: { id: interlocuteurId },
        include: { portalUser: { select: { id: true } } },
    });

    if (!interlocuteur || interlocuteur.clientId !== clientId) {
        throw new NotFoundError('Interlocuteur introuvable');
    }

    if (!interlocuteur.portalUser) {
        throw new NotFoundError('Aucun compte portail trouvé');
    }

    // Sessions killed and account disabled first, then the vault password, then
    // the row itself (kept disabled and unlinked when history references it,
    // instead of failing on the FK after the password was gone). (#119)
    const revoked = await revokeCommercialPortal(interlocuteur.portalUser.id, session.user.id);

    audit(request, session, {
        action: AUDIT_ACTIONS.SESSION_REVOKE,
        entityType: "User",
        entityId: interlocuteur.portalUser.id,
        summary: `Accès portail de ${interlocuteur.firstName} ${interlocuteur.lastName} révoqué`,
        metadata: { ...revoked, interlocuteurId },
    });

    return successResponse({ deleted: true, credentialsRemoved: revoked.credentialsRemoved });
});
