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
import { deleteCredential } from "@/lib/vault/service";

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

    // Drop the vault entry too, and do it first: a stored password for an
    // account that no longer exists is worse than no entry at all. Deleting it
    // through the service keeps the audit trail honest about why it went.
    const credentials = await prisma.vaultCredential.findMany({
        where: { userId: interlocuteur.portalUser.id, type: 'PORTAL' },
        select: { id: true },
    });
    for (const credential of credentials) {
        await deleteCredential(credential.id, session.user.id);
    }

    await prisma.user.delete({ where: { id: interlocuteur.portalUser.id } });

    return successResponse({ deleted: true, credentialsRemoved: credentials.length });
});
