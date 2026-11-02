import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
    NotFoundError,
} from '@/lib/api-utils';
import { z } from 'zod';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { checkSeatFor } from '@/lib/license/server';
import {
    forgetSecondaryCommercial,
    resumeCommercialUser,
    revokeCommercialPortal,
    suspendCommercialUser,
} from '@/lib/clients/commercial-access';

const contactEntrySchema = z.object({
    value: z.string(),
    label: z.string(),
    isPrimary: z.boolean(),
});

const bookingLinkSchema = z.object({
    label: z.string(),
    url: z.string(),
    durationMinutes: z.number(),
});

const updateInterlocuteurSchema = z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    title: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    territory: z.string().nullable().optional(),
    emails: z.array(contactEntrySchema).optional(),
    phones: z.array(contactEntrySchema).optional(),
    bookingLinks: z.array(bookingLinkSchema).optional(),
    notes: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
});

// PUT /api/clients/[id]/interlocuteurs/[iid]
export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; iid: string }> }
) => {
    const session = await requireRole(['MANAGER'], request);
    const { id, iid } = await params;
    const data = await validateRequest(request, updateInterlocuteurSchema);

    const existing = await prisma.clientInterlocuteur.findFirst({
        where: { id: iid, clientId: id },
        include: { portalUser: { select: { id: true, isActive: true, role: true } } },
    });

    if (!existing) {
        throw new NotFoundError('Interlocuteur introuvable');
    }

    const interlocuteur = await prisma.clientInterlocuteur.update({
        where: { id: iid },
        data: {
            ...(data.firstName !== undefined && { firstName: data.firstName }),
            ...(data.lastName !== undefined && { lastName: data.lastName }),
            ...(data.title !== undefined && { title: data.title || null }),
            ...(data.department !== undefined && { department: data.department || null }),
            ...(data.territory !== undefined && { territory: data.territory || null }),
            ...(data.emails !== undefined && { emails: data.emails as unknown as any }),
            ...(data.phones !== undefined && { phones: data.phones as unknown as any }),
            ...(data.bookingLinks !== undefined && { bookingLinks: data.bookingLinks as unknown as any }),
            ...(data.notes !== undefined && { notes: data.notes || null }),
            ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
    });

    // A commercial who stops (isActive=false) loses portal access at once;
    // re-activating the commercial gives the same account back. (#119)
    const portalUser = existing.portalUser;
    if (portalUser && data.isActive !== undefined && data.isActive !== existing.isActive) {
        if (!data.isActive && portalUser.isActive) {
            const revokedSessions = await suspendCommercialUser(portalUser.id, session.user.id);
            audit(request, session, {
                action: AUDIT_ACTIONS.STATUS_CHANGE,
                entityType: 'User',
                entityId: portalUser.id,
                summary: `Accès portail de ${existing.firstName} ${existing.lastName} suspendu (commercial désactivé)`,
                before: { isActive: true },
                after: { isActive: false },
                metadata: { revokedSessions, interlocuteurId: iid },
            });
        } else if (data.isActive && !portalUser.isActive) {
            const seats = await checkSeatFor(portalUser.role);
            if (seats.ok) await resumeCommercialUser(portalUser.id);
        }
    }

    return successResponse(interlocuteur);
});

// DELETE /api/clients/[id]/interlocuteurs/[iid]
export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string; iid: string }> }
) => {
    const session = await requireRole(['MANAGER'], request);
    const { id, iid } = await params;

    const existing = await prisma.clientInterlocuteur.findFirst({
        where: { id: iid, clientId: id },
        include: { portalUser: { select: { id: true } } },
    });

    if (!existing) {
        throw new NotFoundError('Interlocuteur introuvable');
    }

    // The portal account goes first: the FK is SET NULL, so deleting the
    // commercial alone used to leave a live, unreachable login behind. (#119)
    const revoked = existing.portalUser
        ? await revokeCommercialPortal(existing.portalUser.id, session.user.id)
        : null;

    await prisma.clientInterlocuteur.delete({
        where: { id: iid },
    });
    await forgetSecondaryCommercial(iid);

    audit(request, session, {
        action: AUDIT_ACTIONS.DELETE,
        entityType: 'ClientInterlocuteur',
        entityId: iid,
        summary: `Commercial ${existing.firstName} ${existing.lastName} supprimé${revoked ? ' (accès portail révoqué)' : ''}`,
        metadata: revoked ? { ...revoked } : undefined,
    });

    return successResponse({ deleted: true, portalRevoked: !!revoked });
});
