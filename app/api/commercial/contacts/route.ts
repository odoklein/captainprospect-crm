import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    requireRole,
    withErrorHandler,
    AuthError,
} from '@/lib/api-utils';
import { portalVisibleMissionWhere } from '@/lib/portal-visibility';

// ============================================
// GET /api/commercial/contacts
// Fetch contacts and companies from the commercial's client campaigns
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['COMMERCIAL'], request);

    const interlocuteurId = session.user.interlocuteurId;
    if (!interlocuteurId) {
        throw new AuthError('Profil commercial introuvable', 403);
    }

    const interlocuteur = await prisma.clientInterlocuteur.findUnique({
        where: { id: interlocuteurId },
        select: { clientId: true },
    });

    if (!interlocuteur) {
        throw new AuthError('Interlocuteur introuvable', 403);
    }

    const { clientId } = interlocuteur;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || null;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const skip = (page - 1) * limit;

    // Filter by List(s) where commercialInterlocuteurId = interlocuteur courant ET contactsViewEnabled = true
    const eligibleLists = await prisma.list.findMany({
        where: {
            commercialInterlocuteurId: interlocuteurId,
            contactsViewEnabled: true,
            isActive: true,
            isArchived: false,
            mission: {
                clientId,
                AND: [portalVisibleMissionWhere()],
            },
        },
        select: {
            id: true,
            name: true,
            type: true,
            _count: {
                select: {
                    companies: true,
                },
            },
        },
    });

    const eligibleListIds = eligibleLists.map((l) => l.id);

    // If no eligible base -> empty contacts, no error, with clear message
    if (eligibleListIds.length === 0) {
        return successResponse({
            contacts: [],
            total: 0,
            page,
            limit,
            totalPages: 0,
            eligibleLists: [],
            message: "aucune base activée pour l'instant",
        });
    }

    // Build contact where clause scoped to companies in the eligible list(s)
    const contactWhere: Record<string, unknown> = {
        company: {
            listId: { in: eligibleListIds },
        },
    };

    if (search) {
        contactWhere.OR = [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { company: { name: { contains: search, mode: 'insensitive' } } },
        ];
    }

    const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
            where: contactWhere,
            include: {
                company: {
                    select: {
                        id: true,
                        name: true,
                        industry: true,
                        country: true,
                        website: true,
                        size: true,
                        phone: true,
                        listId: true,
                        list: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
            skip,
            take: limit,
        }),
        prisma.contact.count({ where: contactWhere }),
    ]);

    return successResponse({
        contacts,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        eligibleLists,
        message: null,
    });
});
